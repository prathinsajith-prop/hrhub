import { sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import type { RequestUser } from '../types/index.js'

/**
 * Recursively collect all employee IDs in the reporting subtree rooted at `rootId`
 * (the root itself is included). Uses a recursive CTE so the whole walk is one round-trip.
 *
 * Result is cached on the FastifyRequest for the lifetime of a single request so
 * multiple guards (e.g. /leave/:id/cancel triggers canAccessEmployee + resolveAllowedEmployeeIds
 * + a per-employee canAccessEmployee) only execute the CTE once.
 */
async function fetchReportingSubtreeIds(tenantId: string, rootId: string): Promise<string[]> {
    const rows = await db.execute(sql`
        WITH RECURSIVE subtree AS (
            SELECT id FROM employees WHERE tenant_id = ${tenantId} AND id = ${rootId}
            UNION ALL
            SELECT e.id FROM employees e
            INNER JOIN subtree s ON e.reporting_to = s.id
            WHERE e.tenant_id = ${tenantId}
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
