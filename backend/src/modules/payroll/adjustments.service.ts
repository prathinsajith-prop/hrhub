/**
 * Payroll adjustments — the single ledger feeding runPayroll.
 *
 * See backend/src/db/schema/payroll_adjustments.ts for the table's design
 * rationale. The service offers:
 *
 *   1. CRUD for HR-created (`source = 'manual'`) rows.
 *   2. `syncAdjustmentsForPeriod` — recomputes leave + loan derived rows.
 *      Manual rows are never touched. Idempotent: re-running for the same
 *      period replaces only the auto-imported rows.
 *   3. `getAdjustmentTotalsByEmployee` — runPayroll's consumer view. Groups
 *      by employeeId and category so the engine can drop totals straight
 *      into payslip columns.
 *
 * Period locking: any mutation route should call `isPeriodLocked` first.
 * Once a payroll run for (year, month) has left 'draft', adjustments for
 * that period become read-only — the numbers on the payslip are the
 * historical record and HR shouldn't be able to drift them after the fact.
 */
import { and, eq, gte, inArray, isNull, lte, sql, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
    payrollAdjustments,
    payrollAdjustmentImports,
    payrollAdjustmentCategories,
    payrollRuns,
    employees,
    employeeSalaryComponents,
    salaryComponents,
    leaveRequests,
    employeeLoans,
    users,
} from '../../db/schema/index.js'

export type AdjustmentKind = 'addition' | 'deduction'
export type AdjustmentCategory =
    | 'overtime'
    | 'commission'
    | 'bonus'
    | 'loan_repayment'
    | 'salary_advance'
    | 'unpaid_leave'
    | 'sick_half_pay'
    | 'manual'
export type AdjustmentSource = 'manual' | 'leave_engine' | 'loan_engine' | 'expense_engine'

// Default kind for built-in categories. Used as a synchronous classifier when
// the caller already knows it's dealing with a built-in. Custom categories
// resolve their kind through resolveCategory() (async, DB-backed).
const ADDITION_CATEGORIES = new Set<AdjustmentCategory>(['overtime', 'commission', 'bonus'])

export function kindForCategory(category: AdjustmentCategory): AdjustmentKind {
    return ADDITION_CATEGORIES.has(category) ? 'addition' : 'deduction'
}

/** Async variant — handles built-ins and tenant-registered custom categories.
 *  Falls back to 'deduction' as the safe default when the category is unknown
 *  (the route layer rejects unknown categories before reaching the service,
 *  so this branch only fires on race conditions). */
async function kindForCategoryAsync(tenantId: string, category: string): Promise<AdjustmentKind> {
    if (ADDITION_CATEGORIES.has(category as AdjustmentCategory)) return 'addition'
    if (BUILTIN_CATEGORIES.some((c) => c.value === category)) return 'deduction'
    const resolved = await resolveCategory(tenantId, category)
    return resolved?.kind ?? 'deduction'
}

/**
 * A payroll period is "locked" once its run leaves draft. Adjustment mutations
 * for that period must be rejected — the payslip totals are the historical
 * record, and silently mutating the ledger underneath them would be a lie.
 */
export async function isPeriodLocked(tenantId: string, year: number, month: number): Promise<boolean> {
    const [row] = await db
        .select({ status: payrollRuns.status })
        .from(payrollRuns)
        .where(and(eq(payrollRuns.tenantId, tenantId), eq(payrollRuns.year, year), eq(payrollRuns.month, month)))
        .limit(1)
    return !!row && row.status !== 'draft'
}

export interface CreateAdjustmentInput {
    employeeId: string
    periodYear: number
    periodMonth: number
    category: AdjustmentCategory
    amount: number | string
    notes?: string | null
}

export async function createAdjustment(
    tenantId: string,
    input: CreateAdjustmentInput,
    createdBy: string | null,
) {
    const kind = await kindForCategoryAsync(tenantId, input.category)
    const [row] = await db
        .insert(payrollAdjustments)
        .values({
            tenantId,
            employeeId: input.employeeId,
            periodYear: input.periodYear,
            periodMonth: input.periodMonth,
            kind,
            category: input.category,
            amount: String(input.amount),
            notes: input.notes ?? null,
            source: 'manual',
            sourceRef: null,
            createdBy,
        })
        .returning()
    return row
}

export interface BulkAdjustmentRow {
    /** 1-based row number from the source spreadsheet (used for per-row error reporting). */
    rowNumber: number
    employeeNo?: string | null
    employeeName?: string | null
    employeeEmail?: string | null
    employeePhone?: string | null
    amount: number | string
    notes?: string | null
}

/** Strip every non-digit so '+971 50 123 4567' and '+971501234567' compare equal. */
export function normalizePhone(value: string | null | undefined): string | null {
    if (!value) return null
    const digits = String(value).replace(/\D+/g, '')
    return digits.length > 0 ? digits : null
}

/** Compact employee lookup tables used by the per-row matcher.
 *  Exposed so the matching logic can be unit-tested without a DB. */
export interface EmployeeLookups {
    byEmployeeNo: Map<string, { id: string; employeeNo: string | null; firstName: string; lastName: string }>
    byEmail: Map<string, { id: string; employeeNo: string | null; firstName: string; lastName: string }>
    byPhone?: Map<string, { id: string; employeeNo: string | null; firstName: string; lastName: string }>
}

/**
 * Pure per-row matcher — given a parsed row and pre-built lookup maps,
 * produces either a ResolvedRow with an employeeId or one with a row-level
 * error. Extracted so the resolution rules can be unit-tested independently
 * of the surrounding DB query.
 *
 * Resolution priority: employeeNo → employeeEmail → employeePhone. First match
 * wins; if all three are absent or none match, the row is invalid.
 */
