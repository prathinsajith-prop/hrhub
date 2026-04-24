import { getChecklist, updateStep, listChecklists, addStep, deleteStep, createChecklist, getAnalytics } from './onboarding.service.js'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const writeAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')] }

    fastify.get('/analytics', { ...auth, schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
        const data = await getAnalytics(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.post('/', {
        ...writeAuth,
        schema: {
            tags: ['Onboarding'],
            body: {
                type: 'object',
                required: ['employeeId'],
                properties: {
                    employeeId: { type: 'string', format: 'uuid' },
                    startDate: { type: 'string' },
                    dueDate: { type: 'string' },
                    useTemplate: { type: 'boolean' },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const result = await createChecklist(request.user.tenantId, request.body as never)
        if ('error' in result) {
            if (result.error === 'employee_not_found') return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })
            if (result.error === 'already_exists') return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Onboarding checklist already exists for this employee' })
        }
        return reply.code(201).send({ data: (result as any).checklist })
    })

    fastify.get('/', { ...auth, schema: { tags: ['Onboarding'] } }, async (request: any, reply: any) => {
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
        ...writeAuth,
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

    fastify.post('/:checklistId/steps', {
        ...writeAuth,
        schema: {
            tags: ['Onboarding'],
            body: {
                type: 'object',
                required: ['title'],
                properties: {
                    title: { type: 'string', minLength: 1 },
                    owner: { type: 'string' },
                    dueDate: { type: 'string' },
                    slaDays: { type: 'number' },
                },
            },
        },
    }, async (request, reply) => {
        const { checklistId } = request.params as { checklistId: string }
        const result = await addStep(request.user.tenantId, checklistId, request.body as never)
        if (!result) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Checklist not found' })
        return reply.code(201).send({ data: result })
    })

    fastify.delete('/:checklistId/steps/:stepId', writeAuth, async (request, reply) => {
        const { checklistId, stepId } = request.params as { checklistId: string; stepId: string }
        const result = await deleteStep(request.user.tenantId, checklistId, stepId)
        if (!result) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Step not found' })
        return reply.send({ data: result })
    })
}

