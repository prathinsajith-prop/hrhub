import { eq, and, desc, gte, lte, inArray, sql, getTableColumns } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { payrollRuns, payslips, employees, employeeSalaryComponents, leaveRequests, orgUnits, salaryComponents, tenants } from '../../db/schema/index.js'
import { syncAdjustmentsForPeriod, getAdjustmentTotalsByEmployee } from './adjustments.service.js'
import type { InferInsertModel } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { cacheDel } from '../../lib/redis.js'
import { calculateGratuity as calcGratuityFromExit } from '../exit/exit.service.js'
import { sendEmail, payslipEmail } from '../../plugins/email.js'
import { loadEnv } from '../../config/env.js'

type NewPayrollRun = InferInsertModel<typeof payrollRuns>

export async function listPayrollRuns(tenantId: string, params: { year?: number; limit: number; offset: number }) {
    const { year, limit, offset } = params
    const conditions = [eq(payrollRuns.tenantId, tenantId)]
    if (year) conditions.push(eq(payrollRuns.year, year))

    const rows = await db.select({ ...getTableColumns(payrollRuns), totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount') })
        .from(payrollRuns)
        .where(and(...conditions))
        .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
        .limit(limit).offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0

    // Enrich draft rows with a live preview so the dashboard card no longer
    // shows 0 for "Net Pay" before processing. Persisted totals on draft rows
    // are always 0 (they're only written by runPayroll when status flips to
    // approved), so we have to recompute on the fly.
    //
    // Perf: we fetch the payable-employees list ONCE (shared across every
    // draft, doesn't depend on month) and fetch adjustments ONCE PER PERIOD
    // (multiple drafts in the same month share a period). Then we hand both
    // to previewPayrollRun via the `preloaded` channel to skip its internal
    // queries. Without this, each draft caused 3 extra DB round-trips —
    // painful on Neon where RTT is ~50–100 ms.
    const draftRows = rows.filter(r => r.status === 'draft')
    if (draftRows.length === 0) {
        return { data: rows, total, limit, offset, hasMore: offset + limit < total }
    }

    const uniquePeriods = Array.from(
        new Map(draftRows.map(r => [`${r.year}-${r.month}`, { year: r.year, month: r.month }])).values(),
    )

    const emps = await getPayableEmployees(tenantId)
    // Now that we have the employee IDs, fetch adjustments (per period) and
    // earnings (shared across all periods — assignments don't change month
    // to month) in parallel. One pass for any number of drafts in the same
    // tenant — preview cost stays bounded.
    const [earningsByEmp, ...adjResults] = await Promise.all([
        resolveEmployeeEarnings(tenantId, emps.map(e => e.id)),
        ...uniquePeriods.map(p => getAdjustmentTotalsByEmployee(tenantId, p.year, p.month)),
    ])
    const adjByPeriod = new Map<string, typeof adjResults[number]>(
        uniquePeriods.map((p, i) => [`${p.year}-${p.month}`, adjResults[i]]),
    )

    const previews = await Promise.all(
        draftRows.map(r => {
            // The period key is guaranteed to be in `adjByPeriod` because we
            // populated the map from these same draftRows above. Use a typed
            // fallback (empty map) instead of a non-null assertion so this
            // stays sound under TypeScript's `noUncheckedIndexedAccess`.
            const adjustmentTotals = adjByPeriod.get(`${r.year}-${r.month}`) ?? new Map()
            return previewPayrollRun(
                tenantId,
                { id: r.id, year: r.year, month: r.month, status: r.status as string },
                { emps, adjustmentTotals, earningsByEmp },
            ).catch(() => null)
        }),
    )
    const previewByRunId = new Map<string, Awaited<ReturnType<typeof previewPayrollRun>>>(
        draftRows.map((r, i) => [r.id, previews[i] ?? null]),
    )

    const data = rows.map(r => {
        if (r.status !== 'draft') return r
        const p = previewByRunId.get(r.id)
        if (!p) return r
        return {
            ...r,
            totalEmployees: p.totalEmployees,
            totalGross: p.totalGross.toFixed(2),
            totalDeductions: p.totalDeductions.toFixed(2),
            totalNet: p.totalNet.toFixed(2),
        }
    })
    return { data, total, limit, offset, hasMore: offset + limit < total }
}

export async function getPayrollRun(tenantId: string, id: string) {
    const row = await getPayrollRunRaw(tenantId, id)
    if (!row) return null

    // Same preview-enrichment as listPayrollRuns. The /payroll/:id endpoint
    // is hit by the pending-run card on the dashboard. We pass the row in
    // directly so previewPayrollRun doesn't re-fetch it.
    if (row.status === 'draft') {
        const p = await previewPayrollRun(tenantId, row).catch(() => null)
        if (p) {
            return {
                ...row,
                totalEmployees: p.totalEmployees,
                totalGross: p.totalGross.toFixed(2),
                totalDeductions: p.totalDeductions.toFixed(2),
                totalNet: p.totalNet.toFixed(2),
            }
        }
    }
    return row
}

export async function createPayrollRun(tenantId: string, data: Omit<NewPayrollRun, 'tenantId' | 'id'>) {
    const [row] = await db.insert(payrollRuns).values({ ...data, tenantId }).returning()
    return row
}

export async function updatePayrollRun(tenantId: string, id: string, data: Partial<NewPayrollRun>) {
    const [row] = await db.update(payrollRuns)
        .set(withTimestamp(data))
        .where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, tenantId)))
        .returning()
    return row ?? null
}

/**
 * Delete a draft payroll run. Only drafts can be deleted — once processed, the
 * row is the historical record and removing it would orphan payslip
 * downloads, audit traces, and WPS references. Returns the deleted row so the
 * route can include the period in its audit log entry.
 *
 * Cascades automatically: payslips have ON DELETE CASCADE on payroll_run_id.
 * Adjustments are intentionally NOT touched — HR-entered manual adjustments
 * survive draft deletion so the user doesn't lose work if they re-create the
 * period; auto-imported (leave/loan) rows can be regenerated by sync anyway.
 */