export function matchBulkRow(row: BulkAdjustmentRow, lookups: EmployeeLookups) {
    const num = typeof row.amount === 'string' ? Number(row.amount) : row.amount
    if (!Number.isFinite(num) || num <= 0) {
        return {
            rowNumber: row.rowNumber,
            employeeId: null,
            resolvedName: null,
            resolvedEmployeeNo: null,
            amount: num,
            notes: row.notes ?? null,
            error: 'amount must be a positive number',
        }
    }
    let match = row.employeeNo ? lookups.byEmployeeNo.get(String(row.employeeNo).trim()) : undefined
    if (!match && row.employeeEmail) {
        match = lookups.byEmail.get(String(row.employeeEmail).trim().toLowerCase())
    }
    if (!match && row.employeePhone && lookups.byPhone) {
        const phone = normalizePhone(row.employeePhone)
        if (phone) match = lookups.byPhone.get(phone)
    }
    if (!match) {
        const hint = row.employeeNo || row.employeeEmail || row.employeePhone || row.employeeName || '(blank)'
        return {
            rowNumber: row.rowNumber,
            employeeId: null,
            resolvedName: null,
            resolvedEmployeeNo: null,
            amount: num,
            notes: row.notes ?? null,
            error: `employee not found: ${hint}`,
        }
    }
    return {
        rowNumber: row.rowNumber,
        employeeId: match.id,
        resolvedName: `${match.firstName} ${match.lastName}`.trim(),
        resolvedEmployeeNo: match.employeeNo,
        amount: num,
        notes: row.notes?.trim() ? row.notes.trim() : null,
        error: null,
    }
}

export interface BulkCreateAdjustmentsInput {
    periodYear: number
    periodMonth: number
    category: AdjustmentCategory
    rows: BulkAdjustmentRow[]
}

/**
 * Per-row action resolved by the comparison engine.
 *
 *   new        — no existing manual adjustment for (employee, period, category).
 *                Will be inserted.
 *   unchanged  — existing row found with identical amount + notes. Will be skipped.
 *   updated    — existing row found with different amount or notes. Will be UPDATEd.
 *   duplicate  — same employee appears more than once in this batch (after
 *                the first occurrence). Will be skipped on import.
 *   invalid    — row failed validation (bad amount, employee not found, etc.).
 */
export type BulkRowAction = 'new' | 'unchanged' | 'updated' | 'duplicate' | 'invalid'

export interface FieldChange<T> {
    old: T
    new: T
}

/** Field-level diff returned when action === 'updated'. */
export interface RowChanges {
    amount?: FieldChange<number>
    notes?: FieldChange<string | null>
}

export interface BulkCreateAdjustmentsResult {
    /** Rows inserted as brand-new adjustments. */
    created: number
    /** Existing rows whose amount or notes were updated. */
    updated: number
    /** Existing rows that matched exactly — silently skipped. */
    unchanged: number
    /** Within-batch duplicates beyond the first occurrence — silently skipped. */
    duplicate: number
    /** Rows that failed validation (resolution / amount / category etc.). */
    failed: number
    errors: Array<{ row: number; error: string }>
}

export interface BulkValidateRowResult {
    rowNumber: number
    /** Legacy field — kept so older callers don't break. New code should use `action`. */
    status: 'valid' | 'invalid'
    /** The comparison engine's verdict for this row. */
    action: BulkRowAction
    /** Hard error message when action === 'invalid'. */
    error: string | null
    /** Non-blocking warning (e.g. within-batch duplicate). */
    warning: string | null
    employeeId: string | null
    resolvedName: string | null
    resolvedEmployeeNo: string | null
    /** Matched existing manual adjustment (set when action is updated/unchanged). */
    existing: { id: string; amount: number; notes: string | null } | null
    /** Field-level diff (set only when action === 'updated'). */
    changes: RowChanges | null
}

export interface BulkValidateResult {
    total: number
    /** Rows that will commit (new + updated). Excludes unchanged + duplicate + invalid. */
    valid: number
    invalid: number
    /** Count of valid rows that also carry a non-blocking warning. */
    warned: number
    /** Per-action counters — feeds the preview summary cards. */
    newCount: number
    updatedCount: number
    unchangedCount: number
    duplicateCount: number
    /** Period-level guard — populated when the caller supplied periodYear /
     *  periodMonth. Lets the preview dialog show "this period is already
     *  locked" before HR clicks Submit and gets a 409. */
    periodLocked: boolean
    rows: BulkValidateRowResult[]
}

interface ResolvedRow {
    rowNumber: number
    employeeId: string | null
    resolvedName: string | null
    resolvedEmployeeNo: string | null
    amount: number
    notes: string | null
    error: string | null
}

/**
 * Resolve + validate bulk rows against the tenant's employees in a single DB
 * round-trip. Shared by the validate endpoint (which previews) and the create
 * endpoint (which inserts).
 */
