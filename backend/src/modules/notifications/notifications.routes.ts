import { z } from 'zod'
import { getNotifications, markNotificationRead, markAllNotificationsRead, getUnreadCount } from './notifications.service.js'
import { e404 } from '../../lib/errors.js'
import { validate, parseUuidParam } from '../../lib/validation.js'

const listQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
    unreadOnly: z.preprocess(v => v === 'true' || v === true, z.boolean()).optional().default(false),
})

export async function notificationsRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    // GET /api/v1/notifications?limit=&offset=&unreadOnly=
    fastify.get('/', { ...auth, schema: { tags: ['Notifications'] } }, async (request: any, reply: any) => {
        const query = validate(listQuerySchema, request.query)
        const result = await getNotifications(request.user.tenantId, request.user.id, query)
        return reply.send(result)
    })

    // GET /api/v1/notifications/unread-count
    fastify.get('/unread-count', { ...auth, schema: { tags: ['Notifications'] } }, async (request: any, reply: any) => {
        const count = await getUnreadCount(request.user.tenantId, request.user.id)
        return reply.send({ data: { count } })
    })

    // PATCH /api/v1/notifications/:id/read
    fastify.patch('/:id/read', { ...auth, schema: { tags: ['Notifications'] } }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params as Record<string, unknown>, 'id', reply)
        if (!id) return
        const updated = await markNotificationRead(request.user.tenantId, request.user.id, id)
        if (!updated) return reply.code(404).send(e404('Notification not found'))
        return reply.send({ data: updated })
    })

    // POST /api/v1/notifications/mark-all-read
    fastify.post('/mark-all-read', { ...auth, schema: { tags: ['Notifications'] } }, async (request: any, reply: any) => {
        const count = await markAllNotificationsRead(request.user.tenantId, request.user.id)
        return reply.send({ data: { markedRead: count } })
    })
}
