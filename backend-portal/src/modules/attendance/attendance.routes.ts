import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import {
    attendanceRecords,
    employees,
    leaveRequests,
    publicHolidays,
    shifts,
} from '../../db/schema/index.js'
import { e400, e403, e404 } from '../../lib/errors.js'
import { checkInOutSchema, listAttendanceSchema, validate } from '../../lib/validation.js'
import { recordActivity } from '../../lib/audit.js'
import { canAccessEmployee, isElevated, resolveAllowedEmployeeIds } from '../../lib/scoping.js'

function todayISO(): string {
    return new Date().toISOString().slice(0, 10)
}

function diffHours(start: Date, end: Date): number {
    return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000)
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

/** Map a leave_type string to the short code rendered in the calendar grid. */
function leaveCode(leaveType: string): string {
    switch (leaveType) {
        case 'annual': return 'AL'
        case 'sick': return 'SL'
        case 'maternity': return 'ML'
        case 'paternity': return 'PL'
        case 'bereavement':
        case 'compassionate': return 'BL'
        case 'unpaid': return 'A' // unpaid leave reads as absent on the grid
        case 'emergency': return 'E'
        case 'hajj': return 'HJ'
        default: return 'AL'
    }
}

/**
 * Compose the cell code from an attendance record. We surface "short hours"
 * (<4h worked) as P-short and "no check-out" as A so the grid matches the
 * legend the user provided. A late arrival keeps the P code — the cell is
 * rendered in red on the client side using the checkIn timestamp.
 */
function attendanceCode(
    status: string,
    checkIn: Date | null,
    checkOut: Date | null,
    hoursWorked: string | null,
): string {
    if (status === 'on_leave') return 'AL'
    if (status === 'wfh') return 'WFH'
    if (status === 'absent') return 'A'
    if (status === 'half_day') return 'P-short'
    if (status === 'late') return 'P-late'
    if (status === 'present' || status === 'half_day') {
        if (!checkOut && checkIn) return 'A' // only punch-in, never punched out
        const h = hoursWorked ? Number(hoursWorked) : null
        if (h != null && h > 0 && h < 4) return 'P-short'
        return 'P'
    }
    return 'P'
}

