import { getReviews, createReview, updateReview, deleteReview } from './performance.service.js'

export async function performanceRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/performance
    // Admins see all reviews; employees only see their own (via employeeId JWT claim).
    fastify.get('/performance', { ...auth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const { employeeId, from, to, limit = '20', offset = '0' } = request.query as Record<string, string>
        const role = request.user.role
        const isAdmin = ['hr_manager', 'super_admin', 'dept_head'].includes(role)
        const resolvedEmployeeId = isAdmin ? employeeId : (request.user.employeeId ?? undefined)
        const data = await getReviews(request.user.tenantId, { employeeId: resolvedEmployeeId, from, to, limit: Number(limit), offset: Number(offset) })
        return reply.send({ data })
    })

    // POST /api/v1/performance
    fastify.post('/performance', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const review = await createReview(request.user.tenantId, request.user.id, request.body as any)
        return reply.code(201).send({ data: review })
    })

    // PATCH /api/v1/performance/:id
    fastify.patch('/performance/:id', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const review = await updateReview(request.user.tenantId, id, request.body as any)
        if (!review) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Performance review not found' })
        return reply.send({ data: review })
    })

    // DELETE /api/v1/performance/:id
    fastify.delete('/performance/:id', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await deleteReview(request.user.tenantId, id)
        return reply.code(204).send()
    })
}
