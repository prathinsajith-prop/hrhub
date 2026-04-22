import { eq, and, desc, isNull, gte, lte, inArray, sql, getTableColumns } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { leaveRequests } from '../../db/schema/index.js'
import { employees } from '../../db/schema/employees.js'
import type { InferInsertModel } from 'drizzle-orm'

type NewLeaveRequest = InferInsertModel<typeof leaveRequests>

export async function listLeaveRequests(tenantId: string, params: { employeeId?: string; status?: string; leaveType?: string; limit: number; offset: number }) {
    const { employeeId, status, leaveType, limit, offset } = params
    const conditions = [eq(leaveRequests.tenantId, tenantId), isNull(leaveRequests.deletedAt)]
    if (employeeId) conditions.push(eq(leaveRequests.employeeId, employeeId))
    if (status) conditions.push(eq(leaveRequests.status, status as never))
    if (leaveType) conditions.push(eq(leaveRequests.leaveType, leaveType as never))

    const rows = await db.select({ ...getTableColumns(leaveRequests), totalCount: sql<number>`COUNT(*) OVER()`.as('totalCount') })
        .from(leaveRequests)
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

export async function approveLeave(tenantId: string, id: string, approvedBy: string, approved: boolean) {
    const [row] = await db.update(leaveRequests)
        .set({
            status: approved ? 'approved' : 'rejected',
            approvedBy,
            approvedAt: new Date(),
            updatedAt: new Date(),
        } as any)
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'pending')))
        .returning()
    return row ?? null
}

export async function cancelLeave(tenantId: string, id: string) {
    const [row] = await db.update(leaveRequests)
        .set({ status: 'cancelled', updatedAt: new Date() } as any)
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId)))
        .returning()
    return row ?? null
}

export async function softDeleteLeaveRequest(tenantId: string, id: string) {
    const [row] = await db.update(leaveRequests)
        .set({ deletedAt: new Date(), updatedAt: new Date() } as any)
        .where(and(eq(leaveRequests.id, id), eq(leaveRequests.tenantId, tenantId), isNull(leaveRequests.deletedAt)))
        .returning()
    return row ?? null
}

// ─── Leave Balance (UAE Labour Law) ────────────────────────────────────────
// Annual leave entitlement:
//   < 1 year service: 2 days/month  |  ≥ 1 year: 30 calendar days/year
// Sick: 15 days full-pay + 30 days half-pay = 45 tracked days/year
// Maternity: 60 days | Paternity: 5 days | Compassionate: 5 days

const LEAVE_ENTITLEMENTS: Record<string, number> = {
    annual: 30,
    sick: 45,
    maternity: 60,
    paternity: 5,
    compassionate: 5,
    hajj: 30,
    unpaid: 999, // unlimited
    public_holiday: 0, // system-generated
}

export async function getLeaveBalance(tenantId: string, employeeId: string, year: number) {
    // 1. Get employee join date
    const [emp] = await db.select({ joinDate: employees.joinDate }).from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.tenantId, tenantId)))

    if (!emp) return null

    const today = new Date()
    const joinDate = emp.joinDate ? new Date(emp.joinDate) : today
    const monthsOfService = Math.max(0,
        (today.getFullYear() - joinDate.getFullYear()) * 12 +
        (today.getMonth() - joinDate.getMonth()),
    )

    // 2. Compute annual entitlement based on service length
    let annualEntitled: number
    if (monthsOfService < 12) {
        // Accrued 2 days/month, pro-rated for year
        annualEntitled = Math.min(monthsOfService * 2, 30)
    } else {
        annualEntitled = 30
    }

    const yearStart = `${year}-01-01`
    const yearEnd = `${year}-12-31`

    // 3. Count leave taken (approved) and pending per type this year
    const rows = await db.select({
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

    for (const r of rows) {
        const t = r.leaveType as string
        if (r.status === 'approved') {
            taken[t] = (taken[t] ?? 0) + (r.days ?? 0)
        } else if (r.status === 'pending') {
            pending[t] = (pending[t] ?? 0) + (r.days ?? 0)
        }
    }

    // 4. Build balance per leave type
    const types = ['annual', 'sick', 'maternity', 'paternity', 'compassionate', 'hajj', 'unpaid']
    const balance: Record<string, { entitled: number; taken: number; pending: number; available: number }> = {}

    for (const type of types) {
        const entitled = type === 'annual' ? annualEntitled : (LEAVE_ENTITLEMENTS[type] ?? 0)
        const t = taken[type] ?? 0
        const p = pending[type] ?? 0
        const available = entitled === 999 ? 999 : Math.max(0, entitled - t - p)
        balance[type] = { entitled: entitled === 999 ? -1 : entitled, taken: t, pending: p, available: entitled === 999 ? -1 : available }
    }

    return {
        employeeId,
        year,
        monthsOfService,
        balance,
    }
}
