import { calculateSettlement, initiateExit, getExitRequests, getExitRequest, approveExit, rejectExit, markSettlementPaid } from './exit.service.js'

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
        return reply.send({ data })
    })

    // PATCH /api/v1/exit/:id/reject
    fastify.patch('/exit/:id/reject', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const { reason } = (request.body ?? {}) as { reason?: string }
        const data = await rejectExit(request.user.tenantId, id, request.user.id, reason)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found or not pending' })
        return reply.send({ data })
    })

    // PATCH /api/v1/exit/:id/settlement-paid
    fastify.patch('/exit/:id/settlement-paid', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await markSettlementPaid(request.user.tenantId, id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found or not approved' })
        return reply.send({ data })
    })
}
