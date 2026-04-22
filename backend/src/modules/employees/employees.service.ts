import { eq, and, ilike, or, count, desc, asc, getTableColumns } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { employees, entities } from '../../db/schema/index.js'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

type Employee = InferSelectModel<typeof employees>
type NewEmployee = InferInsertModel<typeof employees>

function withFullName<T extends { firstName: string; lastName: string }>(row: T) {
    return { ...row, fullName: `${row.firstName} ${row.lastName}` }
}

export interface ListEmployeesParams {
    tenantId: string
    search?: string
    status?: Employee['status']
    department?: string
    limit: number
    offset: number
}

export async function listEmployees(params: ListEmployeesParams) {
    const { tenantId, search, status, department, limit, offset } = params

    const conditions = [eq(employees.tenantId, tenantId), eq(employees.isArchived, false)]

    if (status) conditions.push(eq(employees.status, status))
    if (department) conditions.push(eq(employees.department, department))
    if (search) {
        conditions.push(
            or(
                ilike(employees.firstName, `%${search}%`),
                ilike(employees.lastName, `%${search}%`),
                ilike(employees.email, `%${search}%`),
                ilike(employees.employeeNo, `%${search}%`)
            )!
        )
    }

    const [{ total }] = await db
        .select({ total: count() })
        .from(employees)
        .where(and(...conditions))

    const rows = await db
        .select()
        .from(employees)
        .where(and(...conditions))
        .orderBy(asc(employees.firstName))
        .limit(limit)
        .offset(offset)

    return {
        data: rows.map(withFullName),
        total: Number(total),
        limit,
        offset,
        hasMore: offset + limit < Number(total),
    }
}

export async function getEmployee(tenantId: string, id: string) {
    const [row] = await db
        .select({
            ...getTableColumns(employees),
            entityName: entities.entityName,
        })
        .from(employees)
        .leftJoin(entities, eq(employees.entityId, entities.id))
        .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)))
        .limit(1)

    return row ? withFullName(row) : null
}

export async function createEmployee(tenantId: string, data: Omit<NewEmployee, 'tenantId' | 'id'>) {
    const [row] = await db
        .insert(employees)
        .values({ ...data, tenantId })
        .returning()

    return withFullName(row)
}

export async function updateEmployee(tenantId: string, id: string, data: Partial<NewEmployee>) {
    const [row] = await db
        .update(employees)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)))
        .returning()

    return row ?? null
}

export async function archiveEmployee(tenantId: string, id: string) {
    const [row] = await db
        .update(employees)
        .set({ isArchived: true, status: 'terminated', updatedAt: new Date() } as any)
        .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)))
        .returning()

    return row ?? null
}

export async function getExpiringVisas(tenantId: string, daysAhead = 90) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + daysAhead)

    const rows = await db
        .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            visaExpiry: employees.visaExpiry,
            visaStatus: employees.visaStatus,
            passportExpiry: employees.passportExpiry,
        })
        .from(employees)
        .where(
            and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false)
            )
        )
        .orderBy(asc(employees.visaExpiry))
        .limit(50)

    return rows.map(r => ({ ...r, fullName: `${r.firstName} ${r.lastName}` }))
}

export async function getOrgChart(tenantId: string) {
    const rows = await db.select({
        id: employees.id,
        firstName: employees.firstName,
        lastName: employees.lastName,
        designation: employees.designation,
        department: employees.department,
        reportingTo: employees.reportingTo,
        avatarUrl: employees.avatarUrl,
        status: employees.status,
    }).from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false)))

    // Build tree
    const map = new Map(rows.map(r => [r.id, { ...r, fullName: `${r.firstName} ${r.lastName}`, children: [] as any[] }]))
    const roots: any[] = []
    for (const node of map.values()) {
        if (node.reportingTo && map.has(node.reportingTo)) {
            map.get(node.reportingTo)!.children.push(node)
        } else {
            roots.push(node)
        }
    }
    return roots
}