async function resolveBulkRows(
    tenantId: string,
    rows: BulkAdjustmentRow[],
): Promise<ResolvedRow[]> {
    const empNos = new Set<string>()
    const empEmails = new Set<string>()
    const empPhones = new Set<string>()
    for (const r of rows) {
        if (r.employeeNo) empNos.add(String(r.employeeNo).trim())
        if (r.employeeEmail) empEmails.add(String(r.employeeEmail).trim().toLowerCase())
        const phone = normalizePhone(r.employeePhone)
        if (phone) empPhones.add(phone)
    }

    // Fetch ONLY the employees actually referenced in this upload — not
    // every employee in the tenant. With the filter pushed into SQL, a
    // 50-row upload reads at most 50 employee rows even in a tenant with
    // 10k employees.
    //
    // Phones can't be matched in SQL directly (the stored values may have
    // spaces, '+', or country-code prefixes that don't byte-match the
    // user's input). We over-fetch by ILIKE on a digit substring, then
    // re-match in JS using the normalised digits — keeps the SQL cheap
    // while still letting `+971 50 123 4567` find `971501234567`.
    const empNosList = [...empNos]
    const empEmailsList = [...empEmails]
    const empPhonesList = [...empPhones]
    const orClauses: ReturnType<typeof inArray>[] = []
    if (empNosList.length > 0) orClauses.push(inArray(employees.employeeNo, empNosList))
    if (empEmailsList.length > 0) {
        // employees may have any of three email columns set — match any.
        orClauses.push(inArray(employees.email, empEmailsList))
        orClauses.push(inArray(employees.workEmail, empEmailsList))
        orClauses.push(inArray(employees.personalEmail, empEmailsList))
    }
    if (empPhonesList.length > 0) {
        // Use the last 7 digits as a coarse SQL filter — narrow enough to
        // exploit indexes, broad enough to still hit even if HR omitted the
        // country code. The exact match happens in JS.
        const tails = empPhonesList.map((p) => p.slice(-7)).filter(Boolean)
        if (tails.length > 0) {
            orClauses.push(sql`(${employees.mobileNo} ~ ${`(${tails.join('|')})`} OR ${employees.phone} ~ ${`(${tails.join('|')})`})` as unknown as ReturnType<typeof inArray>)
        }
    }
    const empRows = orClauses.length === 0
        ? []
        : await db
              .select({
                  id: employees.id,
                  employeeNo: employees.employeeNo,
                  firstName: employees.firstName,
                  lastName: employees.lastName,
                  email: employees.email,
                  workEmail: employees.workEmail,
                  personalEmail: employees.personalEmail,
                  mobileNo: employees.mobileNo,
                  phone: employees.phone,
              })
              .from(employees)
              .where(and(
                  eq(employees.tenantId, tenantId),
                  eq(employees.isArchived, false),
                  // OR across all known identifier columns
                  sql`(${sql.join(orClauses, sql` OR `)})`,
              ))

    const byEmployeeNo = new Map<string, typeof empRows[number]>()
    const byEmail = new Map<string, typeof empRows[number]>()
    const byPhone = new Map<string, typeof empRows[number]>()
    for (const e of empRows) {
        if (e.employeeNo) byEmployeeNo.set(String(e.employeeNo).trim(), e)
        if (e.email) byEmail.set(String(e.email).trim().toLowerCase(), e)
        if (e.workEmail) byEmail.set(String(e.workEmail).trim().toLowerCase(), e)
        if (e.personalEmail) byEmail.set(String(e.personalEmail).trim().toLowerCase(), e)
        const mob = normalizePhone(e.mobileNo)
        if (mob) byPhone.set(mob, e)
        const ph = normalizePhone(e.phone)
        if (ph && !byPhone.has(ph)) byPhone.set(ph, e)
    }

    return rows.map((r) => matchBulkRow(r, { byEmployeeNo, byEmail, byPhone }))
}

/**
 * Two numbers are treated as equal at currency precision (2 decimals). Avoids
 * float-noise false positives where the parsed Excel value comes back as
 * `5000.0000000001` and would otherwise flag every row as "updated".
 */
function moneyEquals(a: number, b: number): boolean {
    return Math.round(a * 100) === Math.round(b * 100)
}

/** Notes are compared after a trim + null-coalesce so blank cells don't differ from NULL. */
function notesEqual(a: string | null, b: string | null): boolean {
    return (a?.trim() || null) === (b?.trim() || null)
}

/**
 * Fetch existing manual adjustments for the rows we're about to validate.
 * Scoped tight: only the resolved employee ids, only the current category,
 * only the current period, only non-deleted manual rows. One round-trip.
 */
async function loadExistingAdjustments(
    tenantId: string,
    periodYear: number,
    periodMonth: number,
    category: string,
    employeeIds: string[],
): Promise<Map<string, { id: string; amount: number; notes: string | null }>> {
    const map = new Map<string, { id: string; amount: number; notes: string | null }>()
    if (employeeIds.length === 0) return map
    // The column type narrows to the built-in category union, but the runtime
    // accepts any tenant-registered category (migration 0057). Pass through SQL
    // template to keep this column comparison working for custom categories.
    const rows = await db
        .select({
            id: payrollAdjustments.id,
            employeeId: payrollAdjustments.employeeId,
            amount: payrollAdjustments.amount,
            notes: payrollAdjustments.notes,
        })
        .from(payrollAdjustments)
        .where(and(
            eq(payrollAdjustments.tenantId, tenantId),
            eq(payrollAdjustments.periodYear, periodYear),
            eq(payrollAdjustments.periodMonth, periodMonth),
            sql`${payrollAdjustments.category} = ${category}`,
            eq(payrollAdjustments.source, 'manual'),
            isNull(payrollAdjustments.deletedAt),
            inArray(payrollAdjustments.employeeId, employeeIds),
        ))
    for (const r of rows) {
        map.set(r.employeeId, { id: r.id, amount: Number(r.amount), notes: r.notes ?? null })
    }
    return map
}

/**
 * Validate + compare each row in a bulk upload against the existing ledger.
 *
 * The comparison engine produces a per-row `action`:
 *   • new        – inserts on submit
 *   • updated    – overwrites the existing row (with field-level diff)
 *   • unchanged  – skipped on submit (already in DB exactly)
 *   • duplicate  – skipped on submit (same employee appeared earlier in batch)
 *   • invalid    – blocking error; row will not commit
 *
 * The route layer can render this directly: badges, red/green diffs, filter chips.
 * Submit is a no-op when (newCount + updatedCount) === 0.
 */
