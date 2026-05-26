import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import {
    attendanceRecords,
    attendancePunches,
    employees,
    leaveRequests,
    orgUnits,
    publicHolidays,
    shifts,
    users,
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
                // Resolved department via org_units (consistent with /employees/*).
                employeeDepartment: sql<string | null>`COALESCE(${orgUnits.name}, ${employees.department})`,
                total: sql<number>`COUNT(*) OVER()`,
            })
            .from(attendanceRecords)
            .innerJoin(employees, and(
                eq(attendanceRecords.employeeId, employees.id),
                eq(employees.tenantId, user.tenantId),
            ))
            .leftJoin(orgUnits, and(
                eq(employees.departmentId, orgUnits.id),
                eq(orgUnits.tenantId, user.tenantId),
            ))
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
                department: sql<string | null>`COALESCE(${orgUnits.name}, ${employees.department})`,
                designation: employees.designation,
                avatarUrl: employees.avatarUrl,
                joinDate: employees.joinDate,
                shiftWeeklyOffDays: shifts.weeklyOffDays,
            })
            .from(employees)
            .leftJoin(shifts, eq(shifts.id, employees.shiftId))
            .leftJoin(orgUnits, and(
                eq(employees.departmentId, orgUnits.id),
                eq(orgUnits.tenantId, user.tenantId),
            ))
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

    // ─── Check-in / Check-out ────────────────────────────────────────────────
    //
    // Multi-punch model: an employee can check in and out multiple times in
    // a single day (lunch break, customer visit, errand, etc.). Each event
    // is a row in `attendance_punches`. The `attendance_records` row stays
    // as a daily rollup so calendar/dashboard views don't have to change:
    //   - checkIn  = FIRST 'in' punch of the day
    //   - checkOut = LAST 'out' punch of the day (only when the last punch
    //     IS an 'out' — i.e., the employee is no longer on-site)
    //   - hoursWorked = sum of every closed (in,out) pair
    //
    // Alternation rule:
    //   - check-in is allowed only when the last punch of the day was 'out'
    //     (or there are no punches yet). Two check-ins in a row → 400.
    //   - check-out is allowed only when the last punch was 'in'. Two check-
    //     outs in a row → 400.
    //
    // POST /api/v1/attendance/check-in
    fastify.post('/check-in', { ...auth }, async (request: any, reply: any) => {
        return handlePunch(request, reply, 'in')
    })

    // POST /api/v1/attendance/check-out
    fastify.post('/check-out', { ...auth }, async (request: any, reply: any) => {
        return handlePunch(request, reply, 'out')
    })

    // GET /api/v1/attendance/punches?date=YYYY-MM-DD[&employeeId=...]
    //
    // Returns every check-in / check-out event for a single calendar day,
    // ordered oldest-first so the FE can pair them in order (in → out →
    // in → out → …). Powers the "day detail" modal on the portal's
    // attendance page that lists individual punches under each rollup row.
    //
    // Scope: same canAccessEmployee guard as the punch writers — employees
    // see their own, dept_heads see their subtree, HR sees all.
    fastify.get('/punches', { ...auth }, async (request: any, reply: any) => {
        const qs = request.query as { date?: string; employeeId?: string }
        const date = qs.date
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return reply.code(400).send(e400('date is required (YYYY-MM-DD)'))
        }
        const user = request.user
        const targetEmpId = qs.employeeId ?? user.employeeId
        if (!targetEmpId) return reply.code(404).send(e404('No employee record linked'))
        if (!(await canAccessEmployee(user, targetEmpId, request))) {
            return reply.code(403).send(e403('Not authorized to view this employee\'s punches'))
        }

        const data = await db
            .select({
                id: attendancePunches.id,
                tenantId: attendancePunches.tenantId,
                employeeId: attendancePunches.employeeId,
                date: attendancePunches.date,
                punchType: attendancePunches.punchType,
                recordedAt: attendancePunches.recordedAt,
                locationName: attendancePunches.locationName,
                latitude: attendancePunches.latitude,
                longitude: attendancePunches.longitude,
                source: attendancePunches.source,
                deviceId: attendancePunches.deviceId,
                notes: attendancePunches.notes,
                createdBy: attendancePunches.createdBy,
                createdAt: attendancePunches.createdAt,
            })
            .from(attendancePunches)
            .where(
                and(
                    eq(attendancePunches.tenantId, user.tenantId),
                    eq(attendancePunches.employeeId, targetEmpId),
                    eq(attendancePunches.date, date),
                ),
            )
            .orderBy(asc(attendancePunches.recordedAt))

        return reply.send({ data })
    })

    // POST /api/v1/attendance/punches
    //
    // Back-fill a missed check-in (and optional check-out) for a given day.
    // Powers the "Add Check-in / Check-out Entry" panel inside the day-
    // detail modal. Employees can only back-fill their own day; dept_heads
    // can back-fill their subtree; HR can back-fill anyone. The
    // `attendanceManualEntryEnabled` flag on the target employee's user
    // gates this endpoint server-side — the UI also hides the panel, but
    // the API must be authoritative.
    fastify.post('/punches', { ...auth }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as {
            employeeId?: string
            date?: string
            inTime?: string
            outTime?: string | null
            inDayOffset?: number
            outDayOffset?: number
            inNotes?: string | null
            outNotes?: string | null
            locationName?: string | null
            latitude?: number | null
            longitude?: number | null
        }
        const user = request.user
        const targetEmpId = body.employeeId ?? user.employeeId
        if (!targetEmpId) return reply.code(404).send(e404('No employee record linked'))
        if (!(await canAccessEmployee(user, targetEmpId, request))) {
            return reply.code(403).send(e403('Not authorized to add a punch for this employee'))
        }
        const denied = await isAttendanceFlagDisabled(user.tenantId, targetEmpId, 'manual')
        if (denied) return reply.code(403).send(e403(denied))

        const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
        if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
            return reply.code(400).send(e400('date is required (YYYY-MM-DD)'))
        }
        if (!body.inTime || !HHMM.test(body.inTime)) {
            return reply.code(400).send(e400('inTime required (HH:MM)'))
        }
        if (body.outTime && !HHMM.test(body.outTime)) {
            return reply.code(400).send(e400('outTime must be HH:MM'))
        }

        const baseDate = new Date(`${body.date}T00:00:00`)
        const [inH, inM] = body.inTime.split(':').map(Number) as [number, number]
        const inDate = new Date(baseDate.getTime() + (body.inDayOffset ?? 0) * 86_400_000)
        inDate.setHours(inH, inM, 0, 0)

        const [inPunch] = await db
            .insert(attendancePunches)
            .values({
                tenantId: user.tenantId,
                employeeId: targetEmpId,
                date: body.date,
                punchType: 'in',
                recordedAt: inDate,
                locationName: body.locationName ?? null,
                latitude: body.latitude != null ? String(body.latitude) : null,
                longitude: body.longitude != null ? String(body.longitude) : null,
                source: 'manual',
                notes: body.inNotes ?? null,
                createdBy: user.id,
            } as any)
            .returning()

        let outPunch: typeof inPunch | null = null
        if (body.outTime) {
            const [outH, outM] = body.outTime.split(':').map(Number) as [number, number]
            const outDate = new Date(baseDate.getTime() + (body.outDayOffset ?? 0) * 86_400_000)
            outDate.setHours(outH, outM, 0, 0)
            if (outDate <= inDate) {
                return reply.code(400).send(e400('Check-out must be after check-in'))
            }
            const [row] = await db
                .insert(attendancePunches)
                .values({
                    tenantId: user.tenantId,
                    employeeId: targetEmpId,
                    date: body.date,
                    punchType: 'out',
                    recordedAt: outDate,
                    locationName: body.locationName ?? null,
                    latitude: body.latitude != null ? String(body.latitude) : null,
                    longitude: body.longitude != null ? String(body.longitude) : null,
                    source: 'manual',
                    notes: body.outNotes ?? null,
                    createdBy: user.id,
                } as any)
                .returning()
            outPunch = row
        }

        return reply.code(201).send({ data: { inPunch, outPunch } })
    })

    // DELETE /api/v1/attendance/punches/:id
    //
    // Remove a specific punch event (e.g. clicked the "In" trash button on
    // the day-detail modal). Same scoping + manual-entry policy gate as the
    // POST above — deleting a punch is a manual modification.
    fastify.delete('/punches/:id', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const user = request.user

        const [existing] = await db
            .select({
                id: attendancePunches.id,
                employeeId: attendancePunches.employeeId,
            })
            .from(attendancePunches)
            .where(and(eq(attendancePunches.tenantId, user.tenantId), eq(attendancePunches.id, id)))
            .limit(1)
        if (!existing) return reply.code(404).send(e404('Punch not found'))
        if (!(await canAccessEmployee(user, existing.employeeId, request))) {
            return reply.code(403).send(e403('Not authorized to delete this punch'))
        }
        const denied = await isAttendanceFlagDisabled(user.tenantId, existing.employeeId, 'manual')
        if (denied) return reply.code(403).send(e403(denied))

        await db
            .delete(attendancePunches)
            .where(and(eq(attendancePunches.tenantId, user.tenantId), eq(attendancePunches.id, id)))
        return reply.send({ data: { ok: true } })
    })
}

