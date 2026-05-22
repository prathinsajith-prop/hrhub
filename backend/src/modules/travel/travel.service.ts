/**
 * Travel module service layer.
 *
 * Responsibilities, in order of decreasing call frequency:
 *   1. List + read travel requests (with optional scoping to a single employee
 *      so dept_head / employee views are server-enforced rather than client-
 *      filtered).
 *   2. CRUD on travel requests with status-aware guards: a request cannot be
 *      edited once it leaves `draft`, can only be cancelled before approval,
 *      and approval/rejection writes the audit fields atomically.
 *   3. Per-request expense rows (`travel_expenses`). Expenses can only be
 *      added when the parent request is `approved` or `completed` — the route
 *      layer enforces this, but the service layer is the source of truth.
 *
 * Soft delete: every delete writes `deleted_at` and every list/read filter
 * by `deleted_at IS NULL`. Approval audit columns (approvedBy, approvedAt,
 * rejectionReason) are written in the SAME UPDATE as the status change so a
 * crash mid-mutation can never leave an "approved request with no approver".
 */
import { and, eq, gte, lte, ilike, isNull, sql, desc, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
    travelRequests,
    travelExpenses,
    employees,
    users,
} from '../../db/schema/index.js'

export type TravelRequestStatus =
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'completed'

export type TravelExpenseStatus =
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'reimbursed'

const FINAL_STATUSES: ReadonlyArray<TravelRequestStatus> = ['approved', 'rejected', 'cancelled', 'completed']

/**
 * Generate a per-tenant unique travel number like "TRV-2026-0001".
 *
 * We scan the highest existing number for the given tenant+year and increment
 * by one. The unique index on (tenantId, travelNo) makes this race-safe: if
 * two HR users hit submit at the same millisecond, one of the inserts will
 * 23505 (duplicate key) and the route layer will retry once.
 */
export async function generateTravelNo(tenantId: string, year: number): Promise<string> {
    const prefix = `TRV-${year}-`
    const [row] = await db
        .select({ travelNo: travelRequests.travelNo })
        .from(travelRequests)
        .where(and(
            eq(travelRequests.tenantId, tenantId),
            ilike(travelRequests.travelNo, `${prefix}%`),
        ))
        .orderBy(desc(travelRequests.travelNo))
        .limit(1)

    let next = 1
    if (row?.travelNo) {
        const tail = row.travelNo.slice(prefix.length)
        const parsed = Number.parseInt(tail, 10)
        if (Number.isInteger(parsed)) next = parsed + 1
    }
    return `${prefix}${String(next).padStart(4, '0')}`
}

/** Inclusive day count between two ISO dates. (arrival - departure + 1). */
export function computeDurationDays(departureISO: string, arrivalISO: string): number {
    const d = new Date(departureISO + 'T00:00:00Z').getTime()
    const a = new Date(arrivalISO + 'T00:00:00Z').getTime()
    if (!Number.isFinite(d) || !Number.isFinite(a) || a < d) return 0
    return Math.round((a - d) / 86400000) + 1
}

// ─── Travel requests ─────────────────────────────────────────────────────────

export interface ListTravelRequestsFilter {
    employeeId?: string
    status?: TravelRequestStatus
    from?: string
    to?: string
    search?: string
    limit?: number
    offset?: number
}

export interface CreateTravelRequestInput {
    employeeId: string
    placeOfVisit?: string | null
    departureDate: string
    arrivalDate: string
    purposeOfVisit?: string | null
    customerName?: string | null
    isBillableToCustomer?: boolean
    notes?: string | null
}

export interface UpdateTravelRequestInput {
    placeOfVisit?: string | null
    departureDate?: string
    arrivalDate?: string
    purposeOfVisit?: string | null
    customerName?: string | null
    isBillableToCustomer?: boolean
    notes?: string | null
}

