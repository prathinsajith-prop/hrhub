import { and, desc, eq, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { employees, leaveBalances, leaveRequests, orgUnits } from '../../db/schema/index.js'
import { e400, e403, e404 } from '../../lib/errors.js'
import { recordActivity } from '../../lib/audit.js'
import { notifyRequester, notifyReviewers } from '../../lib/notify.js'
import {
    canAccessEmployee,
    isDeptHead,
    isElevated,
    resolveAllowedEmployeeIds,
} from '../../lib/scoping.js'
import {
    createLeaveSchema,
    leaveActionSchema,
    listLeaveSchema,
    parseUuidParam,
    validate,
} from '../../lib/validation.js'

function daysBetween(startISO: string, endISO: string): number {
    const start = new Date(startISO + 'T00:00:00Z').getTime()
    const end = new Date(endISO + 'T00:00:00Z').getTime()
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
    return Math.round((end - start) / 86400000) + 1
}

export default async function leaveRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /api/v1/leave — list requests. Employees see their own; dept_heads see their subtree; HR sees all.
    fastify.get('/', { ...auth }, async (request: any, reply: any) => {
        const query = validate(listLeaveSchema, request.query)
        const user = request.user

        const allowedEmployeeIds = await resolveAllowedEmployeeIds(user, request)

        if (allowedEmployeeIds !== null && allowedEmployeeIds.length === 0) {
            return reply.send({ data: [], total: 0, limit: query.limit, offset: query.offset, hasMore: false })
        }
        if (query.employeeId && allowedEmployeeIds !== null && !allowedEmployeeIds.includes(query.employeeId)) {
            return reply.code(403).send(e403("Not authorized to view this employee's leave"))
        }

        const conditions: any[] = [eq(leaveRequests.tenantId, user.tenantId)]
        if (allowedEmployeeIds !== null) conditions.push(inArray(leaveRequests.employeeId, allowedEmployeeIds))
        if (query.employeeId) conditions.push(eq(leaveRequests.employeeId, query.employeeId))
        if (query.status) conditions.push(eq(leaveRequests.status, query.status))
        if (query.leaveType) conditions.push(eq(leaveRequests.leaveType, query.leaveType as any))
        if (query.from) conditions.push(gte(leaveRequests.startDate, query.from))
        if (query.to) conditions.push(lte(leaveRequests.endDate, query.to))
        if (query.search) {
            conditions.push(
                or(
                    ilike(employees.firstName, `%${query.search}%`),
                    ilike(employees.lastName, `%${query.search}%`),
                    ilike(employees.employeeNo, `%${query.search}%`),
                ),
            )
        }

        // Self-join on employees via handoverTo so the manager sees the
        // chosen handover person by name (not just the FK uuid) when reviewing.
        // Every join is also tenant-bound — defence in depth so a stray FK
        // can't leak a name from another tenant. Department is resolved via
        // org_units (FK) with the legacy text column as fallback.
        const handover = alias(employees, 'handover') as any
        const rows = await db
            .select({
                request: leaveRequests,
                employeeFirstName: employees.firstName,
                employeeLastName: employees.lastName,
                employeeNo: employees.employeeNo,
                employeeDepartment: sql<string | null>`COALESCE(${orgUnits.name}, ${employees.department})`,
                handoverFirstName: handover.firstName,
                handoverLastName: handover.lastName,
                handoverDesignation: handover.designation,
                total: sql<number>`COUNT(*) OVER()`,
            })
            .from(leaveRequests)
            .innerJoin(employees, and(
                eq(leaveRequests.employeeId, employees.id),
                eq(employees.tenantId, user.tenantId),
            ))
            .leftJoin(orgUnits, and(
                eq(employees.departmentId, orgUnits.id),
                eq(orgUnits.tenantId, user.tenantId),
            ))
            .leftJoin(handover, and(
                eq(leaveRequests.handoverTo, handover.id),
                eq(handover.tenantId, user.tenantId),
            ))
            .where(and(...conditions))
            .orderBy(desc(leaveRequests.createdAt))
            .limit(query.limit)
            .offset(query.offset)

        const total = rows[0]?.total ?? 0
        const data = rows.map((r) => ({
            ...r.request,
            employeeName: `${r.employeeFirstName} ${r.employeeLastName}`,
            employeeNo: r.employeeNo,
            employeeDepartment: r.employeeDepartment,
            handoverToName: r.handoverFirstName
                ? `${r.handoverFirstName} ${r.handoverLastName ?? ''}`.trim()
                : null,
            handoverToDesignation: r.handoverDesignation ?? null,
        }))

        return reply.send({
            data,
            total: Number(total),
            limit: query.limit,
            offset: query.offset,
            hasMore: query.offset + data.length < Number(total),
        })
    })

    // POST /api/v1/leave — create a leave request
    fastify.post('/', { ...auth }, async (request: any, reply: any) => {
        const body = validate(createLeaveSchema, request.body)
        const user = request.user

        // Only HR roles may submit on behalf of someone else
        if (!isElevated(user) && body.employeeId !== user.employeeId) {
            return reply.code(403).send(e403('You can only create leave requests for yourself'))
        }

        const [employee] = await db
            .select()
            .from(employees)
            .where(and(eq(employees.tenantId, user.tenantId), eq(employees.id, body.employeeId)))
            .limit(1)
        if (!employee) return reply.code(404).send(e404('Employee not found'))

        const days = daysBetween(body.startDate, body.endDate)
        if (days <= 0) return reply.code(400).send(e400('Invalid date range'))

        const [created] = await db
            .insert(leaveRequests)
            .values({
                tenantId: user.tenantId,
                employeeId: body.employeeId,
                leaveType: body.leaveType,
                startDate: body.startDate,
                endDate: body.endDate,
                days,
                status: 'pending',
                reason: body.reason ?? null,
                handoverTo: body.handoverTo ?? null,
                handoverNotes: body.handoverNotes ?? null,
            } as any)
            .returning()

        recordActivity({
            tenantId: user.tenantId,
            userId: user.id,
            actorName: user.name,
            actorRole: user.role,
            entityType: 'leave_request',
            entityId: created.id,
            entityName: `${body.leaveType} ${body.startDate}→${body.endDate}`,
            action: 'submit',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        notifyReviewers({
            tenantId: user.tenantId,
            actorEmployeeId: body.employeeId,
            title: `${employee.firstName} ${employee.lastName} requested ${body.leaveType} leave`,
            message: `${days} day${days === 1 ? '' : 's'}: ${body.startDate} → ${body.endDate}`,
            actionUrl: '/leave?status=pending',
        }).catch((err) => request.log?.warn?.({ err }, 'leave submit notification failed'))

        return reply.code(201).send({ data: created })
    })

    // POST /api/v1/leave/:id/cancel — owner, manager-of-owner, or HR can cancel a pending request
    fastify.post('/:id/cancel', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return
        const user = request.user

        const [existing] = await db
            .select()
            .from(leaveRequests)
            .where(and(eq(leaveRequests.tenantId, user.tenantId), eq(leaveRequests.id, id)))
            .limit(1)
        if (!existing) return reply.code(404).send(e404('Leave request not found'))
        if (existing.status !== 'pending') return reply.code(400).send(e400('Only pending requests can be cancelled'))

        if (!(await canAccessEmployee(user, existing.employeeId, request))) {
            return reply.code(403).send(e403('Not authorized to cancel this request'))
        }

        const [updated] = await db
            .update(leaveRequests)
            .set({ status: 'cancelled', updatedAt: new Date() } as any)
            .where(eq(leaveRequests.id, id))
            .returning()

        recordActivity({
            tenantId: user.tenantId,
            userId: user.id,
            actorName: user.name,
            actorRole: user.role,
            entityType: 'leave_request',
            entityId: id,
            action: 'reject',
            metadata: { reason: 'cancelled' },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        return reply.send({ data: updated })
    })

    // POST /api/v1/leave/:id/approve — dept_head approves/rejects a request from their subtree; HR can approve any
    fastify.post('/:id/approve', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return
        const user = request.user
        const body = validate(leaveActionSchema, request.body)

        if (!isElevated(user) && !isDeptHead(user)) {
            return reply.code(403).send(e403('Manager privileges required'))
        }

        const [existing] = await db
            .select()
            .from(leaveRequests)
            .where(and(eq(leaveRequests.tenantId, user.tenantId), eq(leaveRequests.id, id)))
            .limit(1)
        if (!existing) return reply.code(404).send(e404('Leave request not found'))
        if (existing.status !== 'pending') {
            return reply.code(400).send(e400('Only pending requests can be approved or rejected'))
        }

        // Self-approval guard: you cannot approve your own leave even if you're a dept_head/HR.
        if (existing.employeeId === user.employeeId) {
            return reply.code(403).send(e403('You cannot approve your own leave request'))
        }

        if (!isElevated(user) && !(await canAccessEmployee(user, existing.employeeId, request))) {
            return reply.code(403).send(e403('You can only approve requests from your team'))
        }

        const newStatus = body.approved ? 'approved' : 'rejected'
        const [updated] = await db
            .update(leaveRequests)
            .set({
                status: newStatus,
                approvedBy: user.id,
                approvedAt: new Date(),
                updatedAt: new Date(),
                reason: body.notes ? `${existing.reason ?? ''}\n[Manager note] ${body.notes}` : existing.reason,
            } as any)
            .where(eq(leaveRequests.id, id))
            .returning()

        recordActivity({
            tenantId: user.tenantId,
            userId: user.id,
            actorName: user.name,
            actorRole: user.role,
            entityType: 'leave_request',
            entityId: id,
            action: body.approved ? 'approve' : 'reject',
            metadata: body.notes ? { notes: body.notes } : undefined,
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})

        const dateRange = `${existing.startDate} → ${existing.endDate}`
        const dayLabel = `${existing.days} day${existing.days === 1 ? '' : 's'}`

        // ── Notify the requester ─────────────────────────────────────────
        notifyRequester({
            tenantId: user.tenantId,
            employeeId: existing.employeeId,
            type: body.approved ? 'success' : 'warning',
            title: body.approved
                ? `Your ${existing.leaveType} leave was approved`
                : `Your ${existing.leaveType} leave was rejected`,
            message: body.approved
                ? `${dayLabel}: ${dateRange}`
                : (body.notes ?? 'See the leave page for details.'),
            actionUrl: '/me/leave',
        }).catch((err) => request.log?.warn?.({ err }, 'leave decision notification failed'))

        // ── Notify the handover person — only on approval, so we don't
        // bother them with a heads-up that may still be rejected. We resolve
        // the requester's name in one round-trip so the message reads naturally.
        if (body.approved && existing.handoverTo) {
            db
                .select({
                    firstName: employees.firstName,
                    lastName: employees.lastName,
                })
                .from(employees)
                .where(
                    and(
                        eq(employees.tenantId, user.tenantId),
                        eq(employees.id, existing.employeeId),
                    ),
                )
                .limit(1)
                .then(([requester]) => {
                    const requesterName = requester
                        ? `${requester.firstName} ${requester.lastName ?? ''}`.trim()
                        : 'A colleague'
                    return notifyRequester({
                        tenantId: user.tenantId,
                        employeeId: existing.handoverTo!,
                        type: 'info',
                        title: `You're covering for ${requesterName}`,
                        message: existing.handoverNotes
                            ? `${dayLabel}: ${dateRange} — "${existing.handoverNotes}"`
                            : `${dayLabel}: ${dateRange}`,
                        actionUrl: '/me/leave',
                    })
                })
                .catch((err) => request.log?.warn?.({ err }, 'handover notification failed'))
        }

        return reply.send({ data: updated })
    })

    // GET /api/v1/leave/balance/:employeeId?year=2026 — stored balance rows summarised per leave type
    fastify.get('/balance/:employeeId', { ...auth }, async (request: any, reply: any) => {
        const empId = parseUuidParam(request.params, 'employeeId', reply)
        if (!empId) return
        const user = request.user

        if (!(await canAccessEmployee(user, empId, request))) {
            return reply.code(403).send(e403('Not authorized'))
        }

        const year = Number((request.query as any)?.year ?? new Date().getFullYear())

        const rows = await db
            .select()
            .from(leaveBalances)
            .where(
                and(
                    eq(leaveBalances.tenantId, user.tenantId),
                    eq(leaveBalances.employeeId, empId),
                    eq(leaveBalances.year, year),
                ),
            )

        const balance: Record<string, any> = {}
        for (const r of rows) {
            const opening = Number(r.openingBalance)
            const accrued = Number(r.accrued)
            const carriedForward = Number(r.carriedForward)
            const taken = Number(r.taken)
            const adjustment = Number(r.adjustment)
            balance[r.leaveType] = {
                entitled: opening,
                accrued,
                carriedForward,
                carryExpiresOn: r.carryExpiresOn,
                taken,
                adjustment,
                available: opening + accrued + carriedForward + adjustment - taken,
                unlimited: false,
            }
        }

        return reply.send({ data: { employeeId: empId, year, balance } })
    })
}