export async function deletePayrollRun(tenantId: string, id: string) {
    const [row] = await db
        .delete(payrollRuns)
        .where(and(
            eq(payrollRuns.id, id),
            eq(payrollRuns.tenantId, tenantId),
            eq(payrollRuns.status, 'draft'),
        ))
        .returning()
    return row ?? null
}

/**
 * Pre-processing readiness checklist for a draft run.
 *
 * Splits findings into two buckets:
 *   - blockers — things that would break payroll math or hard-fail downstream
 *     (no payable employees, missing salary on someone who'd be paid). Process
 *     button is disabled until they're fixed.
 *   - warnings — things HR should know but aren't fatal (missing IBAN means
 *     WPS submission would later fail; pending leave for the period means LOP
 *     won't be reflected; unsynced changes means the preview may be stale).
 *
 * Returns null for non-draft runs (the persisted totals are the source of
 * truth there; nothing left to check).
 */
export interface PayrollReadinessEmployee {
    id: string
    employeeNo: string
    name: string
    avatarUrl: string | null
}

export interface PayrollReadiness {
    employeeCount: number
    missingIban: number
    missingSalary: number
    pendingLeaveInPeriod: number
    /** Up to 50 employees flagged for missing IBAN — small enough to render
     *  in a popover, larger lists are truncated and surfaced via the count. */
    missingIbanEmployees: PayrollReadinessEmployee[]
    missingSalaryEmployees: PayrollReadinessEmployee[]
    blockers: string[]
    warnings: string[]
    canProcess: boolean
}

export async function getPayrollReadiness(
    tenantId: string,
    payrollRunId: string,
): Promise<PayrollReadiness | null> {
    const run = await getPayrollRunRaw(tenantId, payrollRunId)
    if (!run || run.status !== 'draft') return null

    const daysInMonth = new Date(run.year, run.month, 0).getDate()
    const monthStart = `${run.year}-${String(run.month).padStart(2, '0')}-01`
    const monthEnd = `${run.year}-${String(run.month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`

    // Four parallel queries — the slice queries carry the unfiltered total
    // via COUNT(*) OVER() so we don't pay for separate COUNT round-trips.
    // Missing-IBAN / missing-salary return up to 50 offending employees so
    // the UI can render a popover with names + links.
    const READINESS_EMPLOYEE_CAP = 50
    const hasPositiveBasicAssignment = sql`EXISTS (
        SELECT 1 FROM employee_salary_components esc
        JOIN salary_components sc ON sc.id = esc.component_id
        WHERE esc.employee_id = ${employees.id}
          AND esc.tenant_id = ${tenantId}
          AND esc.is_active = true
          AND sc.is_active = true
          AND sc.kind = 'earning'
          AND sc.category = 'basic'
          AND COALESCE(esc.amount::numeric, sc.amount::numeric, 0) > 0
    )`
    const [emps, ibanRows, salaryRows, leaveCounts] = await Promise.all([
        db.select({ count: sql<number>`COUNT(*)::int` })
            .from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                inArray(employees.status, ['active', 'onboarding']),
            )),
        db.select({
            id: employees.id,
            employeeNo: employees.employeeNo,
            firstName: employees.firstName,
            lastName: employees.lastName,
            avatarUrl: employees.avatarUrl,
            total: sql<number>`COUNT(*) OVER()`.as('total'),
        })
            .from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                inArray(employees.status, ['active', 'onboarding']),
                sql`(${employees.iban} IS NULL OR ${employees.iban} = '')`,
            ))
            .orderBy(employees.firstName, employees.lastName)
            .limit(READINESS_EMPLOYEE_CAP),
        // Missing/zero basic salary — payroll math BLOCKER. Catalog-aware:
        // an employee is OK if EITHER the legacy column has a positive
        // basic OR they have an active basic-category catalog assignment
        // with a positive amount. We only flag the intersection of "both
        // empty" so catalog-only employees aren't false positives.
        db.select({
            id: employees.id,
            employeeNo: employees.employeeNo,
            firstName: employees.firstName,
            lastName: employees.lastName,
            avatarUrl: employees.avatarUrl,
            total: sql<number>`COUNT(*) OVER()`.as('total'),
        })
            .from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                inArray(employees.status, ['active', 'onboarding']),
                sql`(${employees.basicSalary} IS NULL OR ${employees.basicSalary}::numeric = 0)`,
                sql`NOT ${hasPositiveBasicAssignment}`,
            ))
            .orderBy(employees.firstName, employees.lastName)
            .limit(READINESS_EMPLOYEE_CAP),
        db.select({ count: sql<number>`COUNT(*)::int` })
            .from(leaveRequests)
            .where(and(
                eq(leaveRequests.tenantId, tenantId),
                eq(leaveRequests.status, 'pending'),
                gte(leaveRequests.startDate, monthStart),
                lte(leaveRequests.startDate, monthEnd),
            )),
    ])

    const employeeCount = emps[0]?.count ?? 0
    const missingIban = Number(ibanRows[0]?.total ?? 0)
    const missingSalary = Number(salaryRows[0]?.total ?? 0)
    const pendingLeaveInPeriod = leaveCounts[0]?.count ?? 0

    const toReadinessEmp = (r: { id: string; employeeNo: string; firstName: string; lastName: string; avatarUrl: string | null }): PayrollReadinessEmployee => ({
        id: r.id,
        employeeNo: r.employeeNo,
        name: `${r.firstName} ${r.lastName}`.trim(),
        avatarUrl: r.avatarUrl,
    })
    const missingIbanEmployees = ibanRows.map(toReadinessEmp)
    const missingSalaryEmployees = salaryRows.map(toReadinessEmp)

    const blockers: string[] = []
    const warnings: string[] = []

    if (employeeCount === 0) {
        blockers.push('No payable employees (active or onboarding) for this tenant.')
    }
    if (missingSalary > 0) {
        blockers.push(`${missingSalary} employee${missingSalary === 1 ? ' has' : 's have'} no basic salary set — fix before processing.`)
    }
    if (missingIban > 0) {
        warnings.push(`${missingIban} employee${missingIban === 1 ? ' is' : 's are'} missing an IBAN — WPS submission will fail until added.`)
    }
    if (pendingLeaveInPeriod > 0) {
        warnings.push(`${pendingLeaveInPeriod} leave request${pendingLeaveInPeriod === 1 ? '' : 's'} for this period ${pendingLeaveInPeriod === 1 ? 'is' : 'are'} still pending — approve and re-sync to reflect LOP/sick deductions.`)
    }

    return {
        employeeCount,
        missingIban,
        missingSalary,
        pendingLeaveInPeriod,
        missingIbanEmployees,
        missingSalaryEmployees,
        blockers,
        warnings,
        canProcess: blockers.length === 0,
    }
}

