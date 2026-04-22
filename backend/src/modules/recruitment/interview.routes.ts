import { scheduleInterview, getInterviewsForApplication, getInterviewsByTenant, updateInterviewStatus, deleteInterview } from './interview.service.js'

export async function interviewRoutes(fastify: any) {
    // List all interviews for tenant
    fastify.get('/interviews', {
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const list = await getInterviewsByTenant(request.user.tenantId)
        return reply.send(list)
    })

    // Get interviews for an application
    fastify.get('/interviews/application/:applicationId', {
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const { applicationId } = request.params as { applicationId: string }
        const list = await getInterviewsForApplication(applicationId)
        return reply.send(list)
    })

    // Schedule interview
    fastify.post('/interviews', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        const interview = await scheduleInterview(request.user.tenantId, request.body as any)
        return reply.code(201).send(interview)
    })

    // Update interview status / add feedback
    fastify.patch('/interviews/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const interview = await updateInterviewStatus(request.user.tenantId, id, request.body as any)
        return reply.send(interview)
    })

    // Cancel interview
    fastify.delete('/interviews/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await deleteInterview(request.user.tenantId, id)
        return reply.code(204).send()
    })
}