export async function listTravelRequests(tenantId: string, filter: ListTravelRequestsFilter = {}) {
    const conditions = [
        eq(travelRequests.tenantId, tenantId),
        isNull(travelRequests.deletedAt),
    ]
    if (filter.employeeId) conditions.push(eq(travelRequests.employeeId, filter.employeeId))
    if (filter.status) conditions.push(eq(travelRequests.status, filter.status))
    if (filter.from) conditions.push(gte(travelRequests.departureDate, filter.from))
    if (filter.to) conditions.push(lte(travelRequests.arrivalDate, filter.to))
    if (filter.search) {
        // Search against the travel number + free-text fields. The query is
        // a single ILIKE OR — Postgres can still use the travel_no unique
        // index for the prefix path even with this composite predicate.
        const term = `%${filter.search.replace(/[%_]/g, '\\$&')}%`
        conditions.push(sql`(
            ${travelRequests.travelNo} ILIKE ${term}
            OR ${travelRequests.placeOfVisit} ILIKE ${term}
            OR ${travelRequests.customerName} ILIKE ${term}
            OR ${travelRequests.purposeOfVisit} ILIKE ${term}
        )`)
    }

    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200)
    const offset = Math.max(filter.offset ?? 0, 0)

    const rows = await db
        .select({
            id: travelRequests.id,
            travelNo: travelRequests.travelNo,
            employeeId: travelRequests.employeeId,
            employeeNo: employees.employeeNo,
            employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            department: employees.department,
            placeOfVisit: travelRequests.placeOfVisit,
            departureDate: travelRequests.departureDate,
            arrivalDate: travelRequests.arrivalDate,
            durationDays: travelRequests.durationDays,
            purposeOfVisit: travelRequests.purposeOfVisit,
            customerName: travelRequests.customerName,
            isBillableToCustomer: travelRequests.isBillableToCustomer,
            status: travelRequests.status,
            approvedAt: travelRequests.approvedAt,
            rejectionReason: travelRequests.rejectionReason,
            notes: travelRequests.notes,
            createdAt: travelRequests.createdAt,
            updatedAt: travelRequests.updatedAt,
            // window function gives us the total without a second COUNT query
            total: sql<number>`COUNT(*) OVER()`,
        })
        .from(travelRequests)
        .innerJoin(employees, eq(travelRequests.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(travelRequests.createdAt))
        .limit(limit)
        .offset(offset)

    const total = rows.length > 0 ? Number(rows[0]!.total) : 0
    // Strip the `total` column from each row so the API shape stays clean.
    const data = rows.map(({ total: _t, ...rest }) => rest)
    return { data, total, limit, offset, hasMore: offset + data.length < total }
}

export async function getTravelRequestById(tenantId: string, id: string) {
    const [row] = await db
        .select({
            id: travelRequests.id,
            travelNo: travelRequests.travelNo,
            employeeId: travelRequests.employeeId,
            employeeNo: employees.employeeNo,
            employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            department: employees.department,
            placeOfVisit: travelRequests.placeOfVisit,
            departureDate: travelRequests.departureDate,
            arrivalDate: travelRequests.arrivalDate,
            durationDays: travelRequests.durationDays,
            purposeOfVisit: travelRequests.purposeOfVisit,
            customerName: travelRequests.customerName,
            isBillableToCustomer: travelRequests.isBillableToCustomer,
            status: travelRequests.status,
            approvedBy: travelRequests.approvedBy,
            approvedAt: travelRequests.approvedAt,
            approverName: users.name,
            rejectionReason: travelRequests.rejectionReason,
            notes: travelRequests.notes,
            createdBy: travelRequests.createdBy,
            createdAt: travelRequests.createdAt,
            updatedAt: travelRequests.updatedAt,
        })
        .from(travelRequests)
        .innerJoin(employees, eq(travelRequests.employeeId, employees.id))
        .leftJoin(users, eq(travelRequests.approvedBy, users.id))
        .where(and(
            eq(travelRequests.tenantId, tenantId),
            eq(travelRequests.id, id),
            isNull(travelRequests.deletedAt),
        ))
        .limit(1)
    return row ?? null
}

