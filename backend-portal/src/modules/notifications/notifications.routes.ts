import { and, count, desc, eq, isNull, or } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { notifications } from '../../db/schema/index.js'
import { e404 } from '../../lib/errors.js'
import { parseUuidParam } from '../../lib/validation.js'

function scope(tenantId: string, userId: string) {
    // userId IS NULL = broadcast notification (visible to everyone in the tenant)
    return and(eq(notifications.tenantId, tenantId), or(eq(notifications.userId, userId), isNull(notifications.userId)))
}

export default async function notificationsRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /api/v1/notifications?limit=20&unreadOnly=true — newest first
    fastify.get('/', { ...auth }, async (request: any, reply: any) => {
        const { tenantId, id: userId } = request.user
        const q = request.query as { limit?: string; unreadOnly?: string }
        const limit = Math.min(100, Math.max(1, Number(q?.limit ?? 20)))
        const unreadOnly = q?.unreadOnly === 'true'

        const conds = [scope(tenantId, userId)]
        if (unreadOnly) conds.push(eq(notifications.isRead, false))

        const rows = await db
            .select()
            .from(notifications)
            .where(and(...conds))
            .orderBy(desc(notifications.createdAt))
            .limit(limit)

        return reply.send({ data: rows })
    })

    // GET /api/v1/notifications/unread-count — small payload for the bell badge polling.
    fastify.get('/unread-count', { ...auth }, async (request: any, reply: any) => {
        const { tenantId, id: userId } = request.user
        const [row] = await db
            .select({ c: count() })
            .from(notifications)
            .where(and(scope(tenantId, userId), eq(notifications.isRead, false)))
        return reply.send({ data: { unread: Number(row?.c ?? 0) } })
    })

    // POST /api/v1/notifications/:id/read — mark a single notification as read
    fastify.post('/:id/read', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return
        const { tenantId, id: userId } = request.user
        const [updated] = await db
            .update(notifications)
            .set({ isRead: true })
            .where(and(scope(tenantId, userId), eq(notifications.id, id)))
            .returning()
        if (!updated) return reply.code(404).send(e404('Notification not found'))
        return reply.send({ data: updated })
    })

    // POST /api/v1/notifications/read-all — mark every visible unread notification as read
    fastify.post('/read-all', { ...auth }, async (request: any, reply: any) => {
        const { tenantId, id: userId } = request.user
        await db
            .update(notifications)
            .set({ isRead: true })
            .where(and(scope(tenantId, userId), eq(notifications.isRead, false)))
        return reply.send({ data: { ok: true } })
    })
}
