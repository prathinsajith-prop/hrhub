import { eq, and, ilike, desc, asc, getTableColumns, inArray, notInArray, sql, or, lt, ne, count, aliasedTable } from 'drizzle-orm'
import { withTimestamp, encodeCursor, decodeCursor, extractRows } from '../../lib/db-helpers.js'
import { cacheDel } from '../../lib/redis.js'
import { db } from '../../db/index.js'
import { employees, entities, tenants, gradeLevels, sponsoringEntities, employeeNoSequences, orgUnits, users, shifts, teamMembers, employeeLoans, assetAssignments, visaApplications } from '../../db/schema/index.js'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'
import { removeEmployeeFromMismatchedTeams, removeEmployeeFromAllTeams } from '../teams/teams.service.js'
import { resolveAvatarUrl, resolveAvatarUrls } from '../../plugins/s3.js'
import { buildDrizzleFilters, parseFilterString } from '../../lib/filters.js'

// Alias for the department org unit join (employees can join orgUnits 3x: branch/division/dept)
const deptUnit = aliasedTable(orgUnits, 'dept_unit')

const EMPLOYEE_FIELD_MAP = {
    status: employees.status,
    designation: employees.designation,
    nationality: employees.nationality,
    salary: employees.totalSalary,
    joinDate: employees.joinDate,
    visaExpiry: employees.visaExpiry,
}
const EMPLOYEE_ALLOWED = new Set(Object.keys(EMPLOYEE_FIELD_MAP))

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
    /** Lifecycle scope: 'active' (default) hides archived, 'archived' shows only
     *  archived, 'all' shows both. Drives the Active/Archived/All status filter. */
    archived?: 'active' | 'archived' | 'all'
    /** When set, restricts results to the subtree rooted at this employee (dept_head scoping). */
    managerEmployeeId?: string
    /** Compact filter string: "field:OP(value);..." (designation, nationality, salary, joinDate, visaExpiry). */
    filter?: string
    limit: number
    offset: number
    after?: string // cursor: base64url-encoded { c: createdAt, i: id }
    /**
     * Apply the Organization Policy "searchable in directory" filter at the
     * SQL layer. The route layer resolves the tenant policy once per request
     * and passes it down so the WHERE clause can drop hidden rows before
     * pagination / total counts. Omit (or pass `null`) for HR / super_admin
     * and self-only views — they bypass the directory filter.
     */
    directoryPrivacy?: {
        /** Resolved tenant default — false hides everyone except the viewer. */
        policySearchableInDirectory: boolean
        /** Viewer's own employee row — never filtered out. */
        viewerEmployeeId: string | null
    }
}

/**
 * Returns the IDs of all employees in the reporting subtree rooted at rootId,
 * including the root itself. Uses a recursive CTE so the walk is done in one
 * DB round-trip regardless of tree depth.
 */
export async function getSubtreeEmployeeIds(tenantId: string, rootId: string): Promise<string[]> {
    // Cycle-safe walk — refuses to re-enter a node already in the visited path
    // and caps depth at 50. A self-referential `reporting_to` row (employee
    // who reports to themselves) used to hang the previous version forever
    // until Postgres statement_timeout killed it. See portal scoping.ts for
    // the same fix.
    const rows = await db.execute<{ id: string }>(sql`
        WITH RECURSIVE subtree AS (
            SELECT id, ARRAY[id] AS path
            FROM employees
            WHERE id = ${rootId}::uuid
              AND tenant_id = ${tenantId}::uuid
              AND is_archived = false
            UNION ALL
            SELECT e.id, s.path || e.id
            FROM employees e
            JOIN subtree s ON e.reporting_to = s.id
            WHERE e.tenant_id = ${tenantId}::uuid
              AND e.is_archived = false
              AND NOT (e.id = ANY(s.path))
              AND array_length(s.path, 1) < 50
        )
        SELECT id FROM subtree
    `)
    return extractRows<{ id: string }>(rows).map(r => r.id)
}

