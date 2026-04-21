// @ts-nocheck
import type { FastifyPluginAsync } from 'fastify/types/plugin.js'
import { listLeaveRequests, createLeaveRequest, approveLeave, cancelLeave } from './leave.service.js'

const leaveRoutes: FastifyPluginAsync = async (fastify) => {
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
}

export default leaveRoutes