export async function validateBulkAdjustments(
    tenantId: string,
    rows: BulkAdjustmentRow[],
    opts: { periodYear?: number; periodMonth?: number; category?: string } = {},
): Promise<BulkValidateResult> {
    const resolved = await resolveBulkRows(tenantId, rows)

    // Load existing rows ONCE — only if we have a fully-qualified period+category
    // (the comparison engine has no anchor without it). Older callers omitting
    // these get `existing=null` for every row, which means everything looks `new`.
    const empIds = [...new Set(resolved.filter((r) => r.employeeId).map((r) => r.employeeId as string))]
    const existingByEmp = (opts.periodYear && opts.periodMonth && opts.category)
        ? await loadExistingAdjustments(tenantId, opts.periodYear, opts.periodMonth, opts.category, empIds)
        : new Map<string, { id: string; amount: number; notes: string | null }>()

    // Within-batch duplicate detection. First occurrence per employee wins —
    // every later row for the same employee becomes `action: duplicate` and is
    // skipped on commit. Prevents a single upload from creating N rows for the
    // same person (common copy-paste mistake) AND keeps the comparison engine
    // single-anchored: there's exactly one "intended value" per employee.
    const seenEmp = new Set<string>()

    const rowResults: BulkValidateRowResult[] = resolved.map((r) => {
        // Invalid rows short-circuit — no comparison needed.
        if (r.error) {
            return {
                rowNumber: r.rowNumber,
                status: 'invalid' as const,
                action: 'invalid' as const,
                error: r.error,
                warning: null,
                employeeId: r.employeeId,
                resolvedName: r.resolvedName,
                resolvedEmployeeNo: r.resolvedEmployeeNo,
                existing: null,
                changes: null,
            }
        }

        const empId = r.employeeId as string
        // 2nd+ occurrence of this employee in this batch → duplicate.
        if (seenEmp.has(empId)) {
            return {
                rowNumber: r.rowNumber,
                status: 'valid' as const,
                action: 'duplicate' as const,
                error: null,
                warning: `Duplicate of an earlier row for ${r.resolvedEmployeeNo ?? r.resolvedName ?? 'this employee'} — will be skipped on import.`,
                employeeId: empId,
                resolvedName: r.resolvedName,
                resolvedEmployeeNo: r.resolvedEmployeeNo,
                existing: null,
                changes: null,
            }
        }
        seenEmp.add(empId)

        // Compare against existing DB row, if any.
        const existing = existingByEmp.get(empId) ?? null
        if (!existing) {
            return {
                rowNumber: r.rowNumber,
                status: 'valid' as const,
                action: 'new' as const,
                error: null,
                warning: null,
                employeeId: empId,
                resolvedName: r.resolvedName,
                resolvedEmployeeNo: r.resolvedEmployeeNo,
                existing: null,
                changes: null,
            }
        }

        const amountSame = moneyEquals(existing.amount, r.amount)
        const notesSame = notesEqual(existing.notes, r.notes)
        if (amountSame && notesSame) {
            return {
                rowNumber: r.rowNumber,
                status: 'valid' as const,
                action: 'unchanged' as const,
                error: null,
                warning: null,
                employeeId: empId,
                resolvedName: r.resolvedName,
                resolvedEmployeeNo: r.resolvedEmployeeNo,
                existing,
                changes: null,
            }
        }

        // Updated — record field-level diff so the UI can render red/green.
        const changes: RowChanges = {}
        if (!amountSame) changes.amount = { old: existing.amount, new: r.amount }
        if (!notesSame) changes.notes = { old: existing.notes, new: r.notes }
        return {
            rowNumber: r.rowNumber,
            status: 'valid' as const,
            action: 'updated' as const,
            error: null,
            warning: null,
            employeeId: empId,
            resolvedName: r.resolvedName,
            resolvedEmployeeNo: r.resolvedEmployeeNo,
            existing,
            changes,
        }
    })

    const newCount = rowResults.filter((r) => r.action === 'new').length
    const updatedCount = rowResults.filter((r) => r.action === 'updated').length
    const unchangedCount = rowResults.filter((r) => r.action === 'unchanged').length
    const duplicateCount = rowResults.filter((r) => r.action === 'duplicate').length
    const invalid = rowResults.filter((r) => r.status === 'invalid').length
    const warned = rowResults.filter((r) => r.warning).length

    const periodLocked = (opts.periodYear && opts.periodMonth)
        ? await isPeriodLocked(tenantId, opts.periodYear, opts.periodMonth)
        : false

    return {
        total: rowResults.length,
        valid: newCount + updatedCount,
        invalid,
        warned,
        newCount,
        updatedCount,
        unchangedCount,
        duplicateCount,
        periodLocked,
        rows: rowResults,
    }
}

/**
 * Bulk-upsert manual payroll adjustments from a spreadsheet upload.
 *
 * Resolution: each row is matched to an employee by `employeeNo` → `employeeEmail`
 * → `employeePhone`. Tenant ownership is enforced — rows pointing at employees
 * outside the caller's tenant are rejected with a row-level error.
 *
 * Per-row action (computed by the comparison engine, same logic as validate):
 *   • new        — INSERT a new adjustment row.
 *   • updated    — UPDATE the existing row (amount and/or notes).
 *   • unchanged  — skipped (existing row already matches exactly).
 *   • duplicate  — skipped (same employee already handled earlier in batch).
 *
 * Atomicity: all writes happen inside a single transaction. If any row fails
 * resolution (employee not found / bad amount), the entire batch is aborted and
 * `errors` lists every problem found — the caller must fix the sheet and retry.
 */
export async function bulkCreateAdjustments(
    tenantId: string,
    input: BulkCreateAdjustmentsInput,
    createdBy: string | null,
): Promise<BulkCreateAdjustmentsResult> {
    const resolved = await resolveBulkRows(tenantId, input.rows)
    const errors = resolved
        .filter((r) => r.error)
        .map((r) => ({ row: r.rowNumber, error: r.error as string }))

    if (errors.length > 0) {
        return { created: 0, updated: 0, unchanged: 0, duplicate: 0, failed: errors.length, errors }
    }
    if (resolved.length === 0) {
        return { created: 0, updated: 0, unchanged: 0, duplicate: 0, failed: 0, errors: [] }
    }

    const kind = await kindForCategoryAsync(tenantId, input.category)

    // Load existing rows in one query so the comparison engine doesn't fan out
    // to N queries inside the transaction.
    const empIds = [...new Set(resolved.map((r) => r.employeeId as string))]
    const existingByEmp = await loadExistingAdjustments(
        tenantId,
        input.periodYear,
        input.periodMonth,
        input.category,
        empIds,
    )

    // Classify each row into one of four buckets. Within-batch duplicates
    // (same employee twice in the upload) are silently skipped past the first
    // occurrence — matches validateBulkAdjustments' contract.
    const inserts: Array<typeof payrollAdjustments.$inferInsert> = []
    const updates: Array<{ id: string; amount: string; notes: string | null }> = []
    let unchanged = 0
    let duplicate = 0
    const seenEmp = new Set<string>()

    for (const r of resolved) {
        const empId = r.employeeId as string
        if (seenEmp.has(empId)) {
            duplicate++
            continue
        }
        seenEmp.add(empId)

        const existing = existingByEmp.get(empId) ?? null
        if (!existing) {
            inserts.push({
                tenantId,
                employeeId: empId,
                periodYear: input.periodYear,
                periodMonth: input.periodMonth,
                kind,
                category: input.category,
                amount: r.amount.toFixed(2),
                notes: r.notes,
                source: 'manual',
                sourceRef: null,
                createdBy,
            })
            continue
        }
        if (moneyEquals(existing.amount, r.amount) && notesEqual(existing.notes, r.notes)) {
            unchanged++
            continue
        }
        updates.push({ id: existing.id, amount: r.amount.toFixed(2), notes: r.notes })
    }

    if (inserts.length === 0 && updates.length === 0) {
        return { created: 0, updated: 0, unchanged, duplicate, failed: 0, errors: [] }
    }

    // Inserts batch easily. Updates need one statement per row since each has
    // a different id — but that's fine for typical batch sizes (≤500). For
    // larger batches we could switch to UPDATE … FROM (VALUES …) but it's
    // not worth the complexity at current scale.
    await db.transaction(async (tx) => {
        if (inserts.length > 0) {
            await tx.insert(payrollAdjustments).values(inserts)
        }
        for (const u of updates) {
            await tx.update(payrollAdjustments)
                .set({ amount: u.amount, notes: u.notes, updatedAt: new Date() })
                .where(and(
                    eq(payrollAdjustments.tenantId, tenantId),
                    eq(payrollAdjustments.id, u.id),
                    // Defence in depth: never touch auto-imported rows even if
                    // the comparison engine somehow matched one (shouldn't —
                    // loadExistingAdjustments filters source='manual').
                    eq(payrollAdjustments.source, 'manual'),
                    isNull(payrollAdjustments.deletedAt),
                ))
        }
    })

    return {
        created: inserts.length,
        updated: updates.length,
        unchanged,
        duplicate,
        failed: 0,
        errors: [],
    }
}

