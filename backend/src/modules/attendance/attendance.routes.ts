import { checkIn, checkOut, getAttendance, upsertAttendance, getAttendanceSummary, externalPunch } from './attendance.service.js'

export async function attendanceRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/attendance
    fastify.get('/attendance', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { employeeId, startDate, endDate, status, page, limit, cursor } = request.query as Record<string, string>
        const result = await getAttendance(request.user.tenantId, {
            employeeId,
            startDate,
            endDate,
            status,
            page: page ? Number(page) : undefined,
            limit: limit ? Number(limit) : undefined,
            cursor,
        })
        return reply.send(result)
    })

    // GET /api/v1/attendance/summary
    fastify.get('/attendance/summary', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { month, year } = request.query as { month: string; year: string }
        const data = await getAttendanceSummary(
            request.user.tenantId,
            parseInt(month ?? String(new Date().getMonth() + 1)),
            parseInt(year ?? String(new Date().getFullYear()))
        )
        return reply.send({ data })
    })

    // POST /api/v1/attendance/check-in
    // Non-admins may only check in for themselves; admins may supply any employeeId.
    fastify.post('/attendance/check-in', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { employeeId } = request.body as { employeeId?: string }
        const role = request.user.role
        const isAdmin = ['hr_manager', 'super_admin'].includes(role)
        const resolvedEmployeeId = isAdmin && employeeId ? employeeId : (request.user.employeeId ?? employeeId)
        if (!resolvedEmployeeId) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId required' })
        }
        const data = await checkIn(request.user.tenantId, resolvedEmployeeId)
        return reply.code(201).send({ data })
    })

    // POST /api/v1/attendance/check-out
    fastify.post('/attendance/check-out', { ...auth, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { employeeId } = request.body as { employeeId?: string }
        const role = request.user.role
        const isAdmin = ['hr_manager', 'super_admin'].includes(role)
        const resolvedEmployeeId = isAdmin && employeeId ? employeeId : (request.user.employeeId ?? employeeId)
        if (!resolvedEmployeeId) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId required' })
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
        const data = await externalPunch(request.user.tenantId, { employeeId, timestamp, deviceId, deviceName, punchType, source })
        return reply.send({ data })
    })
}
