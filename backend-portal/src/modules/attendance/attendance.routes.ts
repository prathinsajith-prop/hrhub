import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { attendanceRecords, employees } from '../../db/schema/index.js'
import { e400, e403, e404 } from '../../lib/errors.js'
import { checkInOutSchema, listAttendanceSchema, validate } from '../../lib/validation.js'
import { recordActivity } from '../../lib/audit.js'
import { canAccessEmployee, resolveAllowedEmployeeIds } from '../../lib/scoping.js'

function todayISO(): string {
    return new Date().toISOString().slice(0, 10)
}

function diffHours(start: Date, end: Date): number {
    return Math.max(0, (end.getTime() - start.getTime()) / 3_600_000)
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
