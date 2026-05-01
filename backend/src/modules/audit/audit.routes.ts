import { getLoginHistory, getActivityLogs } from './audit.service.js'
import { generateReportPdf } from '../../lib/pdf.js'
import { db } from '../../db/index.js'
import { tenants } from '../../db/schema/index.js'
import { eq } from 'drizzle-orm'

export async function auditRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/audit/login-history?userId=&limit=&offset=
    // Admins may query any userId; non-admins always see their own.
    fastify.get('/login-history', { ...auth, schema: { tags: ['Audit'] } }, async (request: any, reply: any) => {
        const { userId, limit = '50', offset = '0' } = request.query as Record<string, string>
        const role = request.user.role
        const isAdmin = ['hr_manager', 'super_admin'].includes(role)
        const resolvedUserId = isAdmin ? userId : request.user.id
        const data = await getLoginHistory(request.user.tenantId, resolvedUserId, Number(limit), Number(offset))
        return reply.send({ data })
    })

    // GET /api/v1/audit/activity?entityType=&entityId=&userId=&limit=&offset=
    fastify.get('/activity', { ...adminAuth, schema: { tags: ['Audit'] } }, async (request: any, reply: any) => {
        const { entityType, entityId, userId, limit = '50', offset = '0' } = request.query as Record<string, string>
        const data = await getActivityLogs(request.user.tenantId, {
            entityType, entityId, userId, limit: Number(limit), offset: Number(offset),
        })
        return reply.send({ data })
    })

    // GET /api/v1/audit/export?format=csv|pdf
    fastify.get('/export', { ...adminAuth, schema: { tags: ['Audit'] } }, async (request: any, reply: any) => {
        const { format = 'csv', entityType, entityId, userId } = request.query as Record<string, string>
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const { data } = await getActivityLogs(request.user.tenantId, { entityType, entityId, userId, limit: 10000, offset: 0 }) as any
        const rows = (data ?? []) as any[]
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