export async function getPayslips(tenantId: string, payrollRunId: string) {
    return db.select().from(payslips)
        .where(and(eq(payslips.payrollRunId, payrollRunId), eq(payslips.tenantId, tenantId)))
}

export async function getPayslipsByEmployee(tenantId: string, employeeId: string) {
    return db
        .select({
            id: payslips.id,
            payrollRunId: payslips.payrollRunId,
            month: payrollRuns.month,
            year: payrollRuns.year,
            runStatus: payrollRuns.status,
            basicSalary: payslips.basicSalary,
            housingAllowance: payslips.housingAllowance,
            transportAllowance: payslips.transportAllowance,
            otherAllowances: payslips.otherAllowances,
            earningsBreakdown: payslips.earningsBreakdown,
            overtime: payslips.overtime,
            commission: payslips.commission,
            grossSalary: payslips.grossSalary,
            deductions: payslips.deductions,
            unpaidLeaveDays: payslips.unpaidLeaveDays,
            unpaidLeaveDeduction: payslips.unpaidLeaveDeduction,
            sickHalfPayDays: payslips.sickHalfPayDays,
            sickHalfPayDeduction: payslips.sickHalfPayDeduction,
            loanDeduction: payslips.loanDeduction,
            otherDeduction: payslips.otherDeduction,
            netSalary: payslips.netSalary,
            daysWorked: payslips.daysWorked,
        })
        .from(payslips)
        .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
        .where(and(eq(payslips.tenantId, tenantId), eq(payslips.employeeId, employeeId)))
        .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
}

// ─── Payroll Calculation Engine ─────────────────────────────────────────────
// UAE Labour Law applied via the payroll_adjustments ledger:
//   Gross   = (basic + housing + transport + other) × prorate ratio
//   Net     = Gross + additions − deductions
//
// `additions` and `deductions` no longer come from inline computations — they
// come from the payroll_adjustments table. runPayroll() first calls
// syncAdjustmentsForPeriod() to refresh the leave-engine + loan-engine rows,
// then aggregates everything (including HR-created manual rows) and writes
// per-category totals into the payslip columns. See adjustments.service.ts.

interface PayableEmployee {
    id: string
    basicSalary: string | null
    housingAllowance: string | null
    transportAllowance: string | null
    otherAllowances: string | null
    joinDate: string | null
    contractEndDate: string | null
}

/**
 * Single source of truth for who's payable. Both runPayroll and the draft
 * preview funnel through this so the two paths can't drift on eligibility
 * (e.g. one filter listing 'onboarding' and the other not).
 *
 * 'probation' is a contractType, not a status — never put it here.
 */
const PAYABLE_STATUSES = ['active', 'onboarding'] as const

async function getPayableEmployees(tenantId: string): Promise<PayableEmployee[]> {
    return db.select({
        id: employees.id,
        basicSalary: employees.basicSalary,
        housingAllowance: employees.housingAllowance,
        transportAllowance: employees.transportAllowance,
        otherAllowances: employees.otherAllowances,
        joinDate: employees.joinDate,
        contractEndDate: employees.contractEndDate,
    }).from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            inArray(employees.status, PAYABLE_STATUSES as unknown as string[]),
        ))
}

/**
 * Parse a Postgres `date` column ('YYYY-MM-DD') as local midnight. We must
 * NOT use `new Date(string)` here — that parses as UTC midnight, which lands
 * 4 hours later than local midnight in UAE and causes proration boundary
 * comparisons to flip wrong on the first/last day of the month (e.g. someone
 * who joins on the 31st was getting a full month of pay).
 */
function parseLocalDate(s: string | null | undefined): Date | null {
    if (!s) return null
    const [y, m, d] = s.split('-').map(Number)
    if (!y || !m || !d) return null
    return new Date(y, m - 1, d)
}

/** One resolved earning line for an employee on a specific period. */
interface ResolvedEarning {
    componentId: string
    category: string
    /** Human-readable component name from the catalog (e.g. "Communication
        Allowance"). Used to label rows in the payslip breakdown UI. */
    name: string
    /** AED amount for this earning before proration. Percentage-of-basic
        components are already converted to absolute AED here. */
    amount: number
}

export interface ResolvedEarnings {
    basic: number
    /** True when the employee has a basic earning assignment. Used to gate
        the catalog path — a partial set of assignments (e.g. only an "Other
        Allowance" left over from a half-finished migration) must still fall
        back to the legacy static fields, otherwise the resolver would zero
        out basic / housing / transport. */
    hasBasic: boolean
    earnings: ResolvedEarning[]
}

/**
 * Earnings derived from the salary-components catalog + per-employee
 * assignments. This is the source of truth payroll uses; the legacy
 * `employees.basic_salary` etc. columns serve as a backstop only for
 * employees that don't have any assignments yet (newly-created employee,
 * pre-backfill data, etc.).
 *
 * Returns a Map keyed by employee_id. Inside each entry: the resolved
 * earnings array + the computed basic figure (already flat AED). The
 * basic figure is split out separately because percentage-of-basic
 * components need it as their multiplier and we want to compute it once.
 *
 * Performance: one query joining assignments + components for ALL payable
 * employees in the tenant — O(N + M) where N = employees and M = total
 * assignments. Way better than per-employee fetches inside the math loop.
 */
