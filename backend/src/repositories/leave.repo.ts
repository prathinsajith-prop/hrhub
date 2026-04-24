/**
 * Leave repository — owns queries against leave_requests, leave_policies and
 * leave_balances. Used by payroll calculations and the leave management UI.
 */
import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { leaveBalances, leavePolicies, leaveRequests } from '../db/schema/leave.js'
import {
    applyKeyset,
    buildKeysetResult,
    conjunction,
    pageOffset,
    type KeysetParams,
    type KeysetResult,
} from '../lib/query-helpers.js'

export interface ListLeaveOpts extends KeysetParams {
    employeeId?: string
    status?: string
    leaveType?: string
    startDate?: string
    endDate?: string
    page?: number
}

export async function listLeaveRequests(
    tenantId: string,
    opts: ListLeaveOpts = {}
): Promise<KeysetResult<typeof leaveRequests.$inferSelect> & { total?: number }> {
    const predicate = conjunction([
        eq(leaveRequests.tenantId, tenantId),
        isNull(leaveRequests.deletedAt),
        opts.employeeId ? eq(leaveRequests.employeeId, opts.employeeId) : undefined,
        opts.status ? eq(leaveRequests.status, opts.status as never) : undefined,
        opts.leaveType ? eq(leaveRequests.leaveType, opts.leaveType as never) : undefined,
        opts.startDate ? gte(leaveRequests.startDate, opts.startDate) : undefined,
        opts.endDate ? lte(leaveRequests.endDate, opts.endDate) : undefined,
    ])!

    if (opts.page) {
        const { limit, offset } = pageOffset(opts)
        const [items, totalRow] = await Promise.all([
            db.select().from(leaveRequests).where(predicate).orderBy(desc(leaveRequests.startDate)).limit(limit).offset(offset),
            db.select({ count: sql<number>`count(*)::int` }).from(leaveRequests).where(predicate),
        ])
        return { items, nextCursor: null, total: totalRow[0]?.count ?? 0 }
    }

    const { limit, cursorPredicate } = applyKeyset(opts, leaveRequests.startDate, leaveRequests.id)
    const finalPredicate = cursorPredicate ? and(predicate, cursorPredicate)! : predicate
    const rows = await db
        .select()
        .from(leaveRequests)
        .where(finalPredicate)
        .orderBy(desc(leaveRequests.startDate), desc(leaveRequests.id))
        .limit(limit + 1)
    return buildKeysetResult(rows, limit, (r) => [String(r.startDate), r.id])
}

/**
 * For payroll: fetch every approved leave row that overlaps a date range, for
 * the given employees. The date predicate uses the new
 * idx_leave_requests_tenant_date_employee partial index.
 */
export async function findApprovedLeaveForPayroll(
    tenantId: string,
    employeeIds: string[],
    startDate: string,
    endDate: string,
) {
    if (employeeIds.length === 0) return []
    return db
        .select()
        .from(leaveRequests)
        .where(and(
            eq(leaveRequests.tenantId, tenantId),
            isNull(leaveRequests.deletedAt),
            eq(leaveRequests.status, 'approved'),
            inArray(leaveRequests.employeeId, employeeIds),
            // Overlap predicate: leave interval intersects payroll period.
            sql`${leaveRequests.startDate} <= ${endDate}`,
            sql`${leaveRequests.endDate} >= ${startDate}`,
        ))
}

/** Active leave policies for a tenant. Cacheable. */
export async function listActivePolicies(tenantId: string) {
    return db
        .select()
        .from(leavePolicies)
        .where(and(eq(leavePolicies.tenantId, tenantId), eq(leavePolicies.isActive, true)))
}

/** Single year balance row for an employee + leave type. */
export async function findBalance(tenantId: string, employeeId: string, leaveType: string, year: number) {
    const [row] = await db
        .select()
        .from(leaveBalances)
        .where(and(
            eq(leaveBalances.tenantId, tenantId),
            eq(leaveBalances.employeeId, employeeId),
            eq(leaveBalances.leaveType, leaveType),
            eq(leaveBalances.year, year),
        ))
        .limit(1)
    return row ?? null
}
