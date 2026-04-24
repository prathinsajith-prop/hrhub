/**
 * Attendance repository — keyset/offset pagination, tenant-scoped, with the
 * employee join used by the UI denormalised here so callers don't have to
 * remember the projection.
 */
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { attendanceRecords, employees } from '../db/schema/index.js'
import {
    applyKeyset,
    buildKeysetResult,
    conjunction,
    pageOffset,
    type KeysetParams,
    type KeysetResult,
} from '../lib/query-helpers.js'

export interface ListAttendanceOpts extends KeysetParams {
    employeeId?: string
    startDate?: string
    endDate?: string
    status?: string
    page?: number
}

const projection = {
    id: attendanceRecords.id,
    tenantId: attendanceRecords.tenantId,
    employeeId: attendanceRecords.employeeId,
    date: attendanceRecords.date,
    checkIn: attendanceRecords.checkIn,
    checkOut: attendanceRecords.checkOut,
    hoursWorked: attendanceRecords.hoursWorked,
    overtimeHours: attendanceRecords.overtimeHours,
    status: attendanceRecords.status,
    notes: attendanceRecords.notes,
    createdAt: attendanceRecords.createdAt,
    updatedAt: attendanceRecords.updatedAt,
    employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '—')`,
    employeeNo: employees.employeeNo,
    employeeDepartment: employees.department,
    employeeAvatarUrl: employees.avatarUrl,
}

export async function listAttendance(
    tenantId: string,
    opts: ListAttendanceOpts = {}
): Promise<KeysetResult<Record<string, unknown>> & { total?: number }> {
    const predicate = conjunction([
        eq(attendanceRecords.tenantId, tenantId),
        opts.employeeId ? eq(attendanceRecords.employeeId, opts.employeeId) : undefined,
        opts.startDate ? gte(attendanceRecords.date, opts.startDate) : undefined,
        opts.endDate ? lte(attendanceRecords.date, opts.endDate) : undefined,
        opts.status ? eq(attendanceRecords.status, opts.status as never) : undefined,
    ])!

    if (opts.page) {
        const { limit, offset } = pageOffset(opts)
        const [items, totalRow] = await Promise.all([
            db.select(projection)
                .from(attendanceRecords)
                .leftJoin(employees, eq(employees.id, attendanceRecords.employeeId))
                .where(predicate)
                .orderBy(sql`${attendanceRecords.date} DESC, ${attendanceRecords.id} DESC`)
                .limit(limit)
                .offset(offset),
            db.select({ count: sql<number>`count(*)::int` })
                .from(attendanceRecords)
                .where(predicate),
        ])
        return { items, nextCursor: null, total: totalRow[0]?.count ?? 0 }
    }

    const { limit, cursorPredicate } = applyKeyset(opts, attendanceRecords.date, attendanceRecords.id)
    const finalPredicate = cursorPredicate ? and(predicate, cursorPredicate)! : predicate
    const rows = await db
        .select(projection)
        .from(attendanceRecords)
        .leftJoin(employees, eq(employees.id, attendanceRecords.employeeId))
        .where(finalPredicate)
        .orderBy(sql`${attendanceRecords.date} DESC, ${attendanceRecords.id} DESC`)
        .limit(limit + 1)
    return buildKeysetResult(rows, limit, (r) => [String((r as { date: string }).date), String((r as { id: string }).id)])
}

/** Today's record for an employee, or null. Used by check-in / check-out. */
export async function findToday(tenantId: string, employeeId: string, isoDate: string) {
    const [row] = await db
        .select()
        .from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.tenantId, tenantId),
            eq(attendanceRecords.employeeId, employeeId),
            eq(attendanceRecords.date, isoDate),
        ))
        .limit(1)
    return row ?? null
}
