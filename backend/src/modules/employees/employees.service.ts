import { eq, and, ilike, desc, asc, getTableColumns, sql, or, lt } from 'drizzle-orm'
import { withTimestamp, encodeCursor, decodeCursor } from '../../lib/db-helpers.js'
import { cacheDel } from '../../lib/redis.js'
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
    after?: string // cursor: base64url-encoded { c: createdAt, i: id }
}

export async function listEmployees(params: ListEmployeesParams) {
    const { tenantId, search, status, department, limit, offset, after } = params

    const conditions = [eq(employees.tenantId, tenantId), eq(employees.isArchived, false)]

    if (status) conditions.push(eq(employees.status, status))
    if (department) conditions.push(eq(employees.department, department))
    if (search) {
        const trimmed = search.trim()
        // Sanitise and build a prefix-aware tsquery — each word gets :* for partial match
        const words = trimmed.split(/\s+/).filter(Boolean).map(w => w.replace(/[^a-zA-Z0-9\u00C0-\u024F\u0600-\u06FF]/g, ''))
        if (words.length > 0) {
            const tsQuery = words.join(' & ') + ':*'
            conditions.push(
                sql`to_tsvector('simple',
                    coalesce(${employees.firstName},'') || ' ' ||
                    coalesce(${employees.lastName},'')  || ' ' ||
                    coalesce(${employees.email},'')     || ' ' ||
                    coalesce(${employees.employeeNo},'') || ' ' ||
                    coalesce(${employees.designation},'')
                ) @@ to_tsquery('simple', ${tsQuery})`
            )
        } else {
            // Fall back to ILIKE for employee number if input is all non-word chars
            conditions.push(ilike(employees.employeeNo, `%${trimmed}%`))
        }
    }

    // Cursor-based pagination (keyset) — takes priority over offset when 'after' is provided
    const cursor = after ? decodeCursor(after) : null
    if (cursor) {
        const cursorDate = new Date(cursor.c)
        conditions.push(
            or(
                lt(employees.createdAt, cursorDate),
                and(eq(employees.createdAt, cursorDate), lt(employees.id, cursor.i))
            )!
        )
    }

    const pageSize = limit + 1 // fetch one extra to determine hasMore
    const rows = await db
        .select(getTableColumns(employees))
        .from(employees)
        .where(and(...conditions))
        .orderBy(desc(employees.createdAt), desc(employees.id))
        .limit(cursor ? pageSize : limit)
        .offset(cursor ? 0 : offset)

    const hasMore = cursor ? rows.length > limit : false
    const pageRows = cursor ? rows.slice(0, limit) : rows
    const lastRow = pageRows.at(-1)
    const nextCursor = (cursor && hasMore && lastRow)
        ? encodeCursor(lastRow.createdAt, lastRow.id)
        : undefined

    // When using offset mode, get total count separately
    let total = 0
    if (!cursor) {
        const [countRow] = await db
            .select({ count: sql<number>`COUNT(*)`.as('count') })
            .from(employees)
            .where(and(...conditions))
        total = Number(countRow?.count ?? 0)
    }

    return {
        data: pageRows.map(withFullName),
        total: cursor ? undefined : total,
        limit,
        offset: cursor ? undefined : offset,
        hasMore: cursor ? hasMore : offset + limit < total,
        nextCursor,
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
    await cacheDel(`dashboard:kpis:${tenantId}`)
    return withFullName(row)
}

export async function updateEmployee(tenantId: string, id: string, data: Partial<NewEmployee>) {
    const [row] = await db
        .update(employees)
        .set(withTimestamp(data))
        .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)))
        .returning()

    return row ?? null
}

export async function archiveEmployee(tenantId: string, id: string) {
    const [row] = await db
        .update(employees)
        .set(withTimestamp({ isArchived: true, status: 'terminated' as const }))
        .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)))
        .returning()
    await cacheDel(`dashboard:kpis:${tenantId}`)
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

    // Build tree with cycle detection — max depth 15 to guard against circular reportingTo
    const map = new Map(rows.map(r => [r.id, { ...r, fullName: `${r.firstName} ${r.lastName}`, children: [] as any[] }]))
    const visited = new Set<string>()

    function buildNode(id: string, depth = 0): any {
        if (visited.has(id) || depth > 15) return null
        visited.add(id)
        const node = map.get(id)
        if (!node) return null
        return { ...node, children: node.children.map((c: any) => buildNode(c.id, depth + 1)).filter(Boolean) }
    }

    const roots: any[] = []
    for (const node of map.values()) {
        if (node.reportingTo && map.has(node.reportingTo)) {
            map.get(node.reportingTo)!.children.push(node)
        } else {
            roots.push(node)
        }
    }
    return roots.map(r => buildNode(r.id)).filter(Boolean)
}
