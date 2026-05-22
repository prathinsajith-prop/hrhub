/**
 * Travel module — REST routes.
 *
 * Routes are split into two resource groups:
 *
 *   /travel/requests        — the trips
 *   /travel/expenses        — the per-trip line items
 *
 * Scoping is enforced at the route layer so a malformed permission matrix on
 * the frontend can't be exploited: employees see only their own requests,
 * dept_head sees their department's subtree, hr_manager/super_admin see all.
 *
 * Every mutating endpoint logs an activity row via recordActivity — fire-
 * and-forget, never blocks the response.
 */
import { z } from 'zod'
import { recordActivity } from '../audit/audit.service.js'
import {
    createTravelExpense,
    createTravelRequest,
    getTravelExpenseTotals,
    getTravelRequestById,
    listTravelExpenses,
    listTravelRequests,
    listTravelRequestsForScope,
    resolveTravelRequestScope,
    softDeleteTravelExpense,
    softDeleteTravelRequest,
    transitionTravelExpense,
    transitionTravelRequest,
    updateTravelExpense,
    updateTravelRequest,
} from './travel.service.js'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

// Zod schemas live in this file (not lib/validation) because they're only used
// by travel routes — keeps lib/validation lean.
const createRequestSchema = z.object({
    employeeId: z.string().uuid().optional(),
    placeOfVisit: z.string().max(200).optional().nullable(),
    departureDate: z.string().regex(ISO_DATE, 'departureDate must be YYYY-MM-DD'),
    arrivalDate: z.string().regex(ISO_DATE, 'arrivalDate must be YYYY-MM-DD'),
    purposeOfVisit: z.string().max(500).optional().nullable(),
    customerName: z.string().max(200).optional().nullable(),
    isBillableToCustomer: z.boolean().optional(),
    notes: z.string().max(2000).optional().nullable(),
})

const updateRequestSchema = z.object({
    placeOfVisit: z.string().max(200).optional().nullable(),
    departureDate: z.string().regex(ISO_DATE).optional(),
    arrivalDate: z.string().regex(ISO_DATE).optional(),
    purposeOfVisit: z.string().max(500).optional().nullable(),
    customerName: z.string().max(200).optional().nullable(),
    isBillableToCustomer: z.boolean().optional(),
    notes: z.string().max(2000).optional().nullable(),
})

const transitionSchema = z.object({
    rejectionReason: z.string().max(1000).optional().nullable(),
})

const expenseAmountField = z.union([z.number(), z.string()]).optional()
const createExpenseSchema = z.object({
    travelRequestId: z.string().uuid(),
    description: z.string().max(500).optional().nullable(),
    expenseDate: z.string().regex(ISO_DATE),
    ticket: expenseAmountField,
    lodging: expenseAmountField,
    boarding: expenseAmountField,
    phone: expenseAmountField,
    localConveyance: expenseAmountField,
    incidentals: expenseAmountField,
    others: expenseAmountField,
    currency: z.string().length(3).optional(),
    receiptS3Key: z.string().max(500).optional().nullable(),
})

const updateExpenseSchema = z.object({
    description: z.string().max(500).optional().nullable(),
    expenseDate: z.string().regex(ISO_DATE).optional(),
    ticket: expenseAmountField,
    lodging: expenseAmountField,
    boarding: expenseAmountField,
    phone: expenseAmountField,
    localConveyance: expenseAmountField,
    incidentals: expenseAmountField,
    others: expenseAmountField,
    currency: z.string().length(3).optional(),
    receiptS3Key: z.string().max(500).optional().nullable(),
})

/**
 * Run a Zod safeParse and either send a 400 + return null, or return the
 * parsed payload. Routes use:
 *
 *   const body = parseBody(reply, schema, request.body)
 *   if (!body) return  // 400 already sent
 *
 * Avoids the discriminated-union narrowing pitfalls of returning a result
 * object — TypeScript loses the narrowing when the function is generic.
 */
