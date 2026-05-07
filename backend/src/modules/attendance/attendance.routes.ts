import { checkIn, checkOut, getAttendance, upsertAttendance, getAttendanceSummary, externalPunch } from './attendance.service.js'
import { generateReportPdf } from '../../lib/pdf.js'
import { db } from '../../db/index.js'
import { tenants } from '../../db/schema/index.js'
import { eq } from 'drizzle-orm'
import { findById } from '../../repositories/employees.repo.js'
import { e403 } from '../../lib/errors.js'

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

    // POST /api/v1/attendance/check-in
    // Non-admins may only check in for themselves. dept_head is limited to their own department.
    fastify.post('/attendance/check-in', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { employeeId } = request.body as { employeeId?: string }
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
        const data = await checkIn(request.user.tenantId, resolvedEmployeeId)
        return reply.code(201).send({ data })
    })

    // POST /api/v1/attendance/check-out
    // Non-admins may only check out for themselves. dept_head is limited to their own department.
    fastify.post('/attendance/check-out', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { employeeId } = request.body as { employeeId?: string }
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
        const data = await checkOut(request.user.tenantId, resolvedEmployeeId)
        return reply.send({ data })
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
