import { db } from '../../db/index.js'
import { orgUnits, employees, tenants } from '../../db/schema/index.js'
import { eq, and, asc, sql, count } from 'drizzle-orm'

export type OrgUnitType = 'division' | 'department' | 'branch'

export interface OrgUnitInput {
    name: string
    code?: string
    type: OrgUnitType
    parentId?: string | null
    headEmployeeId?: string | null
    description?: string
    isActive?: boolean
    sortOrder?: number
}

export interface OrgUnitNode {
    id: string
    tenantId: string
    name: string
    code: string | null
    type: OrgUnitType
    parentId: string | null
    headEmployeeId: string | null
    headEmployeeName: string | null
    description: string | null
    isActive: boolean
    sortOrder: number
    createdAt: Date
    updatedAt: Date
    children: OrgUnitNode[]
}

export async function listOrgUnits(tenantId: string) {
    const rows = await db
        .select({
            id: orgUnits.id,
            tenantId: orgUnits.tenantId,
            name: orgUnits.name,
            code: orgUnits.code,
            type: orgUnits.type,
            parentId: orgUnits.parentId,
            headEmployeeId: orgUnits.headEmployeeId,
            headEmployeeName: sql<string | null>`CASE WHEN ${employees.id} IS NOT NULL THEN ${employees.firstName} || ' ' || ${employees.lastName} ELSE NULL END`,
            description: orgUnits.description,
            isActive: orgUnits.isActive,
            sortOrder: orgUnits.sortOrder,
            createdAt: orgUnits.createdAt,
            updatedAt: orgUnits.updatedAt,
        })
        .from(orgUnits)
        .leftJoin(employees, eq(orgUnits.headEmployeeId, employees.id))
        .where(eq(orgUnits.tenantId, tenantId))
        .orderBy(asc(orgUnits.sortOrder), asc(orgUnits.name))

    return rows
}

export async function getOrgUnitTree(tenantId: string): Promise<OrgUnitNode[]> {
    const all = await listOrgUnits(tenantId)

    const map = new Map<string, OrgUnitNode>()
    for (const row of all) {
        map.set(row.id, { ...row, children: [] } as OrgUnitNode)
    }

    const roots: OrgUnitNode[] = []
    for (const node of map.values()) {
        if (node.parentId && map.has(node.parentId)) {
            map.get(node.parentId)!.children.push(node)
        } else {
            roots.push(node)
        }
    }

    return roots
}

/**
 * Strips branch nodes from a tree — used for dept_head view where branches
 * are an employee-level concept and shouldn't clutter the manager's chart.
 */
function stripBranches(node: OrgUnitNode): OrgUnitNode {
    return {
        ...node,
        children: node.children
            .filter((c) => c.type !== 'branch')
            .map(stripBranches),
    }
}

/**
 * Returns the org unit tree scoped by role:
 *
 * - dept_head  → their division with all departments inside it; branches are hidden
 * - employee / pro_officer → their exact lineage path only (division → department → branch),
 *   no siblings, no other branches or departments
 *
 * Falls back to the full tree if the employee has no org assignments.
 */
export async function getScopedOrgUnitTree(tenantId: string, employeeId: string, role: string): Promise<OrgUnitNode[]> {
    const [emp] = await db
        .select({ branchId: employees.branchId, divisionId: employees.divisionId, departmentId: employees.departmentId })
        .from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId)))
        .limit(1)

    if (!emp) return []

    const all = await listOrgUnits(tenantId)
    const map = new Map<string, OrgUnitNode>()
    for (const row of all) {
        map.set(row.id, { ...row, children: [] } as OrgUnitNode)
    }

    // Build full tree
    const roots: OrgUnitNode[] = []
    for (const node of map.values()) {
        if (node.parentId && map.has(node.parentId)) {
            map.get(node.parentId)!.children.push(node)
        } else {
            roots.push(node)
        }
    }

    // Canonical hierarchy: Branch → Division → Department
    // Build the employee's lineage path with Branch always as the root node.

    if (role === 'dept_head') {
        // dept_head sees their branch as root; inside it their division; inside that all departments (no sibling branches/divisions)
        if (emp.branchId && map.has(emp.branchId)) {
            const branch: OrgUnitNode = { ...map.get(emp.branchId)!, children: [] }
            if (emp.divisionId && map.has(emp.divisionId)) {
                const div: OrgUnitNode = { ...map.get(emp.divisionId)!, children: [] }
                // Include all departments in their division (full dept view for dept_head)
                const allDepts = Array.from(map.values()).filter(n => n.type === 'department' && n.parentId === emp.divisionId)
                div.children = allDepts
                branch.children = [div]
            }
            return [branch]
        }
        // No branch assigned — fall back to just their division with all departments
        if (emp.divisionId && map.has(emp.divisionId)) {
            const div: OrgUnitNode = { ...map.get(emp.divisionId)!, children: [] }
            div.children = Array.from(map.values()).filter(n => n.type === 'department' && n.parentId === emp.divisionId)
            return [div]
        }
        return roots
    }

    // employee / pro_officer: exact lineage only — Branch → Division → Department (their own path, no siblings)
    if (emp.branchId && map.has(emp.branchId)) {
        const branch: OrgUnitNode = { ...map.get(emp.branchId)!, children: [] }
        if (emp.divisionId && map.has(emp.divisionId)) {
            const div: OrgUnitNode = { ...map.get(emp.divisionId)!, children: [] }
            if (emp.departmentId && map.has(emp.departmentId)) {
                div.children = [{ ...map.get(emp.departmentId)!, children: [] }]
            }
            branch.children = [div]
        }
        return [branch]
    }
    // No branch — show division → department path
    if (emp.divisionId && map.has(emp.divisionId)) {
        const div: OrgUnitNode = { ...map.get(emp.divisionId)!, children: [] }
        if (emp.departmentId && map.has(emp.departmentId)) {
            div.children = [{ ...map.get(emp.departmentId)!, children: [] }]
        }
        return [div]
    }
    if (emp.departmentId && map.has(emp.departmentId)) {
        return [{ ...map.get(emp.departmentId)!, children: [] }]
    }

    return roots
}