export interface UpdateAdjustmentInput {
    amount?: number | string
    notes?: string | null
    category?: AdjustmentCategory
}

export async function updateAdjustment(tenantId: string, id: string, patch: UpdateAdjustmentInput) {
    const set: Record<string, unknown> = { updatedAt: new Date() }
    if (patch.amount !== undefined) set.amount = String(patch.amount)
    if (patch.notes !== undefined) set.notes = patch.notes
    if (patch.category !== undefined) {
        set.category = patch.category
        set.kind = await kindForCategoryAsync(tenantId, patch.category)
    }
    const [row] = await db
        .update(payrollAdjustments)
        .set(set as any)
        .where(and(
            eq(payrollAdjustments.tenantId, tenantId),
            eq(payrollAdjustments.id, id),
            // Auto-imported rows must not be hand-edited — re-sync would clobber
            // any manual change anyway, so block it cleanly here.
            eq(payrollAdjustments.source, 'manual'),
            isNull(payrollAdjustments.deletedAt),
        ))
        .returning()
    return row ?? null
}

export async function deleteAdjustment(tenantId: string, id: string) {
    // Soft delete — sets deleted_at, leaves the row in place. The list/sum
    // queries filter on `deleted_at IS NULL` so the row disappears from the
    // UI but stays available for audit ("who entered this, who removed it").
    const [row] = await db
        .update(payrollAdjustments)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(
            eq(payrollAdjustments.tenantId, tenantId),
            eq(payrollAdjustments.id, id),
            // Manual rows only — clearing leave/loan rows happens via syncAdjustmentsForPeriod
            eq(payrollAdjustments.source, 'manual'),
            isNull(payrollAdjustments.deletedAt),
        ))
        .returning()
    return row ?? null
}

/**
 * List adjustments for a (tenant, year, month) period, joined with the
 * employee record so the UI can render names + employee numbers without
 * a secondary fetch.
 */
export async function listAdjustments(tenantId: string, year: number, month: number) {
    return db
        .select({
            id: payrollAdjustments.id,
            employeeId: payrollAdjustments.employeeId,
            periodYear: payrollAdjustments.periodYear,
            periodMonth: payrollAdjustments.periodMonth,
            kind: payrollAdjustments.kind,
            category: payrollAdjustments.category,
            amount: payrollAdjustments.amount,
            notes: payrollAdjustments.notes,
            source: payrollAdjustments.source,
            sourceRef: payrollAdjustments.sourceRef,
            createdAt: payrollAdjustments.createdAt,
            employeeNo: employees.employeeNo,
            firstName: employees.firstName,
            lastName: employees.lastName,
            department: employees.department,
            createdByName: users.name,
        })
        .from(payrollAdjustments)
        .innerJoin(employees, eq(payrollAdjustments.employeeId, employees.id))
        .leftJoin(users, eq(payrollAdjustments.createdBy, users.id))
        .where(and(
            eq(payrollAdjustments.tenantId, tenantId),
            eq(payrollAdjustments.periodYear, year),
            eq(payrollAdjustments.periodMonth, month),
            isNull(payrollAdjustments.deletedAt),
        ))
        .orderBy(desc(payrollAdjustments.createdAt))
}

/**
 * Recompute the leave-engine + loan-engine derived adjustment rows for a
 * period. Manual rows (source = 'manual') are left alone.
 *
 * Strategy: delete-then-insert the auto-imported rows inside one transaction.
 * Simpler than upserts against a partial unique index, and trivially correct
 * — at the end of the transaction the auto rows match the current state of
 * leave_requests + employee_loans exactly.
 */
