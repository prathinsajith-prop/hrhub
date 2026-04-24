import { eq, and, or, isNull, desc, count } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { notifications } from '../../db/schema/index.js'

// Returns both user-specific and tenant-wide broadcast (userId = null) notifications
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
    // Allow marking both user-specific and broadcast (userId = null) notifications
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
    userId: string
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
    return row
}
