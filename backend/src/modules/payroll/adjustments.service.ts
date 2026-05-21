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
import { and, eq, gte, inArray, lte, sql, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
    payrollAdjustments,
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

// Default kind for each category, so the HR UI only has to pick "Overtime"
// rather than picking "addition" + "overtime". Single source of truth.
const ADDITION_CATEGORIES = new Set<AdjustmentCategory>(['overtime', 'commission', 'bonus'])

export function kindForCategory(category: AdjustmentCategory): AdjustmentKind {
    return ADDITION_CATEGORIES.has(category) ? 'addition' : 'deduction'
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
    const kind = kindForCategory(input.category)
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
        set.kind = kindForCategory(patch.category)
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
        ))
        .returning()
    return row ?? null
}

export async function deleteAdjustment(tenantId: string, id: string) {
    const [row] = await db
        .delete(payrollAdjustments)
        .where(and(
            eq(payrollAdjustments.tenantId, tenantId),
            eq(payrollAdjustments.id, id),
            // Manual rows only — clearing leave/loan rows happens via syncAdjustmentsForPeriod
            eq(payrollAdjustments.source, 'manual'),
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
    unpaidLeaveDeduction: number
    unpaidLeaveDays: number
    sickHalfPayDeduction: number
    sickHalfPayDays: number
    loanDeduction: number    // loan_repayment + salary_advance
    otherDeduction: number   // manual
}

export async function getAdjustmentTotalsByEmployee(
    tenantId: string,
    year: number,
    month: number,
): Promise<Map<string, EmployeeAdjustmentTotals>> {
    // Two independent queries — the sums query doesn't need the leave_requests
    // join, the day-count query does. Run them in parallel so we pay one
    // round-trip not two (matters on remote DBs like Neon).
    const [rows, dayRows] = await Promise.all([
        db
            .select({
                employeeId: payrollAdjustments.employeeId,
                category: payrollAdjustments.category,
                total: sql<string>`SUM(${payrollAdjustments.amount})`,
            })
            .from(payrollAdjustments)
            .where(and(
                eq(payrollAdjustments.tenantId, tenantId),
                eq(payrollAdjustments.periodYear, year),
                eq(payrollAdjustments.periodMonth, month),
            ))
            .groupBy(payrollAdjustments.employeeId, payrollAdjustments.category),
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
            ))
            .groupBy(payrollAdjustments.employeeId, payrollAdjustments.category),
    ])

    const totals = new Map<string, EmployeeAdjustmentTotals>()
    const blank = (employeeId: string): EmployeeAdjustmentTotals => ({
        employeeId,
        overtime: 0,
        commission: 0,
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
        switch (r.category) {
            case 'overtime': t.overtime += amount; break
            case 'commission':
            case 'bonus': t.commission += amount; break
            case 'unpaid_leave': t.unpaidLeaveDeduction += amount; break
            case 'sick_half_pay': t.sickHalfPayDeduction += amount; break
            case 'loan_repayment':
            case 'salary_advance': t.loanDeduction += amount; break
            case 'manual': t.otherDeduction += amount; break
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
