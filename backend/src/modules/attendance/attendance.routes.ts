import { checkIn, checkOut, getAttendance, upsertAttendance, getAttendanceSummary, externalPunch, getPunchesForDay, recordPunch, deletePunch } from './attendance.service.js'
import { generateReportPdf } from '../../lib/pdf.js'
import { db } from '../../db/index.js'
import {
    attendanceRecords,
    employees,
    leaveRequests,
    publicHolidays,
    shifts,
    tenants,
} from '../../db/schema/index.js'
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { findById } from '../../repositories/employees.repo.js'
import { e400, e403 } from '../../lib/errors.js'

// ─── Calendar helpers (single tenant-scoped read model) ──────────────────

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

function leaveCode(leaveType: string): string {
    switch (leaveType) {
        case 'annual': return 'AL'
        case 'sick': return 'SL'
        case 'maternity': return 'ML'
        case 'paternity': return 'PL'
        case 'bereavement':
        case 'compassionate': return 'BL'
        case 'unpaid': return 'A'
        case 'emergency': return 'E'
        case 'hajj': return 'HJ'
        default: return 'AL'
    }
}

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
        if (!checkOut && checkIn) return 'A'
        const h = hoursWorked ? Number(hoursWorked) : null
        if (h != null && h > 0 && h < 4) return 'P-short'
        return 'P'
    }
    return 'P'
}

