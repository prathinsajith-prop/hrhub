import { getNotifications, markNotificationRead, markAllNotificationsRead, getUnreadCount } from './notifications.service.js'

export async function notificationsRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    // GET /api/v1/notifications?limit=&offset=&unreadOnly=
    fastify.get('/', { ...auth, schema: { tags: ['Notifications'] } }, async (request: any, reply: any) => {
        const { limit = '20', offset = '0', unreadOnly } = request.query as Record<string, string>
        const result = await getNotifications(
            request.user.tenantId,
            request.user.id,
            {
                limit: Math.min(Number(limit), 100),
                offset: Number(offset),
                unreadOnly: unreadOnly === 'true',
            },
        )
        return reply.send(result)
    })

    // GET /api/v1/notifications/unread-count
    fastify.get('/unread-count', { ...auth, schema: { tags: ['Notifications'] } }, async (request: any, reply: any) => {
        const count = await getUnreadCount(request.user.tenantId, request.user.id)
        return reply.send({ data: { count } })
    })

    // PATCH /api/v1/notifications/:id/read
    fastify.patch('/:id/read', { ...auth, schema: { tags: ['Notifications'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const updated = await markNotificationRead(request.user.tenantId, request.user.id, id)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Notification not found' })
        return reply.send({ data: updated })
    })

    // POST /api/v1/notifications/mark-all-read
    fastify.post('/mark-all-read', { ...auth, schema: { tags: ['Notifications'] } }, async (request: any, reply: any) => {
        const count = await markAllNotificationsRead(request.user.tenantId, request.user.id)
        return reply.send({ data: { markedRead: count } })
    })
}
