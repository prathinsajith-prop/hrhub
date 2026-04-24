import { listVisas, getVisa, createVisa, updateVisa, advanceVisaStep, softDeleteVisa, cancelVisa, recalcVisaUrgency } from './visa.service.js'
import { recordActivity } from '../audit/audit.service.js'
import { sendWithETag } from '../../lib/etag.js'
import { cacheDel } from '../../lib/redis.js'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    fastify.get('/', { ...auth, schema: { tags: ['Visa'] } }, async (request, reply) => {
        const { status, urgencyLevel, limit = '20', offset = '0', after } = request.query as Record<string, string>
        const result = await listVisas(request.user.tenantId, { status, urgencyLevel, limit: Number(limit), offset: Number(offset), after })
        return reply.send(result)
    })

    fastify.get('/:id', { ...auth, schema: { tags: ['Visa'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const visa = await getVisa(request.user.tenantId, id)
        if (!visa) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Visa application not found' })
        return reply.send({ data: visa })
    })

    fastify.post('/', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: {
            tags: ['Visa'],
            body: {
                type: 'object',
                required: ['employeeId', 'visaType'],
                properties: {
                    employeeId: { type: 'string', format: 'uuid' },
                    visaType: { type: 'string' },
                    urgencyLevel: { type: 'string', enum: ['normal', 'urgent', 'critical'] },
                    notes: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const visa = await createVisa(request.user.tenantId, body as never)
        cacheDel(`dashboard:kpis:${request.user.tenantId}`).catch(() => { })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'visa',
            entityId: visa.id,
            entityName: `Visa - ${visa.visaType ?? 'application'}`,
            action: 'create',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: visa })
    })

    fastify.patch('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Visa'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const updated = await updateVisa(request.user.tenantId, id, request.body as never)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Visa application not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'visa',
            entityId: id,
            action: 'update',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })

    fastify.post('/:id/advance', {
        preHandler: [fastify.authenticate, fastify.requireRole('pro_officer', 'hr_manager', 'super_admin')],
        schema: { tags: ['Visa'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const updated = await advanceVisaStep(request.user.tenantId, id)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Visa application not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'visa',
            entityId: id,
            entityName: `Visa step → ${updated.currentStep ?? 'next'}`,
            action: 'approve',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })

    fastify.delete('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Visa'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const deleted = await softDeleteVisa(request.user.tenantId, id)
        if (!deleted) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Visa application not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'visa',
            entityId: id,
            action: 'delete',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })

    fastify.post('/:id/cancel', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: {
            tags: ['Visa'],
            body: {
                type: 'object',
                properties: { reason: { type: 'string' } },
            },
        },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const { reason } = (request.body as any) ?? {}
        const updated = await cancelVisa(request.user.tenantId, id, reason as string | undefined)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Visa application not found' })
        cacheDel(`dashboard:kpis:${request.user.tenantId}`).catch(() => { })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'visa',
            entityId: id,
            action: 'reject',
            metadata: reason ? { reason } : undefined,
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })

    fastify.post('/recalc-urgency', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Visa'] },
    }, async (request, reply) => {
        const result = await recalcVisaUrgency(request.user.tenantId)
        return reply.send({ data: result })
    })
}

