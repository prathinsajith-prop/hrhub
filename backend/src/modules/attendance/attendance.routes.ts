import { checkIn, checkOut, getAttendance, upsertAttendance, getAttendanceSummary, externalPunch } from './attendance.service.js'

export async function attendanceRoutes(fastify: any) {
    fastify.get('/attendance', {
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const { employeeId, startDate, endDate, status } = request.query as Record<string, string>
        return reply.send(await getAttendance(request.user.tenantId, { employeeId, startDate, endDate, status }))
    })

    fastify.get('/attendance/summary', {
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const { month, year } = request.query as { month: string; year: string }
        return reply.send(await getAttendanceSummary(
            request.user.tenantId,
            parseInt(month ?? String(new Date().getMonth() + 1)),
            parseInt(year ?? String(new Date().getFullYear()))
        ))
    })

    fastify.post('/attendance/check-in', {
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const { employeeId } = request.body as { employeeId: string }
        return reply.send(await checkIn(request.user.tenantId, employeeId))
    })

    fastify.post('/attendance/check-out', {
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const { employeeId } = request.body as { employeeId: string }
        return reply.send(await checkOut(request.user.tenantId, employeeId))
    })

    fastify.patch('/attendance', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        return reply.send(await upsertAttendance(request.user.tenantId, request.body as any))
    })

    // External device punch endpoint — accepts from biometric devices, mobile apps, etc.
    fastify.post('/attendance/external-punch', {
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const { employeeId, timestamp, deviceId, deviceName, punchType, source } = request.body as {
            employeeId: string
            timestamp?: string
            deviceId?: string
            deviceName?: string
            punchType: 'in' | 'out'
            source?: 'biometric' | 'api' | 'mobile'
        }
        if (!employeeId || !punchType) return reply.status(400).send({ error: 'employeeId and punchType are required' })
        const result = await externalPunch(request.user.tenantId, { employeeId, timestamp, deviceId, deviceName, punchType, source })
        return reply.send(result)
    })
}
