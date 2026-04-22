import { eq, and, desc, count } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { notifications } from '../../db/schema/index.js'

export async function getNotifications(
    tenantId: string,
    userId: string,
    params: { limit: number; offset: number; unreadOnly: boolean },
) {
    const { limit, offset, unreadOnly } = params
    const conditions = [eq(notifications.tenantId, tenantId), eq(notifications.userId, userId)]
    if (unreadOnly) conditions.push(eq(notifications.isRead, false))

    const [{ total }] = await db.select({ total: count() })
        .from(notifications)
        .where(and(...conditions))

    const data = await db.select().from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
        .offset(offset)

    return { data, total: Number(total), limit, offset, hasMore: offset + limit < Number(total) }
}

export async function getUnreadCount(tenantId: string, userId: string): Promise<number> {
    const [{ total }] = await db.select({ total: count() })
        .from(notifications)
        .where(and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId), eq(notifications.isRead, false)))
    return Number(total)
}

export async function markNotificationRead(tenantId: string, userId: string, id: string) {
    const [row] = await db.update(notifications)
        .set({ isRead: true })
        .where(and(
            eq(notifications.id, id),
            eq(notifications.tenantId, tenantId),
            eq(notifications.userId, userId),
        ))
        .returning()
    return row ?? null
}

export async function markAllNotificationsRead(tenantId: string, userId: string): Promise<number> {
    const rows = await db.update(notifications)
        .set({ isRead: true })
        .where(and(
            eq(notifications.tenantId, tenantId),
            eq(notifications.userId, userId),
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
