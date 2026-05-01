import { eq, and, desc, isNull, gte, lte, inArray, sql, getTableColumns, aliasedTable } from 'drizzle-orm'
import { withTimestamp } from '../../lib/db-helpers.js'
import { cacheDel } from '../../lib/redis.js'
import { db } from '../../db/index.js'
import { leaveRequests, leavePolicies, leaveBalances, publicHolidays, attendanceRecords, leaveAdjustments, airTickets, leaveOffsets } from '../../db/schema/index.js'
import { employees } from '../../db/schema/employees.js'
import { users } from '../../db/schema/users.js'
import { sendEmail } from '../../plugins/email.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewLeaveRequest = InferInsertModel<typeof leaveRequests>

export async function listLeaveRequests(tenantId: string, params: { employeeId?: string; department?: string; status?: string; leaveType?: string; from?: string; to?: string; limit: number; offset: number }) {
    const { employeeId, department, status, leaveType, from, to, limit, offset } = params
    const conditions = [eq(leaveRequests.tenantId, tenantId), isNull(leaveRequests.deletedAt)]
    if (employeeId) conditions.push(eq(leaveRequests.employeeId, employeeId))
    if (department) conditions.push(eq(employees.department, department))
    if (status) conditions.push(eq(leaveRequests.status, status as never))
    if (leaveType) conditions.push(eq(leaveRequests.leaveType, leaveType as never))
    // Date-range overlap: include any request that intersects [from, to].
    // (startDate <= to) AND (endDate >= from)
    if (to) conditions.push(lte(leaveRequests.startDate, to))
    if (from) conditions.push(gte(leaveRequests.endDate, from))

    const handoverEmployee = aliasedTable(employees, 'handover_emp')
    const rows = await db.select({
        ...getTableColumns(leaveRequests),
        employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '')`.as('employee_name'),
        employeeNo: employees.employeeNo,
        employeeAvatarUrl: employees.avatarUrl,
        employeeDepartment: employees.department,
        handoverToName: sql<string | null>`COALESCE(${handoverEmployee.firstName} || ' ' || ${handoverEmployee.lastName}, NULL)`.as('handover_to_name'),
        totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount'),
    })
        .from(leaveRequests)
        .leftJoin(employees, eq(employees.id, leaveRequests.employeeId))
        .leftJoin(handoverEmployee, eq(handoverEmployee.id, leaveRequests.handoverTo))
        .where(and(...conditions))
        .orderBy(desc(leaveRequests.createdAt))
        .limit(limit).offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount ?? 0) : 0
    const data = rows.map(({ totalCount: _tc, ...row }) => row)
    return { data, total, limit, offset, hasMore: offset + limit < total }
}

async function countWorkingDays(tenantId: string, startDate: string, endDate: string): Promise<number> {
    const start = new Date(startDate)
    const end = new Date(endDate)

    // Count Mon–Thu + Sun only (UAE weekend = Fri + Sat per Federal Decree-Law No. 33 of 2021)
    let workingDays = 0
    const cur = new Date(start)
    while (cur <= end) {
        const dow = cur.getDay()
        if (dow !== 5 && dow !== 6) workingDays++
        cur.setDate(cur.getDate() + 1)
    }

    const holidays = await db.select({ id: publicHolidays.id })
        .from(publicHolidays)
        .where(and(
            eq(publicHolidays.tenantId, tenantId),
            gte(publicHolidays.date, startDate),
            lte(publicHolidays.date, endDate),
        ))
    return Math.max(1, workingDays - holidays.length)
}

export async function createLeaveRequest(tenantId: string, data: Omit<NewLeaveRequest, 'tenantId' | 'id'>) {
    // Basic date sanity checks
    if (data.startDate && data.endDate && data.startDate > data.endDate) {
        throw Object.assign(new Error('startDate must be on or before endDate'), { statusCode: 400 })
    }
    if (typeof data.days === 'number' && data.days <= 0) {
        throw Object.assign(new Error('days must be a positive number'), { statusCode: 400 })
    }

    // Overlap check: reject if the employee already has a pending or approved request
    // covering any part of the requested date range.
    if (data.employeeId && data.startDate && data.endDate) {
        const [overlap] = await db
            .select({ id: leaveRequests.id, startDate: leaveRequests.startDate, endDate: leaveRequests.endDate })
            .from(leaveRequests)
            .where(and(
                eq(leaveRequests.tenantId, tenantId),
                eq(leaveRequests.employeeId, data.employeeId),
                inArray(leaveRequests.status, ['pending', 'approved']),
                isNull(leaveRequests.deletedAt),
                lte(leaveRequests.startDate, data.endDate),
                gte(leaveRequests.endDate, data.startDate),
            ))
            .limit(1)

        if (overlap) {
            throw Object.assign(
                new Error(`A leave request already exists for this employee between ${overlap.startDate} and ${overlap.endDate}. Please adjust the dates.`),
                { statusCode: 409, name: 'Conflict' },
            )
        }
    }

    // Compute `days` if not provided — subtract any public holidays in the range.
    let days = typeof data.days === 'number' ? data.days : undefined
    if (days === undefined && data.startDate && data.endDate) {
        days = await countWorkingDays(tenantId, data.startDate, data.endDate)
    }

    // Balance check — block if employee doesn't have enough leave available.
    // unpaid and public_holiday are exempt (unlimited / system-managed).
    const UNLIMITED_TYPES = ['unpaid', 'public_holiday']
    if (days && data.employeeId && data.startDate && data.leaveType && !UNLIMITED_TYPES.includes(data.leaveType as string)) {
        const year = new Date(data.startDate).getFullYear()
        const balances = await getLeaveBalance(tenantId, data.employeeId, year)
        if (balances) {
            const typeBalance = balances.balance[data.leaveType as string]
            if (typeBalance && !typeBalance.unlimited && typeBalance.available < days) {
                throw Object.assign(
                    new Error(
                        `Insufficient ${data.leaveType} leave balance. ` +
                        `Available: ${typeBalance.available} day${typeBalance.available === 1 ? '' : 's'}, ` +
                        `Requested: ${days} day${days === 1 ? '' : 's'}.`
                    ),
                    { statusCode: 422 },
                )
            }
        }
    }

    const [row] = await db.insert(leaveRequests).values({ ...data, tenantId, days: days ?? 1 }).returning()
    return row
}

export async function approveLeave(tenantId: string, id: string, approvedBy: string, approverEmail: string, approved: boolean, approverUserEmployeeId?: string | null) {
    // Fetch leave request + employee contact details in a single JOIN to avoid
    // a second round-trip after the update when sending the notification email.
    const [req] = await db
        .select({
            employeeId: leaveRequests.employeeId,
            leaveType: leaveRequests.leaveType,
            startDate: leaveRequests.startDate,
            employeeEmail: employees.email,
            employeeFirstName: employees.firstName,
        })
        .from(leaveRequests)
        .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'pending')))
        .limit(1)
    if (!req) return null

    // Block self-approval. Prefer the user→employee FK; fall back to email match.
    let approverEmployeeId = approverUserEmployeeId ?? null
    if (!approverEmployeeId) {
        const [approverEmployee] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.tenantId, tenantId), eq(employees.email, approverEmail)))
            .limit(1)
        approverEmployeeId = approverEmployee?.id ?? null
    }
    if (approverEmployeeId && approverEmployeeId === req.employeeId) {
        throw Object.assign(new Error('You cannot approve or reject your own leave request'), { statusCode: 403 })
    }

    const status = approved ? ('approved' as const) : ('rejected' as const)

    // Run the DB update and cache invalidation in parallel
    const [[row]] = await Promise.all([
        db.update(leaveRequests)
            .set(withTimestamp({ status, approvedBy, approvedAt: new Date() }))
            .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'pending')))
            .returning(),
        cacheDel(`dashboard:kpis:${tenantId}`),
    ])
    if (!row) return null

    // Keep leave_balances.taken in sync when approving so year-end rollover has accurate snapshots.
    if (approved && row.days) {
        const year = new Date(row.startDate).getFullYear()
        await db.update(leaveBalances)
            .set({ taken: sql`taken + ${row.days}`, updatedAt: new Date() })
            .where(and(
                eq(leaveBalances.tenantId, tenantId),
                eq(leaveBalances.employeeId, row.employeeId),
                eq(leaveBalances.leaveType, row.leaveType),
                eq(leaveBalances.year, year),
            ))

        // Auto-mark attendance records as on_leave for each day in the approved period.
        // Fire-and-forget — does not block the approval response.
        ;(async () => {
            try {
                const start = new Date(row.startDate)
                const end = new Date(row.endDate)
                const now = new Date()
                const records: Array<typeof attendanceRecords.$inferInsert> = []
                for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    records.push({
                        tenantId,
                        employeeId: row.employeeId,
                        date: d.toISOString().split('T')[0],
                        status: 'on_leave' as const,
                        notes: `Auto-marked from approved leave (${row.leaveType})`,
                        createdAt: now,
                        updatedAt: now,
                    })
                }
                if (records.length > 0) {
                    await db.insert(attendanceRecords).values(records)
                        .onConflictDoUpdate({
                            target: [attendanceRecords.employeeId, attendanceRecords.date],
                            set: { status: 'on_leave' as never, notes: sql`EXCLUDED.notes`, updatedAt: now },
                        })
                }
            } catch { /* non-fatal */ }
        })()
    }

    // Send notification using data already fetched in the initial JOIN (no extra DB call)
    if (req.employeeEmail) {
        sendEmail({
            to: req.employeeEmail,
            subject: `Leave Request ${approved ? 'Approved' : 'Rejected'}`,
            html: `<p>Hi ${req.employeeFirstName},</p>
                <p>Your <strong>${req.leaveType}</strong> leave request starting <strong>${req.startDate}</strong> has been <strong>${approved ? 'approved' : 'rejected'}</strong>.</p>
                <p>Please log in to HRHub for more details.</p>`,
            text: `Your ${req.leaveType} leave request starting ${req.startDate} has been ${approved ? 'approved' : 'rejected'}.`,
        }).catch(() => { /* email errors are non-fatal */ })
    }

    return row
}

export async function cancelLeave(tenantId: string, id: string, requesterEmail: string, requesterRole: string, requesterUserEmployeeId?: string | null) {
    // Fetch the leave request to check ownership
    const [req] = await db.select({
        employeeId: leaveRequests.employeeId,
        status: leaveRequests.status,
        leaveType: leaveRequests.leaveType,
        startDate: leaveRequests.startDate,
        days: leaveRequests.days,
    })
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
    if (!row) return null

    // If the leave was already approved, restore the taken count in the balance snapshot
    if (req.status === 'approved' && req.days) {
        const year = new Date(req.startDate).getFullYear()
        await db.update(leaveBalances)
            .set({ taken: sql`GREATEST(taken - ${req.days}, 0)`, updatedAt: new Date() })
            .where(and(
                eq(leaveBalances.tenantId, tenantId),
                eq(leaveBalances.employeeId, req.employeeId),
                eq(leaveBalances.leaveType, req.leaveType),
                eq(leaveBalances.year, year),
            ))
    }

    return row
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
// Uses 4 bulk queries (employees, balances, usage, policies) instead of N×M
// sequential round-trips so this scales to thousands of employees.
export async function rolloverYear(tenantId: string, fromYear: number) {
    const yearStart = `${fromYear}-01-01`
    const yearEnd = `${fromYear}-12-31`
    const todayIso = new Date().toISOString().slice(0, 10)

    // 1. Load all data in parallel — 3 queries total regardless of headcount.
    const [policies, empRows, allBalanceRows, allUsageRows] = await Promise.all([
        listLeavePolicies(tenantId),
        db.select({ id: employees.id, joinDate: employees.joinDate })
            .from(employees)
            .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false))),
        db.select().from(leaveBalances)
            .where(and(eq(leaveBalances.tenantId, tenantId), eq(leaveBalances.year, fromYear))),
        db.select({
            employeeId: leaveRequests.employeeId,
            leaveType: leaveRequests.leaveType,
            status: leaveRequests.status,
            days: leaveRequests.days,
        }).from(leaveRequests)
            .where(and(
                eq(leaveRequests.tenantId, tenantId),
                isNull(leaveRequests.deletedAt),
                gte(leaveRequests.startDate, yearStart),
                lte(leaveRequests.startDate, yearEnd),
                inArray(leaveRequests.status, ['approved', 'pending']),
            )),
    ])

    // 2. Index loaded data by employeeId for O(1) lookup.
    const balanceByEmpType = new Map<string, (typeof allBalanceRows)[number]>()
    for (const r of allBalanceRows) {
        balanceByEmpType.set(`${r.employeeId}:${r.leaveType}`, r)
    }
    const usageByEmpType = new Map<string, { taken: number; pending: number }>()
    for (const r of allUsageRows) {
        const key = `${r.employeeId}:${r.leaveType}`
        const cur = usageByEmpType.get(key) ?? { taken: 0, pending: 0 }
        if (r.status === 'approved') cur.taken += r.days ?? 0
        else if (r.status === 'pending') cur.pending += r.days ?? 0
        usageByEmpType.set(key, cur)
    }

    // 3. Compute all closing/opening rows in JS (no per-employee DB calls).
    const closingRows: any[] = []
    const openingRows: any[] = []

    for (const emp of empRows) {
        const joinDate = emp.joinDate ? new Date(emp.joinDate) : new Date()
        const joinYear = joinDate.getFullYear()
        const today = new Date()
        const monthsOfService = Math.max(0,
            (today.getFullYear() - joinDate.getFullYear()) * 12 +
            (today.getMonth() - joinDate.getMonth()),
        )

        for (const policy of policies) {
            const key = `${emp.id}:${policy.leaveType}`
            const existing = balanceByEmpType.get(key)
            const usage = usageByEmpType.get(key) ?? { taken: 0, pending: 0 }

            const accrued = existing ? Number(existing.accrued) : computeAccrued(policy, monthsOfService, fromYear, joinYear)
            const carryExpiresOn = existing?.carryExpiresOn ?? null
            let carried = existing ? Number(existing.carriedForward) : 0
            if (carryExpiresOn && carryExpiresOn < todayIso) carried = 0
            const adjustment = existing ? Number(existing.adjustment) : 0
            const unlimited = policy.accrualRule === 'unlimited'
            const closing = unlimited ? 0 : Math.max(0, accrued + carried + adjustment - usage.taken)

            closingRows.push({
                tenantId, employeeId: emp.id, leaveType: policy.leaveType, year: fromYear,
                accrued: String(accrued), carriedForward: String(carried),
                carryExpiresOn: carryExpiresOn ?? undefined,
                taken: String(usage.taken), adjustment: String(adjustment),
                closingBalance: String(closing), rolledOverAt: new Date(),
            } as any)

            const carryAmount = Math.min(closing, policy.maxCarryForward)
            if (carryAmount <= 0 && policy.accrualRule !== 'monthly_2_then_30' && policy.accrualRule !== 'flat') continue

            const expiresOn = policy.carryExpiresAfterMonths > 0
                ? new Date(fromYear + 1, 0, 1 + policy.carryExpiresAfterMonths * 30).toISOString().slice(0, 10)
                : null
            const monthsAtNextYearStart = Math.max(0,
                ((fromYear + 1) - joinDate.getFullYear()) * 12 - joinDate.getMonth(),
            )
            const nextAccrued = computeAccrued(policy, monthsAtNextYearStart, fromYear + 1, joinYear)

            openingRows.push({
                tenantId, employeeId: emp.id, leaveType: policy.leaveType, year: fromYear + 1,
                openingBalance: String(carryAmount),
                accrued: String(nextAccrued),
                carriedForward: String(carryAmount),
                carryExpiresOn: expiresOn ?? undefined,
                closingBalance: String(carryAmount + nextAccrued),
            } as any)
        }
    }

    // 4. Write all rows in 2 bulk upserts — still just 2 queries total.
    const BATCH = 500
    let closed = 0
    let opened = 0

    for (let i = 0; i < (closingRows as any[]).length; i += BATCH) {
        const chunk = (closingRows as any[]).slice(i, i + BATCH)
        await db.insert(leaveBalances).values(chunk).onConflictDoUpdate({
            target: [leaveBalances.tenantId, leaveBalances.employeeId, leaveBalances.leaveType, leaveBalances.year],
            set: { closingBalance: sql`excluded.closing_balance`, rolledOverAt: sql`excluded.rolled_over_at`, updatedAt: new Date() },
        })
        closed += chunk.length
    }
    for (let i = 0; i < (openingRows as any[]).length; i += BATCH) {
        const chunk = (openingRows as any[]).slice(i, i + BATCH)
        await db.insert(leaveBalances).values(chunk).onConflictDoNothing()
        opened += chunk.length
    }

    return { fromYear, toYear: fromYear + 1, closed, opened }
}

export async function adjustLeaveBalance(tenantId: string, employeeId: string, leaveType: string, year: number, delta: number, reason?: string, createdBy?: string) {
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
    // Record the adjustment for audit trail
    await db.insert(leaveAdjustments).values({
        tenantId,
        employeeId,
        leaveType,
        year,
        delta: String(delta),
        reason: reason ?? null,
        createdBy: createdBy ?? null,
    })
    return getLeaveBalance(tenantId, employeeId, year)
}

/** Returns the employee department for a leave request — used for dept_head scope guard. */
export async function getLeaveRequestOwnerDept(tenantId: string, leaveId: string): Promise<string | null> {
    const [row] = await db
        .select({ department: employees.department })
        .from(leaveRequests)
        .leftJoin(employees, eq(employees.id, leaveRequests.employeeId))
        .where(and(eq(leaveRequests.id, leaveId), eq(leaveRequests.tenantId, tenantId)))
        .limit(1)
    return row?.department ?? null
}

// ─── Leave Adjustments ───────────────────────────────────────────────────────

const createdByUser = db.select({ id: users.id, name: users.name }).from(users).as('created_by_user')

export async function listLeaveAdjustments(tenantId: string, params: { employeeId?: string; limit: number; offset: number }) {
    const { employeeId, limit, offset } = params
    const conditions = [eq(leaveAdjustments.tenantId, tenantId), isNull(leaveAdjustments.deletedAt)]
    if (employeeId) conditions.push(eq(leaveAdjustments.employeeId, employeeId))

    const rows = await db.select({
        id: leaveAdjustments.id,
        tenantId: leaveAdjustments.tenantId,
        employeeId: leaveAdjustments.employeeId,
        leaveType: leaveAdjustments.leaveType,
        year: leaveAdjustments.year,
        delta: leaveAdjustments.delta,
        reason: leaveAdjustments.reason,
        createdBy: leaveAdjustments.createdBy,
        createdAt: leaveAdjustments.createdAt,
        employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '')`.as('employee_name'),
        createdByName: sql<string | null>`${createdByUser.name}`.as('created_by_name'),
        totalCount: sql<number>`COUNT(*) OVER()`.as('total_count'),
    })
        .from(leaveAdjustments)
        .leftJoin(employees, eq(employees.id, leaveAdjustments.employeeId))
        .leftJoin(createdByUser, eq(createdByUser.id, leaveAdjustments.createdBy))
        .where(and(...conditions))
        .orderBy(desc(leaveAdjustments.createdAt))
        .limit(limit)
        .offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount ?? 0) : 0
    const data = rows.map(({ totalCount: _tc, ...row }) => row)
    return { data, total, limit, offset, hasMore: offset + limit < total }
}

