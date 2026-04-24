import { db } from '../../db/index.js'
import { attendanceRecords, employees } from '../../db/schema/index.js'
import { eq, and, gte, lte, sql } from 'drizzle-orm'
import { encodeCursor, decodeCursor } from '../../lib/db-helpers.js'

export async function checkIn(tenantId: string, employeeId: string) {
    const today = new Date().toISOString().split('T')[0]
    const [existing] = await db.select().from(attendanceRecords)
        .where(and(eq(attendanceRecords.tenantId, tenantId), eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.date, today)))
        .limit(1)

    // Guard against duplicate check-in
    if (existing?.checkIn) {
        throw Object.assign(new Error('Already checked in for today'), { statusCode: 409 })
    }

    if (existing) {
        // Record exists (e.g. from upsert) but has no checkIn yet — update it
        const [rec] = await db.update(attendanceRecords)
            .set({ checkIn: new Date(), updatedAt: new Date() })
            .where(eq(attendanceRecords.id, existing.id))
            .returning()
        return rec
    }

    const [rec] = await db.insert(attendanceRecords).values({
        tenantId,
        employeeId,
        date: today,
        checkIn: new Date(),
        status: 'present',
    }).returning()
    return rec
}

export async function checkOut(tenantId: string, employeeId: string) {
    const today = new Date().toISOString().split('T')[0]
    const [existing] = await db.select().from(attendanceRecords)
        .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.date, today)))

    if (!existing || !existing.checkIn) {
        throw Object.assign(new Error('No check-in found for today'), { statusCode: 422 })
    }

    const checkOutTime = new Date()
    const hoursWorked = (checkOutTime.getTime() - new Date(existing.checkIn).getTime()) / (1000 * 3600)
    const standardHours = 8
    const overtimeHours = Math.max(0, hoursWorked - standardHours)

    const [rec] = await db.update(attendanceRecords)
        .set({
            checkOut: checkOutTime,
            hoursWorked: String(Math.round(hoursWorked * 100) / 100),
            overtimeHours: String(Math.round(overtimeHours * 100) / 100),
            updatedAt: new Date(),
        })
        .where(eq(attendanceRecords.id, existing.id))
        .returning()
    return rec
}

export interface GetAttendanceParams {
    employeeId?: string
    startDate?: string
    endDate?: string
    status?: string
    /** 1-based page number; ignored when cursor is provided. */
    page?: number
    /** Page size (default 50, max 200). */
    limit?: number
    /** Opaque keyset cursor encoded by db-helpers.encodeCursor. */
    cursor?: string
}

export interface GetAttendanceResult {
    items: Array<Record<string, unknown>>
    /** Cursor for the next page, or null if there are no more rows. */
    nextCursor: string | null
    /** Total matching rows (only computed when page-mode requested). */
    total?: number
}

const MAX_ATTENDANCE_PAGE = 200
const DEFAULT_ATTENDANCE_PAGE = 50