const TYPE_ABBR: Record<OrgUnitType, string> = {
    branch: 'BRA',
    division: 'DIVN',
    department: 'DEPT',
}

async function generateOrgCode(tenantId: string, type: OrgUnitType): Promise<string> {
    const [tenant] = await db
        .select({ companyCode: tenants.companyCode })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)

    const prefix = (tenant?.companyCode ?? 'ORG').toUpperCase()
    const abbr = TYPE_ABBR[type]
    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const yyyy = now.getFullYear()
    const period = `${mm}${yyyy}`

    const [{ total }] = await db
        .select({ total: count() })
        .from(orgUnits)
        .where(eq(orgUnits.tenantId, tenantId))

    const seq = String(Number(total) + 1).padStart(7, '0')
    return `${prefix}-${abbr}-${period}-${seq}`
}

export async function createOrgUnit(tenantId: string, input: OrgUnitInput) {
    const code = await generateOrgCode(tenantId, input.type)
    const [row] = await db
        .insert(orgUnits)
        .values({
            tenantId,
            name: input.name.trim(),
            code,
            type: input.type,
            parentId: input.parentId || null,
            headEmployeeId: input.headEmployeeId || null,
            description: input.description?.trim() || null,
            isActive: input.isActive ?? true,
            sortOrder: input.sortOrder ?? 0,
        })
        .returning()
    return row
}

export async function updateOrgUnit(tenantId: string, id: string, input: Partial<OrgUnitInput>) {
    const [row] = await db
        .update(orgUnits)
        .set({
            ...(input.name !== undefined && { name: input.name.trim() }),
            ...(input.type !== undefined && { type: input.type }),
            ...(input.parentId !== undefined && { parentId: input.parentId || null }),
            ...(input.headEmployeeId !== undefined && { headEmployeeId: input.headEmployeeId || null }),
            ...(input.description !== undefined && { description: input.description?.trim() || null }),
            ...(input.isActive !== undefined && { isActive: input.isActive }),
            ...(input.sortOrder !== undefined && { sortOrder: input.sortOrder }),
            updatedAt: new Date(),
        })
        .where(and(eq(orgUnits.id, id), eq(orgUnits.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function deleteOrgUnit(tenantId: string, id: string) {
    // Detach children before soft-deleting the parent
    await db
        .update(orgUnits)
        .set({ parentId: null, updatedAt: new Date() })
        .where(and(eq(orgUnits.parentId, id), eq(orgUnits.tenantId, tenantId)))

    const [row] = await db
        .update(orgUnits)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(orgUnits.id, id), eq(orgUnits.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function getOrgUnitStats(tenantId: string) {
    const [counts] = await db
        .select({
            divisions: sql<number>`count(*) filter (where type = 'division')`,
            departments: sql<number>`count(*) filter (where type = 'department')`,
            branches: sql<number>`count(*) filter (where type = 'branch')`,
        })
        .from(orgUnits)
        .where(and(eq(orgUnits.tenantId, tenantId), eq(orgUnits.isActive, true)))

    return {
        divisions: Number(counts?.divisions ?? 0),
        departments: Number(counts?.departments ?? 0),
        branches: Number(counts?.branches ?? 0),
    }
}
