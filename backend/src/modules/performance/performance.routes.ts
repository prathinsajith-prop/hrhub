import { getReviews, createReview, updateReview, deleteReview } from './performance.service.js'
import { generateReportPdf } from '../../lib/pdf.js'
import { db } from '../../db/index.js'
import { tenants } from '../../db/schema/index.js'
import { eq } from 'drizzle-orm'
import { recordActivity } from '../audit/audit.service.js'

export async function performanceRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'dept_head', 'super_admin')] }

    // GET /api/v1/performance
    // Admins see all reviews; employees only see their own (via employeeId JWT claim).
    fastify.get('/performance', { ...auth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const { employeeId, from, to, limit = '20', offset = '0' } = request.query as Record<string, string>
        const role = request.user.role
        const isAdmin = ['hr_manager', 'super_admin', 'dept_head'].includes(role)
        const resolvedEmployeeId = isAdmin ? employeeId : (request.user.employeeId ?? undefined)
        const data = await getReviews(request.user.tenantId, { employeeId: resolvedEmployeeId, from, to, limit: Number(limit), offset: Number(offset) })
        return reply.send({ data })
    })

    // POST /api/v1/performance
    fastify.post('/performance', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const review = await createReview(request.user.tenantId, request.user.id, request.body as any)
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'performance_review', entityId: review.id, entityName: (review as any).employeeName ?? (request.body as any).reviewPeriod, action: 'create', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.code(201).send({ data: review })
    })

    // PATCH /api/v1/performance/:id
    fastify.patch('/performance/:id', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const review = await updateReview(request.user.tenantId, id, request.body as any)
        if (!review) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Performance review not found' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'performance_review', entityId: id, entityName: (review as any).employeeName ?? (review as any).reviewPeriod, action: 'update', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.send({ data: review })
    })

    // DELETE /api/v1/performance/:id
    fastify.delete('/performance/:id', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await deleteReview(request.user.tenantId, id)
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'performance_review', entityId: id, action: 'delete', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.code(204).send()
    })

    // GET /api/v1/performance/export?format=csv|pdf
    fastify.get('/performance/export', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const { format = 'csv', employeeId, from, to } = request.query as Record<string, string>
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const { data } = await getReviews(request.user.tenantId, { employeeId, from, to, limit: 10000, offset: 0 }) as any
        const rows = (data ?? []) as any[]
        const dateStr = new Date().toISOString().slice(0, 10)

        if (format === 'pdf') {
            const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
            const pdf = await generateReportPdf({
                title: 'Performance Reviews Report',
                companyName: tenantRow?.name ?? '',
                subtitle: from && to ? `${from} – ${to}` : undefined,
                columns: [
                    { header: 'Employee', key: 'employeeName', width: 130 },
                    { header: 'Review Period', key: 'reviewPeriod', width: 100 },
                    { header: 'Rating', key: 'rating', width: 55, align: 'right' },
                    { header: 'Status', key: 'status', width: 70 },
                    { header: 'Reviewer', key: 'reviewerName', width: 120 },
                    { header: 'Comments', key: 'comments' },
                ],
                rows,
            })
            reply.header('Content-Type', 'application/pdf')
            reply.header('Content-Disposition', `attachment; filename="performance-report-${dateStr}.pdf"`)
            return reply.send(pdf)
        }

        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const headers = ['Employee Name', 'Review Period', 'Rating', 'Status', 'Reviewer', 'Comments']
        const lines = [headers.join(',')]
        for (const r of rows) {
            lines.push([r.employeeName, r.reviewPeriod, r.rating ?? '', r.status, r.reviewerName ?? '', r.comments ?? ''].map(escape).join(','))
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', `attachment; filename="performance-export-${dateStr}.csv"`)
        return reply.send(lines.join('\r\n'))
    })
}
