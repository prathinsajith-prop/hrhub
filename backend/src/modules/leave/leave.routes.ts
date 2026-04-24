import { listLeaveRequests, createLeaveRequest, approveLeave, cancelLeave, getLeaveBalance, listLeavePolicies, upsertLeavePolicies, rolloverYear, adjustLeaveBalance } from './leave.service.js'
import { validate, createLeaveSchema, leaveActionSchema } from '../../lib/validation.js'
import { recordActivity } from '../audit/audit.service.js'
import { sendWithETag } from '../../lib/etag.js'
import { cacheDel } from '../../lib/redis.js'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    fastify.get('/', { ...auth, schema: { tags: ['Leave'] } }, async (request, reply) => {
        const { employeeId, status, leaveType, limit = '20', offset = '0' } = request.query as Record<string, string>
        const result = await listLeaveRequests(request.user.tenantId, { employeeId, status, leaveType, limit: Number(limit), offset: Number(offset) })
        return sendWithETag(reply, request, result)
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
        const updated = await approveLeave(request.user.tenantId, id, request.user.id, request.user.email, approved, request.user.employeeId ?? null)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Leave request not found or already processed' })
        // Invalidate dashboard KPI cache — pendingLeave count changed
        cacheDel(`dashboard:kpis:${request.user.tenantId}`).catch(() => { })
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
        const updated = await cancelLeave(request.user.tenantId, id, request.user.email, request.user.role, request.user.employeeId ?? null)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Leave request not found' })
        cacheDel(`dashboard:kpis:${request.user.tenantId}`).catch(() => { })
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

    // ─── Leave Policies (per-tenant config) ─────────────────────────────
    fastify.get('/policies', { ...auth, schema: { tags: ['Leave'] } }, async (request, reply) => {
        const data = await listLeavePolicies(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.put('/policies', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const body = request.body as { policies: Array<{ leaveType: string; daysPerYear: number; accrualRule: 'flat' | 'monthly_2_then_30' | 'unlimited' | 'none'; maxCarryForward: number; carryExpiresAfterMonths: number }> }
        if (!body?.policies || !Array.isArray(body.policies)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'policies[] required' })
        }
        const data = await upsertLeavePolicies(request.user.tenantId, body.policies)
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'leave_policy', entityId: request.user.tenantId, action: 'update',
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data })
    })

    // POST /leave/rollover  { fromYear }
    fastify.post('/rollover', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { fromYear } = (request.body ?? {}) as { fromYear?: number }
        const year = Number(fromYear ?? new Date().getFullYear() - 1)
        const result = await rolloverYear(request.user.tenantId, year)
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'leave_balance', entityId: request.user.tenantId, action: 'submit', metadata: { rollover: result } as any,
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: result })
    })

    // POST /leave/balance/:employeeId/adjust  { leaveType, year, delta, reason }
    fastify.post('/balance/:employeeId/adjust', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { employeeId } = request.params as { employeeId: string }
        const { leaveType, year, delta, reason } = (request.body ?? {}) as { leaveType: string; year: number; delta: number; reason?: string }
        if (!leaveType || typeof year !== 'number' || typeof delta !== 'number') {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'leaveType, year, delta required' })
        }
        const balance = await adjustLeaveBalance(request.user.tenantId, employeeId, leaveType, year, delta, reason)
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'leave_balance', entityId: employeeId, action: 'update',
            metadata: { leaveType, year, delta, reason },
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: balance })
    })
}