export async function listEmployees(params: ListEmployeesParams) {
    const { tenantId, search, status, department, archived = 'active', managerEmployeeId, filter, limit, offset, after, directoryPrivacy } = params

    const conditions = [eq(employees.tenantId, tenantId)]
    // Lifecycle scope. 'all' adds no archived predicate.
    if (archived === 'active') conditions.push(eq(employees.isArchived, false))
    else if (archived === 'archived') conditions.push(eq(employees.isArchived, true))

    // Apply the Organization Policy "searchable in directory" filter for peer
    // viewers. Pushed into SQL so the row count / pagination cursor reflect
    // what the viewer can actually see, and so we avoid serialising rows that
    // will be dropped. Self is always visible.
    //
    // Semantics:
    //   - tenant policy ON, employee override absent or true  → row visible
    //   - tenant policy ON, employee override false           → hidden
    //   - tenant policy OFF                                    → only self visible
    if (directoryPrivacy) {
        const { policySearchableInDirectory, viewerEmployeeId } = directoryPrivacy
        if (!policySearchableInDirectory) {
            // Org has turned the directory off entirely for peers — only the
            // viewer's own row remains visible. If there's no viewer employee
            // (rare edge case: a HR-admin demoted in mid-session), short-circuit.
            if (!viewerEmployeeId) {
                return { data: [], total: 0, limit, offset, hasMore: false }
            }
            conditions.push(eq(employees.id, viewerEmployeeId))
        } else {
            // Org default ON — drop only the rows that explicitly opted OUT.
            // The override jsonb defaults to `{}`, so the COALESCE keeps
            // unset employees visible.
            const selfClause = viewerEmployeeId
                ? sql`${employees.id} = ${viewerEmployeeId}`
                : sql`false`
            conditions.push(or(
                selfClause,
                sql`COALESCE((${employees.privacyOverrides} ->> 'searchableInDirectory')::boolean, true) = true`,
            )!)
        }
    }

    if (status) {
        conditions.push(eq(employees.status, status))
    }
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
        // Match either the legacy text column or the FK-based org unit name
        conditions.push(or(eq(employees.department, department), eq(deptUnit.name, department))!)
    }
    if (search) {
        const trimmed = search.trim()
        if (trimmed.includes('@')) {
            // @ and . are stripped from tsquery tokens — use ILIKE across all three email columns.
            conditions.push(or(
                ilike(employees.email, `%${trimmed}%`),
                ilike(employees.workEmail, `%${trimmed}%`),
                ilike(employees.personalEmail, `%${trimmed}%`),
            )!)
        } else {
            // Sanitise and build a prefix-aware tsquery \u2014 each word gets :* for partial match.
            const words = trimmed.split(/\s+/).filter(Boolean)
                .map(w => w.replace(/[^a-zA-Z0-9\u00C0-\u024F\u0600-\u06FF]/g, '')).filter(Boolean)
            if (words.length > 0) {
                const tsQuery = words.join(' & ') + ':*'
                conditions.push(or(
                    sql`to_tsvector('simple',
                        coalesce(${employees.firstName},'') || ' ' ||
                        coalesce(${employees.lastName},'')  || ' ' ||
                        coalesce(${employees.email},'')     || ' ' ||
                        coalesce(${employees.workEmail},'') || ' ' ||
                        coalesce(${employees.employeeNo},'') || ' ' ||
                        coalesce(${employees.designation},'')
                    ) @@ to_tsquery('simple', ${tsQuery})`,
                    ilike(employees.employeeNo, `%${trimmed}%`),
                )!)
            }
        }
    }

    if (filter) {
        const parsed = parseFilterString(filter)
        // department filters must OR across the legacy text column AND the joined org unit name
        // because newer employees use departmentId (FK) while older ones used the text column.
        const deptFilters = parsed.filter(f => f.field === 'department')
        const restFilters = parsed.filter(f => f.field !== 'department')
        for (const df of deptFilters) {
            if (df.operator === 'LIKE' && typeof df.value === 'string') {
                conditions.push(or(ilike(employees.department, `%${df.value}%`), ilike(deptUnit.name, `%${df.value}%`))!)
            } else if (df.operator === 'EQ' && typeof df.value === 'string') {
                conditions.push(or(eq(employees.department, df.value), eq(deptUnit.name, df.value))!)
            } else if (df.operator === 'IN' && Array.isArray(df.value)) {
                const vals = df.value as string[]
                conditions.push(or(inArray(employees.department, vals), inArray(deptUnit.name, vals))!)
            } else if (df.operator === 'NOT_IN' && Array.isArray(df.value)) {
                const vals = df.value as string[]
                conditions.push(and(notInArray(employees.department, vals), notInArray(deptUnit.name, vals))!)
            }
        }
        for (const c of buildDrizzleFilters(restFilters, EMPLOYEE_FIELD_MAP, EMPLOYEE_ALLOWED)) {
            conditions.push(c)
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
        .select({
            ...getTableColumns(employees),
            gradeLevelName: gradeLevels.name,
            sponsoringEntityName: sponsoringEntities.name,
            shiftName: shifts.name,
            shiftStartTime: shifts.startTime,
            shiftEndTime: shifts.endTime,
            shiftWeeklyOffDays: shifts.weeklyOffDays,
            // Pull the org-unit name so we can override the legacy text column
            // when projecting the response — see the COALESCE below. Without
            // this the admin app would show "Nostrum consequuntur" while the
            // employee profile shows "Account Management Department".
            departmentName: deptUnit.name,
        })
        .from(employees)
        .leftJoin(gradeLevels, eq(employees.gradeLevelId, gradeLevels.id))
        .leftJoin(sponsoringEntities, eq(employees.sponsoringEntityId, sponsoringEntities.id))
        .leftJoin(deptUnit, eq(employees.departmentId, deptUnit.id))
        .leftJoin(shifts, eq(employees.shiftId, shifts.id))
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
            .leftJoin(deptUnit, eq(employees.departmentId, deptUnit.id))
            .where(and(...conditions))
        total = Number(countRow?.count ?? 0)
    }

    // Batch resolve — one round of S3 signing for all unique avatar keys.
    const avatarUrls = await resolveAvatarUrls(pageRows.map(r => (r as any).avatarUrl))
    // Project the canonical org-unit department name onto the `department` field.
    // The legacy text column stays as the fallback so a tenant whose data
    // never migrated to the org-units model keeps showing something.
    const data = pageRows.map((r, i) => {
        const row = r as any
        const department = row.departmentName ?? row.department ?? null
        return { ...withFullName(row), department, avatarUrl: avatarUrls[i] }
    })

    return {
        data,
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
            gradeLevelName: gradeLevels.name,
            sponsoringEntityName: sponsoringEntities.name,
            shiftName: shifts.name,
            shiftStartTime: shifts.startTime,
            shiftEndTime: shifts.endTime,
            shiftWeeklyOffDays: shifts.weeklyOffDays,
            // Canonical department name from the org-units FK — overrides the
            // legacy text column in the response shaping below.
            departmentName: deptUnit.name,
        })
        .from(employees)
        .leftJoin(entities, eq(employees.entityId, entities.id))
        .leftJoin(gradeLevels, eq(employees.gradeLevelId, gradeLevels.id))
        .leftJoin(sponsoringEntities, eq(employees.sponsoringEntityId, sponsoringEntities.id))
        .leftJoin(shifts, eq(employees.shiftId, shifts.id))
        .leftJoin(deptUnit, eq(employees.departmentId, deptUnit.id))
        .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId)))
        .limit(1)

    if (!row) return null
    const employee = withFullName(row as typeof row & { firstName: string; lastName: string })
    const department = (row as any).departmentName ?? employee.department ?? null
    return { ...employee, department, avatarUrl: await resolveAvatarUrl(employee.avatarUrl) }
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
 * Format: `{COMPANYCODE}-{NNN}-{MM}-{YYYY}`   e.g. PROP-001-04-2026
 *
 * Uses an atomic upsert on `employee_no_sequences` so concurrent creates
 * for the same tenant can never receive the same sequence number — no
 * retry loop or pessimistic locking required.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function generateNextEmployeeNo(tenantId: string, conn: any = db): Promise<string> {
    const [tenant] = await conn
        .select({ companyCode: tenants.companyCode })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)

    const companyCode = tenant?.companyCode ?? 'EMP'

    const now = new Date()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const yyyy = String(now.getFullYear())
    const yearMonth = `${yyyy}-${mm}`

    const [row] = await conn
        .insert(employeeNoSequences)
        .values({ tenantId, yearMonth, lastSeq: 1 })
        .onConflictDoUpdate({
            target: [employeeNoSequences.tenantId, employeeNoSequences.yearMonth],
            set: { lastSeq: sql`${employeeNoSequences.lastSeq} + 1` },
        })
        .returning({ lastSeq: employeeNoSequences.lastSeq })

    if (!row) throw new Error('Failed to generate employee number')
    const seq = String(row.lastSeq).padStart(3, '0')
    return `${companyCode}-${seq}-${mm}-${yyyy}`
}