export async function deleteLeaveAdjustment(tenantId: string, id: string) {
    const [adj] = await db.select()
        .from(leaveAdjustments)
        .where(and(eq(leaveAdjustments.id, id), eq(leaveAdjustments.tenantId, tenantId), isNull(leaveAdjustments.deletedAt)))
        .limit(1)
    if (!adj) return null
    // Reverse the balance effect atomically and soft-delete in a single transaction.
    // Atomic SQL avoids a read-modify-write race if two HR managers delete concurrently.
    const [deleted] = await db.transaction(async (tx) => {
        await tx.update(leaveBalances)
            .set({
                adjustment: sql`CAST(adjustment AS NUMERIC) - ${Number(adj.delta)}`,
                updatedAt: new Date(),
            })
            .where(and(
                eq(leaveBalances.tenantId, tenantId),
                eq(leaveBalances.employeeId, adj.employeeId),
                eq(leaveBalances.leaveType, adj.leaveType),
                eq(leaveBalances.year, adj.year),
            ))
        return tx.update(leaveAdjustments)
            .set({ deletedAt: new Date() })
            .where(and(eq(leaveAdjustments.id, id), eq(leaveAdjustments.tenantId, tenantId)))
            .returning()
    })
    return deleted ?? null
}

// ─── Air Tickets ─────────────────────────────────────────────────────────────

