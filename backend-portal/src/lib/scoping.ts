import { and, eq, or, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { employees } from '../db/schema/index.js'
import type { RequestUser } from '../types/index.js'

/**
 * Recursively collect all employee IDs in the reporting subtree rooted at `rootId`
 * (the root itself is included). Uses a recursive CTE so the whole walk is one round-trip.
 *
 * Result is cached on the FastifyRequest for the lifetime of a single request so
 * multiple guards (e.g. /leave/:id/cancel triggers canAccessEmployee + resolveAllowedEmployeeIds
 * + a per-employee canAccessEmployee) only execute the CTE once.
 *
 * Cycle-safe: the walk carries the visited-ID path and refuses to follow an
 * edge that would re-enter a node already in the path. A previous bug surfaced
 * here because an employee's `reporting_to` pointed at their own id (a
 * self-loop), and `UNION ALL` with no guard recursed forever until Neon's
 * statement_timeout killed the query and every team-list / leave / attendance
 * endpoint returned 500 / 401. Belt-and-braces: also cap path length at 50,
 * which is well above any realistic org depth.
 */
async function fetchReportingSubtreeIds(tenantId: string, rootId: string): Promise<string[]> {
    const rows = await db.execute(sql`
        WITH RECURSIVE subtree AS (
            SELECT id, ARRAY[id] AS path
            FROM employees WHERE tenant_id = ${tenantId} AND id = ${rootId}
            UNION ALL
            SELECT e.id, s.path || e.id
            FROM employees e
            INNER JOIN subtree s ON e.reporting_to = s.id
            WHERE e.tenant_id = ${tenantId}
              AND NOT (e.id = ANY(s.path))
              AND array_length(s.path, 1) < 50
        )
        SELECT id FROM subtree
    `)
    return (rows as any[]).map((r) => r.id as string)
}

export async function getReportingSubtreeIds(
    tenantId: string,
    rootId: string,
    request?: { _subtreeCache?: Map<string, string[]> },
): Promise<string[]> {
    if (!request) return fetchReportingSubtreeIds(tenantId, rootId)
    if (!request._subtreeCache) request._subtreeCache = new Map()
    const key = `${tenantId}:${rootId}`
    const cached = request._subtreeCache.get(key)
    if (cached) return cached
    const ids = await fetchReportingSubtreeIds(tenantId, rootId)
    request._subtreeCache.set(key, ids)
    return ids
}

export function isElevated(user: Pick<RequestUser, 'roles'>): boolean {
    return user.roles.includes('hr_manager') || user.roles.includes('super_admin')
}

export function isDeptHead(user: Pick<RequestUser, 'roles'>): boolean {
    return user.roles.includes('dept_head')
}

/**
 * Resolve the set of employee IDs this user is allowed to access in the portal.
 *
 *   - HR / super_admin → null (no restriction)
 *   - dept_head        → recursive subtree of their own employeeId
 *   - everyone else    → just their own employeeId (or [] if absent)
 *
 * Callers should treat `null` as "no filter" and an empty array as "no access".
 */
export async function resolveAllowedEmployeeIds(
    user: RequestUser,
    request?: { _subtreeCache?: Map<string, string[]> },
): Promise<string[] | null> {
    if (isElevated(user)) return null
    if (isDeptHead(user) && user.employeeId) {
        return getReportingSubtreeIds(user.tenantId, user.employeeId, request)
    }
    return user.employeeId ? [user.employeeId] : []
}

/**
 * True if `targetEmployeeId` is within the requester's visibility scope.
 * Encapsulates "own / dept_head subtree / HR sees all" without duplicating
 * the recursive-CTE call in every route.
 *
 * Sensitive endpoints (documents, leave history, attendance, salary history)
 * should keep using THIS function — it does NOT include same-department
 * peers. For relaxed "can see this person's basic profile?" checks use
 * `canViewTeammate` instead.
 */
export async function canAccessEmployee(
    user: RequestUser,
    targetEmployeeId: string,
    request?: { _subtreeCache?: Map<string, string[]> },
): Promise<boolean> {
    if (isElevated(user)) return true
    if (targetEmployeeId === user.employeeId) return true
    if (isDeptHead(user) && user.employeeId) {
        const subtree = await getReportingSubtreeIds(user.tenantId, user.employeeId, request)
        return subtree.includes(targetEmployeeId)
    }
    return false
}

/**
 * Fetch the requester's own department row (id and legacy text column). Cached
 * on the request so two calls during one HTTP request don't double up.
 */
async function fetchSelfDepartment(
    user: RequestUser,
    request?: { _selfDeptCache?: { departmentId: string | null; department: string | null } | null },
): Promise<{ departmentId: string | null; department: string | null } | null> {
    if (!user.employeeId) return null
    if (request && request._selfDeptCache !== undefined) return request._selfDeptCache
    const [row] = await db
        .select({ departmentId: employees.departmentId, department: employees.department })
        .from(employees)
        .where(and(eq(employees.tenantId, user.tenantId), eq(employees.id, user.employeeId)))
        .limit(1)
    const value = row ?? null
    if (request) request._selfDeptCache = value
    return value
}

/**
 * Return a SQL predicate that matches everyone visible in the team-list view:
 *
 *   - HR / super_admin → `null` (no restriction; caller skips the AND clause)
 *   - dept_head        → reporting subtree OR same-department peers
 *   - everyone else    → same-department peers (including themselves)
 *
 * "Same department" prefers the `department_id` FK; falls back to the legacy
 * text column when the FK isn't set, matching the priority used in colleagues
 * lookup and the org-unit display COALESCE.
 *
 * Designed for the wide list view — peers see only the slim columns the route
 * projects (no salary / passport / bank). Documents, leave history, attendance
 * and similar PII endpoints stay on `canAccessEmployee`.
 */
export async function buildTeammateScopeWhere(
    user: RequestUser,
    request?: { _subtreeCache?: Map<string, string[]>; _selfDeptCache?: { departmentId: string | null; department: string | null } | null },
) {
    if (isElevated(user)) return null
    if (!user.employeeId) return sql`false`

    const me = await fetchSelfDepartment(user, request)
    const sameDeptPredicate = me?.departmentId
        ? eq(employees.departmentId, me.departmentId)
        : me?.department
            ? eq(employees.department, me.department)
            : null

    const orParts = [eq(employees.id, user.employeeId)]
    if (sameDeptPredicate) orParts.push(sameDeptPredicate)

    if (isDeptHead(user)) {
        const subtree = await getReportingSubtreeIds(user.tenantId, user.employeeId, request)
        if (subtree.length > 0) {
            // Avoid drizzle-orm `inArray` for an inline literal list; using a
            // SQL fragment lets us reuse the same pattern as the existing
            // /employees route which paginates by allowed IDs.
            orParts.push(
                sql`${employees.id} IN (${sql.join(subtree.map((id) => sql`${id}`), sql`, `)})`,
            )
        }
    }

    return orParts.length === 1 ? orParts[0] : or(...orParts)
}

/**
 * Relaxed sibling of `canAccessEmployee` used for the basic profile screen.
 * Returns true when the target is visible in the team-list scope — i.e. self,
 * a same-department peer, a reporting-subtree member, or any employee when
 * the requester is HR/super_admin.
 *
 * Does NOT grant access to documents, salary history, or any other endpoint
 * that uses `canAccessEmployee`.
 */
export async function canViewTeammate(
    user: RequestUser,
    targetEmployeeId: string,
    request?: { _subtreeCache?: Map<string, string[]>; _selfDeptCache?: { departmentId: string | null; department: string | null } | null },
): Promise<boolean> {
    if (await canAccessEmployee(user, targetEmployeeId, request)) return true
    const me = await fetchSelfDepartment(user, request)
    if (!me) return false

    const [row] = await db
        .select({ departmentId: employees.departmentId, department: employees.department })
        .from(employees)
        .where(and(eq(employees.tenantId, user.tenantId), eq(employees.id, targetEmployeeId)))
        .limit(1)
    if (!row) return false

    if (me.departmentId && row.departmentId) return me.departmentId === row.departmentId
    if (me.department && row.department) return me.department === row.department
    return false
}
