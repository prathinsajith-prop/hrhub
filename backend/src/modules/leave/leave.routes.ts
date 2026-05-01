import {
    listLeaveRequests, createLeaveRequest, approveLeave, cancelLeave, getLeaveBalance,
    listLeavePolicies, upsertLeavePolicies, rolloverYear, adjustLeaveBalance, getLeaveRequestOwnerDept,
    listLeaveAdjustments, deleteLeaveAdjustment,
    listAirTickets, createAirTicket, updateAirTicket, deleteAirTicket,
    listLeaveOffsets, createLeaveOffset, updateLeaveOffset, deleteLeaveOffset,
} from './leave.service.js'
import { validate, createLeaveSchema, leaveActionSchema } from '../../lib/validation.js'
import { recordActivity } from '../audit/audit.service.js'
import { sendWithETag } from '../../lib/etag.js'
import { cacheDel } from '../../lib/redis.js'
import { db } from '../../db/index.js'
import { tenants, users, employees } from '../../db/schema/index.js'
import { eq, and, inArray } from 'drizzle-orm'
import { sendEmail, leaveNotificationEmail } from '../../plugins/email.js'
import { loadEnv } from '../../config/env.js'
import { generateReportPdf } from '../../lib/pdf.js'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    fastify.get('/', { ...auth, schema: { tags: ['Leave'] } }, async (request, reply) => {
        const { employeeId, department, status, leaveType, from, to, limit = '20', offset = '0' } = request.query as Record<string, string>
        // dept_head can only see leave requests for their own department.
        const resolvedDepartment = (request as any).user.role === 'dept_head'
            ? ((request as any).user.department ?? department)
            : department
        const result = await listLeaveRequests(request.user.tenantId, { employeeId, department: resolvedDepartment, status, leaveType, from, to, limit: Number(limit), offset: Number(offset) })
        return sendWithETag(reply, request, result)
    })

    fastify.post('/', {
        ...auth,
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const body = validate(createLeaveSchema, request.body)
        const leave = await createLeaveRequest(request.user.tenantId, body as never)

        // Notify HR managers, super admins, and the employee's dept_head (fire-and-forget)
        ;(async () => {
            try {
                const env = loadEnv()
                const appUrl = (env as any).APP_URL ?? ''

                // Fetch employee name and department in one query
                const [emp] = await db
                    .select({ firstName: employees.firstName, lastName: employees.lastName, department: employees.department })
                    .from(employees)
                    .where(and(eq(employees.id, body.employeeId), eq(employees.tenantId, request.user.tenantId)))
                    .limit(1)
                if (!emp) return

                const employeeName = `${emp.firstName} ${emp.lastName}`

                // Fetch all HR managers + super_admins, plus dept_heads in the same department
                const approvers = await db
                    .select({ name: users.name, email: users.email, role: users.role, department: users.department })
                    .from(users)
                    .where(and(
                        eq(users.tenantId, request.user.tenantId),
                        eq(users.isActive, true),
                        inArray(users.role, ['hr_manager', 'super_admin', 'dept_head'] as never[]),
                    ))

                // Filter dept_heads to only those in the same department; hr_manager/super_admin always notified
                const recipients = approvers.filter(u =>
                    u.role !== 'dept_head' || (emp.department && u.department === emp.department)
                )

                for (const recipient of recipients) {
                    if (!recipient.email) continue
                    const opts = leaveNotificationEmail({
                        managerName: recipient.name ?? 'Manager',
                        employeeName,
                        leaveType: body.leaveType.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                        startDate: body.startDate,
                        endDate: body.endDate,
                        approveUrl: `${appUrl}/leave`,
                    })
                    sendEmail({ ...opts, to: recipient.email }).catch(() => {})
                }
            } catch { /* non-fatal */ }
        })()

        return reply.code(201).send({ data: leave })
    })

    fastify.post('/:id/approve', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'dept_head', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const { approved, notes } = validate(leaveActionSchema, request.body)

        // dept_head can only approve leave for employees in their own department.
        if ((request as any).user.role === 'dept_head') {
            const dept = await getLeaveRequestOwnerDept(request.user.tenantId, id)
            if (dept && dept !== (request as any).user.department) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only approve leave for employees in your department' })
            }
        }

        const updated = await approveLeave(request.user.tenantId, id, request.user.id, request.user.email, approved, request.user.employeeId ?? null)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Leave request not found or already processed' })
        // Invalidate dashboard KPI cache — pendingLeave count changed
        cacheDel(`dashboard:kpis:${request.user.tenantId}`).catch(() => { })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'leave',
            entityId: id,
            action: approved ? 'approve' : 'reject',
            metadata: notes ? { notes } : undefined,
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })

    fastify.post('/:id/cancel', { ...auth, schema: { tags: ['Leave'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const updated = await cancelLeave(request.user.tenantId, id, request.user.email, request.user.role, request.user.employeeId ?? null)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Leave request not found' })
        cacheDel(`dashboard:kpis:${request.user.tenantId}`).catch(() => { })
        return reply.send({ data: updated })
    })

    // GET /leave/balance/:employeeId?year=2025
    fastify.get('/balance/:employeeId', {
        ...auth,
        schema: {
            tags: ['Leave'],
            params: { type: 'object', properties: { employeeId: { type: 'string', format: 'uuid' } }, required: ['employeeId'] },
            querystring: { type: 'object', properties: { year: { type: 'integer' } } },
        },
    }, async (request, reply) => {
        const { employeeId } = request.params as { employeeId: string }
        const user = request.user
        const isElevated = ['hr_manager', 'super_admin', 'dept_head', 'pro_officer'].includes(user.role)
        if (!isElevated && user.employeeId !== employeeId) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied' })
        }
        const { year = new Date().getFullYear() } = request.query as { year?: number }
        const balance = await getLeaveBalance(request.user.tenantId, employeeId, Number(year))
        if (!balance) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })
        return reply.send({ data: balance })
    })

    // ─── Leave Policies (per-tenant config) ─────────────────────────────
    fastify.get('/policies', { ...auth, schema: { tags: ['Leave'] } }, async (request, reply) => {
        const data = await listLeavePolicies(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.put('/policies', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const body = request.body as { policies: Array<{ leaveType: string; daysPerYear: number; accrualRule: 'flat' | 'monthly_2_then_30' | 'unlimited' | 'none'; maxCarryForward: number; carryExpiresAfterMonths: number }> }
        if (!body?.policies || !Array.isArray(body.policies)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'policies[] required' })
        }
        const data = await upsertLeavePolicies(request.user.tenantId, body.policies)
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'leave_policy', entityId: request.user.tenantId, action: 'update',
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data })
    })

    // POST /leave/rollover  { fromYear }
    fastify.post('/rollover', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        // Enforce rolloverEnabledFrom gate
        const [tenantRow] = await db
            .select({ leaveSettings: tenants.leaveSettings })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        const enabledFrom = tenantRow?.leaveSettings?.rolloverEnabledFrom
        if (enabledFrom) {
            const unlockDate = new Date(enabledFrom)
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            if (today < unlockDate) {
                return reply.code(403).send({
                    statusCode: 403,
                    error: 'Forbidden',
                    message: `Year-end rollover is locked until ${enabledFrom}. Update the date in Organization Settings → Leave Settings.`,
                })
            }
        }
        const { fromYear } = (request.body ?? {}) as { fromYear?: number }
        const year = Number(fromYear ?? new Date().getFullYear() - 1)
        const result = await rolloverYear(request.user.tenantId, year)
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'leave_balance', entityId: request.user.tenantId, action: 'submit', metadata: { rollover: result } as any,
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: result })
    })

    // POST /leave/balance/:employeeId/adjust  { leaveType, year, delta, reason }
    fastify.post('/balance/:employeeId/adjust', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { employeeId } = request.params as { employeeId: string }
        const { leaveType, year, delta, reason } = (request.body ?? {}) as { leaveType: string; year: number; delta: number; reason?: string }
        if (!leaveType || typeof year !== 'number' || typeof delta !== 'number') {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'leaveType, year, delta required' })
        }
        const balance = await adjustLeaveBalance(request.user.tenantId, employeeId, leaveType, year, delta, reason, request.user.id)
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'leave_balance', entityId: employeeId, action: 'update',
            metadata: { leaveType, year, delta, reason },
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: balance })
    })

    // ─── Leave Adjustments ────────────────────────────────────────────────────

    // GET /leave/adjustments?employeeId=&limit=&offset=
    fastify.get('/adjustments', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { employeeId, limit = '25', offset = '0' } = request.query as Record<string, string>
        const result = await listLeaveAdjustments(request.user.tenantId, {
            employeeId, limit: Number(limit), offset: Number(offset),
        })
        return reply.send(result)
    })

    // DELETE /leave/adjustments/:id  (reverses balance + soft-deletes)
    fastify.delete('/adjustments/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const row = await deleteLeaveAdjustment(request.user.tenantId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Adjustment not found' })
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'leave_adjustment', entityId: id, action: 'delete',
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: row })
    })

    // ─── Air Tickets ──────────────────────────────────────────────────────────

    // GET /leave/air-tickets?employeeId=&status=&limit=&offset=
    fastify.get('/air-tickets', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { employeeId, status, limit = '25', offset = '0' } = request.query as Record<string, string>
        const result = await listAirTickets(request.user.tenantId, {
            employeeId, status, limit: Number(limit), offset: Number(offset),
        })
        return reply.send(result)
    })

    // POST /leave/air-tickets
    fastify.post('/air-tickets', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const body = request.body as {
            employeeId: string; year: number; ticketFor: 'self' | 'family' | 'both';
            destination?: string; amount?: number; currency?: string; reason?: string; notes?: string
        }
        if (!body?.employeeId || !body?.year || !body?.ticketFor) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId, year, ticketFor required' })
        }
        const row = await createAirTicket(request.user.tenantId, { ...body, createdBy: request.user.id })
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'air_ticket', entityId: row.id, action: 'create',
            metadata: { employeeId: body.employeeId, year: body.year, ticketFor: body.ticketFor } as any,
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: row })
    })

    // PATCH /leave/air-tickets/:id
    fastify.patch('/air-tickets/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const body = request.body as Partial<{
            ticketFor: 'self' | 'family' | 'both'; destination: string; amount: number;
            currency: string; status: 'pending' | 'approved' | 'rejected' | 'used'; reason: string; notes: string
        }>
        const row = await updateAirTicket(request.user.tenantId, id, body)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Air ticket not found' })
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'air_ticket', entityId: id, action: 'update',
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: row })
    })

    // DELETE /leave/air-tickets/:id
    fastify.delete('/air-tickets/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const row = await deleteAirTicket(request.user.tenantId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Air ticket not found' })
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'air_ticket', entityId: id, action: 'delete',
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: row })
    })

    // ─── Leave Offsets ────────────────────────────────────────────────────────

    // GET /leave/offsets?employeeId=&status=&limit=&offset=
    fastify.get('/offsets', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { employeeId, status, limit = '25', offset = '0' } = request.query as Record<string, string>
        const result = await listLeaveOffsets(request.user.tenantId, {
            employeeId, status, limit: Number(limit), offset: Number(offset),
        })
        return reply.send(result)
    })

    // POST /leave/offsets
    fastify.post('/offsets', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const body = request.body as {
            employeeId: string; workDate: string; days?: number; reason?: string; notes?: string
        }
        if (!body?.employeeId || !body?.workDate) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId, workDate required' })
        }
        const row = await createLeaveOffset(request.user.tenantId, { ...body, createdBy: request.user.id })
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'leave_offset', entityId: row.id, action: 'create',
            metadata: { employeeId: body.employeeId, workDate: body.workDate, days: body.days } as any,
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: row })
    })

    // PATCH /leave/offsets/:id
    fastify.patch('/offsets/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const body = request.body as Partial<{
            workDate: string; days: number; reason: string; status: 'pending' | 'approved' | 'rejected'; notes: string
        }>
        const row = await updateLeaveOffset(request.user.tenantId, id, body)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Offset not found' })
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'leave_offset', entityId: id, action: 'update',
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: row })
    })

    // DELETE /leave/offsets/:id
    fastify.delete('/offsets/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const row = await deleteLeaveOffset(request.user.tenantId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Offset not found' })
        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'leave_offset', entityId: id, action: 'delete',
            ipAddress: (request as any).ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: row })
    })

    // GET /leave/export?format=csv|pdf&status=...&department=...&from=...&to=...
    fastify.get('/export', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Leave'] },
    }, async (request, reply) => {
        const { format = 'csv', ...filters } = request.query as Record<string, string>
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const { data } = await listLeaveRequests(request.user.tenantId, { ...filters, limit: 10000, offset: 0 })
        const dateStr = new Date().toISOString().slice(0, 10)

        if (format === 'pdf') {
            const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
            const pdf = await generateReportPdf({
                title: 'Leave Requests Report',
                companyName: tenantRow?.name ?? '',
                subtitle: filters.from && filters.to ? `${filters.from} – ${filters.to}` : undefined,
                columns: [
                    { header: 'Employee', key: 'employeeName', width: 130 },
                    { header: 'Department', key: 'employeeDepartment', width: 100 },
                    { header: 'Leave Type', key: 'leaveType', width: 90 },
                    { header: 'From', key: 'startDate', width: 70 },
                    { header: 'To', key: 'endDate', width: 70 },
                    { header: 'Days', key: 'days', width: 45, align: 'right' },
                    { header: 'Status', key: 'status', width: 70 },
                    { header: 'Reason', key: 'reason' },
                ],
                rows: data as Record<string, unknown>[],
            })
            reply.header('Content-Type', 'application/pdf')
            reply.header('Content-Disposition', `attachment; filename="leave-report-${dateStr}.pdf"`)
            return reply.send(pdf)
        }

        // CSV
        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const headers = ['Employee No', 'Employee Name', 'Department', 'Leave Type', 'Start Date', 'End Date', 'Days', 'Status', 'Reason']
        const lines = [headers.join(',')]
        for (const r of data as any[]) {
            lines.push([r.employeeNo, r.employeeName, r.employeeDepartment, r.leaveType, r.startDate, r.endDate, r.days, r.status, r.reason ?? ''].map(escape).join(','))
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', `attachment; filename="leave-export-${dateStr}.csv"`)
        return reply.send(lines.join('\r\n'))
    })
}