export async function getAttendance(tenantId: string, params: GetAttendanceParams): Promise<GetAttendanceResult> {
    const limit = Math.min(Math.max(1, params.limit ?? DEFAULT_ATTENDANCE_PAGE), MAX_ATTENDANCE_PAGE)
    const conditions = [eq(attendanceRecords.tenantId, tenantId)]
    if (params.employeeId) conditions.push(eq(attendanceRecords.employeeId, params.employeeId))
    if (params.startDate) conditions.push(gte(attendanceRecords.date, params.startDate))
    if (params.endDate) conditions.push(lte(attendanceRecords.date, params.endDate))
    if (params.status) conditions.push(eq(attendanceRecords.status, params.status as never))

    // Cursor: { c: ISO date, i: row id } — keyset on (date DESC, id DESC).
    if (params.cursor) {
        const decoded = decodeCursor(params.cursor)
        if (decoded) {
            conditions.push(sql`(${attendanceRecords.date}, ${attendanceRecords.id}) < (${decoded.c}, ${decoded.i})`)
        }
    }

    const baseQuery = db.select({
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
    })
        .from(attendanceRecords)
        .leftJoin(employees, eq(employees.id, attendanceRecords.employeeId))
        .where(and(...conditions))
        .orderBy(sql`${attendanceRecords.date} DESC, ${attendanceRecords.id} DESC`)
        .limit(limit + 1) // fetch one extra to detect "has more"

    // Page-mode (offset) — used by traditional table UIs.
    if (!params.cursor && params.page && params.page > 0) {
        const offset = (params.page - 1) * limit
        const [items, totalRow] = await Promise.all([
            db.select({
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
            })
                .from(attendanceRecords)
                .leftJoin(employees, eq(employees.id, attendanceRecords.employeeId))
                .where(and(...conditions))
                .orderBy(sql`${attendanceRecords.date} DESC, ${attendanceRecords.id} DESC`)
                .limit(limit)
                .offset(offset),
            db.select({ count: sql<number>`count(*)::int` })
                .from(attendanceRecords)
                .where(and(...conditions)),
        ])
        return { items, nextCursor: null, total: totalRow[0]?.count ?? 0 }
    }

    const rows = await baseQuery
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const last = items[items.length - 1]
    const nextCursor = hasMore && last
        ? encodeCursor(String((last as { date: string }).date), String((last as { id: string }).id))
        : null
    return { items, nextCursor }
}

export async function upsertAttendance(tenantId: string, data: {
    employeeId: string
    date: string
    status: 'present' | 'absent' | 'half_day' | 'late' | 'wfh' | 'on_leave'
    checkIn?: string
    checkOut?: string
    notes?: string
}) {
    const { checkIn: ci, checkOut: co, ...rest } = data
    const mapped = {
        ...rest,
        checkIn: ci ? new Date(ci) : undefined,
        checkOut: co ? new Date(co) : undefined,
    }
    const existing = await db.select().from(attendanceRecords)
        .where(and(eq(attendanceRecords.employeeId, data.employeeId), eq(attendanceRecords.date, data.date)))

    if (existing.length > 0) {
        const [rec] = await db.update(attendanceRecords)
            .set({ ...mapped, updatedAt: new Date() })
            .where(eq(attendanceRecords.id, existing[0].id))
            .returning()
        return rec
    }

    const [rec] = await db.insert(attendanceRecords).values({ tenantId, ...mapped }).returning()
    return rec
}

export async function getAttendanceSummary(tenantId: string, month: number, year: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    const records = await db.select({
        employeeId: attendanceRecords.employeeId,
        status: attendanceRecords.status,
        count: sql<number>`count(*)::int`,
    }).from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.tenantId, tenantId),
            gte(attendanceRecords.date, startDate),
            lte(attendanceRecords.date, endDate)
        ))
        .groupBy(attendanceRecords.employeeId, attendanceRecords.status)

    return records
}

export async function externalPunch(tenantId: string, params: {
    employeeId: string
    timestamp?: string
    deviceId?: string
    deviceName?: string
    punchType: 'in' | 'out'
    source?: string
}) {
    const now = params.timestamp ? new Date(params.timestamp) : new Date()
    const date = now.toISOString().split('T')[0]

    const [existing] = await db.select().from(attendanceRecords)
        .where(and(eq(attendanceRecords.tenantId, tenantId), eq(attendanceRecords.employeeId, params.employeeId), eq(attendanceRecords.date, date)))
        .limit(1)

    if (params.punchType === 'in') {
        if (existing) return existing
        const [rec] = await db.insert(attendanceRecords).values({
            tenantId,
            employeeId: params.employeeId,
            date,
            status: 'present',
            checkIn: now,
            notes: params.deviceName ? `Punched via ${params.deviceName}` : params.source ? `Source: ${params.source}` : undefined,
        }).returning()
        return rec
    } else {
        if (!existing) return { error: 'No check-in found for today' }
        const checkInTime = existing.checkIn ? new Date(existing.checkIn) : now
        const hoursWorked = ((now.getTime() - checkInTime.getTime()) / 3600000).toFixed(2)
        const [rec] = await db.update(attendanceRecords)
            .set({ checkOut: now, hoursWorked })
            .where(eq(attendanceRecords.id, existing.id))
            .returning()
        return rec
    }
}