export async function resolveEmployeeEarnings(
    tenantId: string,
    empIds: string[],
): Promise<Map<string, ResolvedEarnings>> {
    const result = new Map<string, ResolvedEarnings>()
    if (empIds.length === 0) return result

    // Active assignments joined with their catalog component. The catalog
    // tells us flat vs percentage and the default amount; the assignment
    // can override the amount. We also pre-filter to active components +
    // active assignments + earning kind so we don't have to filter in JS.
    const rows = await db
        .select({
            employeeId: employeeSalaryComponents.employeeId,
            componentId: salaryComponents.id,
            name: salaryComponents.name,
            category: salaryComponents.category,
            calculationType: salaryComponents.calculationType,
            componentAmount: salaryComponents.amount,
            assignmentAmount: employeeSalaryComponents.amount,
        })
        .from(employeeSalaryComponents)
        .innerJoin(salaryComponents, eq(employeeSalaryComponents.componentId, salaryComponents.id))
        .where(and(
            eq(employeeSalaryComponents.tenantId, tenantId),
            eq(employeeSalaryComponents.isActive, true),
            eq(salaryComponents.isActive, true),
            eq(salaryComponents.kind, 'earning'),
            inArray(employeeSalaryComponents.employeeId, empIds),
        ))

    // First pass: compute the Basic for each employee — SUMMING every
    // assignment whose catalog row sits in the `basic` category. Tenants
    // may legitimately split basic across multiple catalog rows (e.g. a
    // "Basic" + "Probation Basic" structure), and we previously overwrote
    // here, which meant one of them silently dropped out of the Basic
    // figure used for gratuity, WPS, and as the % multiplier below.
    //
    // Percentage-of-basic components in this category are still treated as
    // flat AED — the resolver's contract is that whatever HR put under
    // `basic` is what gets paid as basic, no conversion.
    const basicByEmp = new Map<string, number>()
    for (const r of rows) {
        if (r.category !== 'basic') continue
        const amt = Number(r.assignmentAmount ?? r.componentAmount ?? 0)
        basicByEmp.set(r.employeeId, (basicByEmp.get(r.employeeId) ?? 0) + amt)
    }

    // Second pass: resolve every earning, converting percentage-of-basic
    // into absolute AED using the basic we computed above.
    //
    // `hasBasic` requires a POSITIVE basic — a zero-amount assignment (left
    // over from sibling-zeroing during a salary revision, or HR clearing
    // the amount) must fall back to the legacy column so payroll doesn't
    // produce a payslip with basic=0. Matches the readiness check at
    // hasPositiveBasicAssignment so a draft preview and the readiness
    // blocker can't disagree.
    for (const r of rows) {
        const basic = basicByEmp.get(r.employeeId) ?? 0
        const hasBasic = basic > 0
        const rawAmount = Number(r.assignmentAmount ?? r.componentAmount ?? 0)
        const amount = r.calculationType === 'percentage_of_basic'
            ? (basic * rawAmount) / 100
            : rawAmount

        const entry = result.get(r.employeeId) ?? { basic, hasBasic, earnings: [] }
        entry.earnings.push({ componentId: r.componentId, category: r.category, name: r.name, amount })
        result.set(r.employeeId, entry)
    }

    return result
}

/**
 * Pure function — given employees, adjustments, and a period, returns the
 * per-employee payslip rows + the run totals. No DB writes. runPayroll calls
 * this and then persists; the draft preview calls it and just returns totals.
 *
 * `payrollRunId` is included in the payslip rows but only matters when the
 * caller intends to persist — preview ignores the values inside `payslipValues`.
 *
 * Earnings come from the salary-components catalog via `earningsByEmp`. If an
 * employee has no assignments (newly created, pre-migration etc.), we fall
 * back to the legacy static fields on the employee row so payroll keeps
 * producing a sensible result and HR sees no regression.
 *
 * Exported for tests — production callers go through previewPayrollRun /
 * runPayroll / getDraftPayslipsPreview.
 */