/**
 * Resolve the canonical text name for a department `org_units` row so the
 * legacy `employees.department` column can be kept in sync with the FK. This
 * is what stops "user FK points to Account but text column still says AWS"
 * drift after a transfer or department edit.
 *
 * Returns `null` for an invalid/missing departmentId so the caller can null
 * the text column explicitly when the FK is being cleared.
 */
async function resolveDepartmentText(tenantId: string, departmentId: string | null | undefined): Promise<string | null> {
    if (!departmentId) return null
    const [row] = await db
        .select({ name: orgUnits.name })
        .from(orgUnits)
        .where(and(eq(orgUnits.id, departmentId), eq(orgUnits.tenantId, tenantId)))
        .limit(1)
    return row?.name ?? null
}

export async function updateEmployee(tenantId: string, id: string, data: Partial<NewEmployee>) {
    // Sync the legacy text column whenever `departmentId` is being set/cleared,
    // unless the caller also explicitly supplied a `department` value (rare
    // but allowed for migrations that intentionally diverge the two).
    const patch: Partial<NewEmployee> = { ...data }
    if ('departmentId' in data && !('department' in data)) {
        patch.department = await resolveDepartmentText(tenantId, data.departmentId ?? null)
    }

    const [row] = await db
        .update(employees)
        .set(withTimestamp(patch))
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
    // Clean up team memberships so archived staff don't linger on teams.
    if (row) await removeEmployeeFromAllTeams(tenantId, id).catch(() => { })
    await cacheDel(`dashboard:kpis:${tenantId}`)
    return row ?? null
}

