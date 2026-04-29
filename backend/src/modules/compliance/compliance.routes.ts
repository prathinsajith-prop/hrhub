import { getEmiratisationMetrics, getExpiryAlerts, getComplianceReport } from './compliance.service.js'

export default async function(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')] }

    fastify.get('/emiratisation', { ...auth, schema: { tags: ['Compliance'] } }, async (request, reply) => {
        const data = await getEmiratisationMetrics(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/expiry-alerts', { ...auth, schema: { tags: ['Compliance'] } }, async (request, reply) => {
        const data = await getExpiryAlerts(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/report', { ...auth, schema: { tags: ['Compliance'] } }, async (request, reply) => {
        const data = await getComplianceReport(request.user.tenantId)
        return reply.send({ data })
    })
}

