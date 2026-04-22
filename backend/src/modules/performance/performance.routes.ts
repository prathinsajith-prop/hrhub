import { getReviews, createReview, updateReview, deleteReview } from './performance.service.js'

export async function performanceRoutes(fastify: any) {
    fastify.get('/performance', {
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const { employeeId } = request.query as { employeeId?: string }
        return reply.send(await getReviews(request.user.tenantId, employeeId))
    })

    fastify.post('/performance', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        const review = await createReview(request.user.tenantId, request.user.id, request.body as any)
        return reply.code(201).send(review)
    })

    fastify.patch('/performance/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const review = await updateReview(request.user.tenantId, id, request.body as any)
        return reply.send(review)
    })

    fastify.delete('/performance/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await deleteReview(request.user.tenantId, id)
        return reply.code(204).send()
    })
}
