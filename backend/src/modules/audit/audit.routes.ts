import { z } from 'zod'
import { getLoginHistory, getActivityLogs } from './audit.service.js'
import { generateReportPdf } from '../../lib/pdf.js'
import { db } from '../../db/index.js'
import { tenants } from '../../db/schema/index.js'
import { eq } from 'drizzle-orm'
import { e400 } from '../../lib/errors.js'
import { validate } from '../../lib/validation.js'

const loginHistoryQuerySchema = z.object({
    userId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
})

const activityQuerySchema = z.object({
    entityType: z.string().max(100).optional(),
    entityId: z.string().max(100).optional(),
    userId: z.string().uuid().optional(),
    action: z.string().max(50).optional(),
    actorRole: z.string().max(50).optional(),
    actorName: z.string().max(200).optional(),
    entityName: z.string().max(200).optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    ipAddress: z.string().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
    offset: z.coerce.number().int().min(0).default(0),
})

const exportQuerySchema = z.object({
    format: z.enum(['csv', 'pdf']).default('csv'),
    entityType: z.string().max(100).optional(),
    entityId: z.string().max(100).optional(),
    userId: z.string().uuid().optional(),
})

export async function auditRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/audit/login-history?userId=&limit=&offset=
    // Admins may query any userId; non-admins always see their own.
    fastify.get('/login-history', { ...auth, schema: { tags: ['Audit'] } }, async (request: any, reply: any) => {
        const query = validate(loginHistoryQuerySchema, request.query)
        const role = request.user.role
        const isAdmin = ['hr_manager', 'super_admin'].includes(role)
        const resolvedUserId = isAdmin ? query.userId : request.user.id
        const result = await getLoginHistory(request.user.tenantId, resolvedUserId, query.limit, query.offset)
        return reply.send(result)
    })

    // GET /api/v1/audit/activity?entityType=&entityId=&userId=&limit=&offset=
    fastify.get('/activity', { ...adminAuth, schema: { tags: ['Audit'] } }, async (request: any, reply: any) => {
        const query = validate(activityQuerySchema, request.query)
        const result = await getActivityLogs(request.user.tenantId, query)
        return reply.send(result)
    })

    // GET /api/v1/audit/my-activity?limit=&offset=
    // The employee portal calls this to show "what's recently happened to my
    // record": leave decisions, payslips generated, profile edits, document
    // verifications, etc. Always scoped to the caller's own employeeId — never
    // accepts a different entityId, so a non-admin can't snoop on others.
    fastify.get('/my-activity', { ...auth, schema: { tags: ['Audit'] } }, async (request: any, reply: any) => {
        const employeeId = request.user.employeeId
        if (!employeeId) {
            return reply.send({ data: [], total: 0, limit: 0, offset: 0, hasMore: false })
        }
        const { limit = 50, offset = 0 } = (request.query ?? {}) as { limit?: number | string; offset?: number | string }
        const parsedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100)
        const parsedOffset = Math.max(Number(offset) || 0, 0)
        const result = await getActivityLogs(request.user.tenantId, {
            entityType: 'employee',
            entityId: employeeId,
            limit: parsedLimit,
            offset: parsedOffset,
        })
        return reply.send(result)
    })

    // GET /api/v1/audit/export?format=csv|pdf
    fastify.get('/export', { ...adminAuth, schema: { tags: ['Audit'] } }, async (request: any, reply: any) => {
        const parsed = exportQuerySchema.safeParse(request.query)
        if (!parsed.success) return reply.code(400).send(e400('Invalid format. Must be csv or pdf.'))
        const { format, entityType, entityId, userId } = parsed.data
        const { data } = await getActivityLogs(request.user.tenantId, { entityType, entityId, userId, limit: 10000, offset: 0 })
        const rows = data as any[]
        const dateStr = new Date().toISOString().slice(0, 10)

        if (format === 'pdf') {
            const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
            const pdf = await generateReportPdf({
                title: 'Audit Activity Log',
                companyName: tenantRow?.name ?? '',
                columns: [
                    { header: 'Actor', key: 'actorName', width: 120 },
                    { header: 'Role', key: 'actorRole', width: 80 },
                    { header: 'Action', key: 'action', width: 65 },
                    { header: 'Entity Type', key: 'entityType', width: 80 },
                    { header: 'Entity', key: 'entityName', width: 130 },
                    { header: 'Date', key: 'createdAt', width: 120 },
                    { header: 'IP Address', key: 'ipAddress' },
                ],
                rows,
            })
            reply.header('Content-Type', 'application/pdf')
            reply.header('Content-Disposition', `attachment; filename="audit-log-${dateStr}.pdf"`)
            return reply.send(pdf)
        }

        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const headers = ['Actor', 'Role', 'Action', 'Entity Type', 'Entity Name', 'Entity ID', 'Date', 'IP Address']
        const lines = [headers.join(',')]
        for (const r of rows) {
            lines.push([r.actorName, r.actorRole, r.action, r.entityType, r.entityName ?? '', r.entityId, r.createdAt, r.ipAddress ?? ''].map(escape).join(','))
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', `attachment; filename="audit-export-${dateStr}.csv"`)
        return reply.send(lines.join('\r\n'))
    })
}