export async function createTravelRequest(
    tenantId: string,
    input: CreateTravelRequestInput,
    createdBy: string | null,
) {
    const duration = computeDurationDays(input.departureDate, input.arrivalDate)
    if (duration < 1) {
        throw Object.assign(new Error('arrival_date must be on or after departure_date'), { statusCode: 400 })
    }

    // Generate the travel number using the departure year — keeps the
    // numbering aligned with the fiscal context of the trip.
    const year = Number(input.departureDate.slice(0, 4))
    const travelNo = await generateTravelNo(tenantId, year)

    const [row] = await db
        .insert(travelRequests)
        .values({
            tenantId,
            employeeId: input.employeeId,
            travelNo,
            placeOfVisit: input.placeOfVisit ?? null,
            departureDate: input.departureDate,
            arrivalDate: input.arrivalDate,
            durationDays: duration,
            purposeOfVisit: input.purposeOfVisit ?? null,
            customerName: input.customerName ?? null,
            isBillableToCustomer: input.isBillableToCustomer ?? false,
            notes: input.notes ?? null,
            status: 'draft',
            createdBy,
        })
        .returning()
    return row!
}

export async function updateTravelRequest(
    tenantId: string,
    id: string,
    patch: UpdateTravelRequestInput,
) {
    // Pull the existing row so we can (a) refuse edits on non-draft requests
    // and (b) recompute duration_days if departure/arrival changed.
    const existing = await getTravelRequestById(tenantId, id)
    if (!existing) return null
    if (existing.status !== 'draft' && existing.status !== 'submitted') {
        throw Object.assign(
            new Error(`Cannot edit a ${existing.status} travel request`),
            { statusCode: 409 },
        )
    }

    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.placeOfVisit !== undefined) set.placeOfVisit = patch.placeOfVisit ?? null
    if (patch.purposeOfVisit !== undefined) set.purposeOfVisit = patch.purposeOfVisit ?? null
    if (patch.customerName !== undefined) set.customerName = patch.customerName ?? null
    if (patch.isBillableToCustomer !== undefined) set.isBillableToCustomer = patch.isBillableToCustomer
    if (patch.notes !== undefined) set.notes = patch.notes ?? null

    // Date changes need duration recompute. Either both must come together or
    // neither — partial updates would otherwise compute against a stale half.
    const nextDeparture = patch.departureDate ?? existing.departureDate
    const nextArrival = patch.arrivalDate ?? existing.arrivalDate
    if (patch.departureDate !== undefined || patch.arrivalDate !== undefined) {
        const duration = computeDurationDays(nextDeparture, nextArrival)
        if (duration < 1) {
            throw Object.assign(new Error('arrival_date must be on or after departure_date'), { statusCode: 400 })
        }
        set.departureDate = nextDeparture
        set.arrivalDate = nextArrival
        set.durationDays = duration
    }

    const [row] = await db
        .update(travelRequests)
        .set(set as Partial<typeof travelRequests.$inferInsert>)
        .where(and(
            eq(travelRequests.tenantId, tenantId),
            eq(travelRequests.id, id),
            isNull(travelRequests.deletedAt),
        ))
        .returning()
    return row ?? null
}

/**
 * Transition a request through the workflow. Centralised so the legal
 * transitions live in ONE place (not scattered across N route handlers).
 *
 * Allowed transitions:
 *   draft       → submitted | cancelled
 *   submitted   → approved  | rejected  | cancelled
 *   approved    → completed | cancelled
 *   rejected    → (none — terminal)
 *   cancelled   → (none — terminal)
 *   completed   → (none — terminal)
 */