export type { ResolvedEarnings as PayslipResolvedEarnings }
export { buildPayslipsAndTotals as __buildPayslipsAndTotals_forTests }
function buildPayslipsAndTotals(
    tenantId: string,
    payrollRunId: string,
    year: number,
    month: number,
    emps: PayableEmployee[],
    adjustmentTotals: Awaited<ReturnType<typeof getAdjustmentTotalsByEmployee>>,
    earningsByEmp: Map<string, ResolvedEarnings>,
) {
    const daysInMonth = new Date(year, month, 0).getDate()
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month - 1, daysInMonth)

    let totalGross = 0
    let totalDeductions = 0
    let totalNet = 0

    const payslipValues: InferInsertModel<typeof payslips>[] = emps.map(emp => {
        // ── Earnings: resolved from the catalog if assignments exist; fall
        // back to the legacy static fields when an employee has nothing
        // assigned yet. The static-fields path is the safety net for
        // newly-created employees (the Add Employee flow today still writes
        // the four columns directly; a follow-up will switch it to creating
        // assignments).
        // Catalog path requires a basic-earning assignment — otherwise we
        // can't trust the resolved set as the source of truth, and the
        // legacy static fields stay authoritative. This guard prevents a
        // partial-migration scenario (one stray "Other Allowance" assignment
        // with no Basic) from zeroing out basic / housing / transport.
        const resolved = earningsByEmp.get(emp.id)
        let basic: number, housing: number, transport: number, other: number
        if (resolved && resolved.hasBasic) {
            basic = resolved.basic
            housing = resolved.earnings.filter(e => e.category === 'housing').reduce((s, e) => s + e.amount, 0)
            transport = resolved.earnings.filter(e => e.category === 'transport').reduce((s, e) => s + e.amount, 0)
            // Every other earning category (cost_of_living, social, custom, …)
            // rolls up into "other" on the persisted payslip columns — keeps
            // the payslip shape stable while letting the catalog grow.
            other = resolved.earnings
                .filter(e => !['basic', 'housing', 'transport'].includes(e.category))
                .reduce((s, e) => s + e.amount, 0)
        } else {
            basic = Number(emp.basicSalary ?? 0)
            housing = Number(emp.housingAllowance ?? 0)
            transport = Number(emp.transportAllowance ?? 0)
            other = Number(emp.otherAllowances ?? 0)
        }
        // Snapshot of every catalog earning that fed into this payslip. The
        // amounts here are pre-prorated; the UI applies the proration ratio
        // already baked into the row totals — actually no, we DO prorate
        // them here so the breakdown sums exactly to the persisted column
        // totals. Empty when the employee was on the legacy fallback path.

        let workedDays = daysInMonth
        const joinDate = parseLocalDate(emp.joinDate)
        const contractEndDate = parseLocalDate(emp.contractEndDate)
        if (joinDate && joinDate > monthStart && joinDate <= monthEnd) {
            workedDays = daysInMonth - joinDate.getDate() + 1
        }
        if (contractEndDate && contractEndDate >= monthStart && contractEndDate <= monthEnd) {
            workedDays = Math.min(workedDays, contractEndDate.getDate())
        }

        const prorateRatio = workedDays / daysInMonth
        const baseEarnings = (basic + housing + transport + other) * prorateRatio

        const adj = adjustmentTotals.get(emp.id)
        const overtime = adj?.overtime ?? 0
        const commission = adj?.commission ?? 0
        const additions = overtime + commission
        const unpaidLeaveDeduction = adj?.unpaidLeaveDeduction ?? 0
        const sickHalfPayDeduction = adj?.sickHalfPayDeduction ?? 0
        const loanDeduction = adj?.loanDeduction ?? 0
        const otherDeduction = adj?.otherDeduction ?? 0
        const deductions = unpaidLeaveDeduction + sickHalfPayDeduction + loanDeduction + otherDeduction
        const gross = baseEarnings + additions
        const net = Math.max(0, gross - deductions)

        totalGross += gross
        totalDeductions += deductions
        totalNet += net

        const earningsBreakdown = resolved && resolved.hasBasic
            ? resolved.earnings.map(e => ({
                componentId: e.componentId,
                category: e.category,
                name: e.name,
                amount: Number((e.amount * prorateRatio).toFixed(2)),
            }))
            : []

        return {
            payrollRunId,
            employeeId: emp.id,
            tenantId,
            basicSalary: String((basic * prorateRatio).toFixed(2)),
            housingAllowance: String((housing * prorateRatio).toFixed(2)),
            transportAllowance: String((transport * prorateRatio).toFixed(2)),
            otherAllowances: String((other * prorateRatio).toFixed(2)),
            earningsBreakdown,
            overtime: overtime.toFixed(2),
            commission: commission.toFixed(2),
            grossSalary: String(gross.toFixed(2)),
            deductions: String(deductions.toFixed(2)),
            unpaidLeaveDays: adj?.unpaidLeaveDays ?? 0,
            unpaidLeaveDeduction: unpaidLeaveDeduction.toFixed(2),
            sickHalfPayDays: adj?.sickHalfPayDays ?? 0,
            sickHalfPayDeduction: sickHalfPayDeduction.toFixed(2),
            loanDeduction: loanDeduction.toFixed(2),
            otherDeduction: otherDeduction.toFixed(2),
            netSalary: String(net.toFixed(2)),
            daysWorked: workedDays - (adj?.unpaidLeaveDays ?? 0),
        }
    })

    return {
        payslipValues,
        totalEmployees: emps.length,
        totalGross,
        totalDeductions,
        totalNet,
    }
}

/**
 * Draft-run preview — same math as runPayroll, no side effects.
 *
 * Returns null for non-draft runs (their totals are already correct on the
 * persisted row). The frontend calls this only when a card shows a draft, so
 * the cost is bounded — typically one preview per page load.
 *
 * We deliberately do NOT call syncAdjustmentsForPeriod here. Sync is a state
 * mutation that HR triggers explicitly from the Adjustments tab; preview just
 * reflects the current ledger. If HR hasn't synced yet, leave/loan deductions
 * show as 0 — matching what runPayroll WOULD persist if processed right now
 * with the current data.
 *
 * For perf: pass `preloaded` to skip the employee + adjustment queries when
 * the caller already has them (e.g. `listPayrollRuns` previewing multiple
 * drafts that share the same (tenant, year, month)). Without preload this
 * does 1 query for the run + 1 for employees + 2 for adjustments — Neon RTT
 * is ~50–100 ms each, so cutting redundant fetches matters a lot.
 */
export interface PayrollPreloaded {
    emps: PayableEmployee[]
    adjustmentTotals: Awaited<ReturnType<typeof getAdjustmentTotalsByEmployee>>
    /** Pre-resolved earnings (assignments + catalog). Optional — falls back
     *  to an internal resolve if absent. */
    earningsByEmp?: Awaited<ReturnType<typeof resolveEmployeeEarnings>>
}

export async function previewPayrollRun(
    tenantId: string,
    payrollRunIdOrRow: string | { id: string; year: number; month: number; status: string },
    preloaded?: PayrollPreloaded,
) {
    // Avoid the redundant SELECT when the caller already has the row.
    const run = typeof payrollRunIdOrRow === 'string'
        ? await getPayrollRunRaw(tenantId, payrollRunIdOrRow)
        : payrollRunIdOrRow
    if (!run || run.status !== 'draft') return null

    const emps = preloaded?.emps ?? await getPayableEmployees(tenantId)
    if (emps.length === 0) {
        return { totalEmployees: 0, totalGross: 0, totalDeductions: 0, totalNet: 0 }
    }

    const [adjustmentTotals, earningsByEmp] = await Promise.all([
        preloaded?.adjustmentTotals ?? getAdjustmentTotalsByEmployee(tenantId, run.year, run.month),
        preloaded?.earningsByEmp ?? resolveEmployeeEarnings(tenantId, emps.map(e => e.id)),
    ])
    const { totalEmployees, totalGross, totalDeductions, totalNet } =
        buildPayslipsAndTotals(tenantId, run.id, run.year, run.month, emps, adjustmentTotals, earningsByEmp)
    return { totalEmployees, totalGross, totalDeductions, totalNet }
}

