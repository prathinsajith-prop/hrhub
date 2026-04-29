import { eq, and, ilike, desc, asc, getTableColumns, inArray, sql, or, lt } from 'drizzle-orm'
import { withTimestamp, encodeCursor, decodeCursor } from '../../lib/db-helpers.js'
import { cacheDel } from '../../lib/redis.js'
import { db } from '../../db/index.js'
import { employees, entities } from '../../db/schema/index.js'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import { removeEmployeeFromMismatchedTeams } from '../teams/teams.service.js'

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
    /** When set, restricts results to the subtree rooted at this employee (dept_head scoping). */
    managerEmployeeId?: string
    limit: number
    offset: number
    after?: string // cursor: base64url-encoded { c: createdAt, i: id }
}

/**
 * Returns the IDs of all employees in the reporting subtree rooted at rootId,
 * including the root itself. Uses a recursive CTE so the walk is done in one
 * DB round-trip regardless of tree depth.
 */
export async function getSubtreeEmployeeIds(tenantId: string, rootId: string): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
        WITH RECURSIVE subtree AS (
            SELECT id
            FROM employees
            WHERE id = ${rootId}::uuid
              AND tenant_id = ${tenantId}::uuid
              AND is_archived = false
            UNION ALL
            SELECT e.id
            FROM employees e
            JOIN subtree s ON e.reporting_to = s.id
            WHERE e.tenant_id = ${tenantId}::uuid
              AND e.is_archived = false
        )
        SELECT id FROM subtree
    `)
    return [...rows].map(r => r.id)
}

export async function listEmployees(params: ListEmployeesParams) {
    const { tenantId, search, status, department, managerEmployeeId, limit, offset, after } = params

    const conditions = [eq(employees.tenantId, tenantId), eq(employees.isArchived, false)]

    if (managerEmployeeId) {
        // Subtree scoping for dept_head: only employees who report (directly or
        // indirectly) to this manager, plus the manager themselves.
        const subtreeIds = await getSubtreeEmployeeIds(tenantId, managerEmployeeId)
        if (subtreeIds.length === 0) {
            // Manager has no employee record in this tenant — return empty
            return { data: [], total: 0, limit, offset, hasMore: false }
        }
        conditions.push(inArray(employees.id, subtreeIds))
    } else if (department) {
        conditions.push(eq(employees.department, department))
    }
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

    return row ? withFullName(row as typeof row & { firstName: string; lastName: string }) : null
}

export async function createEmployee(tenantId: string, data: Omit<NewEmployee, 'tenantId' | 'id'>) {
    const [row] = await db
        .insert(employees)
        .values({ ...data, tenantId })
        .returning()
    await cacheDel(`dashboard:kpis:${tenantId}`)
    return withFullName(row)
}

/**
 * Generate the next sequential employee number for a tenant.
 * Format: `EMP-00001`, `EMP-00002`, ... — scoped to the tenant and ignoring
 * any manually-assigned non-numeric IDs. Uses the largest existing numeric
 * suffix so gaps never collapse. The `(tenant_id, employee_no)` unique index
 * backs this with a retry on conflict at the route layer.
 */
export async function generateNextEmployeeNo(tenantId: string): Promise<string> {
    const [row] = await db
        .select({
            // Extract the trailing integer from EMP-NNNNN (or similar) per tenant.
            max: sql<number>`COALESCE(MAX(
                CAST(NULLIF(REGEXP_REPLACE(${employees.employeeNo}, '\\D', '', 'g'), '') AS INTEGER)
            ), 0)`,
        })
        .from(employees)
        .where(eq(employees.tenantId, tenantId))

    const next = (row?.max ?? 0) + 1
    return `EMP-${String(next).padStart(5, '0')}`
}

export async function updateEmployee(tenantId: string, id: string, data: Partial<NewEmployee>) {
    const [row] = await db
        .update(employees)
        .set(withTimestamp(data))
        .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)))
        .returning()

    // Auto-exit: if department changed, remove from teams that no longer match
    if (row && 'departmentId' in data) {
        removeEmployeeFromMismatchedTeams(tenantId, id, data.departmentId ?? null).catch(() => { })
    }

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
    const today = new Date().toISOString().split('T')[0]
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() + daysAhead)
    const cutoffStr = cutoff.toISOString().split('T')[0]

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
                eq(employees.isArchived, false),
                sql`${employees.visaExpiry} IS NOT NULL`,
                sql`${employees.visaExpiry} >= ${today}`,
                sql`${employees.visaExpiry} <= ${cutoffStr}`,
            )
        )
        .orderBy(asc(employees.visaExpiry))
        .limit(50)

    return rows.map(r => ({ ...r, fullName: `${r.firstName} ${r.lastName}` }))
}

/**
 * Returns ancestor IDs from the employee's direct manager up to the root,
 * using a single recursive CTE. The employee itself is excluded.
 * Result order: [directManager, grandManager, ..., root]
 */
export async function getAncestorChain(tenantId: string, employeeId: string): Promise<string[]> {
    const rows = await db.execute<{ id: string }>(sql`
        WITH RECURSIVE ancestors AS (
            SELECT id, reporting_to, 1 AS depth
            FROM employees
            WHERE id = ${employeeId}::uuid
              AND tenant_id = ${tenantId}::uuid
              AND is_archived = false
            UNION ALL
            SELECT e.id, e.reporting_to, a.depth + 1
            FROM employees e
            JOIN ancestors a ON e.id = a.reporting_to
            WHERE e.tenant_id = ${tenantId}::uuid
              AND e.is_archived = false
              AND a.depth < 15
        )
        SELECT id FROM ancestors
        WHERE id != ${employeeId}::uuid
        ORDER BY depth ASC
    `)
    return [...rows].map(r => r.id)
}

export async function getOrgChart(tenantId: string, rootEmployeeId?: string) {
    if (rootEmployeeId) {
        // 1. Subtree: dept_head + all direct/indirect reports
        const subtreeIds = await getSubtreeEmployeeIds(tenantId, rootEmployeeId)
        if (subtreeIds.length === 0) return []

        // 2. Ancestor chain: managers above the dept_head up to the org root
        const ancestorIds = await getAncestorChain(tenantId, rootEmployeeId)

        // 3. Fetch all needed rows in one query
        const allIds = [...new Set([...ancestorIds, ...subtreeIds])]
        const rows = await db.select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            designation: employees.designation,
            department: employees.department,
            reportingTo: employees.reportingTo,
            avatarUrl: employees.avatarUrl,
            status: employees.status,
        }).from(employees).where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            inArray(employees.id, allIds),
        ))

        const subtreeSet = new Set(subtreeIds)
        const ancestorSet = new Set(ancestorIds)

        // 4. Build node map — ancestors are flagged so the frontend can style them
        const map = new Map(rows.map(r => [r.id, {
            ...r,
            fullName: `${r.firstName} ${r.lastName}`,
            isAncestor: ancestorSet.has(r.id),
            children: [] as any[],
        }]))

        // 5. Wire children — ancestor nodes only get the next node in the chain as
        //    their child (never their other direct reports, which would expose peers).
        //    Subtree nodes get all their actual children from within the subtree.
        for (const node of map.values()) {
            if (!node.reportingTo || !map.has(node.reportingTo)) continue
            const parent = map.get(node.reportingTo)!
            if (parent.isAncestor && !ancestorSet.has(node.id) && node.id !== rootEmployeeId) {
                // This node is a peer of the dept_head or a peer of an ancestor — skip
                continue
            }
            parent.children.push(node)
        }

        // 6. The tree root is the oldest ancestor with no manager in our set,
        //    or the dept_head themselves if they have no ancestors.
        const topId = ancestorIds.length > 0 ? ancestorIds[ancestorIds.length - 1] : rootEmployeeId
        const visited = new Set<string>()
        function buildNode(id: string, depth = 0): any {
            if (visited.has(id) || depth > 20) return null
            visited.add(id)
            const node = map.get(id)
            if (!node) return null
            // For ancestor nodes, only include children that are in our allowed set
            const children = node.children
                .filter((c: any) => ancestorSet.has(c.id) || subtreeSet.has(c.id))
                .map((c: any) => buildNode(c.id, depth + 1))
                .filter(Boolean)
            return { ...node, children }
        }

        const root = buildNode(topId)
        return root ? [root] : []
    }

    // Full chart for hr_manager / super_admin
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

    const map = new Map(rows.map(r => [r.id, {
        ...r, fullName: `${r.firstName} ${r.lastName}`, isAncestor: false, children: [] as any[],
    }]))
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
