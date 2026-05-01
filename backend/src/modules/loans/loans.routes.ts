import { recordActivity } from '../audit/audit.service.js'
import {
    listLoans,
    getLoan,
    createLoan,
    approveLoan,
    rejectLoan,
    recordLoanPayment,
    getEmployeeAllLoans,
} from './loans.service.js'

export default async function loansRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const hrOnly = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/loans?employeeId=&status=&limit=&offset=
    fastify.get('/', auth, async (request: any, reply: any) => {
        const user = request.user
        const qs = request.query as { employeeId?: string; status?: string; limit?: string; offset?: string }

        // Employees can only see their own loans
        let employeeId = qs.employeeId
        const isElevated = ['hr_manager', 'super_admin'].includes(user.role)
        if (!isElevated) employeeId = user.employeeId ?? undefined

        const result = await listLoans(user.tenantId, {
            employeeId,
            status: qs.status,
            limit: Math.min(Number(qs.limit ?? 25), 100),
            offset: Number(qs.offset ?? 0),
        })
        return reply.send(result)
    })

    // GET /api/v1/loans/my — employee self-service
    fastify.get('/my', auth, async (request: any, reply: any) => {
        const empId = request.user.employeeId
        if (!empId) return reply.send({ data: [] })
        const data = await getEmployeeAllLoans(request.user.tenantId, empId)
        return reply.send({ data })
    })

    // GET /api/v1/loans/:id
    fastify.get('/:id', auth, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await getLoan(request.user.tenantId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Loan not found' })

        const user = request.user
        const isElevated = ['hr_manager', 'super_admin'].includes(user.role)
        if (!isElevated && row.employeeId !== user.employeeId) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied' })
        }
        return reply.send({ data: row })
    })

    // POST /api/v1/loans — request a loan (employee or HR)
    fastify.post('/', auth, async (request: any, reply: any) => {
        const body = request.body as Record<string, unknown>
        const user = request.user
        const isElevated = ['hr_manager', 'super_admin'].includes(user.role)

        // Employees can only request for themselves
        let employeeId = body.employeeId as string
        if (!isElevated) {
            if (!user.employeeId) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'No employee profile linked' })
            employeeId = user.employeeId
        }

        const row = await createLoan(user.tenantId, {
            employeeId,
            amount: body.amount as string,
            monthlyDeduction: body.monthlyDeduction as string,
            reason: body.reason as string | undefined,
            notes: body.notes as string | undefined,
        })
        recordActivity({
            tenantId: user.tenantId,
            userId: user.id,
            actorName: user.name,
            actorRole: user.role,
            entityType: 'employee_loan',
            entityId: row.id,
            entityName: `Loan AED ${row.amount}`,
            action: 'create',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: row })
    })

    // POST /api/v1/loans/:id/approve
    fastify.post('/:id/approve', hrOnly, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const body = request.body as { startDate?: string }
        const updated = await approveLoan(request.user.tenantId, id, request.user.id, body.startDate)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee_loan',
            entityId: updated.id,
            entityName: `Loan AED ${updated.amount}`,
            action: 'approve',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })

    // POST /api/v1/loans/:id/reject
    fastify.post('/:id/reject', hrOnly, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const body = request.body as { notes?: string }
        const updated = await rejectLoan(request.user.tenantId, id, body.notes)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee_loan',
            entityId: updated.id,
            entityName: `Loan AED ${updated.amount}`,
            action: 'reject',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })

    // POST /api/v1/loans/:id/payment — record monthly deduction
    fastify.post('/:id/payment', hrOnly, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const updated = await recordLoanPayment(request.user.tenantId, id)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee_loan',
            entityId: updated.id,
            entityName: `Loan AED ${updated.amount}`,
            action: 'update',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })
}
