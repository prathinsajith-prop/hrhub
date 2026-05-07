import { eq, and, or, isNull, desc, count } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { notifications } from '../../db/schema/index.js'
import { broadcastToUser, broadcastToTenant } from '../../lib/ws-registry.js'

function notificationScope(tenantId: string, userId: string) {
    return and(
        eq(notifications.tenantId, tenantId),
        or(eq(notifications.userId, userId), isNull(notifications.userId)),
    )
}

export async function getNotifications(
    tenantId: string,
    userId: string,
    params: { limit: number; offset: number; unreadOnly: boolean },
) {
    const { limit, offset, unreadOnly } = params
    const scope = notificationScope(tenantId, userId)
    const conditions = unreadOnly ? and(scope, eq(notifications.isRead, false)) : scope

    const [{ total }] = await db.select({ total: count() })
        .from(notifications)
        .where(conditions)

    const data = await db.select().from(notifications)
        .where(conditions)
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset)

    return { data, total: Number(total), limit, offset, hasMore: offset + limit < Number(total) }
}

export async function getUnreadCount(tenantId: string, userId: string): Promise<number> {
    const [{ total }] = await db.select({ total: count() })
        .from(notifications)
        .where(and(
            notificationScope(tenantId, userId),
            eq(notifications.isRead, false),
        ))
    return Number(total)
}

export async function markNotificationRead(tenantId: string, userId: string, id: string) {
    const [row] = await db.update(notifications)
        .set({ isRead: true })
        .where(and(
            eq(notifications.id, id),
            eq(notifications.tenantId, tenantId),
            or(eq(notifications.userId, userId), isNull(notifications.userId)),
        ))
        .returning()
    return row ?? null
}

export async function markAllNotificationsRead(tenantId: string, userId: string): Promise<number> {
    const rows = await db.update(notifications)
        .set({ isRead: true })
        .where(and(
            notificationScope(tenantId, userId),
            eq(notifications.isRead, false),
        ))
        .returning({ id: notifications.id })
    return rows.length
}

export async function createNotification(params: {
    tenantId: string
    userId: string | null  // null = tenant-wide broadcast
    type: 'info' | 'warning' | 'error' | 'success'
    title: string
    message: string
    actionUrl?: string
}) {
    const [row] = await db.insert(notifications).values({
        tenantId: params.tenantId,
        userId: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl ?? null,
    }).returning()

    const event = {
        type: 'notification:new',
        payload: {
            id: row.id,
            notificationType: row.type,
            title: row.title,
            message: row.message,
            actionUrl: row.actionUrl,
            createdAt: row.createdAt,
        },
    }

    if (params.userId) {
        broadcastToUser(params.userId, params.tenantId, event)
    } else {
        broadcastToTenant(params.tenantId, event)
    }

    return row
}
