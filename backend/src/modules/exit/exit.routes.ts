import { calculateSettlement, initiateExit, getExitRequests, getExitRequest, approveExit, markSettlementPaid } from './exit.service.js'

export async function exitRoutes(fastify: any) {
    // Calculate settlement preview
    fastify.get('/exit/settlement-preview', {
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const { employeeId, exitDate, exitType } = request.query as Record<string, string>
        if (!employeeId || !exitDate || !exitType) {
            return reply.code(400).send({ error: 'employeeId, exitDate, exitType required' })
        }
        const result = await calculateSettlement(request.user.tenantId, employeeId, exitDate, exitType)
        return reply.send(result)
    })

    // Initiate exit
    fastify.post('/exit', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        const result = await initiateExit(request.user.tenantId, request.body as any)
        return reply.code(201).send(result)
    })

    // List exit requests
    fastify.get('/exit', {
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const list = await getExitRequests(request.user.tenantId)
        return reply.send(list)
    })

    // Get single exit request
    fastify.get('/exit/:id', {
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const req = await getExitRequest(request.user.tenantId, id)
        if (!req) return reply.code(404).send({ error: 'Not found' })
        return reply.send(req)
    })

    // Approve exit
    fastify.patch('/exit/:id/approve', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const req = await approveExit(request.user.tenantId, id, request.user.id)
        return reply.send(req)
    })

    // Mark settlement paid
    fastify.patch('/exit/:id/settlement-paid', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const req = await markSettlementPaid(request.user.tenantId, id)
        return reply.send(req)
    })
}
