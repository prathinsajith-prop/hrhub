import { eq, and, desc, isNull, gte, lte, inArray, sql, getTableColumns } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { cacheDel } from '../../lib/redis.js'
import { db } from '../../db/index.js'
import { leaveRequests, leavePolicies, leaveBalances } from '../../db/schema/index.js'
import { employees } from '../../db/schema/employees.js'
import { sendEmail } from '../../plugins/email.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewLeaveRequest = InferInsertModel<typeof leaveRequests>

export async function listLeaveRequests(tenantId: string, params: { employeeId?: string; status?: string; leaveType?: string; limit: number; offset: number }) {
    const { employeeId, status, leaveType, limit, offset } = params
    const conditions = [eq(leaveRequests.tenantId, tenantId), isNull(leaveRequests.deletedAt)]
    if (employeeId) conditions.push(eq(leaveRequests.employeeId, employeeId))
    if (status) conditions.push(eq(leaveRequests.status, status as never))
    if (leaveType) conditions.push(eq(leaveRequests.leaveType, leaveType as never))

    const rows = await db.select({
        ...getTableColumns(leaveRequests),
        employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '')`.as('employee_name'),
        employeeNo: employees.employeeNo,
        employeeAvatarUrl: employees.avatarUrl,
        employeeDepartment: employees.department,
        totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
    })
        .from(leaveRequests)
        .leftJoin(employees, eq(employees.id, leaveRequests.employeeId))
        .where(and(...conditions))
        .orderBy(desc(leaveRequests.createdAt))
        .limit(limit).offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount) : 0
    return { data: rows, total, limit, offset, hasMore: offset + limit < total }
}

export async function createLeaveRequest(tenantId: string, data: Omit<NewLeaveRequest, 'tenantId' | 'id'>) {
    const [row] = await db.insert(leaveRequests).values({ ...data, tenantId }).returning()
    return row
}

export async function approveLeave(tenantId: string, id: string, approvedBy: string, approverEmail: string, approved: boolean, approverUserEmployeeId?: string | null) {
    // Fetch the pending leave request first
    const [req] = await db.select({ employeeId: leaveRequests.employeeId, leaveType: leaveRequests.leaveType, startDate: leaveRequests.startDate })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'pending')))
        .limit(1)
    if (!req) return null

    // Block self-approval. Prefer the user→employee FK (added in 0014); fall
    // back to email match for tokens issued before the FK rollout.
    let approverEmployeeId = approverUserEmployeeId ?? null
    if (!approverEmployeeId) {
        const [approverEmployee] = await db.select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.tenantId, tenantId), eq(employees.email, approverEmail)))
            .limit(1)
        approverEmployeeId = approverEmployee?.id ?? null
    }
    if (approverEmployeeId && approverEmployeeId === req.employeeId) {
        throw Object.assign(new Error('You cannot approve or reject your own leave request'), { statusCode: 403 })
    }

    const status = approved ? ('approved' as const) : ('rejected' as const)
    const [row] = await db.update(leaveRequests)
        .set(withTimestamp({ status, approvedBy, approvedAt: new Date() }))
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'pending')))
        .returning()
    if (!row) return null

    await cacheDel(`dashboard:kpis:${tenantId}`)

    // Send email notification to employee
    try {
        const [emp] = await db.select({ email: employees.email, firstName: employees.firstName })
            .from(employees)
            .where(eq(employees.id, req.employeeId))
            .limit(1)
        if (emp?.email) {
            await sendEmail({
                to: emp.email,
                subject: `Leave Request ${approved ? 'Approved' : 'Rejected'}`,
                html: `<p>Hi ${emp.firstName},</p>
                    <p>Your <strong>${req.leaveType}</strong> leave request starting <strong>${req.startDate}</strong> has been <strong>${approved ? 'approved' : 'rejected'}</strong>.</p>
                    <p>Please log in to HRHub for more details.</p>`,
                text: `Your ${req.leaveType} leave request starting ${req.startDate} has been ${approved ? 'approved' : 'rejected'}.`,
            })
        }
    } catch { /* email errors are non-fatal */ }

    return row
}

export async function cancelLeave(tenantId: string, id: string, requesterEmail: string, requesterRole: string, requesterUserEmployeeId?: string | null) {
    // Fetch the leave request to check ownership
    const [req] = await db.select({ employeeId: leaveRequests.employeeId, status: leaveRequests.status })
        .from(leaveRequests)
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId), isNull(leaveRequests.deletedAt)))
        .limit(1)
    if (!req) return null

    // HR managers and super_admins can cancel any leave request; others can only cancel their own
    const isAdmin = ['hr_manager', 'super_admin', 'dept_head'].includes(requesterRole)
    if (!isAdmin) {
        let requesterEmployeeId = requesterUserEmployeeId ?? null
        if (!requesterEmployeeId) {
            const [requesterEmployee] = await db.select({ id: employees.id })
                .from(employees)
                .where(and(eq(employees.tenantId, tenantId), eq(employees.email, requesterEmail)))
                .limit(1)
            requesterEmployeeId = requesterEmployee?.id ?? null
        }
        if (!requesterEmployeeId || requesterEmployeeId !== req.employeeId) {
            throw Object.assign(new Error('You can only cancel your own leave requests'), { statusCode: 403 })
        }
    }

    const [row] = await db.update(leaveRequests)
        .set(withTimestamp({ status: 'cancelled' as const }))
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function softDeleteLeaveRequest(tenantId: string, id: string) {
    const [row] = await db.update(leaveRequests)
        .set(withTimestamp({ deletedAt: new Date() }))
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId), isNull(leaveRequests.deletedAt)))
        .returning()
    return row ?? null
}

// ─── Leave Policies + Balances (per-tenant config + yearly cumulation) ─────
// Policies are stored in `leave_policies`. Defaults seeded by migration 0008.
// Yearly snapshots live in `leave_balances` keyed by (tenant, employee, type, year).
// Annual leave carries forward (default cap 15 days, expires 12 months later).

type AccrualRule = 'flat' | 'monthly_2_then_30' | 'unlimited' | 'none'
type LeavePolicy = {
    leaveType: string
    daysPerYear: number
    accrualRule: AccrualRule
    maxCarryForward: number
    carryExpiresAfterMonths: number
}

const HARDCODED_FALLBACK: LeavePolicy[] = [
    { leaveType: 'annual', daysPerYear: 30, accrualRule: 'monthly_2_then_30', maxCarryForward: 15, carryExpiresAfterMonths: 12 },
    { leaveType: 'sick', daysPerYear: 45, accrualRule: 'flat', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
    { leaveType: 'maternity', daysPerYear: 60, accrualRule: 'flat', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
    { leaveType: 'paternity', daysPerYear: 5, accrualRule: 'flat', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
    { leaveType: 'compassionate', daysPerYear: 5, accrualRule: 'flat', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
    { leaveType: 'hajj', daysPerYear: 30, accrualRule: 'flat', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
    { leaveType: 'unpaid', daysPerYear: 0, accrualRule: 'unlimited', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
    { leaveType: 'public_holiday', daysPerYear: 0, accrualRule: 'none', maxCarryForward: 0, carryExpiresAfterMonths: 0 },
]

export async function listLeavePolicies(tenantId: string): Promise<LeavePolicy[]> {
    const rows = await db.select({
        leaveType: leavePolicies.leaveType,
        daysPerYear: leavePolicies.daysPerYear,
        accrualRule: leavePolicies.accrualRule,
        maxCarryForward: leavePolicies.maxCarryForward,
        carryExpiresAfterMonths: leavePolicies.carryExpiresAfterMonths,
    }).from(leavePolicies).where(eq(leavePolicies.tenantId, tenantId))
    if (rows.length === 0) return HARDCODED_FALLBACK
    return rows as LeavePolicy[]
}

export async function upsertLeavePolicies(tenantId: string, items: LeavePolicy[]) {
    if (items.length === 0) return listLeavePolicies(tenantId)
    // Single batch upsert — one round-trip instead of N sequential inserts
    await db.insert(leavePolicies).values(
        items.map(p => ({
            tenantId,
            leaveType: p.leaveType,
            daysPerYear: p.daysPerYear,
            accrualRule: p.accrualRule as AccrualRule,
            maxCarryForward: p.maxCarryForward,
            carryExpiresAfterMonths: p.carryExpiresAfterMonths,
        }))
    ).onConflictDoUpdate({
        target: [leavePolicies.tenantId, leavePolicies.leaveType],
        set: {
            daysPerYear: sql`excluded.days_per_year`,
            accrualRule: sql`excluded.accrual_rule`,
            maxCarryForward: sql`excluded.max_carry_forward`,
            carryExpiresAfterMonths: sql`excluded.carry_expires_after_months`,
            updatedAt: sql`NOW()`,
        },
    })
    return listLeavePolicies(tenantId)
}

function computeAccrued(policy: LeavePolicy, monthsOfService: number, year: number, joinYear: number): number {
    if (policy.accrualRule === 'unlimited' || policy.accrualRule === 'none') return 0
    if (policy.accrualRule === 'monthly_2_then_30') {
        // First incomplete year of service: 2 days/month capped at 30
        if (year === joinYear && monthsOfService < 12) {
            return Math.min(monthsOfService * 2, policy.daysPerYear)
        }
        return policy.daysPerYear
    }
    return policy.daysPerYear
}

export async function getLeaveBalance(tenantId: string, employeeId: string, year: number) {
    const [emp] = await db.select({ joinDate: employees.joinDate }).from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId)))
    if (!emp) return null

    const today = new Date()
    const joinDate = emp.joinDate ? new Date(emp.joinDate) : today
    const joinYear = joinDate.getFullYear()
    const monthsOfService = Math.max(0,
        (today.getFullYear() - joinDate.getFullYear()) * 12 +
        (today.getMonth() - joinDate.getMonth()),
    )

    const policies = await listLeavePolicies(tenantId)

    // Aggregate taken/pending in this year per type
    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`
    const usageRows = await db.select({
        leaveType: leaveRequests.leaveType,
        status: leaveRequests.status,
        days: leaveRequests.days,
    }).from(leaveRequests)
        .where(and(
            eq(leaveRequests.tenantId, tenantId),
            eq(leaveRequests.employeeId, employeeId),
            isNull(leaveRequests.deletedAt),
            gte(leaveRequests.startDate, yearStart),
            lte(leaveRequests.startDate, yearEnd),
            inArray(leaveRequests.status, ['approved', 'pending']),
        ))
    const taken: Record<string, number> = {}
    const pending: Record<string, number> = {}
    for (const r of usageRows) {
        const t = r.leaveType as string
        if (r.status === 'approved') taken[t] = (taken[t] ?? 0) + (r.days ?? 0)
        else if (r.status === 'pending') pending[t] = (pending[t] ?? 0) + (r.days ?? 0)
    }

    // Read existing balance rows (carry-forward + adjustments)
    const balanceRows = await db.select().from(leaveBalances).where(and(
        eq(leaveBalances.tenantId, tenantId),
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.year, year),
    ))
    const balanceByType = new Map(balanceRows.map((r) => [r.leaveType, r]))

    const balance: Record<string, {
        entitled: number
        accrued: number
        carriedForward: number
        carryExpiresOn: string | null
        taken: number
        pending: number
        adjustment: number
        available: number
        unlimited: boolean
    }> = {}

    const todayIso = today.toISOString().slice(0, 10)

    for (const policy of policies) {
        const existing = balanceByType.get(policy.leaveType)
        const accrued = existing ? Number(existing.accrued) : computeAccrued(policy, monthsOfService, year, joinYear)
        let carried = existing ? Number(existing.carriedForward) : 0
        const carryExpiresOn = existing?.carryExpiresOn ?? null
        if (carryExpiresOn && carryExpiresOn < todayIso) carried = 0 // expired
        const adjustment = existing ? Number(existing.adjustment) : 0
        const t = taken[policy.leaveType] ?? 0
        const p = pending[policy.leaveType] ?? 0
        const unlimited = policy.accrualRule === 'unlimited'
        const available = unlimited ? -1 : Math.max(0, accrued + carried + adjustment - t - p)
        balance[policy.leaveType] = {
            entitled: policy.daysPerYear,
            accrued,
            carriedForward: carried,
            carryExpiresOn,
            taken: t,
            pending: p,
            adjustment,
            available,
            unlimited,
        }
    }

    return { employeeId, year, monthsOfService, balance }
}

