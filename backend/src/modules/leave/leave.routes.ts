import { listLeaveRequests, createLeaveRequest, approveLeave, cancelLeave, getLeaveBalance } from './leave.service.js'
import { validate, createLeaveSchema, leaveActionSchema } from '../../lib/validation.js'
import { recordActivity } from '../audit/audit.service.js'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    fastify.get('/', { ...auth, schema: { tags: ['Leave'] } }, async (request, reply) => {
        const { employeeId, status, leaveType, limit = '20', offset = '0' } = request.query as Record<string, string>
        const result = await listLeaveRequests(request.user.tenantId, { employeeId, status, leaveType, limit: Number(limit), offset: Number(offset) })
        return reply.send(result)
    })

    fastify.post('/', {
        ...auth,
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const body = validate(createLeaveSchema, request.body)
        const leave = await createLeaveRequest(request.user.tenantId, body as never)
        return reply.code(201).send({ data: leave })
    })

    fastify.post('/:id/approve', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'dept_head', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const { approved, notes } = validate(leaveActionSchema, request.body)
        const updated = await approveLeave(request.user.tenantId, id, request.user.id, approved)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Leave request not found or already processed' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'leave',
            entityId: id,
            action: approved ? 'approve' : 'reject',
            metadata: notes ? { notes } : undefined,
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
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