export async function attendanceRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'dept_head', 'super_admin')] }

    // GET /api/v1/attendance
    // hr_manager/super_admin see all; dept_head scoped to their department; employees see own only.
    fastify.get('/attendance', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { employeeId, startDate, endDate, status, filter, page, limit, cursor } = request.query as Record<string, string>
        if (filter && filter.length > 2000) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'filter param too long' })
        const role = request.user.role
        const isHrAdmin = ['hr_manager', 'super_admin'].includes(role)
        const isDeptHead = role === 'dept_head'
        if (isDeptHead && !request.user.department) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Your account has no department assigned. Contact an HR admin.' })
        }
        const resolvedEmployeeId = isHrAdmin ? employeeId : isDeptHead ? employeeId : request.user.employeeId
        const resolvedDepartment = isDeptHead ? request.user.department : undefined
        const result = await getAttendance(request.user.tenantId, {
            employeeId: resolvedEmployeeId,
            department: resolvedDepartment,
            startDate,
            endDate,
            status,
            filter,
            page: page ? Math.max(1, Number(page)) : undefined,
            limit: limit ? Math.min(Math.max(1, Number(limit)), 200) : undefined,
            cursor,
        })
        return reply.send(result)
    })

    // GET /api/v1/attendance/summary — admin/dept_head only; returns company-wide aggregated data
    fastify.get('/attendance/summary', { ...adminAuth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { month, year } = request.query as { month: string; year: string }
        const data = await getAttendanceSummary(
            request.user.tenantId,
            parseInt(month ?? String(new Date().getMonth() + 1)),
            parseInt(year ?? String(new Date().getFullYear()))
        )
        return reply.send({ data })
    })

    // GET /api/v1/attendance/calendar?month=YYYY-MM[&department=Sales]
    //
    // Whole-company (HR / super_admin) or dept-scoped (dept_head) attendance grid
    // for the requested month. Returns an employees×days matrix with each cell
    // resolved to a status code (P, P-late, P-short, A, AL, SL, ML, PL, BL, BT,
    // WFH, E, H, WO, N/A) plus check-in/check-out timestamps. Single round-trip
    // — bulk-loads attendance, approved leaves, public holidays, and per-employee
    // shifts in parallel and composes cells in JS via O(1) lookups.
    fastify.get('/attendance/calendar', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const user = request.user
        const q = (request.query ?? {}) as { month?: string; department?: string; employeeId?: string }
        const monthStr = q.month && /^\d{4}-\d{2}$/.test(q.month) ? q.month : null
        if (!monthStr) return reply.code(400).send(e400('month query param required (YYYY-MM)'))

        // ── Date window ─────────────────────────────────────────────────
        const [yearN, monthN] = monthStr.split('-').map(Number) as [number, number]
        const firstDay = new Date(Date.UTC(yearN, monthN - 1, 1))
        const lastDay = new Date(Date.UTC(yearN, monthN, 0))
        const daysInMonth = lastDay.getUTCDate()
        const startISO = `${monthStr}-01`
        const endISO = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`

        // ── Scope ─────────────────────────────────────────────────────
        // - hr_manager / super_admin: all employees, optional ?department / ?employeeId filter.
        // - dept_head: limited to their own department (cannot widen via query).
        // - employee: only their own row, regardless of ?employeeId.
        const role = user.role
        const isHrAdmin = ['hr_manager', 'super_admin'].includes(role)
        const isDeptHead = role === 'dept_head'
        const isEmployee = role === 'employee'
        if (isDeptHead && !user.department) {
            return reply.code(403).send(e403('Your account has no department assigned. Contact an HR admin.'))
        }
        if (isEmployee && !user.employeeId) {
            return reply.code(403).send(e403('Your account is not linked to an employee record.'))
        }

        const departmentFilter = isDeptHead ? user.department : (isHrAdmin ? (q.department ?? null) : null)
        // Employees and the explicit employeeId filter both narrow to a single row.
        const employeeIdFilter = isEmployee ? user.employeeId : (q.employeeId || null)

        const empConds: any[] = [eq(employees.tenantId, user.tenantId)]
        if (departmentFilter) empConds.push(eq(employees.department, departmentFilter))
        if (employeeIdFilter) empConds.push(eq(employees.id, employeeIdFilter))

        // ── Employees + their shift weekly-off days ─────────────────────
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
            .where(and(...empConds))
            .orderBy(asc(employees.firstName))

        if (empRows.length === 0) {
            return reply.send({ month: monthStr, daysInMonth, employees: [], firstWeekday: firstDay.getUTCDay() })
        }

        const scopedIds = empRows.map((e) => e.id)

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

        const result = empRows.map((emp) => {
            const weeklyOffSet = new Set((emp.shiftWeeklyOffDays ?? []).map((d) => d.toLowerCase()))
            const empLeaves = leavesByEmp.get(emp.id) ?? []
            const joinDate = emp.joinDate ? new Date(emp.joinDate + 'T00:00:00Z') : null

            const cells: Array<{
                code: string
                checkIn: string | null
                checkOut: string | null
                hoursWorked: string | null
                leaveType?: string
                holidayName?: string
            }> = []

            for (let day = 1; day <= daysInMonth; day++) {
                const dateObj = new Date(Date.UTC(yearN, monthN - 1, day))
                const iso = `${monthStr}-${String(day).padStart(2, '0')}`

                if (joinDate && dateObj < joinDate) {
                    cells.push({ code: 'N/A', checkIn: null, checkOut: null, hoursWorked: null })
                    continue
                }

                const holidayName = holidayByDate.get(iso)
                if (holidayName) {
                    cells.push({ code: 'H', checkIn: null, checkOut: null, hoursWorked: null, holidayName })
                    continue
                }

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

        reply.header('Cache-Control', 'private, max-age=30')
        return reply.send({
            month: monthStr,
            daysInMonth,
            firstWeekday: firstDay.getUTCDay(),
            employees: result,
        })
    })

    // POST /api/v1/attendance/check-in
    // Non-admins may only check in for themselves. dept_head is limited to their own department.
    fastify.post('/attendance/check-in', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as {
            employeeId?: string
            locationName?: string
            latitude?: number | string
            longitude?: number | string
            notes?: string
            deviceId?: string
        }
        const employeeId = body.employeeId
        const role = request.user.role
        const isHrAdmin = ['hr_manager', 'super_admin'].includes(role)
        const isDeptHead = role === 'dept_head'
        const resolvedEmployeeId = (isHrAdmin || isDeptHead) && employeeId ? employeeId : (request.user.employeeId ?? employeeId)
        if (!resolvedEmployeeId) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId required' })
        }
        if (isDeptHead && employeeId && employeeId !== request.user.employeeId) {
            if (!request.user.department) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Your account has no department assigned. Contact an HR admin.' })
            }
            const emp = await findById(request.user.tenantId, resolvedEmployeeId)
            if (!emp || emp.department !== request.user.department) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only manage attendance for employees in your department.' })
            }
        }
        try {
            const data = await checkIn(request.user.tenantId, resolvedEmployeeId, {
                locationName: body.locationName ?? null,
                latitude: body.latitude ?? null,
                longitude: body.longitude ?? null,
                notes: body.notes ?? null,
                deviceId: body.deviceId ?? null,
                source: 'web',
            }, request.user.id)
            return reply.code(201).send({ data })
        } catch (err: any) {
            const code = err?.statusCode ?? 500
            return reply.code(code).send({ statusCode: code, error: code === 409 ? 'Conflict' : 'Bad Request', message: err?.message ?? 'Unexpected error' })
        }
    })

    // POST /api/v1/attendance/check-out
    fastify.post('/attendance/check-out', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as {
            employeeId?: string
            locationName?: string
            latitude?: number | string
            longitude?: number | string
            notes?: string
            deviceId?: string
        }
        const employeeId = body.employeeId
        const role = request.user.role
        const isHrAdmin = ['hr_manager', 'super_admin'].includes(role)
        const isDeptHead = role === 'dept_head'
        const resolvedEmployeeId = (isHrAdmin || isDeptHead) && employeeId ? employeeId : (request.user.employeeId ?? employeeId)
        if (!resolvedEmployeeId) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId required' })
        }
        if (isDeptHead && employeeId && employeeId !== request.user.employeeId) {
            if (!request.user.department) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Your account has no department assigned. Contact an HR admin.' })
            }
            const emp = await findById(request.user.tenantId, resolvedEmployeeId)
            if (!emp || emp.department !== request.user.department) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only manage attendance for employees in your department.' })
            }
        }
        try {
            const data = await checkOut(request.user.tenantId, resolvedEmployeeId, {
                locationName: body.locationName ?? null,
                latitude: body.latitude ?? null,
                longitude: body.longitude ?? null,
                notes: body.notes ?? null,
                deviceId: body.deviceId ?? null,
                source: 'web',
            }, request.user.id)
            return reply.send({ data })
        } catch (err: any) {
            const code = err?.statusCode ?? 500
            return reply.code(code).send({ statusCode: code, error: code === 409 ? 'Conflict' : 'Bad Request', message: err?.message ?? 'Unexpected error' })
        }
    })

    // GET /api/v1/attendance/punches?date=YYYY-MM-DD&employeeId=
    // Returns every individual check-in / out for a single day. Employees
    // see their own; admins / dept_head respect scoping.
    fastify.get('/attendance/punches', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const q = (request.query ?? {}) as { date?: string; employeeId?: string }
        const date = q.date
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'date query param required (YYYY-MM-DD)' })
        }
        const role = request.user.role
        const isHrAdmin = ['hr_manager', 'super_admin'].includes(role)
        const isDeptHead = role === 'dept_head'
        const resolvedEmployeeId = (isHrAdmin || isDeptHead) && q.employeeId ? q.employeeId : request.user.employeeId
        if (!resolvedEmployeeId) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId required' })
        }
        if (isDeptHead && q.employeeId && q.employeeId !== request.user.employeeId) {
            const emp = await findById(request.user.tenantId, resolvedEmployeeId)
            if (!emp || emp.department !== request.user.department) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only view punches for employees in your department.' })
            }
        }
        const data = await getPunchesForDay(request.user.tenantId, resolvedEmployeeId, date)
        return reply.send({ data })
    })

    // POST /api/v1/attendance/punches — manual HR entry (paired in + out).
    // Body: { employeeId, date, inTime: 'HH:MM', outTime?: 'HH:MM',
    //   inDayOffset?: 0|1, outDayOffset?: 0|1, inNotes?, outNotes?,
    //   locationName?, latitude?, longitude? }
    //
    // HR/super_admin only — the route accepts arbitrary `date` + `inDayOffset`
    // so a non-elevated caller could backfill historical attendance for
    // themselves. Gating to HR matches the rest of the manual-entry surface
    // (PATCH /attendance, biometric import).
    fastify.post('/attendance/punches', { ...adminAuth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as {
            employeeId?: string
            date?: string
            inTime?: string
            outTime?: string
            inDayOffset?: number
            outDayOffset?: number
            inNotes?: string
            outNotes?: string
            locationName?: string
            latitude?: number
            longitude?: number
        }
        const role = request.user.role
        const isHrAdmin = ['hr_manager', 'super_admin'].includes(role)
        const isDeptHead = role === 'dept_head'
        const resolvedEmployeeId = (isHrAdmin || isDeptHead) && body.employeeId ? body.employeeId : request.user.employeeId
        if (!resolvedEmployeeId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId required' })

        const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
        if (!body.date || !/^\d{4}-\d{2}-\d{2}$/.test(body.date)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'date is required (YYYY-MM-DD)' })
        }
        if (!body.inTime || !HHMM.test(body.inTime)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'inTime required (HH:MM)' })
        }
        if (body.outTime && !HHMM.test(body.outTime)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'outTime must be HH:MM' })
        }

        const baseDate = new Date(`${body.date}T00:00:00`)
        const [inH, inM] = body.inTime.split(':').map(Number) as [number, number]
        const inDate = new Date(baseDate.getTime() + (body.inDayOffset ?? 0) * 86_400_000)
        inDate.setHours(inH, inM, 0, 0)
        // recordPunch now returns { row, created } — the created flag tells
        // us whether this was a fresh insert or a no-op against an existing
        // identical punch. Surface it in the response so bulk-import
        // callers can count duplicates separately.
        const inResult = await recordPunch(
            request.user.tenantId, resolvedEmployeeId, 'in',
            {
                recordedAt: inDate,
                locationName: body.locationName ?? null,
                latitude: body.latitude ?? null,
                longitude: body.longitude ?? null,
                notes: body.inNotes ?? null,
                source: 'manual',
            },
            request.user.id,
        )
        let outResult: { row: typeof inResult.row; created: boolean } | null = null
        if (body.outTime) {
            const [outH, outM] = body.outTime.split(':').map(Number) as [number, number]
            const outDate = new Date(baseDate.getTime() + (body.outDayOffset ?? 0) * 86_400_000)
            outDate.setHours(outH, outM, 0, 0)
            if (outDate <= inDate) {
                return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Check-out must be after check-in.' })
            }
            outResult = await recordPunch(
                request.user.tenantId, resolvedEmployeeId, 'out',
                {
                    recordedAt: outDate,
                    locationName: body.locationName ?? null,
                    latitude: body.latitude ?? null,
                    longitude: body.longitude ?? null,
                    notes: body.outNotes ?? null,
                    source: 'manual',
                },
                request.user.id,
            )
        }
        // Two booleans roll into one "wasDuplicate" status per call:
        //   - Both punches were no-ops → duplicate (entire row skipped)
        //   - At least one was fresh → not a duplicate
        const wasDuplicate = !inResult.created && (!outResult || !outResult.created)
        return reply.code(201).send({
            data: {
                inPunch: inResult.row,
                outPunch: outResult?.row ?? null,
                // Per-punch flags so the importer can show "5 rows imported,
                // 2 skipped as duplicates" instead of pretending everything
                // wrote fresh.
                inCreated: inResult.created,
                outCreated: outResult ? outResult.created : null,
                duplicate: wasDuplicate,
            },
        })
    })

    // DELETE /api/v1/attendance/punches/:id — undo a stray clock action.
    //
    // HR/super_admin only — without this gate, employees could remove their
    // own punches and rewrite attendance history, defeating audit integrity.
    fastify.delete('/attendance/punches/:id', { ...adminAuth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const role = request.user.role
        const isHrAdmin = ['hr_manager', 'super_admin'].includes(role)
        const isDeptHead = role === 'dept_head'
        const q = (request.query ?? {}) as { employeeId?: string }
        const resolvedEmployeeId = (isHrAdmin || isDeptHead) && q.employeeId ? q.employeeId : request.user.employeeId
        if (!resolvedEmployeeId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId required' })
        const row = await deletePunch(request.user.tenantId, resolvedEmployeeId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Punch not found' })
        return reply.code(204).send()
    })

    // PATCH /api/v1/attendance — admin upsert
    fastify.patch('/attendance', { ...adminAuth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { employeeId, date, status, checkIn, checkOut, notes } = request.body as {
            employeeId?: string
            date?: string
            status?: string
            checkIn?: string
            checkOut?: string
            notes?: string
        }
        const VALID_STATUSES = ['present', 'absent', 'half_day', 'late', 'wfh', 'on_leave']
        if (!employeeId || !date || !status) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId, date, and status are required' })
        }
        if (!VALID_STATUSES.includes(status)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: `status must be one of: ${VALID_STATUSES.join(', ')}` })
        }
        const data = await upsertAttendance(request.user.tenantId, {
            employeeId, date,
            status: status as 'present' | 'absent' | 'half_day' | 'late' | 'wfh' | 'on_leave',
            checkIn, checkOut, notes,
        })
        return reply.send({ data })
    })

    // POST /api/v1/attendance/external-punch — biometric / mobile device integration
    fastify.post('/attendance/external-punch', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { employeeId, timestamp, deviceId, deviceName, punchType, source } = request.body as {
            employeeId: string
            timestamp?: string
            deviceId?: string
            deviceName?: string
            punchType: 'in' | 'out'
            source?: 'biometric' | 'api' | 'mobile'
        }
        if (!employeeId || !punchType) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId and punchType are required' })
        }
        // Verify the employee belongs to the caller's tenant before accepting any punch —
        // without this an attacker from tenant A could punch in/out for employees in tenant B.
        const emp = await findById(request.user.tenantId, employeeId)
        if (!emp) return reply.code(403).send(e403('Employee not found in your organization'))

        // Non-elevated roles can only punch for themselves.
        const isElevated = ['hr_manager', 'super_admin', 'pro_officer'].includes(request.user.role)
        if (!isElevated && request.user.employeeId !== employeeId) {
            return reply.code(403).send(e403('You can only record attendance for yourself'))
        }
        const data = await externalPunch(request.user.tenantId, { employeeId, timestamp, deviceId, deviceName, punchType, source })
        return reply.send({ data })
    })

    // GET /api/v1/attendance/export?format=csv|pdf&startDate=...&endDate=...
    fastify.get('/attendance/export', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'dept_head', 'super_admin')],
        schema: { tags: ['Attendance'] },
    }, async (request: any, reply: any) => {
        const { format = 'csv', employeeId, startDate, endDate, status, filter } = request.query as Record<string, string>
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const isDeptHead = request.user.role === 'dept_head'
        const isHrAdmin = ['hr_manager', 'super_admin'].includes(request.user.role)
        if (isDeptHead && !request.user.department) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Your account has no department assigned. Contact an HR admin.' })
        }
        const resolvedEmployeeId = isHrAdmin ? employeeId : isDeptHead ? employeeId : request.user.employeeId
        const resolvedDepartment = isDeptHead ? request.user.department : undefined
        const result = await getAttendance(request.user.tenantId, { employeeId: resolvedEmployeeId, department: resolvedDepartment, startDate, endDate, status, filter, limit: 10000 })
        const rows = (result.items ?? []) as any[]
        const dateStr = new Date().toISOString().slice(0, 10)

        if (format === 'pdf') {
            const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
            const pdf = await generateReportPdf({
                title: 'Attendance Report',
                companyName: tenantRow?.name ?? '',
                subtitle: startDate && endDate ? `${startDate} – ${endDate}` : undefined,
                columns: [
                    { header: 'Employee', key: 'employeeName', width: 130 },
                    { header: 'Date', key: 'date', width: 80 },
                    { header: 'Check In', key: 'checkIn', width: 70 },
                    { header: 'Check Out', key: 'checkOut', width: 70 },
                    { header: 'Hours', key: 'hoursWorked', width: 55, align: 'right' },
                    { header: 'Overtime', key: 'overtimeHours', width: 60, align: 'right' },
                    { header: 'Status', key: 'status', width: 70 },
                    { header: 'Notes', key: 'notes' },
                ],
                rows,
            })
            reply.header('Content-Type', 'application/pdf')
            reply.header('Content-Disposition', `attachment; filename="attendance-report-${dateStr}.pdf"`)
            return reply.send(pdf)
        }

        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const headers = ['Employee No', 'Employee Name', 'Date', 'Check In', 'Check Out', 'Hours Worked', 'Overtime Hours', 'Status', 'Notes']
        const lines = [headers.join(',')]
        for (const r of rows) {
            lines.push([r.employeeNo, r.employeeName, r.date, r.checkIn ?? '', r.checkOut ?? '', r.hoursWorked ?? '', r.overtimeHours ?? '', r.status, r.notes ?? ''].map(escape).join(','))
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', `attachment; filename="attendance-export-${dateStr}.csv"`)
        return reply.send(lines.join('\r\n'))
    })
}