export async function listAirTickets(tenantId: string, params: { employeeId?: string; status?: string; limit: number; offset: number }) {
    const { employeeId, status, limit, offset } = params
    const conditions = [eq(airTickets.tenantId, tenantId), isNull(airTickets.deletedAt)]
    if (employeeId) conditions.push(eq(airTickets.employeeId, employeeId))
    if (status) conditions.push(eq(airTickets.status, status as never))

    const rows = await db.select({
        id: airTickets.id,
        tenantId: airTickets.tenantId,
        employeeId: airTickets.employeeId,
        year: airTickets.year,
        ticketFor: airTickets.ticketFor,
        destination: airTickets.destination,
        amount: airTickets.amount,
        currency: airTickets.currency,
        status: airTickets.status,
        reason: airTickets.reason,
        notes: airTickets.notes,
        createdBy: airTickets.createdBy,
        createdAt: airTickets.createdAt,
        employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '')`.as('employee_name'),
        createdByName: sql<string | null>`${createdByUser.name}`.as('created_by_name'),
        totalCount: sql<number>`COUNT(*) OVER()`.as('total_count'),
    })
        .from(airTickets)
        .leftJoin(employees, eq(employees.id, airTickets.employeeId))
        .leftJoin(createdByUser, eq(createdByUser.id, airTickets.createdBy))
        .where(and(...conditions))
        .orderBy(desc(airTickets.createdAt))
        .limit(limit)
        .offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount ?? 0) : 0
    const data = rows.map(({ totalCount: _tc, ...row }) => row)
    return { data, total, limit, offset, hasMore: offset + limit < total }
}

export async function createAirTicket(tenantId: string, data: {
    employeeId: string; year: number; ticketFor: 'self' | 'family' | 'both'; destination?: string;
    amount?: number; currency?: string; reason?: string; notes?: string; createdBy?: string
}) {
    const [row] = await db.insert(airTickets).values({
        tenantId,
        employeeId: data.employeeId,
        year: data.year,
        ticketFor: data.ticketFor,
        destination: data.destination ?? null,
        amount: data.amount != null ? String(data.amount) : null,
        currency: data.currency ?? 'AED',
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        createdBy: data.createdBy ?? null,
    }).returning()
    return row
}

export async function updateAirTicket(tenantId: string, id: string, data: Partial<{
    ticketFor: 'self' | 'family' | 'both'; destination: string; amount: number;
    currency: string; status: 'pending' | 'approved' | 'rejected' | 'used'; reason: string; notes: string
}>) {
    const set: Record<string, unknown> = {}
    if (data.ticketFor !== undefined) set.ticketFor = data.ticketFor
    if (data.destination !== undefined) set.destination = data.destination
    if (data.amount !== undefined) set.amount = String(data.amount)
    if (data.currency !== undefined) set.currency = data.currency
    if (data.status !== undefined) set.status = data.status
    if (data.reason !== undefined) set.reason = data.reason
    if (data.notes !== undefined) set.notes = data.notes
    if (Object.keys(set).length === 0) return null
    const [row] = await db.update(airTickets).set(set as never)
        .where(and(eq(airTickets.id, id), eq(airTickets.tenantId, tenantId), isNull(airTickets.deletedAt)))
        .returning()
    return row ?? null
}

export async function deleteAirTicket(tenantId: string, id: string) {
    const [row] = await db.update(airTickets)
        .set({ deletedAt: new Date() })
        .where(and(eq(airTickets.id, id), eq(airTickets.tenantId, tenantId), isNull(airTickets.deletedAt)))
        .returning()
    return row ?? null
}

// ─── Leave Offsets ───────────────────────────────────────────────────────────

export async function listLeaveOffsets(tenantId: string, params: { employeeId?: string; status?: string; limit: number; offset: number }) {
    const { employeeId, status, limit, offset } = params
    const conditions = [eq(leaveOffsets.tenantId, tenantId), isNull(leaveOffsets.deletedAt)]
    if (employeeId) conditions.push(eq(leaveOffsets.employeeId, employeeId))
    if (status) conditions.push(eq(leaveOffsets.status, status as never))

    const rows = await db.select({
        id: leaveOffsets.id,
        tenantId: leaveOffsets.tenantId,
        employeeId: leaveOffsets.employeeId,
        workDate: leaveOffsets.workDate,
        days: leaveOffsets.days,
        reason: leaveOffsets.reason,
        status: leaveOffsets.status,
        notes: leaveOffsets.notes,
        createdBy: leaveOffsets.createdBy,
        createdAt: leaveOffsets.createdAt,
        employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '')`.as('employee_name'),
        createdByName: sql<string | null>`${createdByUser.name}`.as('created_by_name'),
        totalCount: sql<number>`COUNT(*) OVER()`.as('total_count'),
    })
        .from(leaveOffsets)
        .leftJoin(employees, eq(employees.id, leaveOffsets.employeeId))
        .leftJoin(createdByUser, eq(createdByUser.id, leaveOffsets.createdBy))
        .where(and(...conditions))
        .orderBy(desc(leaveOffsets.createdAt))
        .limit(limit)
        .offset(offset)

    const total = rows.length > 0 ? Number(rows[0].totalCount ?? 0) : 0
    const data = rows.map(({ totalCount: _tc, ...row }) => row)
    return { data, total, limit, offset, hasMore: offset + limit < total }
}