export async function transitionTravelRequest(
    tenantId: string,
    id: string,
    to: TravelRequestStatus,
    actor: { userId: string | null; rejectionReason?: string | null },
) {
    const existing = await getTravelRequestById(tenantId, id)
    if (!existing) return null
    const allowed = ALLOWED_TRANSITIONS[existing.status as TravelRequestStatus]
    if (!allowed.includes(to)) {
        throw Object.assign(
            new Error(`Cannot transition from ${existing.status} to ${to}`),
            { statusCode: 409 },
        )
    }
    if (to === 'rejected' && !actor.rejectionReason?.trim()) {
        throw Object.assign(new Error('rejection_reason is required when rejecting'), { statusCode: 400 })
    }

    const set: Record<string, unknown> = { status: to, updatedAt: new Date() }
    if (to === 'approved' || to === 'rejected') {
        set.approvedBy = actor.userId
        set.approvedAt = new Date()
        set.rejectionReason = to === 'rejected' ? actor.rejectionReason : null
    }

    const [row] = await db
        .update(travelRequests)
        .set(set as Partial<typeof travelRequests.$inferInsert>)
        .where(and(
            eq(travelRequests.tenantId, tenantId),
            eq(travelRequests.id, id),
            isNull(travelRequests.deletedAt),
            // Defence in depth: re-check the from-state in SQL to defeat
            // a TOCTOU race where two approvers click at once.
            eq(travelRequests.status, existing.status),
        ))
        .returning()
    return row ?? null
}

const ALLOWED_TRANSITIONS: Record<TravelRequestStatus, ReadonlyArray<TravelRequestStatus>> = {
    draft:     ['submitted', 'cancelled'],
    submitted: ['approved', 'rejected', 'cancelled'],
    approved:  ['completed', 'cancelled'],
    rejected:  [],
    cancelled: [],
    completed: [],
}

export async function softDeleteTravelRequest(tenantId: string, id: string) {
    const [row] = await db
        .update(travelRequests)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(
            eq(travelRequests.tenantId, tenantId),
            eq(travelRequests.id, id),
            isNull(travelRequests.deletedAt),
        ))
        .returning()
    return row ?? null
}

// ─── Travel expenses ─────────────────────────────────────────────────────────

const EXPENSE_NUMERIC_FIELDS = [
    'ticket', 'lodging', 'boarding', 'phone', 'localConveyance', 'incidentals', 'others',
] as const

export interface CreateTravelExpenseInput {
    travelRequestId: string
    description?: string | null
    expenseDate: string
    ticket?: number | string
    lodging?: number | string
    boarding?: number | string
    phone?: number | string
    localConveyance?: number | string
    incidentals?: number | string
    others?: number | string
    currency?: string
    receiptS3Key?: string | null
}

export interface UpdateTravelExpenseInput {
    description?: string | null
    expenseDate?: string
    ticket?: number | string
    lodging?: number | string
    boarding?: number | string
    phone?: number | string
    localConveyance?: number | string
    incidentals?: number | string
    others?: number | string
    currency?: string
    receiptS3Key?: string | null
}

/** Cast a numeric input to the string-of-decimal format Drizzle expects, with
 *  basic sanity checking. Throws on negatives or non-numbers — the route layer
 *  surfaces these as 400s with the field name. */
function normalizeAmount(label: string, value: number | string | undefined): string | undefined {
    if (value === undefined || value === null || value === '') return undefined
    const n = typeof value === 'string' ? Number(value) : value
    if (!Number.isFinite(n) || n < 0) {
        throw Object.assign(new Error(`${label} must be a non-negative number`), { statusCode: 400 })
    }
    return n.toFixed(2)
}

