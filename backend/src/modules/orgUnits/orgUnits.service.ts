import { db } from '../../db/index.js'
import { orgUnits, employees } from '../../db/schema/index.js'
import { eq, and, asc, sql } from 'drizzle-orm'

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

export async function createOrgUnit(tenantId: string, input: OrgUnitInput) {
    const [row] = await db
        .insert(orgUnits)
        .values({
            tenantId,
            name: input.name.trim(),
            code: input.code?.trim() || null,
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
            ...(input.code !== undefined && { code: input.code?.trim() || null }),
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
    // Detach children before deletion
    await db
        .update(orgUnits)
        .set({ parentId: null })
        .where(and(eq(orgUnits.parentId, id), eq(orgUnits.tenantId, tenantId)))

    const [row] = await db
        .delete(orgUnits)
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