export async function createLeaveOffset(tenantId: string, data: {
    employeeId: string; workDate: string; days?: number; reason?: string; notes?: string; createdBy?: string
}) {
    const [row] = await db.insert(leaveOffsets).values({
        tenantId,
        employeeId: data.employeeId,
        workDate: data.workDate,
        days: data.days != null ? String(data.days) : '1',
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        createdBy: data.createdBy ?? null,
    }).returning()
    return row
}

export async function updateLeaveOffset(tenantId: string, id: string, data: Partial<{
    workDate: string; days: number; reason: string; status: 'pending' | 'approved' | 'rejected'; notes: string
}>) {
    const set: Record<string, unknown> = {}
    if (data.workDate !== undefined) set.workDate = data.workDate
    if (data.days !== undefined) set.days = String(data.days)
    if (data.reason !== undefined) set.reason = data.reason
    if (data.status !== undefined) set.status = data.status
    if (data.notes !== undefined) set.notes = data.notes
    if (Object.keys(set).length === 0) return null
    const [row] = await db.update(leaveOffsets).set(set as never)
        .where(and(eq(leaveOffsets.id, id), eq(leaveOffsets.tenantId, tenantId), isNull(leaveOffsets.deletedAt)))
        .returning()
    return row ?? null
}

export async function deleteLeaveOffset(tenantId: string, id: string) {
    const [row] = await db.update(leaveOffsets)
        .set({ deletedAt: new Date() })
        .where(and(eq(leaveOffsets.id, id), eq(leaveOffsets.tenantId, tenantId), isNull(leaveOffsets.deletedAt)))
        .returning()
    return row ?? null
}
