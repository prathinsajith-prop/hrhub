import { getLoginHistory, getActivityLogs } from './audit.service.js'

export async function auditRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/audit/login-history?userId=&limit=&offset=
    // Admins may query any userId; non-admins always see their own.
    fastify.get('/login-history', { ...auth, schema: { tags: ['Audit'] } }, async (request: any, reply: any) => {
        const { userId, limit = '50', offset = '0' } = request.query as Record<string, string>
        const role = request.user.role
        const isAdmin = ['hr_manager', 'super_admin'].includes(role)
        const resolvedUserId = isAdmin ? userId : request.user.id
        const data = await getLoginHistory(request.user.tenantId, resolvedUserId, Number(limit), Number(offset))
        return reply.send({ data })
    })

    // GET /api/v1/audit/activity?entityType=&entityId=&userId=&limit=&offset=
    fastify.get('/activity', { ...adminAuth, schema: { tags: ['Audit'] } }, async (request: any, reply: any) => {
        const { entityType, entityId, userId, limit = '50', offset = '0' } = request.query as Record<string, string>
        const data = await getActivityLogs(request.user.tenantId, {
            entityType, entityId, userId, limit: Number(limit), offset: Number(offset),
        })
        return reply.send({ data })
    })
}
