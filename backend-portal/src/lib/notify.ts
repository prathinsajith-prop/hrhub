// Shared notification helpers for the portal's approval workflows.
//
// Two flavours:
//   1. notifyReviewers — fires when an employee submits something that needs
//      approval. Inserts one notification row per active hr_manager /
//      super_admin in the tenant, plus the submitter's direct dept_head (if
//      they can be resolved via employees.reportingTo → users.email).
//   2. notifyRequester — fires when HR/manager approves or rejects. Inserts
//      one notification row for the user account behind the original
//      submitting employee.
//
// Both are designed to be called fire-and-forget (`.catch(() => {})`) so the
// notification path can never block or fail the underlying mutation.

import { and, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '../db/client.js'
import { employees, notifications, users } from '../db/schema/index.js'

type NotificationType = 'info' | 'warning' | 'error' | 'success'

interface NotifyReviewersInput {
    tenantId: string
    /** Employee whose record was the subject of the request. Used to find
     *  their direct dept_head and to skip self-notification. */
    actorEmployeeId: string | null
    /** Human-readable action label, e.g. "bank details", "leave request". */
    title: string
    /** Body line, e.g. "3 fields pending review". */
    message: string
    actionUrl: string
    type?: NotificationType
}

interface NotifyRequesterInput {
    tenantId: string
    /** Employee being notified (the original requester). */
    employeeId: string
    title: string
    message: string
    actionUrl?: string
    type?: NotificationType
}

/**
 * Find HR-class reviewers + the submitter's direct dept_head, then write one
 * `notifications` row per reviewer. Bulk insert in a single round-trip.
 */
export async function notifyReviewers({
    tenantId,
    actorEmployeeId,
    title,
    message,
    actionUrl,
    type = 'info',
}: NotifyReviewersInput): Promise<void> {
    const hrUsers = await db
        .select({ id: users.id })
        .from(users)
        .where(
            and(
                eq(users.tenantId, tenantId),
                eq(users.isActive, true),
                sql`(${users.role} IN ('hr_manager', 'super_admin') OR 'hr_manager' = ANY(${users.roles}) OR 'super_admin' = ANY(${users.roles}))`,
            ),
        )

    const reviewerIds = new Set(hrUsers.map((u) => u.id))

    if (actorEmployeeId) {
        const manager = alias(employees, 'manager') as any
        const direct = await db
            .select({ managerUserId: users.id })
            .from(employees)
            .leftJoin(manager, eq(manager.id, employees.reportingTo))
            .leftJoin(users, sql`lower(${users.email}) = lower(${manager.email})`)
            .where(and(eq(employees.tenantId, tenantId), eq(employees.id, actorEmployeeId)))
            .limit(1)
            .catch(() => [] as Array<{ managerUserId: string | null }>)
        const managerUserId = direct[0]?.managerUserId
        if (managerUserId) reviewerIds.add(managerUserId)
    }

    if (reviewerIds.size === 0) return

    await db.insert(notifications).values(
        Array.from(reviewerIds).map((userId) => ({
            tenantId,
            userId,
            type,
            title,
            message,
            actionUrl,
        })),
    )
}

/**
 * Look up the user account behind an employee and write one notification row
 * to them. Used when HR approves/rejects something the employee submitted.
 *
 * Lookup priority:
 *   1. users.employee_id FK (canonical) — covers employees with no email on
 *      file, since the user was created with this employee link
 *   2. case-insensitive employees.email ↔ users.email match (fallback for
 *      legacy data where the FK is null)
 */
export async function notifyRequester({
    tenantId,
    employeeId,
    title,
    message,
    actionUrl,
    type = 'info',
}: NotifyRequesterInput): Promise<void> {
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

    await db.insert(notifications).values({
        tenantId,
        userId,
        type,
        title,
        message,
        actionUrl,
    })
}
