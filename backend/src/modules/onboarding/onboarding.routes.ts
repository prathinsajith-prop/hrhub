// @ts-nocheck
import type { FastifyPluginAsync } from 'fastify/types/plugin.js'
import { getChecklist, updateStep, listChecklists } from './onboarding.service.js'

const onboardingRoutes: FastifyPluginAsync = async (fastify) => {
    const auth = { preHandler: [fastify.authenticate] }

    fastify.get('/', { ...auth, schema: { tags: ['Onboarding'] } }, async (request, reply) => {
        const { limit = '20', offset = '0' } = request.query as Record<string, string>
        const data = await listChecklists(request.user.tenantId, { limit: Number(limit), offset: Number(offset) })
        return reply.send({ data })
    })

    fastify.get('/employee/:employeeId', { ...auth, schema: { tags: ['Onboarding'] } }, async (request, reply) => {
        const { employeeId } = request.params as { employeeId: string }
        const checklist = await getChecklist(request.user.tenantId, employeeId)
        if (!checklist) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Onboarding checklist not found' })
        return reply.send({ data: checklist })
    })

    fastify.patch('/:checklistId/steps/:stepId', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: {
            tags: ['Onboarding'],
            body: {
                type: 'object',
                properties: {
                    status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'overdue'] },
                    notes: { type: 'string' },
                    completedDate: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const { checklistId, stepId } = request.params as { checklistId: string; stepId: string }
        const result = await updateStep(request.user.tenantId, checklistId, stepId, request.body as never)
        if (!result) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Step not found' })
        return reply.send({ data: result })
    })
}

export default onboardingRoutes
