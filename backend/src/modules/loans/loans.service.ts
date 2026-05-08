import { eq, and, desc, asc, isNull, sql, getTableColumns } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { db } from '../../db/index.js'
import { employeeLoans, loanPayments, employees, users } from '../../db/schema/index.js'
import { Conditions } from '../../lib/filters.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewLoan = InferInsertModel<typeof employeeLoans>

const LOAN_FIELD_MAP = {
    status: employeeLoans.status,
    amount: employeeLoans.amount,
    startDate: employeeLoans.startDate,
}
const LOAN_ALLOWED = new Set(Object.keys(LOAN_FIELD_MAP))

export async function listLoans(
    tenantId: string,
    params: {
        employeeId?: string
        status?: string
        q?: string
        filter?: string
        limit: number
        offset: number
    },
) {
    const { employeeId, status, q, filter, limit, offset } = params

    // Base: tenant + soft-delete + employee scope — reused as KPI scope via fork().
    const baseConds = Conditions.create()
        .tenant(employeeLoans.tenantId, tenantId)
        .notDeleted(employeeLoans.deletedAt)
        .match(employeeLoans.employeeId, employeeId)

    const mainConds = baseConds.fork()
        .match(employeeLoans.status, status)
        .nameSearch(q, employees.firstName, employees.lastName, employees.employeeNo)
        .filter(filter, LOAN_FIELD_MAP, LOAN_ALLOWED)

    const [rows, [kpi]] = await Promise.all([
        db
            .select({
                ...getTableColumns(employeeLoans),
                employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
                employeeNo: employees.employeeNo,
                employeeDepartment: employees.department,
                employeeBasicSalary: employees.basicSalary,
                employeeTotalSalary: employees.totalSalary,
                approverName: sql<string | null>`${users.name}`,
                total: sql<number>`COUNT(*) OVER()`.as('total'),
            })
            .from(employeeLoans)
            .leftJoin(employees, eq(employees.id, employeeLoans.employeeId))
            .leftJoin(users, eq(users.id, employeeLoans.approvedBy))
            .where(mainConds.where())
            .orderBy(desc(employeeLoans.createdAt))
            .limit(limit)
            .offset(offset),
        // KPI uses base scope only so aggregate counts aren't filtered by status/search
        db
            .select({
                total: sql<number>`COUNT(*)`.as('total'),
                pending: sql<number>`COUNT(*) FILTER (WHERE status = 'pending')`.as('pending'),
                active: sql<number>`COUNT(*) FILTER (WHERE status = 'active')`.as('active'),
                totalDisbursed: sql<number>`COALESCE(SUM(CAST(amount AS NUMERIC)) FILTER (WHERE status IN ('active', 'completed')), 0)`.as('totalDisbursed'),
                totalOutstanding: sql<number>`COALESCE(SUM(CAST(remaining_balance AS NUMERIC)) FILTER (WHERE status = 'active'), 0)`.as('totalOutstanding'),
            })
            .from(employeeLoans)
            .where(baseConds.where()),
    ])

    const total = rows.length > 0 ? Number(rows[0]!.total) : 0

    return {
        data: rows.map(r => { const { total: _, ...rest } = r; return rest }),
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
        summary: {
            total: Number(kpi?.total ?? 0),
            pending: Number(kpi?.pending ?? 0),
            active: Number(kpi?.active ?? 0),
            totalDisbursed: Number(kpi?.totalDisbursed ?? 0),
            totalOutstanding: Number(kpi?.totalOutstanding ?? 0),
        },
    }
}

export async function getLoan(tenantId: string, id: string) {
    const [row] = await db
        .select({
            ...getTableColumns(employeeLoans),
            employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            employeeNo: employees.employeeNo,
            employeeDepartment: employees.department,
            approverName: sql<string | null>`${users.name}`,
        })
        .from(employeeLoans)
        .leftJoin(employees, eq(employees.id, employeeLoans.employeeId))
        .leftJoin(users, eq(users.id, employeeLoans.approvedBy))
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
    return row ?? null
}

export async function deleteLoan(tenantId: string, id: string) {
    const [row] = await db
        .update(employeeLoans)
        .set(withTimestamp({ deletedAt: new Date() }))
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
        .returning()
    return row ?? null
}

export async function createLoan(
    tenantId: string,
    data: Omit<NewLoan, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>,
) {
    // Compute derived fields
    const amount = parseFloat(String(data.amount))
    const monthly = parseFloat(String(data.monthlyDeduction))
    const totalInstallments = monthly > 0 ? Math.ceil(amount / monthly) : null

    const [row] = await db
        .insert(employeeLoans)
        .values({
            tenantId,
            ...data,
            remainingBalance: String(amount),
            totalInstallments,
            paidInstallments: 0,
            status: 'pending',
        })
        .returning()
    return row
}