/**
 * Internal raw fetch — bypasses the preview-enrichment in getPayrollRun() so
 * we don't recurse when previewPayrollRun calls back into getPayrollRun.
 */
async function getPayrollRunRaw(tenantId: string, id: string) {
    const [row] = await db.select().from(payrollRuns)
        .where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, tenantId)))
        .limit(1)
    return row ?? null
}

export async function runPayroll(tenantId: string, payrollRunId: string): Promise<boolean> {
    const run = await getPayrollRun(tenantId, payrollRunId)
    if (!run || run.status !== 'draft') return false

    // Mark as processing immediately
    await db.update(payrollRuns)
        .set(withTimestamp({ status: 'processing' as const }))
        .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.tenantId, tenantId)))

    // Fetch payable employees ('active' or 'onboarding' — see getPayableEmployees
    // helper for the rationale on why 'onboarding' is included).
    const activeEmps = await getPayableEmployees(tenantId)

    if (activeEmps.length === 0) {
        // Revert to draft if no employees
        await db.update(payrollRuns)
            .set(withTimestamp({ status: 'draft' as const }))
            .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.tenantId, tenantId)))
        return false
    }

    // Refresh auto-imported adjustment rows (LOP / sick / loan), then pull
    // the per-employee totals — HR-created manual rows are folded in here too.
    await syncAdjustmentsForPeriod(tenantId, run.year, run.month)
    const [adjustmentTotals, earningsByEmp] = await Promise.all([
        getAdjustmentTotalsByEmployee(tenantId, run.year, run.month),
        resolveEmployeeEarnings(tenantId, activeEmps.map(e => e.id)),
    ])

    // Run the calculation through the shared helper so a draft preview and
    // the real run cannot drift in their math.
    const { payslipValues, totalGross, totalDeductions, totalNet } = buildPayslipsAndTotals(
        tenantId, payrollRunId, run.year, run.month, activeEmps, adjustmentTotals, earningsByEmp,
    )

    if (payslipValues.length === 0) {
        await db.update(payrollRuns)
            .set(withTimestamp({ status: 'draft' as const }))
            .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.tenantId, tenantId)))
        return false
    }

    // Atomically replace payslips and finalize the run (BUG-003)
    await db.transaction(async (tx) => {
        // Delete any existing payslips for this run (idempotent)
        await tx.delete(payslips).where(and(eq(payslips.payrollRunId, payrollRunId), eq(payslips.tenantId, tenantId)))

        // Insert all payslips in one batch
        await tx.insert(payslips).values(payslipValues)

        // Update payroll run totals + status
        await tx.update(payrollRuns)
            .set(withTimestamp({
                status: 'approved' as const,
                totalEmployees: activeEmps.length,
                totalGross: String(totalGross.toFixed(2)),
                totalDeductions: String(totalDeductions.toFixed(2)),
                totalNet: String(totalNet.toFixed(2)),
                processedDate: new Date().toISOString().split('T')[0],
            }))
            .where(and(eq(payrollRuns.id, payrollRunId), eq(payrollRuns.tenantId, tenantId)))
    })

    await cacheDel(`dashboard:kpis:${tenantId}`)

    // Fire-and-forget payslip notification emails (non-fatal)
    ;(async () => {
        try {
            const env = loadEnv()
            const appUrl = (env as unknown as Record<string, string>).APP_URL ?? ''
            const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId)).limit(1)
            const companyName = tenant?.name ?? 'Your Company'

            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']
            const month = `${monthNames[(run.month ?? 1) - 1]} ${run.year}`

            const empIds = payslipValues.map(p => p.employeeId).filter(Boolean) as string[]
            if (empIds.length === 0) return

            const empEmails = await db.select({ id: employees.id, firstName: employees.firstName, email: employees.email })
                .from(employees)
                .where(and(eq(employees.tenantId, tenantId), inArray(employees.id, empIds)))
            const emailMap = new Map(empEmails.map(e => [e.id, e]))

            for (const slip of payslipValues) {
                const emp = emailMap.get(slip.employeeId ?? '')
                if (!emp?.email) continue
                const opts = payslipEmail({
                    employeeName: emp.firstName ?? 'Employee',
                    month,
                    basicSalary: String(slip.basicSalary ?? '0'),
                    grossSalary: String(slip.grossSalary ?? '0'),
                    deductions: String(slip.deductions ?? '0'),
                    netSalary: String(slip.netSalary ?? '0'),
                    companyName,
                    appUrl,
                    // Itemised breakdown so the email matches the in-app payslip
                    // view and the PDF download. Lines only render when > 0.
                    overtime: String(slip.overtime ?? '0'),
                    commission: String(slip.commission ?? '0'),
                    unpaidLeaveDays: slip.unpaidLeaveDays ?? 0,
                    unpaidLeaveDeduction: String(slip.unpaidLeaveDeduction ?? '0'),
                    sickHalfPayDays: slip.sickHalfPayDays ?? 0,
                    sickHalfPayDeduction: String(slip.sickHalfPayDeduction ?? '0'),
                    loanDeduction: String(slip.loanDeduction ?? '0'),
                    otherDeduction: String(slip.otherDeduction ?? '0'),
                })
                // Pass tenantId so sendEmail honours the org-wide
                // notifications kill-switch. Payslip emails are business
                // notifications, not transactional auth flows, so they
                // should be silenceable from Settings → Organization Policy.
                sendEmail({ ...opts, to: emp.email, tenantId }).catch(() => {})
            }
        } catch {
            // non-fatal — email errors must not fail payroll
        }
    })()

    return true
}