export default async function attendanceRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /api/v1/attendance — own (employee), subtree (dept_head), all (HR)
    fastify.get('/', { ...auth }, async (request: any, reply: any) => {
        const query = validate(listAttendanceSchema, request.query)
        const user = request.user

        const allowedEmployeeIds = await resolveAllowedEmployeeIds(user, request)
        if (allowedEmployeeIds !== null && allowedEmployeeIds.length === 0) {
            return reply.send({ data: [], total: 0, limit: query.limit, offset: query.offset, hasMore: false })
        }
        if (query.employeeId && allowedEmployeeIds !== null && !allowedEmployeeIds.includes(query.employeeId)) {
            return reply.code(403).send(e403('Not authorized'))
        }

        const conditions: any[] = [eq(attendanceRecords.tenantId, user.tenantId)]
        if (allowedEmployeeIds !== null) conditions.push(inArray(attendanceRecords.employeeId, allowedEmployeeIds))
        if (query.employeeId) conditions.push(eq(attendanceRecords.employeeId, query.employeeId))
        if (query.startDate) conditions.push(gte(attendanceRecords.date, query.startDate))
        if (query.endDate) conditions.push(lte(attendanceRecords.date, query.endDate))
        if (query.status) conditions.push(eq(attendanceRecords.status, query.status as any))

        const rows = await db
            .select({
                record: attendanceRecords,
                employeeFirstName: employees.firstName,
                employeeLastName: employees.lastName,
                employeeNo: employees.employeeNo,
                employeeDepartment: employees.department,
                total: sql<number>`COUNT(*) OVER()`,
            })
            .from(attendanceRecords)
            .innerJoin(employees, eq(attendanceRecords.employeeId, employees.id))
            .where(and(...conditions))
            .orderBy(desc(attendanceRecords.date))
            .limit(query.limit)
            .offset(query.offset)

        const total = rows[0]?.total ?? 0
        const data = rows.map((r) => ({
            ...r.record,
            employeeName: `${r.employeeFirstName} ${r.employeeLastName}`,
            employeeNo: r.employeeNo,
            employeeDepartment: r.employeeDepartment,
        }))
        return reply.send({
            data,
            total: Number(total),
            limit: query.limit,
            offset: query.offset,
            hasMore: query.offset + data.length < Number(total),
        })
    })

    // GET /api/v1/attendance/calendar?month=YYYY-MM&scope=me|team
    //
    // Returns an employees-by-days matrix for the requested month, with each cell
    // carrying a resolved status code (P/A/AL/SL/.../WO/H/N/A) plus the day's
    // check-in/check-out times when available. This is the read model that
    // powers the team attendance grid in the portal — one round-trip instead of
    // four (employees + attendance + leaves + holidays).
    fastify.get('/calendar', { ...auth }, async (request: any, reply: any) => {
        const user = request.user
        const q = (request.query ?? {}) as { month?: string; scope?: string }
        const monthStr = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : null
        if (!monthStr) return reply.code(400).send(e400('month query param required (YYYY-MM)'))

        const scope = q.scope === 'team' ? 'team' : 'me'

        // ── Date window for the requested month ───────────────────────────
        const [yearN, monthN] = monthStr.split('-').map(Number) as [number, number]
        const firstDay = new Date(Date.UTC(yearN, monthN - 1, 1))
        const lastDay = new Date(Date.UTC(yearN, monthN, 0)) // day 0 of next month = last day of this
        const daysInMonth = lastDay.getUTCDate()
        const startISO = `${monthStr}-01`
        const endISO = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`

        // Resolve which employees to include.
        //  - `null`  ⇒ elevated user, no employee filter
        //  - `[]`    ⇒ no access (early return below)
        //  - `[ids]` ⇒ explicit allow-list
        let employeeIds: string[] | null
        if (scope === 'me') {
            if (!user.employeeId) return reply.send({ month: monthStr, daysInMonth, employees: [] })
            employeeIds = [user.employeeId]
        } else {
            employeeIds = await resolveAllowedEmployeeIds(user, request)
            if (employeeIds && employeeIds.length === 0) {
                return reply.send({ month: monthStr, daysInMonth, employees: [] })
            }
        }

        const employeeCond = employeeIds
            ? inArray(employees.id, employeeIds)
            : sql`1=1`

        // ── Pull employees + their shift (for weekly-off days) ────────────
        const empRows = await db
            .select({
                id: employees.id,
                employeeNo: employees.employeeNo,
                firstName: employees.firstName,
                lastName: employees.lastName,
                department: employees.department,
                designation: employees.designation,
                avatarUrl: employees.avatarUrl,
                joinDate: employees.joinDate,
                shiftWeeklyOffDays: shifts.weeklyOffDays,
            })
            .from(employees)
            .leftJoin(shifts, eq(shifts.id, employees.shiftId))
            .where(and(eq(employees.tenantId, user.tenantId), employeeCond))
            .orderBy(asc(employees.firstName))

        if (empRows.length === 0) {
            return reply.send({ month: monthStr, daysInMonth, employees: [] })
        }

        const scopedIds = empRows.map((e) => e.id)

        // ── Bulk-load attendance, approved leaves and holidays for the window ─
        const [attRows, leaveRows, holidayRows] = await Promise.all([
            db
                .select({
                    employeeId: attendanceRecords.employeeId,
                    date: attendanceRecords.date,
                    checkIn: attendanceRecords.checkIn,
                    checkOut: attendanceRecords.checkOut,
                    hoursWorked: attendanceRecords.hoursWorked,
                    status: attendanceRecords.status,
                })
                .from(attendanceRecords)
                .where(
                    and(
                        eq(attendanceRecords.tenantId, user.tenantId),
                        inArray(attendanceRecords.employeeId, scopedIds),
                        gte(attendanceRecords.date, startISO),
                        lte(attendanceRecords.date, endISO),
                    ),
                ),
            db
                .select({
                    employeeId: leaveRequests.employeeId,
                    leaveType: leaveRequests.leaveType,
                    startDate: leaveRequests.startDate,
                    endDate: leaveRequests.endDate,
                })
                .from(leaveRequests)
                .where(
                    and(
                        eq(leaveRequests.tenantId, user.tenantId),
                        inArray(leaveRequests.employeeId, scopedIds),
                        eq(leaveRequests.status, 'approved'),
                        // overlap test: leave.start <= window.end AND leave.end >= window.start
                        lte(leaveRequests.startDate, endISO),
                        gte(leaveRequests.endDate, startISO),
                    ),
                ),
            db
                .select({ date: publicHolidays.date, name: publicHolidays.name })
                .from(publicHolidays)
                .where(
                    and(
                        eq(publicHolidays.tenantId, user.tenantId),
                        gte(publicHolidays.date, startISO),
                        lte(publicHolidays.date, endISO),
                    ),
                ),
        ])

        // ── Index lookups for O(1) per-cell resolution ────────────────────
        const attByEmpDate = new Map<string, typeof attRows[number]>()
        for (const r of attRows) attByEmpDate.set(`${r.employeeId}|${r.date}`, r)

        const leavesByEmp = new Map<string, typeof leaveRows>()
        for (const lr of leaveRows) {
            const arr = leavesByEmp.get(lr.employeeId) ?? []
            arr.push(lr)
            leavesByEmp.set(lr.employeeId, arr)
        }

        const holidayByDate = new Map<string, string>()
        for (const h of holidayRows) holidayByDate.set(h.date, h.name)

        // ── Compose the matrix ────────────────────────────────────────────
        const result = empRows.map((emp) => {
            const weeklyOffSet = new Set(
                (emp.shiftWeeklyOffDays ?? []).map((d) => d.toLowerCase()),
            )
            const empLeaves = leavesByEmp.get(emp.id) ?? []
            const joinDate = emp.joinDate ? new Date(emp.joinDate + 'T00:00:00Z') : null

            const cells: Array<{
                code: string
                checkIn: string | null
                checkOut: string | null
                hoursWorked: string | null
                tone?: string
                leaveType?: string
                holidayName?: string
            }> = []

            for (let day = 1; day <= daysInMonth; day++) {
                const dateObj = new Date(Date.UTC(yearN, monthN - 1, day))
                const iso = `${monthStr}-${String(day).padStart(2, '0')}`

                // Before joinDate? N/A.
                if (joinDate && dateObj < joinDate) {
                    cells.push({ code: 'N/A', checkIn: null, checkOut: null, hoursWorked: null })
                    continue
                }

                const holidayName = holidayByDate.get(iso)
                if (holidayName) {
                    cells.push({ code: 'H', checkIn: null, checkOut: null, hoursWorked: null, holidayName })
                    continue
                }

                // Leave overlap takes precedence over weekly-off so multi-day leaves render contiguously.
                const leave = empLeaves.find((l) => iso >= l.startDate && iso <= l.endDate)
                if (leave) {
                    cells.push({
                        code: leaveCode(leave.leaveType),
                        checkIn: null,
                        checkOut: null,
                        hoursWorked: null,
                        leaveType: leave.leaveType,
                    })
                    continue
                }

                // Weekly off (Sat/Sun for most tenants — driven by the employee's shift).
                const dayName = WEEKDAY_NAMES[dateObj.getUTCDay()]
                if (weeklyOffSet.has(dayName)) {
                    cells.push({ code: 'WO', checkIn: null, checkOut: null, hoursWorked: null })
                    continue
                }

                const att = attByEmpDate.get(`${emp.id}|${iso}`)
                if (att) {
                    cells.push({
                        code: attendanceCode(att.status, att.checkIn, att.checkOut, att.hoursWorked),
                        checkIn: att.checkIn ? new Date(att.checkIn).toISOString() : null,
                        checkOut: att.checkOut ? new Date(att.checkOut).toISOString() : null,
                        hoursWorked: att.hoursWorked ?? null,
                    })
                    continue
                }

                // Past day with no record → absent. Future day → empty.
                const today = new Date()
                today.setUTCHours(0, 0, 0, 0)
                if (dateObj < today) {
                    cells.push({ code: 'A', checkIn: null, checkOut: null, hoursWorked: null })
                } else {
                    cells.push({ code: '', checkIn: null, checkOut: null, hoursWorked: null })
                }
            }

            return {
                id: emp.id,
                employeeNo: emp.employeeNo,
                name: `${emp.firstName} ${emp.lastName}`,
                department: emp.department,
                designation: emp.designation,
                avatarUrl: emp.avatarUrl,
                cells,
            }
        })

        // Light cache — calendar is recomputed quickly but we ease load on the
        // initial render when the user flips months back and forth.
        reply.header('Cache-Control', 'private, max-age=30')
        return reply.send({
            month: monthStr,
            daysInMonth,
            scope,
            // Echo elevation so the client can decide whether to show the
            // employee-name column (always present here, but kept for parity).
            elevated: isElevated(user),
            firstWeekday: firstDay.getUTCDay(),
            employees: result,
        })
    })

    // POST /api/v1/attendance/check-in
    fastify.post('/check-in', { ...auth }, async (request: any, reply: any) => {
        const body = (validate(checkInOutSchema, request.body) ?? {}) as { employeeId?: string }
        const user = request.user
        const targetEmpId = body.employeeId ?? user.employeeId
        if (!targetEmpId) return reply.code(404).send(e404('No employee record linked'))

        if (!(await canAccessEmployee(user, targetEmpId, request))) {
            return reply.code(403).send(e403('Not authorized to check in for this employee'))
        }

        const date = todayISO()
        const now = new Date()
        const [existing] = await db
            .select()
            .from(attendanceRecords)
            .where(
                and(
                    eq(attendanceRecords.tenantId, user.tenantId),
                    eq(attendanceRecords.employeeId, targetEmpId),
                    eq(attendanceRecords.date, date),
                ),
            )
            .limit(1)

        if (existing?.checkIn) return reply.code(400).send(e400('Already checked in today'))

        const row = existing
            ? (
                  await db
                      .update(attendanceRecords)
                      .set({ checkIn: now, status: 'present', updatedAt: now })
                      .where(eq(attendanceRecords.id, existing.id))
                      .returning()
              )[0]
            : (
                  await db
                      .insert(attendanceRecords)
                      .values({
                          tenantId: user.tenantId,
                          employeeId: targetEmpId,
                          date,
                          checkIn: now,
                          status: 'present',
                      } as any)
                      .returning()
              )[0]

        recordActivity({
            tenantId: user.tenantId,
            userId: user.id,
            actorName: user.name,
            actorRole: user.role,
            entityType: 'attendance',
            entityId: row.id,
            action: 'submit',
            metadata: { event: 'check_in', employeeId: targetEmpId },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        return reply.send({ data: row })
    })

    // POST /api/v1/attendance/check-out
    fastify.post('/check-out', { ...auth }, async (request: any, reply: any) => {
        const body = (validate(checkInOutSchema, request.body) ?? {}) as { employeeId?: string }
        const user = request.user
        const targetEmpId = body.employeeId ?? user.employeeId
        if (!targetEmpId) return reply.code(404).send(e404('No employee record linked'))

        if (!(await canAccessEmployee(user, targetEmpId, request))) {
            return reply.code(403).send(e403('Not authorized'))
        }

        const date = todayISO()
        const now = new Date()
        const [existing] = await db
            .select()
            .from(attendanceRecords)
            .where(
                and(
                    eq(attendanceRecords.tenantId, user.tenantId),
                    eq(attendanceRecords.employeeId, targetEmpId),
                    eq(attendanceRecords.date, date),
                ),
            )
            .limit(1)

        if (!existing?.checkIn) return reply.code(400).send(e400('No check-in found for today'))
        if (existing.checkOut) return reply.code(400).send(e400('Already checked out today'))

        const hoursWorked = diffHours(existing.checkIn, now).toFixed(2)
        const [updated] = await db
            .update(attendanceRecords)
            .set({ checkOut: now, hoursWorked, updatedAt: now })
            .where(eq(attendanceRecords.id, existing.id))
            .returning()

        recordActivity({
            tenantId: user.tenantId,
            userId: user.id,
            actorName: user.name,
            actorRole: user.role,
            entityType: 'attendance',
            entityId: updated.id,
            action: 'submit',
            metadata: { event: 'check_out', employeeId: targetEmpId, hoursWorked },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        return reply.send({ data: updated })
    })
}
