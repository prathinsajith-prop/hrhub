import { scheduleInterview, getInterviewsForApplication, getInterviewsByTenant, updateInterviewStatus, deleteInterview } from './interview.service.js'

export async function interviewRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/interviews
    fastify.get('/interviews', { ...auth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const data = await getInterviewsByTenant(request.user.tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/interviews/application/:applicationId
    fastify.get('/interviews/application/:applicationId', { ...auth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const { applicationId } = request.params as { applicationId: string }
        const data = await getInterviewsForApplication(request.user.tenantId, applicationId)
        return reply.send({ data })
    })

    // POST /api/v1/interviews
    fastify.post('/interviews', { ...adminAuth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const data = await scheduleInterview(request.user.tenantId, request.body as any)
        return reply.code(201).send({ data })
    })

    // PATCH /api/v1/interviews/:id
    fastify.patch('/interviews/:id', { ...adminAuth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await updateInterviewStatus(request.user.tenantId, id, request.body as any)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Interview not found' })
        return reply.send({ data })
    })

    // DELETE /api/v1/interviews/:id
    fastify.delete('/interviews/:id', { ...adminAuth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await deleteInterview(request.user.tenantId, id)
        return reply.code(204).send()
    })
}