/** Restore an archived employee back to active. Returns null if not found/not archived. */
export async function unarchiveEmployee(tenantId: string, id: string) {
    const [row] = await db
        .update(employees)
        .set(withTimestamp({ isArchived: false, status: 'active' as const }))
        .where(and(eq(employees.id, id), eq(employees.tenantId, tenantId), eq(employees.isArchived, true)))
        .returning()
    await cacheDel(`dashboard:kpis:${tenantId}`)
    return row ?? null
}

/**
 * Guard against archiving protected accounts. Throws a 409 ServiceError-shaped
 * error (statusCode + code) the route surfaces verbatim. Rules:
 *  - cannot archive yourself (the currently logged-in user)
 *  - cannot archive the last active super_admin (owner-equivalent)
 */
export async function assertEmployeeArchivable(
    tenantId: string,
    employeeId: string,
    actor: { userId: string; employeeId?: string | null },
): Promise<void> {
    if (actor.employeeId && actor.employeeId === employeeId) {
        throw Object.assign(new Error('You cannot archive your own account.'), { statusCode: 409, code: 'PROTECTED_SELF' })
    }
    // Linked login account (every user has an employeeId; an employee may have none).
    const [linked] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, employeeId)))
        .limit(1)
    if (linked?.role === 'super_admin') {
        const [{ n }] = await db
            .select({ n: count() })
            .from(users)
            .where(and(eq(users.tenantId, tenantId), eq(users.role, 'super_admin'), eq(users.isActive, true), ne(users.id, linked.id)))
        if (Number(n) === 0) {
            throw Object.assign(new Error('You cannot archive the last active Super Admin / account owner.'), { statusCode: 409, code: 'PROTECTED_LAST_ADMIN' })
        }
    }
}

export interface ArchiveDependency { type: string; count: number; message: string; blocking: boolean }

/**
 * Surface records that depend on an employee, so HR can decide before archiving.
 * Returns `blocking` (org-structure roles that would break) and `warnings`
 * (open items that simply need awareness). The route maps `block` vs
 * `warn-and-continue` from the `force` flag.
 */
