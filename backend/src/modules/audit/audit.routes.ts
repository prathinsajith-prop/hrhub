import { getLoginHistory, getActivityLogs } from './audit.service.js'

export async function auditRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    // GET /api/v1/audit/login-history?userId=&limit=
    fastify.get('/login-history', auth, async (request: any, reply: any) => {
        const { userId, limit = '50' } = request.query as Record<string, string>
        const tenantId = request.user.tenantId
        // Non-admins can only see their own history
        const role = request.user.role
        const resolvedUserId = ['hr_manager', 'super_admin'].includes(role) ? userId : request.user.id
        const data = await getLoginHistory(tenantId, resolvedUserId, Number(limit))
        return reply.send({ data })
    })

    // GET /api/v1/audit/activity?entityType=&entityId=&userId=&limit=&offset=
    fastify.get('/activity', {
        ...auth,
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        const { entityType, entityId, userId, limit = '50', offset = '0' } = request.query as Record<string, string>
        const data = await getActivityLogs(request.user.tenantId, {
            entityType, entityId, userId, limit: Number(limit), offset: Number(offset),
        })
        return reply.send({ data })
    })
}