export async function getPayslipsWithEmployees(tenantId: string, payrollRunId: string) {
    // First decide whether this run has been processed. Draft runs have no
    // rows in `payslips` (they're only persisted when status flips to
    // approved), so we compute a live preview using the same math as
    // runPayroll. The frontend can tell the two shapes apart by `isDraft`
    // and disable the PDF download for previews (no row to PDF-ify).
    const run = await getPayrollRunRaw(tenantId, payrollRunId)
    if (!run) return []

    if (run.status === 'draft') {
        return getDraftPayslipsPreview(tenantId, run)
    }

    const slips = await db.select({
        id: payslips.id,
        employeeId: payslips.employeeId,
        basicSalary: payslips.basicSalary,
        housingAllowance: payslips.housingAllowance,
        transportAllowance: payslips.transportAllowance,
        otherAllowances: payslips.otherAllowances,
        earningsBreakdown: payslips.earningsBreakdown,
        grossSalary: payslips.grossSalary,
        deductions: payslips.deductions,
        unpaidLeaveDays: payslips.unpaidLeaveDays,
        unpaidLeaveDeduction: payslips.unpaidLeaveDeduction,
        sickHalfPayDays: payslips.sickHalfPayDays,
        sickHalfPayDeduction: payslips.sickHalfPayDeduction,
        loanDeduction: payslips.loanDeduction,
        otherDeduction: payslips.otherDeduction,
        netSalary: payslips.netSalary,
        daysWorked: payslips.daysWorked,
        overtime: payslips.overtime,
        commission: payslips.commission,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeNo: employees.employeeNo,
        department: employees.department,
        designation: employees.designation,
        iban: employees.iban,
        bankName: employees.bankName,
    }).from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .where(and(eq(payslips.payrollRunId, payrollRunId), eq(payslips.tenantId, tenantId)))

    return slips.map(s => {
        const fullName = `${s.firstName} ${s.lastName}`
        return {
            ...s,
            fullName,
            // Frontend expects `employeeName` on Payslip — alias here so the
            // sheet doesn't render blanks. Keep `fullName` too for backward
            // compatibility with any other callers (PDF templates etc.).
            employeeName: fullName,
            isDraft: false as const,
        }
    })
}

/**
 * Build the same row shape as the persisted query, but from in-memory math.
 * The synthetic `id` is `draft:<runId>:<employeeId>` so React keys are stable
 * across renders but never collide with real payslip UUIDs — and any
 * attempt to download a "draft:..." id obviously isn't a UUID, so the PDF
 * route can detect it and 4xx if someone fakes a request. The UI also
 * hides the download button entirely when `isDraft` is true.
 */
async function getDraftPayslipsPreview(tenantId: string, run: { id: string; year: number; month: number }) {
    const [emps, adjustmentTotals] = await Promise.all([
        // One query that gets both the math inputs and the display fields
        // — saves a round-trip vs calling getPayableEmployees + a second
        // fetch for names/IBANs.
        db.select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            employeeNo: employees.employeeNo,
            department: sql<string | null>`COALESCE(${orgUnits.name}, ${employees.department})`,
            designation: employees.designation,
            iban: employees.iban,
            bankName: employees.bankName,
            basicSalary: employees.basicSalary,
            housingAllowance: employees.housingAllowance,
            transportAllowance: employees.transportAllowance,
            otherAllowances: employees.otherAllowances,
            joinDate: employees.joinDate,
            contractEndDate: employees.contractEndDate,
        })
            .from(employees)
            .leftJoin(orgUnits, eq(employees.departmentId, orgUnits.id))
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                // MUST match getPayableEmployees — see PAYABLE_STATUSES comment.
                inArray(employees.status, PAYABLE_STATUSES as unknown as string[]),
            )),
        getAdjustmentTotalsByEmployee(tenantId, run.year, run.month),
    ])

    if (emps.length === 0) return []

    // Resolve catalog earnings for the same employee list.
    const earningsByEmp = await resolveEmployeeEarnings(tenantId, emps.map(e => e.id))

    // Strip down to the PayableEmployee shape for the math helper.
    const mathInputs: PayableEmployee[] = emps.map(e => ({
        id: e.id,
        basicSalary: e.basicSalary,
        housingAllowance: e.housingAllowance,
        transportAllowance: e.transportAllowance,
        otherAllowances: e.otherAllowances,
        joinDate: e.joinDate,
        contractEndDate: e.contractEndDate,
    }))
    const { payslipValues } = buildPayslipsAndTotals(
        tenantId, run.id, run.year, run.month, mathInputs, adjustmentTotals, earningsByEmp,
    )

    // Merge the math output with the employee display fields. Iterate by the
    // employees array (not payslipValues) so the order matches the
    // alphabetical persisted query.
    const valuesByEmp = new Map(payslipValues.map(p => [p.employeeId, p]))
    return emps
        .map(e => {
            const v = valuesByEmp.get(e.id)
            if (!v) return null
            const fullName = `${e.firstName} ${e.lastName}`
            return {
                id: `draft:${run.id}:${e.id}`,
                employeeId: e.id,
                basicSalary: v.basicSalary,
                housingAllowance: v.housingAllowance,
                transportAllowance: v.transportAllowance,
                otherAllowances: v.otherAllowances,
                earningsBreakdown: v.earningsBreakdown,
                grossSalary: v.grossSalary,
                deductions: v.deductions,
                unpaidLeaveDays: v.unpaidLeaveDays,
                unpaidLeaveDeduction: v.unpaidLeaveDeduction,
                sickHalfPayDays: v.sickHalfPayDays,
                sickHalfPayDeduction: v.sickHalfPayDeduction,
                loanDeduction: v.loanDeduction,
                otherDeduction: v.otherDeduction,
                netSalary: v.netSalary,
                daysWorked: v.daysWorked,
                overtime: v.overtime,
                commission: v.commission,
                firstName: e.firstName,
                lastName: e.lastName,
                employeeNo: e.employeeNo,
                department: e.department,
                designation: e.designation,
                iban: e.iban,
                bankName: e.bankName,
                fullName,
                employeeName: fullName,
                isDraft: true as const,
            }
        })
        .filter((row): row is NonNullable<typeof row> => row !== null)
}

