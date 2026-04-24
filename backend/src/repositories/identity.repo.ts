/**
 * User \u2194 Employee resolution helpers.
 *
 * The tables are deliberately separate (auth identity vs HR record). This
 * module gives the rest of the codebase one canonical way to bridge them
 * so we don't sprinkle "find employee by email" lookups everywhere.
 */
import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { employees } from '../db/schema/employees.js'

/**
 * Resolve the employee record for a logged-in user. Prefers the
 * users.employee_id FK (added in migration 0014); falls back to a
 * case-insensitive email match for backward compatibility with
 * pre-rollout data.
 */
export async function resolveEmployeeForUser(
    tenantId: string,
    user: { id: string; email: string; employeeId?: string | null }
) {
    if (user.employeeId) {
        const [row] = await db
            .select()
            .from(employees)
            .where(and(eq(employees.tenantId, tenantId), eq(employees.id, user.employeeId)))
            .limit(1)
        if (row) return row
    }
    const [row] = await db
        .select()
        .from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            sql`LOWER(${employees.email}) = LOWER(${user.email})`,
        ))
        .limit(1)
    return row ?? null
}

/**
 * Link an existing user account to an employee. Used by HR when
 * provisioning portal access for a previously imported employee.
 */
export async function linkUserToEmployee(tenantId: string, userId: string, employeeId: string) {
    await db
        .update(users)
        .set({ employeeId, updatedAt: new Date() })
        .where(and(eq(users.tenantId, tenantId), eq(users.id, userId)))
}