/**
 * Server-side enforcement of HR's per-user attendance switches (Users →
 * Manage Access on the main app). Returns a message string when the action
 * should be denied, `null` to allow. Looks up the *target* employee's
 * linked user row, so a punch on behalf of someone else honours their
 * policy too.
 */
async function isAttendanceFlagDisabled(
    tenantId: string,
    employeeId: string,
    flag: 'punch' | 'manual',
): Promise<string | null> {
    const [row] = await db
        .select({
            punch: users.attendancePunchEnabled,
            manual: users.attendanceManualEntryEnabled,
        })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.employeeId, employeeId)))
        .limit(1)
    if (!row) return null
    if (flag === 'punch' && row.punch === false) {
        return 'Attendance check-in / check-out is disabled for this employee.'
    }
    if (flag === 'manual' && row.manual === false) {
        return 'Manual attendance entry is disabled for this employee.'
    }
    return null
}

/**
 * Shared handler for both check-in and check-out. Inserts a row in
 * `attendance_punches`, then rebuilds the daily rollup in
 * `attendance_records` so reads downstream don't need to know about
 * punches.
 */
async function handlePunch(
    request: any,
    reply: any,
    punchType: 'in' | 'out',
): Promise<unknown> {
    const body = (validate(checkInOutSchema, request.body) ?? {}) as {
        employeeId?: string
        latitude?: number | null
        longitude?: number | null
        locationName?: string | null
        notes?: string | null
    }
    const user = request.user
    const targetEmpId = body.employeeId ?? user.employeeId
    if (!targetEmpId) return reply.code(404).send(e404('No employee record linked'))
    if (!(await canAccessEmployee(user, targetEmpId, request))) {
        return reply.code(403).send(e403(`Not authorized to check ${punchType} for this employee`))
    }

    // Honour HR's per-user attendance switch (Users → Manage Access on the
    // main app). When it's off, the live check-in / check-out buttons are
    // hidden in the portal — but a curl or devtools replay would otherwise
    // sneak past, so enforce server-side too.
    const denied = await isAttendanceFlagDisabled(user.tenantId, targetEmpId, 'punch')
    if (denied) return reply.code(403).send(e403(denied))

    // Location is required for every self-service punch — guards against a
    // user spoofing a punch via devtools/curl. The portal UI already blocks
    // submit when geo is null; this is the server-side back-stop.
    if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
        return reply.code(400).send(e400('Location is required to record a punch. Enable location and try again.'))
    }

    const date = todayISO()
    const now = new Date()

    // Look up the last punch today to validate alternation. The
    // (employee_id, recorded_at) index makes this O(log n).
    const [last] = await db
        .select({ punchType: attendancePunches.punchType })
        .from(attendancePunches)
        .where(
            and(
                eq(attendancePunches.tenantId, user.tenantId),
                eq(attendancePunches.employeeId, targetEmpId),
                eq(attendancePunches.date, date),
            ),
        )
        .orderBy(desc(attendancePunches.recordedAt))
        .limit(1)

    // Alternation guard. "Already checked in" and "Already checked out"
    // both come from the same predicate — phrasing differs per verb.
    if (punchType === 'in' && last?.punchType === 'in') {
        return reply.code(400).send(e400('You are already checked in. Check out before checking in again.'))
    }
    if (punchType === 'out' && !last) {
        return reply.code(400).send(e400('No check-in found for today.'))
    }
    if (punchType === 'out' && last?.punchType === 'out') {
        return reply.code(400).send(e400('You are already checked out. Check in before checking out again.'))
    }

    // Insert the punch event.
    const [punch] = await db
        .insert(attendancePunches)
        .values({
            tenantId: user.tenantId,
            employeeId: targetEmpId,
            date,
            punchType,
            recordedAt: now,
            locationName: body.locationName ?? null,
            latitude: body.latitude != null ? String(body.latitude) : null,
            longitude: body.longitude != null ? String(body.longitude) : null,
            source: 'web',
            notes: body.notes ?? null,
            createdBy: user.id,
        } as any)
        .returning()

    // Rebuild the daily rollup so downstream consumers (calendar / payroll
    // / dashboard) keep working without learning about punches. Same
    // transaction would be cleaner but two queries is fine for typical
    // sub-20-punches-per-day volume.
    const todayPunches = await db
        .select({
            punchType: attendancePunches.punchType,
            recordedAt: attendancePunches.recordedAt,
        })
        .from(attendancePunches)
        .where(
            and(
                eq(attendancePunches.tenantId, user.tenantId),
                eq(attendancePunches.employeeId, targetEmpId),
                eq(attendancePunches.date, date),
            ),
        )
        .orderBy(asc(attendancePunches.recordedAt))

    const firstIn = todayPunches.find((p) => p.punchType === 'in')?.recordedAt ?? null
    // Last 'out' only counts as checkOut when it follows the last 'in' —
    // otherwise the employee is still on-site and the column should be NULL.
    const lastPunch = todayPunches[todayPunches.length - 1] ?? null
    const lastOut = lastPunch?.punchType === 'out' ? lastPunch.recordedAt : null

    // Sum every closed (in, out) pair. Unpaired tail 'in' contributes 0.
    let totalMs = 0
    let pairOpenAt: Date | null = null
    for (const p of todayPunches) {
        if (p.punchType === 'in' && !pairOpenAt) {
            pairOpenAt = p.recordedAt as Date
        } else if (p.punchType === 'out' && pairOpenAt) {
            totalMs += (p.recordedAt as Date).getTime() - pairOpenAt.getTime()
            pairOpenAt = null
        }
    }
    const hoursWorked = totalMs > 0 ? (totalMs / 3_600_000).toFixed(2) : null

    const [existingRollup] = await db
        .select({ id: attendanceRecords.id })
        .from(attendanceRecords)
        .where(
            and(
                eq(attendanceRecords.tenantId, user.tenantId),
                eq(attendanceRecords.employeeId, targetEmpId),
                eq(attendanceRecords.date, date),
            ),
        )
        .limit(1)

    let rollup
    if (existingRollup) {
        ;[rollup] = await db
            .update(attendanceRecords)
            .set({
                checkIn: firstIn,
                checkOut: lastOut,
                hoursWorked,
                status: 'present',
                updatedAt: now,
            })
            .where(eq(attendanceRecords.id, existingRollup.id))
            .returning()
    } else {
        ;[rollup] = await db
            .insert(attendanceRecords)
            .values({
                tenantId: user.tenantId,
                employeeId: targetEmpId,
                date,
                checkIn: firstIn,
                checkOut: lastOut,
                hoursWorked,
                status: 'present',
            } as any)
            .returning()
    }

    recordActivity({
        tenantId: user.tenantId,
        userId: user.id,
        actorName: user.name,
        actorRole: user.role,
        entityType: 'attendance',
        entityId: rollup.id,
        action: 'submit',
        metadata: {
            event: punchType === 'in' ? 'check_in' : 'check_out',
            employeeId: targetEmpId,
            punchId: punch.id,
            // Per-call count so the audit log surfaces "3rd check-in of the day"
            punchSequence: todayPunches.length,
        },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
    }).catch(() => {})

    // Return the rollup row (same shape the FE expects) plus the latest
    // punch so the client can render a confirmation pill if it wants to.
    return reply.send({ data: rollup, punch })
}