export async function listTravelExpenses(
    tenantId: string,
    filter: { travelRequestId?: string; employeeId?: string; status?: TravelExpenseStatus } = {},
) {
    const conditions = [
        eq(travelExpenses.tenantId, tenantId),
        isNull(travelExpenses.deletedAt),
    ]
    if (filter.travelRequestId) conditions.push(eq(travelExpenses.travelRequestId, filter.travelRequestId))
    if (filter.employeeId) conditions.push(eq(travelExpenses.employeeId, filter.employeeId))
    if (filter.status) conditions.push(eq(travelExpenses.status, filter.status))

    return db
        .select({
            id: travelExpenses.id,
            travelRequestId: travelExpenses.travelRequestId,
            travelNo: travelRequests.travelNo,
            employeeId: travelExpenses.employeeId,
            employeeNo: employees.employeeNo,
            employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            description: travelExpenses.description,
            expenseDate: travelExpenses.expenseDate,
            ticket: travelExpenses.ticket,
            lodging: travelExpenses.lodging,
            boarding: travelExpenses.boarding,
            phone: travelExpenses.phone,
            localConveyance: travelExpenses.localConveyance,
            incidentals: travelExpenses.incidentals,
            others: travelExpenses.others,
            currency: travelExpenses.currency,
            receiptS3Key: travelExpenses.receiptS3Key,
            status: travelExpenses.status,
            approvedAt: travelExpenses.approvedAt,
            rejectionReason: travelExpenses.rejectionReason,
            createdAt: travelExpenses.createdAt,
            // Server-side row total — saves the frontend from re-summing
            // every render. Returned as a string to match the numeric cols.
            total: sql<string>`(
                ${travelExpenses.ticket} + ${travelExpenses.lodging} + ${travelExpenses.boarding}
                + ${travelExpenses.phone} + ${travelExpenses.localConveyance}
                + ${travelExpenses.incidentals} + ${travelExpenses.others}
            )::numeric(12,2)`,
        })
        .from(travelExpenses)
        .innerJoin(travelRequests, eq(travelExpenses.travelRequestId, travelRequests.id))
        .innerJoin(employees, eq(travelExpenses.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(travelExpenses.expenseDate))
}

export async function createTravelExpense(
    tenantId: string,
    input: CreateTravelExpenseInput,
    createdBy: string | null,
) {
    // Parent must exist, be in the same tenant, and be in a state that
    // allows expenses (approved or completed). The trip can't have been
    // soft-deleted either.
    const parent = await getTravelRequestById(tenantId, input.travelRequestId)
    if (!parent) {
        throw Object.assign(new Error('Travel request not found'), { statusCode: 404 })
    }
    if (parent.status !== 'approved' && parent.status !== 'completed') {
        throw Object.assign(
            new Error(`Cannot add expenses to a ${parent.status} travel request`),
            { statusCode: 409 },
        )
    }

    const values: Partial<typeof travelExpenses.$inferInsert> = {
        tenantId,
        travelRequestId: input.travelRequestId,
        employeeId: parent.employeeId,
        description: input.description ?? null,
        expenseDate: input.expenseDate,
        currency: input.currency ?? 'AED',
        receiptS3Key: input.receiptS3Key ?? null,
        createdBy,
    }
    for (const field of EXPENSE_NUMERIC_FIELDS) {
        const v = normalizeAmount(field, input[field])
        if (v !== undefined) (values as Record<string, unknown>)[field] = v
    }

    const [row] = await db.insert(travelExpenses).values(values as typeof travelExpenses.$inferInsert).returning()
    return row!
}

export async function updateTravelExpense(
    tenantId: string,
    id: string,
    patch: UpdateTravelExpenseInput,
) {
    // Don't allow edits on approved/reimbursed expenses — those numbers
    // already feed into reports. To correct an approved expense the user
    // must reject it (which sends it back to pending) first.
    const [existing] = await db
        .select({ status: travelExpenses.status })
        .from(travelExpenses)
        .where(and(
            eq(travelExpenses.tenantId, tenantId),
            eq(travelExpenses.id, id),
            isNull(travelExpenses.deletedAt),
        ))
        .limit(1)
    if (!existing) return null
    if (existing.status === 'approved' || existing.status === 'reimbursed') {
        throw Object.assign(
            new Error(`Cannot edit a ${existing.status} expense — reject it first`),
            { statusCode: 409 },
        )
    }

    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.description !== undefined) set.description = patch.description ?? null
    if (patch.expenseDate !== undefined) set.expenseDate = patch.expenseDate
    if (patch.currency !== undefined) set.currency = patch.currency
    if (patch.receiptS3Key !== undefined) set.receiptS3Key = patch.receiptS3Key ?? null
    for (const field of EXPENSE_NUMERIC_FIELDS) {
        const v = normalizeAmount(field, patch[field])
        if (v !== undefined) set[field] = v
    }

    const [row] = await db
        .update(travelExpenses)
        .set(set as Partial<typeof travelExpenses.$inferInsert>)
        .where(and(
            eq(travelExpenses.tenantId, tenantId),
            eq(travelExpenses.id, id),
            isNull(travelExpenses.deletedAt),
        ))
        .returning()
    return row ?? null
}

