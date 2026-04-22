import { db } from '../../db/index.js'
import { attendanceRecords, employees } from '../../db/schema/index.js'
import { eq, and, gte, lte, sql } from 'drizzle-orm'

export async function checkIn(tenantId: string, employeeId: string) {
    const today = new Date().toISOString().split('T')[0]
    // Upsert for today
    const existing = await db.select().from(attendanceRecords)
        .where(and(eq(attendanceRecords.employeeId, employeeId), eq(attendanceRecords.date, today)))

    if (existing.length > 0) {
        // Already checked in - update check_in time
        const [rec] = await db.update(attendanceRecords)
            .set({ checkIn: new Date(), updatedAt: new Date() })
            .where(eq(attendanceRecords.id, existing[0].id))
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

    if (!existing || !existing.checkIn) throw new Error('No check-in found for today')

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

export async function getAttendance(tenantId: string, params: {
    employeeId?: string
    startDate?: string
    endDate?: string
    status?: string
}) {
    const conditions = [eq(attendanceRecords.tenantId, tenantId)]
    if (params.employeeId) conditions.push(eq(attendanceRecords.employeeId, params.employeeId))
    if (params.startDate) conditions.push(gte(attendanceRecords.date, params.startDate))
    if (params.endDate) conditions.push(lte(attendanceRecords.date, params.endDate))

    return db.select().from(attendanceRecords).where(and(...conditions))
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