function parseBody<T extends z.ZodTypeAny>(
    reply: any,
    schema: T,
    value: unknown,
): z.infer<T> | null {
    const result = schema.safeParse(value)
    if (result.success) return result.data
    const first = result.error.issues[0]
    const message = first ? `${first.path.join('.')}: ${first.message}` : 'Invalid payload'
    reply.code(400).send({ statusCode: 400, error: 'Bad Request', message })
    return null
}

export default async function travelRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [(fastify as any).authenticate] }
    const hrOnly = { preHandler: [(fastify as any).authenticate, (fastify as any).requireRole('hr_manager', 'super_admin')] }

    // ─── Travel requests ────────────────────────────────────────────────────

    // GET /api/v1/travel/requests
    fastify.get('/requests', { ...auth, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const qs = request.query as Record<string, string | undefined>
        const filter = {
            employeeId: qs.employeeId,
            status: qs.status as any,
            from: qs.from,
            to: qs.to,
            search: qs.search,
            limit: qs.limit ? Number(qs.limit) : undefined,
            offset: qs.offset ? Number(qs.offset) : undefined,
        }
        const user = request.user
        const scope = await resolveTravelRequestScope(user.tenantId, {
            role: user.role,
            employeeId: user.employeeId ?? null,
            department: user.department ?? null,
        })
        if (scope === null) {
            // HR/super_admin — no scoping.
            return reply.send(await listTravelRequests(user.tenantId, filter))
        }
        if (scope.length === 0) {
            return reply.send({ data: [], total: 0, limit: filter.limit ?? 50, offset: filter.offset ?? 0, hasMore: false })
        }
        // Refuse a cross-scope employeeId filter (e.g. an employee asking
        // for someone else's trips). Returning 403 makes the failure mode
        // explicit instead of silently empty.
        if (filter.employeeId && !scope.includes(filter.employeeId)) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Not authorized to view this employee\'s travel' })
        }
        return reply.send(await listTravelRequestsForScope(user.tenantId, scope, filter))
    })

    // GET /api/v1/travel/requests/:id
    fastify.get('/requests/:id', { ...auth, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const { id } = request.params as { id: string }
        const row = await getTravelRequestById(request.user.tenantId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Travel request not found' })
        // Enforce per-row scope (the resolver returns hard ids only; here
        // we re-check because the GET endpoint accepts arbitrary uuids).
        const ok = await viewerCanSeeRequest(request.user, row.employeeId)
        if (!ok) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Not authorized to view this travel request' })
        return reply.send({ data: row })
    })

    // POST /api/v1/travel/requests
    // Employees can only create requests for themselves; HR can target anyone.
    fastify.post('/requests', { ...auth, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const body = parseBody(reply, createRequestSchema, request.body)
        if (!body) return
        const user = request.user

        const isElevated = ['hr_manager', 'super_admin'].includes(user.role)
        const employeeId = isElevated
            ? (body.employeeId ?? user.employeeId)
            : user.employeeId
        if (!employeeId) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId required' })
        }
        if (!isElevated && body.employeeId && body.employeeId !== user.employeeId) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Cannot create travel requests for other employees' })
        }

        try {
            const row = await createTravelRequest(user.tenantId, {
                employeeId,
                placeOfVisit: body.placeOfVisit,
                departureDate: body.departureDate,
                arrivalDate: body.arrivalDate,
                purposeOfVisit: body.purposeOfVisit,
                customerName: body.customerName,
                isBillableToCustomer: body.isBillableToCustomer,
                notes: body.notes,
            }, user.id)

            recordActivity({
                tenantId: user.tenantId,
                userId: user.id,
                actorName: user.name,
                actorRole: user.role,
                entityType: 'travel_request',
                entityId: row.id,
                entityName: row.travelNo,
                action: 'create',
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            return reply.code(201).send({ data: row })
        } catch (err: any) {
            const code = err?.statusCode ?? 500
            return reply.code(code).send({ statusCode: code, error: code === 400 ? 'Bad Request' : 'Internal Server Error', message: err?.message ?? 'Failed to create travel request' })
        }
    })

    // PATCH /api/v1/travel/requests/:id — only the owner or HR can edit, and
    // only while the request is still in draft/submitted.
    fastify.patch('/requests/:id', { ...auth, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const { id } = request.params as { id: string }
        const body = parseBody(reply, updateRequestSchema, request.body)
        if (!body) return

        const existing = await getTravelRequestById(request.user.tenantId, id)
        if (!existing) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Travel request not found' })
        if (!await viewerCanMutateRequest(request.user, existing.employeeId)) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Not authorized to edit this travel request' })
        }

        try {
            const row = await updateTravelRequest(request.user.tenantId, id, body)
            if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Travel request not found' })
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'travel_request',
                entityId: id,
                entityName: existing.travelNo,
                action: 'update',
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            return reply.send({ data: row })
        } catch (err: any) {
            const code = err?.statusCode ?? 500
            return reply.code(code).send({ statusCode: code, error: code === 409 ? 'Conflict' : code === 400 ? 'Bad Request' : 'Internal Server Error', message: err?.message })
        }
    })

    // Status transitions — one endpoint per verb keeps the audit log clean and
    // gives each verb its own role guard.
    for (const verb of ['submit', 'cancel'] as const) {
        const to = verb === 'submit' ? 'submitted' : 'cancelled'
        fastify.post(`/requests/:id/${verb}`, { ...auth, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
            const { id } = request.params as { id: string }
            const existing = await getTravelRequestById(request.user.tenantId, id)
            if (!existing) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Travel request not found' })
            if (!await viewerCanMutateRequest(request.user, existing.employeeId)) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Not authorized' })
            }
            try {
                const row = await transitionTravelRequest(request.user.tenantId, id, to, { userId: request.user.id })
                if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Travel request not found' })
                recordActivity({
                    tenantId: request.user.tenantId,
                    userId: request.user.id,
                    actorName: request.user.name,
                    actorRole: request.user.role,
                    entityType: 'travel_request',
                    entityId: id,
                    entityName: existing.travelNo,
                    action: verb === 'submit' ? 'submit' : 'update',
                    metadata: { status: to },
                    ipAddress: request.ip,
                    userAgent: request.headers['user-agent'],
                }).catch(() => { })
                return reply.send({ data: row })
            } catch (err: any) {
                const code = err?.statusCode ?? 500
                return reply.code(code).send({ statusCode: code, error: code === 409 ? 'Conflict' : 'Bad Request', message: err?.message })
            }
        })
    }

    // Approve / reject — HR only.
    fastify.post('/requests/:id/approve', { ...hrOnly, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const { id } = request.params as { id: string }
        const existing = await getTravelRequestById(request.user.tenantId, id)
        if (!existing) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Travel request not found' })
        try {
            const row = await transitionTravelRequest(request.user.tenantId, id, 'approved', { userId: request.user.id })
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'travel_request',
                entityId: id,
                entityName: existing.travelNo,
                action: 'approve',
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            return reply.send({ data: row })
        } catch (err: any) {
            const code = err?.statusCode ?? 500
            return reply.code(code).send({ statusCode: code, error: code === 409 ? 'Conflict' : 'Bad Request', message: err?.message })
        }
    })

    fastify.post('/requests/:id/reject', { ...hrOnly, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const { id } = request.params as { id: string }
        const body = parseBody(reply, transitionSchema, request.body ?? {})
        if (!body) return
        const existing = await getTravelRequestById(request.user.tenantId, id)
        if (!existing) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Travel request not found' })
        try {
            const row = await transitionTravelRequest(request.user.tenantId, id, 'rejected', {
                userId: request.user.id,
                rejectionReason: body.rejectionReason ?? null,
            })
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'travel_request',
                entityId: id,
                entityName: existing.travelNo,
                action: 'reject',
                metadata: { reason: body.rejectionReason ?? null },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            return reply.send({ data: row })
        } catch (err: any) {
            const code = err?.statusCode ?? 500
            return reply.code(code).send({ statusCode: code, error: code === 409 ? 'Conflict' : 'Bad Request', message: err?.message })
        }
    })

    fastify.post('/requests/:id/complete', { ...hrOnly, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const { id } = request.params as { id: string }
        const existing = await getTravelRequestById(request.user.tenantId, id)
        if (!existing) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Travel request not found' })
        try {
            const row = await transitionTravelRequest(request.user.tenantId, id, 'completed', { userId: request.user.id })
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'travel_request',
                entityId: id,
                entityName: existing.travelNo,
                action: 'update',
                metadata: { status: 'completed' },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            return reply.send({ data: row })
        } catch (err: any) {
            const code = err?.statusCode ?? 500
            return reply.code(code).send({ statusCode: code, error: code === 409 ? 'Conflict' : 'Bad Request', message: err?.message })
        }
    })

    // DELETE /api/v1/travel/requests/:id — soft delete (HR only). Cascade-
    // deletes attached expense rows through the FK ON DELETE CASCADE.
    // Soft variant just sets deleted_at; the rows physically remain.
    fastify.delete('/requests/:id', { ...hrOnly, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const { id } = request.params as { id: string }
        const existing = await getTravelRequestById(request.user.tenantId, id)
        if (!existing) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Travel request not found' })
        await softDeleteTravelRequest(request.user.tenantId, id)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'travel_request',
            entityId: id,
            entityName: existing.travelNo,
            action: 'delete',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })

    // ─── Travel expenses ────────────────────────────────────────────────────

    // GET /api/v1/travel/requests/:id/expenses — child collection.
    fastify.get('/requests/:id/expenses', { ...auth, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const { id } = request.params as { id: string }
        const parent = await getTravelRequestById(request.user.tenantId, id)
        if (!parent) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Travel request not found' })
        if (!await viewerCanSeeRequest(request.user, parent.employeeId)) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Not authorized' })
        }
        const data = await listTravelExpenses(request.user.tenantId, { travelRequestId: id })
        const totals = await getTravelExpenseTotals(request.user.tenantId, id)
        return reply.send({ data, totals })
    })

    // GET /api/v1/travel/expenses — flat list (HR + dept_head views).
    fastify.get('/expenses', { ...auth, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const qs = request.query as Record<string, string | undefined>
        const user = request.user
        const scope = await resolveTravelRequestScope(user.tenantId, {
            role: user.role,
            employeeId: user.employeeId ?? null,
            department: user.department ?? null,
        })
        if (scope === null) {
            return reply.send({ data: await listTravelExpenses(user.tenantId, { status: qs.status as any }) })
        }
        if (scope.length === 0) return reply.send({ data: [] })
        // Multi-scope: filter by employeeId (single) or fall back to the
        // single-id path. For dept_head with N employees, we issue N parallel
        // queries — typically the dept is small, so this is fine.
        // The cheaper alternative would be adding inArray support to
        // listTravelExpenses; left for later if profiling shows a need.
        if (scope.length === 1) {
            return reply.send({ data: await listTravelExpenses(user.tenantId, { employeeId: scope[0], status: qs.status as any }) })
        }
        const lists = await Promise.all(
            scope.map((empId) => listTravelExpenses(user.tenantId, { employeeId: empId, status: qs.status as any })),
        )
        return reply.send({ data: lists.flat() })
    })

    // POST /api/v1/travel/expenses
    fastify.post('/expenses', { ...auth, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const body = parseBody(reply, createExpenseSchema, request.body)
        if (!body) return

        const parent = await getTravelRequestById(request.user.tenantId, body.travelRequestId)
        if (!parent) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Travel request not found' })
        if (!await viewerCanMutateRequest(request.user, parent.employeeId)) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Not authorized to add expenses for this request' })
        }

        try {
            const row = await createTravelExpense(request.user.tenantId, body, request.user.id)
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'travel_expense',
                entityId: row.id,
                entityName: `${parent.travelNo} · ${row.expenseDate}`,
                action: 'create',
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            return reply.code(201).send({ data: row })
        } catch (err: any) {
            const code = err?.statusCode ?? 500
            return reply.code(code).send({ statusCode: code, error: code === 409 ? 'Conflict' : 'Bad Request', message: err?.message })
        }
    })

    fastify.patch('/expenses/:id', { ...auth, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const { id } = request.params as { id: string }
        const body = parseBody(reply, updateExpenseSchema, request.body)
        if (!body) return
        try {
            const row = await updateTravelExpense(request.user.tenantId, id, body)
            if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Expense not found' })
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'travel_expense',
                entityId: id,
                entityName: `${row.expenseDate}`,
                action: 'update',
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            return reply.send({ data: row })
        } catch (err: any) {
            const code = err?.statusCode ?? 500
            return reply.code(code).send({ statusCode: code, error: code === 409 ? 'Conflict' : 'Bad Request', message: err?.message })
        }
    })

    for (const verb of ['approve', 'reject', 'reimburse'] as const) {
        const to = verb === 'approve' ? 'approved' : verb === 'reject' ? 'rejected' : 'reimbursed'
        fastify.post(`/expenses/:id/${verb}`, { ...hrOnly, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
            const { id } = request.params as { id: string }
            // Only the reject path expects a body (the rejection reason).
            // Approve / reimburse skip parsing entirely.
            let rejectionReason: string | null = null
            if (verb === 'reject') {
                const body = parseBody(reply, transitionSchema, request.body ?? {})
                if (!body) return
                rejectionReason = body.rejectionReason ?? null
            }
            try {
                const row = await transitionTravelExpense(request.user.tenantId, id, to, {
                    userId: request.user.id,
                    rejectionReason,
                })
                if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Expense not found' })
                recordActivity({
                    tenantId: request.user.tenantId,
                    userId: request.user.id,
                    actorName: request.user.name,
                    actorRole: request.user.role,
                    entityType: 'travel_expense',
                    entityId: id,
                    entityName: `${row.expenseDate}`,
                    action: verb === 'approve' ? 'approve' : verb === 'reject' ? 'reject' : 'update',
                    metadata: { status: to, ...(verb === 'reject' ? { reason: rejectionReason } : {}) },
                    ipAddress: request.ip,
                    userAgent: request.headers['user-agent'],
                }).catch(() => { })
                return reply.send({ data: row })
            } catch (err: any) {
                const code = err?.statusCode ?? 500
                return reply.code(code).send({ statusCode: code, error: 'Bad Request', message: err?.message })
            }
        })
    }

    fastify.delete('/expenses/:id', { ...hrOnly, schema: { tags: ['Travel'] } }, async (request: any, reply) => {
        const { id } = request.params as { id: string }
        const row = await softDeleteTravelExpense(request.user.tenantId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Expense not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'travel_expense',
            entityId: id,
            entityName: `${row.expenseDate}`,
            action: 'delete',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })
}

// ─── Scope helpers shared across handlers ───────────────────────────────────

/** Can this viewer see a travel request owned by the given employeeId? */
async function viewerCanSeeRequest(
    viewer: { tenantId: string; role: string; employeeId: string | null; department: string | null },
    requestEmployeeId: string,
): Promise<boolean> {
    if (viewer.role === 'hr_manager' || viewer.role === 'super_admin') return true
    if (viewer.role === 'dept_head') {
        const scope = await resolveTravelRequestScope(viewer.tenantId, {
            role: viewer.role,
            employeeId: viewer.employeeId,
            department: viewer.department,
        })
        return scope === null || scope.includes(requestEmployeeId)
    }
    return viewer.employeeId === requestEmployeeId
}

/**
 * Can this viewer MUTATE (edit / delete / add expense to) the request? The
 * rules are tighter than viewing — dept_head can VIEW but not mutate their
 * subordinates' trips. Only the owner + HR can mutate.
 */
async function viewerCanMutateRequest(
    viewer: { tenantId: string; role: string; employeeId: string | null },
    requestEmployeeId: string,
): Promise<boolean> {
    if (viewer.role === 'hr_manager' || viewer.role === 'super_admin') return true
    return viewer.employeeId === requestEmployeeId
}