/** Re-export from exit service so there is a single canonical implementation. */
export function calculateGratuity(basicSalary: number, yearsOfService: number): number {
    return calcGratuityFromExit(basicSalary, yearsOfService)
}

/**
 * Generate UAE WPS (Wage Protection System) SIF (Salary Information File).
 * Format: pipe-delimited with EDR, EMP, TRL record types per MOHRE specification.
 * Returns the SIF file content as a string.
 */
export async function generateWpsSif(tenantId: string, payrollRunId: string): Promise<{ content: string; filename: string } | null> {
    const run = await getPayrollRun(tenantId, payrollRunId)
    if (!run) return null

    const slips = await getPayslips(tenantId, payrollRunId)
    if (slips.length === 0) return null

    // Fetch employee details only for employees in this payroll run
    const empIds = slips.map(s => s.employeeId)
    const empRows = await db
        .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            employeeNo: employees.employeeNo,
            iban: employees.iban,
            bankName: employees.bankName,
            labourCardNumber: employees.labourCardNumber,
        })
        .from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            inArray(employees.id, empIds),
        ))

    const empMap = new Map(empRows.map(e => [e.id, e]))

    // Payment date: last day of payroll month
    const lastDay = new Date(run.year, run.month, 0)
    const payDateStr = `${String(lastDay.getDate()).padStart(2, '0')}/${String(run.month).padStart(2, '0')}/${run.year}`

    const totalSalary = Number(run.totalNet).toFixed(2)
    const lines: string[] = []

    // EDR — Employer Detail Record
    lines.push([
        'EDR',
        tenantId.slice(0, 8).toUpperCase(),   // Employer routing code (placeholder)
        '0000000000',                          // Employer bank account (placeholder — set in real deployment)
        String(run.year),
        String(run.month).padStart(2, '0'),
        String(slips.length),
        totalSalary,
        'AED',
        tenantId.slice(0, 8).toUpperCase(),   // MOL establishment ID
        payDateStr,
        'TRF',                                 // Payment type: Transfer
    ].join('|'))

    // EMP records — one per payslip
    for (const slip of slips) {
        const emp = empMap.get(slip.employeeId)
        const name = emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown'
        const iban = emp?.iban ?? '0000000000000000000000000000'   // placeholder if no IBAN
        const labourId = emp?.labourCardNumber ?? slip.employeeId.slice(0, 12)
        const netSalary = Number(slip.netSalary).toFixed(2)
        const basicSalary = Number(slip.basicSalary).toFixed(2)
        const allowances = (Number(slip.grossSalary) - Number(slip.basicSalary)).toFixed(2)

        lines.push([
            'EMP',
            '000000',                          // Routing code (agent bank)
            iban,                              // Account number / IBAN
            '0000',                            // Agent bank code (placeholder)
            name.toUpperCase().slice(0, 50),   // Employee name (max 50 chars)
            labourId,                          // MOL Labour Card / Employee ID
            '',                                // Mobile (optional)
            `01/${String(run.month).padStart(2, '0')}/${run.year}`,   // Start date
            payDateStr,                        // End date
            String(slip.daysWorked ?? 30),     // Days worked
            allowances,                        // Variable salary (allowances)
            basicSalary,                       // Fixed salary (basic)
            netSalary,                         // Total salary net
            'AED',
        ].join('|'))
    }

    // TRL — Trailer Record
    lines.push([
        'TRL',
        String(slips.length),
        totalSalary,
    ].join('|'))

    const content = lines.join('\n')
    const filename = `WPS_SIF_${run.year}_${String(run.month).padStart(2, '0')}_${tenantId.slice(0, 6)}.sif`

    return { content, filename }
}

export async function getPayslipById(tenantId: string, payslipId: string) {
    const [slip] = await db.select({
        id: payslips.id,
        payrollRunId: payslips.payrollRunId,
        employeeId: payslips.employeeId,
        month: payrollRuns.month,
        year: payrollRuns.year,
        basicSalary: payslips.basicSalary,
        housingAllowance: payslips.housingAllowance,
        transportAllowance: payslips.transportAllowance,
        otherAllowances: payslips.otherAllowances,
        earningsBreakdown: payslips.earningsBreakdown,
        overtime: payslips.overtime,
        commission: payslips.commission,
        grossSalary: payslips.grossSalary,
        deductions: payslips.deductions,
        unpaidLeaveDays: payslips.unpaidLeaveDays,
        unpaidLeaveDeduction: payslips.unpaidLeaveDeduction,
        sickHalfPayDays: payslips.sickHalfPayDays,
        sickHalfPayDeduction: payslips.sickHalfPayDeduction,
        loanDeduction: payslips.loanDeduction,
        otherDeduction: payslips.otherDeduction,
        netSalary: payslips.netSalary,
        daysWorked: payslips.daysWorked,
        totalDeductions: payslips.deductions,
        // Employee fields
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeNo: employees.employeeNo,
        designation: employees.designation,
        department: employees.department,
        bankName: employees.bankName,
        iban: employees.iban,
        // Tenant fields (joined in a single query — no N+1)
        tenantName: tenants.name,
        tradeLicenseNo: tenants.tradeLicenseNo,
    }).from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
        .leftJoin(tenants, eq(tenants.id, payslips.tenantId))
        .where(and(eq(payslips.id, payslipId), eq(payslips.tenantId, tenantId)))
        .limit(1)

    if (!slip) return null

    const employeeName = `${slip.firstName} ${slip.lastName}`
    return { ...slip, employeeName }
}