// ─── Year-end rollover ─────────────────────────────────────────────────────
// Closes `fromYear` and creates `fromYear + 1` rows with carried_forward applied.
export async function rolloverYear(tenantId: string, fromYear: number) {
    const policies = await listLeavePolicies(tenantId)
    const empRows = await db.select({ id: employees.id, joinDate: employees.joinDate })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false)))

    let closed = 0
    let opened = 0

    for (const emp of empRows) {
        const balance = await getLeaveBalance(tenantId, emp.id, fromYear)
        if (!balance) continue
        for (const policy of policies) {
            const b = balance.balance[policy.leaveType]
            if (!b) continue
            const closing = b.unlimited ? 0 : Math.max(0, b.accrued + b.carriedForward + b.adjustment - b.taken)

            // Persist closing for fromYear
            await db.insert(leaveBalances).values({
                tenantId, employeeId: emp.id, leaveType: policy.leaveType, year: fromYear,
                accrued: String(b.accrued), carriedForward: String(b.carriedForward),
                carryExpiresOn: b.carryExpiresOn ?? undefined,
                taken: String(b.taken), adjustment: String(b.adjustment),
                closingBalance: String(closing), rolledOverAt: new Date(),
            }).onConflictDoUpdate({
                target: [leaveBalances.tenantId, leaveBalances.employeeId, leaveBalances.leaveType, leaveBalances.year],
                set: { closingBalance: String(closing), rolledOverAt: new Date(), updatedAt: new Date() },
            })
            closed++

            // Open next year with carry-forward (capped)
            const carryAmount = Math.min(closing, policy.maxCarryForward)
            if (carryAmount <= 0 && policy.accrualRule !== 'monthly_2_then_30' && policy.accrualRule !== 'flat') continue

            const expiresOn = policy.carryExpiresAfterMonths > 0
                ? new Date(fromYear + 1, 0, 1 + policy.carryExpiresAfterMonths * 30).toISOString().slice(0, 10)
                : null

            // Compute next-year accrual snapshot (so balance row has it baked in)
            const joinDate = emp.joinDate ? new Date(emp.joinDate) : new Date()
            const monthsAtNextYearStart = Math.max(0,
                ((fromYear + 1) - joinDate.getFullYear()) * 12 - joinDate.getMonth(),
            )
            const nextAccrued = computeAccrued(policy, monthsAtNextYearStart, fromYear + 1, joinDate.getFullYear())

            await db.insert(leaveBalances).values({
                tenantId, employeeId: emp.id, leaveType: policy.leaveType, year: fromYear + 1,
                openingBalance: String(carryAmount),
                accrued: String(nextAccrued),
                carriedForward: String(carryAmount),
                carryExpiresOn: expiresOn ?? undefined,
                closingBalance: String(carryAmount + nextAccrued),
            }).onConflictDoNothing()
            opened++
        }
    }
    return { fromYear, toYear: fromYear + 1, closed, opened }
}

export async function adjustLeaveBalance(tenantId: string, employeeId: string, leaveType: string, year: number, delta: number, _reason?: string) {
    const [existing] = await db.select().from(leaveBalances).where(and(
        eq(leaveBalances.tenantId, tenantId),
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.leaveType, leaveType),
        eq(leaveBalances.year, year),
    ))
    const newAdj = (existing ? Number(existing.adjustment) : 0) + delta
    if (existing) {
        await db.update(leaveBalances).set({ adjustment: String(newAdj), updatedAt: new Date() })
            .where(eq(leaveBalances.id, existing.id))
    } else {
        await db.insert(leaveBalances).values({
            tenantId, employeeId, leaveType, year, adjustment: String(newAdj),
        })
    }
    return getLeaveBalance(tenantId, employeeId, year)
}