export async function syncAdjustmentsForPeriod(
    tenantId: string,
    year: number,
    month: number,
): Promise<{ leaveRows: number; loanRows: number }> {
    const daysInMonth = new Date(year, month, 0).getDate()
    const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
    const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // Fetch payable employees + their catalog basic in two parallel scans
    // (vs the previous per-employee correlated subquery). The daily rate
    // uses the assignment-derived basic salary so LOP and sick-half-pay
    // match what runPayroll computes for gross — they MUST share the same
    // basic figure or the deductions would be wrong relative to the
    // earnings on the same payslip.
    //
    // Resolution order: assignment.amount (override) → catalog default → 0,
    // then fall back to the legacy column when no Basic assignment exists.
    const [emps, basicRows] = await Promise.all([
        db.select({
            id: employees.id,
            legacyBasic: employees.basicSalary,
        })
            .from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                inArray(employees.status, ['active', 'onboarding']),
            )),
        db.select({
            employeeId: employeeSalaryComponents.employeeId,
            amount: sql<string | null>`COALESCE(${employeeSalaryComponents.amount}, ${salaryComponents.amount})`,
        })
            .from(employeeSalaryComponents)
            .innerJoin(salaryComponents, and(
                eq(salaryComponents.id, employeeSalaryComponents.componentId),
                eq(salaryComponents.isActive, true),
                eq(salaryComponents.kind, 'earning'),
                eq(salaryComponents.category, 'basic'),
            ))
            .where(and(
                eq(employeeSalaryComponents.tenantId, tenantId),
                eq(employeeSalaryComponents.isActive, true),
            )),
    ])

    // SUM (not overwrite) so a tenant with two `basic`-category rows on the
    // same employee — see payroll-resolver.test.ts "multiple basic-category
    // components" — gets the same combined basic the resolver computes.
    const basicByEmp = new Map<string, number>()
    for (const r of basicRows) {
        const prev = basicByEmp.get(r.employeeId) ?? 0
        basicByEmp.set(r.employeeId, prev + Number(r.amount ?? 0))
    }
    const dailyRateByEmp = new Map<string, number>()
    for (const e of emps) {
        const basic = basicByEmp.get(e.id) ?? Number(e.legacyBasic ?? 0)
        dailyRateByEmp.set(e.id, basic / 30)
    }
    const empIds = emps.map(e => e.id)
    if (empIds.length === 0) {
        return { leaveRows: 0, loanRows: 0 }
    }

    // --- Leave rows ----------------------------------------------------------
    // Same windowing rule the legacy runPayroll used: a leave is counted in
    // the month its startDate falls into. Cross-month splitting is a separate
    // concern we haven't tackled yet.
    const leaves = await db
        .select({
            id: leaveRequests.id,
            employeeId: leaveRequests.employeeId,
            leaveType: leaveRequests.leaveType,
            days: leaveRequests.days,
            startDate: leaveRequests.startDate,
            endDate: leaveRequests.endDate,
        })
        .from(leaveRequests)
        .where(and(
            eq(leaveRequests.tenantId, tenantId),
            eq(leaveRequests.status, 'approved'),
            gte(leaveRequests.startDate, monthStart),
            lte(leaveRequests.startDate, monthEnd),
            inArray(leaveRequests.employeeId, empIds),
        ))

    const leaveAdjustments: Array<typeof payrollAdjustments.$inferInsert> = []
    for (const l of leaves) {
        const dailyRate = dailyRateByEmp.get(l.employeeId) ?? 0
        if (l.leaveType === 'unpaid') {
            const amount = (l.days ?? 0) * dailyRate
            if (amount <= 0) continue
            leaveAdjustments.push({
                tenantId,
                employeeId: l.employeeId,
                periodYear: year,
                periodMonth: month,
                kind: 'deduction',
                category: 'unpaid_leave',
                amount: amount.toFixed(2),
                notes: `Unpaid leave ${l.startDate} → ${l.endDate} (${l.days} day${l.days === 1 ? '' : 's'})`,
                source: 'leave_engine',
                sourceRef: l.id,
                createdBy: null,
            })
        } else if (l.leaveType === 'sick') {
            const overflowDays = Math.max(0, (l.days ?? 0) - 15)
            const amount = overflowDays * dailyRate * 0.5
            if (amount <= 0) continue
            leaveAdjustments.push({
                tenantId,
                employeeId: l.employeeId,
                periodYear: year,
                periodMonth: month,
                kind: 'deduction',
                category: 'sick_half_pay',
                amount: amount.toFixed(2),
                notes: `Sick leave half-pay (${overflowDays} day${overflowDays === 1 ? '' : 's'} beyond first 15)`,
                source: 'leave_engine',
                sourceRef: l.id,
                createdBy: null,
            })
        }
    }

    // --- Loan rows -----------------------------------------------------------
    // One adjustment per active loan, capped at the remaining balance so we
    // never deduct more than the employee actually owes in the final month.
    const loans = await db
        .select({
            id: employeeLoans.id,
            employeeId: employeeLoans.employeeId,
            monthlyDeduction: employeeLoans.monthlyDeduction,
            remainingBalance: employeeLoans.remainingBalance,
            status: employeeLoans.status,
        })
        .from(employeeLoans)
        .where(and(
            eq(employeeLoans.tenantId, tenantId),
            eq(employeeLoans.status, 'active'),
            inArray(employeeLoans.employeeId, empIds),
        ))

    const loanAdjustments: Array<typeof payrollAdjustments.$inferInsert> = []
    for (const ln of loans) {
        const monthly = Number(ln.monthlyDeduction ?? 0)
        const remaining = ln.remainingBalance != null ? Number(ln.remainingBalance) : Number.POSITIVE_INFINITY
        const amount = Math.max(0, Math.min(monthly, remaining))
        if (amount <= 0) continue
        loanAdjustments.push({
            tenantId,
            employeeId: ln.employeeId,
            periodYear: year,
            periodMonth: month,
            kind: 'deduction',
            category: 'loan_repayment',
            amount: amount.toFixed(2),
            notes: `Loan installment (outstanding ${remaining.toFixed(2)})`,
            source: 'loan_engine',
            sourceRef: ln.id,
            createdBy: null,
        })
    }

    // Replace auto rows atomically — manual rows untouched.
    await db.transaction(async (tx) => {
        await tx
            .delete(payrollAdjustments)
            .where(and(
                eq(payrollAdjustments.tenantId, tenantId),
                eq(payrollAdjustments.periodYear, year),
                eq(payrollAdjustments.periodMonth, month),
                inArray(payrollAdjustments.source, ['leave_engine', 'loan_engine']),
            ))
        if (leaveAdjustments.length > 0) await tx.insert(payrollAdjustments).values(leaveAdjustments)
        if (loanAdjustments.length > 0) await tx.insert(payrollAdjustments).values(loanAdjustments)
    })

    return { leaveRows: leaveAdjustments.length, loanRows: loanAdjustments.length }
}

/**
 * Aggregated view consumed by runPayroll. Returns one record per employee
 * with totals per category — drop straight into payslip columns.
 *
 * `unpaidLeaveDays` / `sickHalfPayDays` are summed too so the breakdown UI
 * can show "Loss of pay (N days)" rather than just an amount.
 */
