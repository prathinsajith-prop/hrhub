import { eq, and, or, isNull, desc, count, sql, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { notifications, users, employees } from '../../db/schema/index.js'
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

/**
 * Notify an employee in-app by resolving their user account first. Mirrors the
 * portal's `notifyRequester` so HR-side actions (loan/exit/transfer/asset/
 * performance/document decisions) can alert the affected employee with a single
 * call. Resolution priority:
 *   1. users.employeeId FK (canonical — covers employees with no email on file)
 *   2. case-insensitive employees.email ↔ users.email match (legacy fallback)
 * No-ops silently when no user account is linked. Fire-and-forget at call sites
 * (`.catch(() => {})`) so a notification failure never breaks the mutation.
 */
export async function notifyEmployee(
    tenantId: string,
    employeeId: string | null | undefined,
    params: { type: 'info' | 'warning' | 'error' | 'success'; title: string; message: string; actionUrl?: string },
): Promise<void> {
    if (!employeeId) return
    const [byFk] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, employeeId), eq(users.isActive, true)))
        .limit(1)
    let userId = byFk?.id ?? null
    if (!userId) {
        const [byEmail] = await db
            .select({ userId: users.id })
            .from(employees)
            .leftJoin(users, sql`lower(${users.email}) = lower(${employees.email})`)
            .where(and(eq(employees.tenantId, tenantId), eq(employees.id, employeeId)))
            .limit(1)
        userId = byEmail?.userId ?? null
    }
    if (!userId) return
    await createNotification({ tenantId, userId, ...params })
}

/**
 * Resolve the active users holding any of the given roles for a tenant.
 * Returns id/name/email so a caller can both in-app notify AND email them
 * (e.g. "new job application", "new complaint", "travel request submitted").
 */
export async function getRecipientsByRoles(
    tenantId: string,
    roles: string[],
): Promise<Array<{ id: string; name: string | null; email: string }>> {
    if (!roles.length) return []
    return db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(and(
            eq(users.tenantId, tenantId),
            eq(users.isActive, true),
            inArray(users.role, roles as never[]),
        ))
}

/**
 * In-app notify every active user holding any of the given roles (e.g. alert all
 * HR managers + super admins). One query to resolve, then a notification per
 * user. Fire-and-forget at call sites. Returns the number notified.
 */
export async function notifyRoles(
    tenantId: string,
    roles: string[],
    params: { type: 'info' | 'warning' | 'error' | 'success'; title: string; message: string; actionUrl?: string },
): Promise<number> {
    const recipients = await getRecipientsByRoles(tenantId, roles)
    await Promise.all(recipients.map((r) => createNotification({ tenantId, userId: r.id, ...params })))
    return recipients.length
}

/**
 * Bulk in-app notification fan-out — for events that target many employees at
 * once (e.g. publishing an announcement to a department/branch/whole org).
 * Resolves employee→user accounts in ONE query and bulk-inserts notification
 * rows in chunks, instead of N per-employee round-trips. WebSocket push is
 * skipped here (the bell polls); use createNotification for single, live alerts.
 * Returns the number of notifications written.
 */
export async function notifyEmployeesBulk(
    tenantId: string,
    employeeIds: string[],
    params: { type: 'info' | 'warning' | 'error' | 'success'; title: string; message: string; actionUrl?: string },
): Promise<number> {
    if (!employeeIds.length) return 0
    // Resolve linked, active user accounts for these employees (one query).
    const userRows = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true), inArray(users.employeeId, employeeIds)))
    if (!userRows.length) return 0
    const values = userRows.map((u) => ({
        tenantId,
        userId: u.id,
        type: params.type,
        title: params.title,
        message: params.message,
        actionUrl: params.actionUrl ?? null,
    }))
    // Chunked bulk insert keeps each statement well under parameter limits.
    const CHUNK = 1000
    for (let i = 0; i < values.length; i += CHUNK) {
        await db.insert(notifications).values(values.slice(i, i + CHUNK))
    }
    return values.length
}
