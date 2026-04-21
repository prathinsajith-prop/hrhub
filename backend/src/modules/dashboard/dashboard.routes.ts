import { getDashboardKPIs, getRecentNotifications, getPayrollTrend, getNationalityBreakdown, getDeptHeadcount, getEmiratisationStatus } from './dashboard.service.js'

export default async function(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    fastify.get('/kpis', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getDashboardKPIs(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/notifications', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const { limit = '10' } = request.query as { limit?: string }
        const data = await getRecentNotifications(request.user.tenantId, request.user.id, Number(limit))
        return reply.send({ data })
    })

    fastify.get('/payroll-trend', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getPayrollTrend(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/nationality-breakdown', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getNationalityBreakdown(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/dept-headcount', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getDeptHeadcount(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/emiratisation', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getEmiratisationStatus(request.user.tenantId)
        return reply.send({ data })
    })
}