export interface EmployeeAdjustmentTotals {
    employeeId: string
    overtime: number
    commission: number       // commission + bonus categories pooled
    /** Catch-all bucket for tenant-defined custom addition categories
     *  (e.g. "site_allowance", "ramadan_bonus"). Counts toward gross. */
    otherAddition: number
    unpaidLeaveDeduction: number
    unpaidLeaveDays: number
    sickHalfPayDeduction: number
    sickHalfPayDays: number
    loanDeduction: number    // loan_repayment + salary_advance
    /** "manual" built-in + any custom deduction category. Reduces net. */
    otherDeduction: number
}

export async function getAdjustmentTotalsByEmployee(
    tenantId: string,
    year: number,
    month: number,
): Promise<Map<string, EmployeeAdjustmentTotals>> {
    // Three independent queries — the sums query groups by (employee,
    // category, kind), the day-count query joins leave_requests, and
    // listCategories pulls the tenant's custom catalog. Parallelise.
    const [rows, dayRows] = await Promise.all([
        db
            .select({
                employeeId: payrollAdjustments.employeeId,
                category: payrollAdjustments.category,
                kind: payrollAdjustments.kind,
                total: sql<string>`SUM(${payrollAdjustments.amount})`,
            })
            .from(payrollAdjustments)
            .where(and(
                eq(payrollAdjustments.tenantId, tenantId),
                eq(payrollAdjustments.periodYear, year),
                eq(payrollAdjustments.periodMonth, month),
                isNull(payrollAdjustments.deletedAt),
            ))
            .groupBy(payrollAdjustments.employeeId, payrollAdjustments.category, payrollAdjustments.kind),
        db
            .select({
                employeeId: payrollAdjustments.employeeId,
                category: payrollAdjustments.category,
                days: sql<number>`COALESCE(SUM(${leaveRequests.days}), 0)::int`,
            })
            .from(payrollAdjustments)
            .innerJoin(leaveRequests, eq(payrollAdjustments.sourceRef, leaveRequests.id))
            .where(and(
                eq(payrollAdjustments.tenantId, tenantId),
                eq(payrollAdjustments.periodYear, year),
                eq(payrollAdjustments.periodMonth, month),
                eq(payrollAdjustments.source, 'leave_engine'),
                isNull(payrollAdjustments.deletedAt),
            ))
            .groupBy(payrollAdjustments.employeeId, payrollAdjustments.category),
    ])

    const totals = new Map<string, EmployeeAdjustmentTotals>()
    const blank = (employeeId: string): EmployeeAdjustmentTotals => ({
        employeeId,
        overtime: 0,
        commission: 0,
        otherAddition: 0,
        unpaidLeaveDeduction: 0,
        unpaidLeaveDays: 0,
        sickHalfPayDeduction: 0,
        sickHalfPayDays: 0,
        loanDeduction: 0,
        otherDeduction: 0,
    })

    for (const r of rows) {
        const t = totals.get(r.employeeId) ?? blank(r.employeeId)
        const amount = Number(r.total ?? 0)
        // Built-in categories with semantic payslip slots:
        switch (r.category) {
            case 'overtime':       t.overtime += amount; break
            case 'commission':
            case 'bonus':          t.commission += amount; break
            case 'unpaid_leave':   t.unpaidLeaveDeduction += amount; break
            case 'sick_half_pay':  t.sickHalfPayDeduction += amount; break
            case 'loan_repayment':
            case 'salary_advance': t.loanDeduction += amount; break
            case 'manual':         t.otherDeduction += amount; break
            default:
                // Custom tenant category — route by kind. The DB-stored kind
                // is authoritative (set at insert time from kindForCategoryAsync),
                // so we don't need to re-query the catalog here.
                if (r.kind === 'addition') t.otherAddition += amount
                else t.otherDeduction += amount
        }
        totals.set(r.employeeId, t)
    }

    for (const r of dayRows) {
        const t = totals.get(r.employeeId) ?? blank(r.employeeId)
        if (r.category === 'unpaid_leave') t.unpaidLeaveDays = Number(r.days ?? 0)
        else if (r.category === 'sick_half_pay') {
            // sick_half_pay days only count overflow (> 15) — we stored that
            // via Math.max(0, days - 15) inside the notes/amount, so back it
            // out from the amount instead. Cheaper: re-derive at render time.
            // Approximate days for the UI by inverting amount = days * (basic/30) * 0.5.
            // We keep this approximation, since exact provenance is in the notes column.
            t.sickHalfPayDays = Math.max(0, Number(r.days ?? 0) - 15)
        }
        totals.set(r.employeeId, t)
    }

    return totals
}

// ─── Bulk import history ─────────────────────────────────────────────────────
//
// Each successful bulk upload writes a row to payroll_adjustment_imports that
// references the original spreadsheet in S3. Lets HR review past uploads and
// re-download the source file when needed.

export interface RecordImportInput {
    periodYear: number
    periodMonth: number
    category: AdjustmentCategory
    rowsCreated: number
    fileName: string
    fileSize: number
    fileMime: string
    fileS3Key: string
    fileHash: string
}

export async function recordImport(
    tenantId: string,
    input: RecordImportInput,
    createdBy: string | null,
) {
    const [row] = await db
        .insert(payrollAdjustmentImports)
        .values({
            tenantId,
            periodYear: input.periodYear,
            periodMonth: input.periodMonth,
            category: input.category,
            rowsCreated: input.rowsCreated,
            fileName: input.fileName,
            fileSize: input.fileSize,
            fileMime: input.fileMime,
            fileS3Key: input.fileS3Key,
            fileHash: input.fileHash,
            createdBy,
        })
        .returning()
    return row
}

export async function listImports(
    tenantId: string,
    filter: { year?: number; month?: number; limit?: number } = {},
) {
    const limit = Math.min(filter.limit ?? 50, 200)
    const conditions = [eq(payrollAdjustmentImports.tenantId, tenantId)]
    if (filter.year !== undefined) conditions.push(eq(payrollAdjustmentImports.periodYear, filter.year))
    if (filter.month !== undefined) conditions.push(eq(payrollAdjustmentImports.periodMonth, filter.month))
    return db
        .select({
            id: payrollAdjustmentImports.id,
            periodYear: payrollAdjustmentImports.periodYear,
            periodMonth: payrollAdjustmentImports.periodMonth,
            category: payrollAdjustmentImports.category,
            rowsCreated: payrollAdjustmentImports.rowsCreated,
            fileName: payrollAdjustmentImports.fileName,
            fileSize: payrollAdjustmentImports.fileSize,
            createdAt: payrollAdjustmentImports.createdAt,
            createdByName: users.name,
        })
        .from(payrollAdjustmentImports)
        .leftJoin(users, eq(payrollAdjustmentImports.createdBy, users.id))
        .where(and(...conditions))
        .orderBy(desc(payrollAdjustmentImports.createdAt))
        .limit(limit)
}