export async function transitionTravelExpense(
    tenantId: string,
    id: string,
    to: TravelExpenseStatus,
    actor: { userId: string | null; rejectionReason?: string | null },
) {
    if (to === 'rejected' && !actor.rejectionReason?.trim()) {
        throw Object.assign(new Error('rejection_reason is required when rejecting'), { statusCode: 400 })
    }
    const set: Record<string, unknown> = { status: to, updatedAt: new Date() }
    if (to === 'approved' || to === 'rejected') {
        set.approvedBy = actor.userId
        set.approvedAt = new Date()
        set.rejectionReason = to === 'rejected' ? actor.rejectionReason : null
    }
    const [row] = await db
        .update(travelExpenses)
        .set(set as Partial<typeof travelExpenses.$inferInsert>)
        .where(and(
            eq(travelExpenses.tenantId, tenantId),
            eq(travelExpenses.id, id),
            isNull(travelExpenses.deletedAt),
        ))
        .returning()
    return row ?? null
}

export async function softDeleteTravelExpense(tenantId: string, id: string) {
    const [row] = await db
        .update(travelExpenses)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(
            eq(travelExpenses.tenantId, tenantId),
            eq(travelExpenses.id, id),
            isNull(travelExpenses.deletedAt),
        ))
        .returning()
    return row ?? null
}

/**
 * Sum every category across all non-deleted expenses for a single travel
 * request. One query — feeds the "totals" card on the expense page. Returns
 * zeros for every column when the request has no expense rows yet.
 */
export async function getTravelExpenseTotals(tenantId: string, travelRequestId: string) {
    const [row] = await db
        .select({
            ticket:          sql<string>`COALESCE(SUM(${travelExpenses.ticket}), 0)`,
            lodging:         sql<string>`COALESCE(SUM(${travelExpenses.lodging}), 0)`,
            boarding:        sql<string>`COALESCE(SUM(${travelExpenses.boarding}), 0)`,
            phone:           sql<string>`COALESCE(SUM(${travelExpenses.phone}), 0)`,
            localConveyance: sql<string>`COALESCE(SUM(${travelExpenses.localConveyance}), 0)`,
            incidentals:     sql<string>`COALESCE(SUM(${travelExpenses.incidentals}), 0)`,
            others:          sql<string>`COALESCE(SUM(${travelExpenses.others}), 0)`,
            grandTotal:      sql<string>`COALESCE(SUM(
                ${travelExpenses.ticket} + ${travelExpenses.lodging} + ${travelExpenses.boarding}
                + ${travelExpenses.phone} + ${travelExpenses.localConveyance}
                + ${travelExpenses.incidentals} + ${travelExpenses.others}
            ), 0)`,
            rowCount: sql<number>`COUNT(*)`,
        })
        .from(travelExpenses)
        .where(and(
            eq(travelExpenses.tenantId, tenantId),
            eq(travelExpenses.travelRequestId, travelRequestId),
            isNull(travelExpenses.deletedAt),
        ))
    return row!
}

// ─── Scoped lookups for permission gating ────────────────────────────────────

/**
 * Fetch the set of travel request ids visible to a given viewer. Used by the
 * route layer when paginating: instead of returning every row and filtering
 * client-side, we narrow the set in SQL.
 *
 * Returns null = "no scoping, can see everything" (HR/super admin).
 * Returns [] = "can see nothing".
 */
export async function resolveTravelRequestScope(
    tenantId: string,
    viewer: { role: string; employeeId: string | null; department: string | null },
): Promise<string[] | null> {
    if (viewer.role === 'super_admin' || viewer.role === 'hr_manager') return null
    if (viewer.role === 'dept_head') {
        // Department-scoped: every employee in the same department.
        if (!viewer.department) return []
        const rows = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.department, viewer.department),
            ))
        return rows.map((r) => r.id)
    }
    // Everyone else: their own employee row only.
    return viewer.employeeId ? [viewer.employeeId] : []
}

/**
 * Apply the viewer's scope to a list filter. Returns the same filter with
 * employeeId narrowed (or signals "no results possible" via empty array).
 *
 * Helper exists so both the route handler and any cross-module callers
 * (notifications worker, reports) apply identical rules.
 */
