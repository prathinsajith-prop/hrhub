import { listLeaveRequests, createLeaveRequest, approveLeave, cancelLeave, getLeaveBalance } from './leave.service.js'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    fastify.get('/', { ...auth, schema: { tags: ['Leave'] } }, async (request, reply) => {
        const { employeeId, status, leaveType, limit = '20', offset = '0' } = request.query as Record<string, string>
        const result = await listLeaveRequests(request.user.tenantId, { employeeId, status, leaveType, limit: Number(limit), offset: Number(offset) })
        return reply.send(result)
    })

    fastify.post('/', {
        ...auth,
        schema: {
            tags: ['Leave'],
            body: {
                type: 'object',
                required: ['employeeId', 'leaveType', 'startDate', 'endDate', 'days'],
                properties: {
                    employeeId: { type: 'string', format: 'uuid' },
                    leaveType: { type: 'string' },
                    startDate: { type: 'string' },
                    endDate: { type: 'string' },
                    days: { type: 'integer', minimum: 1 },
                    reason: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const leave = await createLeaveRequest(request.user.tenantId, body as never)
        return reply.code(201).send({ data: leave })
    })

    fastify.post('/:id/approve', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'dept_head', 'super_admin')],
        schema: {
            tags: ['Leave'],
            body: {
                type: 'object',
                required: ['approved'],
                properties: { approved: { type: 'boolean' } },
            },
        },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const { approved } = request.body as { approved: boolean }
        const updated = await approveLeave(request.user.tenantId, id, request.user.id, approved)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Leave request not found or already processed' })
        return reply.send({ data: updated })
    })

    fastify.post('/:id/cancel', { ...auth, schema: { tags: ['Leave'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const updated = await cancelLeave(request.user.tenantId, id)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Leave request not found' })
        return reply.send({ data: updated })
    })

    // GET /leave/balance/:employeeId?year=2025
    fastify.get('/balance/:employeeId', {
        ...auth,
        schema: {
            tags: ['Leave'],
            params: { type: 'object', properties: { employeeId: { type: 'string', format: 'uuid' } }, required: ['employeeId'] },
            querystring: { type: 'object', properties: { year: { type: 'integer' } } },
        },
    }, async (request, reply) => {
        const { employeeId } = request.params as { employeeId: string }
        const { year = new Date().getFullYear() } = request.query as { year?: number }
        const balance = await getLeaveBalance(request.user.tenantId, employeeId, Number(year))
        if (!balance) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })
        return reply.send({ data: balance })
    })
}