export async function getImportById(tenantId: string, id: string) {
    const [row] = await db
        .select()
        .from(payrollAdjustmentImports)
        .where(and(
            eq(payrollAdjustmentImports.tenantId, tenantId),
            eq(payrollAdjustmentImports.id, id),
        ))
        .limit(1)
    return row ?? null
}

// ─── Adjustment category catalog ─────────────────────────────────────────────
//
// HR can extend the 8 built-in categories with their own labels (e.g.
// "site_allowance", "ramadan_bonus"). Custom categories pool into the same
// addition / deduction kind buckets in runPayroll — only their `kind` field
// matters for the payslip math; the label is for display.

export const BUILTIN_CATEGORIES: Array<{ value: AdjustmentCategory; label: string; kind: AdjustmentKind; builtin: true; manual: boolean }> = [
    { value: 'overtime', label: 'Overtime', kind: 'addition', builtin: true, manual: true },
    { value: 'commission', label: 'Commission', kind: 'addition', builtin: true, manual: true },
    { value: 'bonus', label: 'Bonus', kind: 'addition', builtin: true, manual: true },
    { value: 'salary_advance', label: 'Salary advance', kind: 'deduction', builtin: true, manual: true },
    { value: 'manual', label: 'Manual deduction', kind: 'deduction', builtin: true, manual: true },
    // Auto-driven by syncAdjustmentsForPeriod — not pickable by HR, but
    // returned so the UI can render their labels.
    { value: 'loan_repayment', label: 'Loan repayment', kind: 'deduction', builtin: true, manual: false },
    { value: 'unpaid_leave', label: 'Loss of pay', kind: 'deduction', builtin: true, manual: false },
    { value: 'sick_half_pay', label: 'Sick half-pay', kind: 'deduction', builtin: true, manual: false },
]

export interface AdjustmentCategoryOption {
    value: string
    label: string
    kind: AdjustmentKind
    builtin: boolean
    /** False for auto-only categories (loan_repayment, unpaid_leave, sick_half_pay). */
    manual: boolean
}

/** Slug a free-form label so two custom names that look the same compare equal. */
export function slugifyCategory(input: string): string {
    return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

/**
 * Built-in + tenant-defined adjustment categories, sorted with HR's manual
 * picks first (built-ins) then custom additions. The frontend renders this
 * directly into the category Select / Combobox.
 */
export async function listCategories(tenantId: string): Promise<AdjustmentCategoryOption[]> {
    const custom = await db
        .select({
            value: payrollAdjustmentCategories.value,
            label: payrollAdjustmentCategories.label,
            kind: payrollAdjustmentCategories.kind,
        })
        .from(payrollAdjustmentCategories)
        .where(eq(payrollAdjustmentCategories.tenantId, tenantId))
    const customOpts: AdjustmentCategoryOption[] = custom.map((c) => ({
        value: c.value,
        label: c.label,
        kind: c.kind as AdjustmentKind,
        builtin: false,
        manual: true,
    }))
    return [...BUILTIN_CATEGORIES, ...customOpts]
}

export interface CreateCategoryInput {
    label: string
    kind: AdjustmentKind
}

/**
 * Create a tenant-scoped custom category. Returns the existing record (and a
 * `created: false` flag) when the slug already exists in the tenant — that
 * way the picker's "Create '…'" flow is idempotent on rapid double-clicks.
 */
export async function createCategory(
    tenantId: string,
    input: CreateCategoryInput,
    createdBy: string | null,
): Promise<{ option: AdjustmentCategoryOption; created: boolean }> {
    const value = slugifyCategory(input.label)
    if (!value) throw new Error('Category label cannot be empty.')
    if (BUILTIN_CATEGORIES.some((c) => c.value === value)) {
        const b = BUILTIN_CATEGORIES.find((c) => c.value === value)!
        return { option: { value: b.value, label: b.label, kind: b.kind, builtin: true, manual: b.manual }, created: false }
    }
    const existing = await db
        .select({ value: payrollAdjustmentCategories.value, label: payrollAdjustmentCategories.label, kind: payrollAdjustmentCategories.kind })
        .from(payrollAdjustmentCategories)
        .where(and(
            eq(payrollAdjustmentCategories.tenantId, tenantId),
            eq(payrollAdjustmentCategories.value, value),
        ))
        .limit(1)
    if (existing[0]) {
        return {
            option: { value: existing[0].value, label: existing[0].label, kind: existing[0].kind as AdjustmentKind, builtin: false, manual: true },
            created: false,
        }
    }
    const [row] = await db
        .insert(payrollAdjustmentCategories)
        .values({ tenantId, value, label: input.label.trim(), kind: input.kind, createdBy })
        .returning()
    return {
        option: { value: row.value, label: row.label, kind: row.kind as AdjustmentKind, builtin: false, manual: true },
        created: true,
    }
}

/**
 * Resolve a category string to its (kind, isKnown). Used by the create routes
 * to allow either a built-in or a tenant-registered custom category through.
 */
export async function resolveCategory(tenantId: string, value: string): Promise<{ kind: AdjustmentKind; builtin: boolean } | null> {
    const builtin = BUILTIN_CATEGORIES.find((c) => c.value === value)
    if (builtin) return { kind: builtin.kind, builtin: true }
    const slug = slugifyCategory(value)
    const [custom] = await db
        .select({ kind: payrollAdjustmentCategories.kind })
        .from(payrollAdjustmentCategories)
        .where(and(
            eq(payrollAdjustmentCategories.tenantId, tenantId),
            eq(payrollAdjustmentCategories.value, slug),
        ))
        .limit(1)
    return custom ? { kind: custom.kind as AdjustmentKind, builtin: false } : null
}