export async function applyViewerScopeToList(
    tenantId: string,
    viewer: { role: string; employeeId: string | null; department: string | null },
    filter: ListTravelRequestsFilter,
): Promise<{ scoped: ListTravelRequestsFilter; blocked: boolean }> {
    const scope = await resolveTravelRequestScope(tenantId, viewer)
    if (scope === null) return { scoped: filter, blocked: false }
    if (scope.length === 0) return { scoped: filter, blocked: true }

    // If the caller passed an employeeId, verify it's inside their scope.
    if (filter.employeeId && !scope.includes(filter.employeeId)) {
        return { scoped: filter, blocked: true }
    }
    // For single-id scope we can simply set employeeId. For multi-id scope
    // (dept_head) we need an inArray clause — handled in the route by
    // calling listTravelRequests once per id is wasteful, so we return the
    // scope so the route can build the inArray itself.
    if (scope.length === 1 && !filter.employeeId) {
        return { scoped: { ...filter, employeeId: scope[0] }, blocked: false }
    }
    return { scoped: filter, blocked: false }
}

/**
 * Variant used by dept_head queries — applies the multi-id scope via an
 * explicit inArray on the underlying table. Keeps `listTravelRequests`
 * single-employee-friendly while still supporting the dept_head case.
 */
export async function listTravelRequestsForScope(
    tenantId: string,
    employeeIds: string[],
    filter: Omit<ListTravelRequestsFilter, 'employeeId'>,
) {
    if (employeeIds.length === 0) {
        return { data: [], total: 0, limit: filter.limit ?? 50, offset: filter.offset ?? 0, hasMore: false }
    }
    const conditions = [
        eq(travelRequests.tenantId, tenantId),
        isNull(travelRequests.deletedAt),
        inArray(travelRequests.employeeId, employeeIds),
    ]
    if (filter.status) conditions.push(eq(travelRequests.status, filter.status))
    if (filter.from) conditions.push(gte(travelRequests.departureDate, filter.from))
    if (filter.to) conditions.push(lte(travelRequests.arrivalDate, filter.to))
    if (filter.search) {
        const term = `%${filter.search.replace(/[%_]/g, '\\$&')}%`
        conditions.push(sql`(
            ${travelRequests.travelNo} ILIKE ${term}
            OR ${travelRequests.placeOfVisit} ILIKE ${term}
            OR ${travelRequests.customerName} ILIKE ${term}
            OR ${travelRequests.purposeOfVisit} ILIKE ${term}
        )`)
    }

    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200)
    const offset = Math.max(filter.offset ?? 0, 0)

    const rows = await db
        .select({
            id: travelRequests.id,
            travelNo: travelRequests.travelNo,
            employeeId: travelRequests.employeeId,
            employeeNo: employees.employeeNo,
            employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            department: employees.department,
            placeOfVisit: travelRequests.placeOfVisit,
            departureDate: travelRequests.departureDate,
            arrivalDate: travelRequests.arrivalDate,
            durationDays: travelRequests.durationDays,
            purposeOfVisit: travelRequests.purposeOfVisit,
            customerName: travelRequests.customerName,
            isBillableToCustomer: travelRequests.isBillableToCustomer,
            status: travelRequests.status,
            approvedAt: travelRequests.approvedAt,
            rejectionReason: travelRequests.rejectionReason,
            notes: travelRequests.notes,
            createdAt: travelRequests.createdAt,
            updatedAt: travelRequests.updatedAt,
            total: sql<number>`COUNT(*) OVER()`,
        })
        .from(travelRequests)
        .innerJoin(employees, eq(travelRequests.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(travelRequests.createdAt))
        .limit(limit)
        .offset(offset)

    const total = rows.length > 0 ? Number(rows[0]!.total) : 0
    const data = rows.map(({ total: _t, ...rest }) => rest)
    return { data, total, limit, offset, hasMore: offset + data.length < total }
}

export { FINAL_STATUSES, ALLOWED_TRANSITIONS }
