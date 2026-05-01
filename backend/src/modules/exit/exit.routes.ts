import { calculateSettlement, initiateExit, getExitRequests, getExitRequest, approveExit, rejectExit, markSettlementPaid } from './exit.service.js'
import { generateReportPdf } from '../../lib/pdf.js'
import { db } from '../../db/index.js'
import { tenants } from '../../db/schema/index.js'
import { eq } from 'drizzle-orm'
import { recordActivity } from '../audit/audit.service.js'

export async function exitRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/exit/settlement-preview?employeeId=&exitDate=&exitType=&deductions=
    fastify.get('/exit/settlement-preview', { ...auth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { employeeId, exitDate, exitType, deductions } = request.query as Record<string, string>
        if (!employeeId || !exitDate || !exitType) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId, exitDate and exitType are required' })
        }
        const data = await calculateSettlement(request.user.tenantId, employeeId, exitDate, exitType, Number(deductions ?? 0))
        return reply.send({ data })
    })

    // POST /api/v1/exit
    fastify.post('/exit', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const data = await initiateExit(request.user.tenantId, request.body as any)
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'exit_request', entityId: data.request.id, entityName: (data.request as any).employeeId, action: 'create', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.code(201).send({ data })
    })

    // GET /api/v1/exit
    fastify.get('/exit', { ...auth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const data = await getExitRequests(request.user.tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/exit/:id
    fastify.get('/exit/:id', { ...auth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await getExitRequest(request.user.tenantId, id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found' })
        return reply.send({ data })
    })

    // PATCH /api/v1/exit/:id/approve
    fastify.patch('/exit/:id/approve', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await approveExit(request.user.tenantId, id, request.user.id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found or not pending' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'exit_request', entityId: id, entityName: (data as any).employeeName, action: 'approve', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.send({ data })
    })

    // PATCH /api/v1/exit/:id/reject
    fastify.patch('/exit/:id/reject', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const { reason } = (request.body ?? {}) as { reason?: string }
        const data = await rejectExit(request.user.tenantId, id, request.user.id, reason)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found or not pending' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'exit_request', entityId: id, entityName: (data as any).employeeName, action: 'reject', metadata: reason ? { reason } : undefined, ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.send({ data })
    })

    // PATCH /api/v1/exit/:id/settlement-paid
    fastify.patch('/exit/:id/settlement-paid', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await markSettlementPaid(request.user.tenantId, id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found or not approved' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'exit_request', entityId: id, entityName: (data as any).employeeName, action: 'update', metadata: { settlementPaid: true }, ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.send({ data })
    })

    // GET /api/v1/exit/export?format=csv|pdf
    fastify.get('/exit/export', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { format = 'csv', status } = request.query as Record<string, string>
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const allExits = await getExitRequests(request.user.tenantId)
        const rows = (status ? allExits.filter((r: any) => r.status === status) : allExits) as any[]
        const dateStr = new Date().toISOString().slice(0, 10)

        if (format === 'pdf') {
            const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
            const pdf = await generateReportPdf({
                title: 'Employee Exit Report',
                companyName: tenantRow?.name ?? '',
                columns: [
                    { header: 'Employee', key: 'employeeName', width: 120 },
                    { header: 'Emp No', key: 'employeeNo', width: 70 },
                    { header: 'Department', key: 'employeeDepartment', width: 90 },
                    { header: 'Exit Type', key: 'exitType', width: 80 },
                    { header: 'Exit Date', key: 'exitDate', width: 75 },
                    { header: 'Status', key: 'status', width: 70 },
                    { header: 'Total Settlement (AED)', key: 'totalSettlement', width: 110, align: 'right', currency: true },
                    { header: 'Settled', key: 'settlementPaid' },
                ],
                rows,
            })
            reply.header('Content-Type', 'application/pdf')
            reply.header('Content-Disposition', `attachment; filename="exit-report-${dateStr}.pdf"`)
            return reply.send(pdf)
        }

        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const headers = ['Employee No', 'Employee Name', 'Department', 'Exit Type', 'Exit Date', 'Last Working Day', 'Status', 'Gratuity (AED)', 'Leave Encashment (AED)', 'Total Settlement (AED)', 'Settlement Paid']
        const lines = [headers.join(',')]
        for (const r of rows) {
            lines.push([r.employeeNo, r.employeeName, r.employeeDepartment, r.exitType, r.exitDate, r.lastWorkingDay, r.status, r.gratuityAmount ?? '', r.leaveEncashmentAmount ?? '', r.totalSettlement ?? '', r.settlementPaid ? 'Yes' : 'No'].map(escape).join(','))
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', `attachment; filename="exit-export-${dateStr}.csv"`)
        return reply.send(lines.join('\r\n'))
    })
}