export async function getEmployeeArchiveDependencies(tenantId: string, employeeId: string): Promise<ArchiveDependency[]> {
    const [reports, headOf, teams, loans, assets, visas] = await Promise.all([
        db.select({ n: count() }).from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.reportingTo, employeeId), eq(employees.isArchived, false))),
        db.select({ n: count() }).from(orgUnits).where(and(eq(orgUnits.tenantId, tenantId), eq(orgUnits.headEmployeeId, employeeId), eq(orgUnits.isActive, true))),
        db.select({ n: count() }).from(teamMembers).where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.employeeId, employeeId))),
        db.select({ n: count() }).from(employeeLoans).where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.employeeId, employeeId), eq(employeeLoans.status, 'active'))),
        db.select({ n: count() }).from(assetAssignments).where(and(eq(assetAssignments.tenantId, tenantId), eq(assetAssignments.employeeId, employeeId), eq(assetAssignments.status, 'assigned'))),
        db.select({ n: count() }).from(visaApplications).where(and(eq(visaApplications.tenantId, tenantId), eq(visaApplications.employeeId, employeeId), notInArray(visaApplications.status, ['active', 'cancelled', 'expired'] as never[]))),
    ])
    const out: ArchiveDependency[] = []
    const n = (r: { n: unknown }[]) => Number(r[0]?.n ?? 0)
    if (n(reports) > 0) out.push({ type: 'direct_reports', count: n(reports), blocking: true, message: `${n(reports)} employee(s) report to this person — reassign their manager first.` })
    if (n(headOf) > 0) out.push({ type: 'org_unit_head', count: n(headOf), blocking: true, message: `Head of ${n(headOf)} branch/division/department — reassign the head first.` })
    if (n(teams) > 0) out.push({ type: 'team_memberships', count: n(teams), blocking: false, message: `Member of ${n(teams)} team(s) — memberships will be removed on archive.` })
    if (n(loans) > 0) out.push({ type: 'active_loans', count: n(loans), blocking: false, message: `${n(loans)} active loan(s) still repaying.` })
    if (n(assets) > 0) out.push({ type: 'assigned_assets', count: n(assets), blocking: false, message: `${n(assets)} asset(s) still assigned — collect/return them.` })
    if (n(visas) > 0) out.push({ type: 'open_visa', count: n(visas), blocking: false, message: `${n(visas)} visa application(s) in progress.` })
    return out
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
    return extractRows<{ id: string }>(rows).map(r => r.id)
}

export async function getOrgChart(tenantId: string, rootEmployeeId?: string) {
    // Only employees linked to an active user account appear in the org chart.
    // Unlinked employee records (HR-only, contractors, archived) are filtered out.
    const linkedRows = await db
        .select({ id: users.employeeId })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.isActive, true)))
    const linkedEmployeeIds = new Set(linkedRows.map(r => r.id))

    if (rootEmployeeId) {
        // 1. Subtree: dept_head + all direct/indirect reports
        const subtreeIdsAll = await getSubtreeEmployeeIds(tenantId, rootEmployeeId)
        const subtreeIds = subtreeIdsAll.filter(id => linkedEmployeeIds.has(id))
        if (subtreeIds.length === 0) return []

        // 2. Ancestor chain: managers above the dept_head up to the org root
        const ancestorIdsAll = await getAncestorChain(tenantId, rootEmployeeId)
        const ancestorIds = ancestorIdsAll.filter(id => linkedEmployeeIds.has(id))

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

        // Batch-resolve presigned avatar URLs (deduped per unique key).
        const avatarUrls = await resolveAvatarUrls(rows.map(r => r.avatarUrl))
        const resolvedRows = rows.map((r, i) => ({ ...r, avatarUrl: avatarUrls[i] }))

        // 4. Build node map — ancestors are flagged so the frontend can style them
        const map = new Map(resolvedRows.map(r => [r.id, {
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

    // Full chart for hr_manager / super_admin — only employees with linked user accounts
    if (linkedEmployeeIds.size === 0) return []
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
        inArray(employees.id, Array.from(linkedEmployeeIds)),
    ))

    const avatarUrls = await resolveAvatarUrls(rows.map(r => r.avatarUrl))
    const resolvedRows = rows.map((r, i) => ({ ...r, avatarUrl: avatarUrls[i] }))

    const map = new Map(resolvedRows.map(r => [r.id, {
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
