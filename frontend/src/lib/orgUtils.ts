import type { OrgUnit } from '@/hooks/useOrgUnits'

/** O(1) id→OrgUnit lookup map. Pass the raw array from useOrgUnits(). */
export function buildOrgUnitMap(units: OrgUnit[]): Map<string, OrgUnit> {
    return new Map(units.map(u => [u.id, u]))
}

/**
 * Resolves [branchName, divisionName, deptName] from explicit IDs.
 * Returns null for any level where the ID is absent or not in the map.
 */
export function resolveOrgPath(
    map: Map<string, OrgUnit>,
    branchId?: string | null,
    divisionId?: string | null,
    departmentId?: string | null,
): [string | null, string | null, string | null] {
    return [
        branchId ? (map.get(branchId)?.name ?? null) : null,
        divisionId ? (map.get(divisionId)?.name ?? null) : null,
        departmentId ? (map.get(departmentId)?.name ?? null) : null,
    ]
}

/**
 * Resolves [branchName, divisionName, deptName] by walking the parentId chain
 * upward from a department ID. Useful when only departmentId is stored (e.g. Teams).
 */
export function resolveOrgPathFromDeptId(
    map: Map<string, OrgUnit>,
    deptId?: string | null,
): [string | null, string | null, string | null] {
    if (!deptId) return [null, null, null]
    const dept = map.get(deptId)
    if (!dept) return [null, null, null]
    const division = dept.parentId ? map.get(dept.parentId) ?? null : null
    const branch = division?.parentId ? map.get(division.parentId) ?? null : null
    return [branch?.name ?? null, division?.name ?? null, dept.name]
}