export async function approveLoan(
    tenantId: string,
    id: string,
    approverId: string,
    startDate?: string,
) {
    const [existing] = await db
        .select()
        .from(employeeLoans)
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
    if (!existing) throw Object.assign(new Error('Loan not found'), { statusCode: 404 })
    if (existing.status !== 'pending')
        throw Object.assign(new Error('Only pending loans can be approved'), { statusCode: 409 })

    const [updated] = await db
        .update(employeeLoans)
        .set(withTimestamp({
            status: 'active',
            approvedBy: approverId,
            approvedAt: new Date(),
            startDate: startDate ?? new Date().toISOString().slice(0, 10),
        }))
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
        .returning()
    return updated
}

export async function rejectLoan(tenantId: string, id: string, notes?: string) {
    const [existing] = await db
        .select()
        .from(employeeLoans)
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
    if (!existing) throw Object.assign(new Error('Loan not found'), { statusCode: 404 })
    if (existing.status !== 'pending')
        throw Object.assign(new Error('Only pending loans can be rejected'), { statusCode: 409 })

    const [updated] = await db
        .update(employeeLoans)
        .set(withTimestamp({ status: 'rejected', notes: notes ?? existing.notes }))
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
        .returning()
    return updated
}

/** Coerce a YYYY-MM or YYYY-MM-DD string to YYYY-MM-01. Defaults to current month. */
function normalisePeriodMonth(input?: string | null): string {
    if (input) {
        // Match optional day; use local Y/M to avoid UTC off-by-one at month boundaries.
        const m = input.match(/^(\d{4})-(\d{2})/)
        if (m) return `${m[1]}-${m[2]}-01`
    }
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Records a payment for a specific month. Defaults to the current month
 * when `periodMonth` is omitted. Rejects duplicate same-month payments.
 */
export async function recordLoanPayment(
    tenantId: string,
    id: string,
    opts: { periodMonth?: string; recordedBy?: string; notes?: string } = {},
) {
    const periodMonth = normalisePeriodMonth(opts.periodMonth)

    return db.transaction(async (tx) => {
        const [existing] = await tx
            .select()
            .from(employeeLoans)
            .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
            .for('update')
        if (!existing) throw Object.assign(new Error('Loan not found'), { statusCode: 404 })
        if (existing.status !== 'active')
            throw Object.assign(new Error('Loan is not active'), { statusCode: 409 })

        // Reject duplicates — one payment per (loan, period).
        const [dup] = await tx
            .select({ id: loanPayments.id })
            .from(loanPayments)
            .where(and(eq(loanPayments.loanId, id), eq(loanPayments.periodMonth, periodMonth)))
            .limit(1)
        if (dup) {
            throw Object.assign(
                new Error('A payment for this month is already recorded'),
                { statusCode: 409 },
            )
        }

        // Enforce in-order payments: the next payable month must be `periodMonth`.
        // Computed as: startMonth + paidInstallments months.
        if (existing.startDate) {
            const startD = parseDateOnly(existing.startDate)
            const expected = new Date(startD.getFullYear(), startD.getMonth() + (existing.paidInstallments ?? 0), 1)
            const expectedPeriod = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, '0')}-01`
            if (periodMonth !== expectedPeriod) {
                throw Object.assign(
                    new Error(`Payments must be recorded in order. Pay ${expectedPeriod.slice(0, 7)} first.`),
                    { statusCode: 409 },
                )
            }
        }

        const monthly = parseFloat(String(existing.monthlyDeduction))
        const current = parseFloat(String(existing.remainingBalance ?? existing.amount))
        const payAmount = Math.min(monthly, current) // Never overpay
        const newBalance = Math.max(0, current - payAmount)
        const newPaid = (existing.paidInstallments ?? 0) + 1
        const newStatus = newBalance === 0 ? 'completed' : 'active'

        await tx.insert(loanPayments).values({
            tenantId,
            loanId: id,
            periodMonth,
            amount: String(payAmount),
            recordedBy: opts.recordedBy ?? null,
            notes: opts.notes ?? null,
        })

        const [updated] = await tx
            .update(employeeLoans)
            .set(withTimestamp({
                paidInstallments: newPaid,
                remainingBalance: String(newBalance),
                status: newStatus,
            }))
            .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, id), isNull(employeeLoans.deletedAt)))
            .returning()
        return updated ?? null
    })
}

export interface LoanScheduleEntry {
    installmentNo: number
    /** YYYY-MM-01 — the month this installment is due. */
    periodMonth: string
    dueDate: string
    amount: number
    paidAmount: number
    paidDate: string | null
    /**
     * - `paid`     — already recorded
     * - `overdue`  — due date passed and still unpaid (next-in-line)
     * - `pending`  — due this month or earlier, still unpaid (next-in-line)
     * - `upcoming` — future month — payment is locked until earlier ones are paid
     */
    status: 'paid' | 'pending' | 'overdue' | 'upcoming'
    daysOverdue?: number
    /** When false, frontend must hide the Pay button (out-of-order pay forbidden). */
    canPay: boolean
}

/** Format a Date as 'YYYY-MM-DD' using its local Y/M/D — avoids UTC/local off-by-one. */
function ymd(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Parse 'YYYY-MM-DD' as a local-midnight Date (sidesteps Date's default UTC parse). */
function parseDateOnly(s: string): Date {
    const [y, m, d] = s.split('-').map(Number)
    return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/**
 * Builds the full installment schedule for a loan from `startDate` (or `approvedAt`/`createdAt`)
 * + `totalInstallments`, then joins recorded payments to mark each row's status.
 */
export async function getLoanSchedule(tenantId: string, loanId: string): Promise<LoanScheduleEntry[]> {
    const [loan] = await db
        .select()
        .from(employeeLoans)
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.id, loanId), isNull(employeeLoans.deletedAt)))
        .limit(1)
    if (!loan) return []

    const totalInstallments = loan.totalInstallments ?? 0
    if (totalInstallments <= 0) return []

    const monthly = parseFloat(String(loan.monthlyDeduction)) || 0
    const startStr = loan.startDate
        ?? (loan.approvedAt ? ymd(loan.approvedAt) : null)
        ?? ymd(loan.createdAt)
    const start = parseDateOnly(startStr)

    const payments = await db
        .select()
        .from(loanPayments)
        .where(eq(loanPayments.loanId, loanId))
        .orderBy(asc(loanPayments.periodMonth))

    // Drizzle returns `date` columns as 'YYYY-MM-DD' strings.
    const paymentByPeriod = new Map<string, typeof payments[number]>()
    for (const p of payments) {
        paymentByPeriod.set(String(p.periodMonth), p)
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    // First pass — derive paid/overdue/pending/upcoming for each row.
    // `nextPayableIndex` is the lowest unpaid installment, in-order. Only that
    // entry can have `canPay: true`; everything after stays "upcoming" until it
    // moves to the front of the queue.
    const raw: Omit<LoanScheduleEntry, 'canPay'>[] = []
    let nextPayableIndex = -1
    for (let i = 0; i < totalInstallments; i++) {
        const due = new Date(start.getFullYear(), start.getMonth() + i, start.getDate())
        const period = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-01`
        const dueDate = ymd(due)
        const payment = paymentByPeriod.get(period)
        const isPaid = !!payment
        const isOverdue = !isPaid && due.getTime() < today.getTime()
        const isCurrent = !isPaid && !isOverdue && due.getMonth() === today.getMonth() && due.getFullYear() === today.getFullYear()
        const isFuture = !isPaid && !isOverdue && due.getTime() > today.getTime() && !isCurrent
        const daysOverdue = isOverdue ? Math.floor((today.getTime() - due.getTime()) / 86400000) : 0

        let status: LoanScheduleEntry['status']
        if (isPaid) status = 'paid'
        else if (isOverdue) status = 'overdue'
        else if (isFuture) status = 'upcoming'
        else status = 'pending' // due this month, not yet paid

        if (!isPaid && nextPayableIndex < 0) nextPayableIndex = i

        raw.push({
            installmentNo: i + 1,
            periodMonth: period,
            dueDate,
            amount: payment ? Number(payment.amount) : monthly,
            paidAmount: payment ? Number(payment.amount) : 0,
            paidDate: payment ? payment.paidDate.toISOString() : null,
            status,
            ...(isOverdue ? { daysOverdue } : {}),
        })
    }

    return raw.map((entry, i) => ({
        ...entry,
        // Only the first unpaid installment is payable. Out-of-order pay is blocked.
        canPay: entry.status !== 'paid' && i === nextPayableIndex,
    }))
}

export async function getEmployeeActiveLoans(tenantId: string, employeeId: string) {
    return db
        .select()
        .from(employeeLoans)
        .where(
            and(
                eq(employeeLoans.tenantId, tenantId),
                eq(employeeLoans.employeeId, employeeId),
                eq(employeeLoans.status, 'active'),
                isNull(employeeLoans.deletedAt),
            ),
        )
        .orderBy(desc(employeeLoans.createdAt))
}

export async function getEmployeeAllLoans(tenantId: string, employeeId: string) {
    return db
        .select()
        .from(employeeLoans)
        .where(and(eq(employeeLoans.tenantId, tenantId), eq(employeeLoans.employeeId, employeeId), isNull(employeeLoans.deletedAt)))
        .orderBy(desc(employeeLoans.createdAt))
}
