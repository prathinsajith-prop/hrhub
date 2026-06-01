import { z } from 'zod'
import { calculateSettlement, initiateExit, getExitRequests, getExitRequest, approveExit, rejectExit, markSettlementPaid, getMyOpenExit } from './exit.service.js'
import { getExitApprovalReadiness, listInterviewQuestions, listInterviewResponses, submitInterviewResponses } from '../offboardingFlow/offboarding.service.js'
import { verifyExitInterviewToken } from '../../lib/exit-interview-tokens.js'
import { generateReportPdf } from '../../lib/pdf.js'
import { db } from '../../db/index.js'
import { tenants } from '../../db/schema/index.js'
import { eq } from 'drizzle-orm'
import { recordActivity } from '../audit/audit.service.js'

const initiateExitSchema = z.object({
    employeeId: z.string().uuid(),
    exitType: z.enum(['resignation', 'termination', 'contract_end', 'retirement']),
    exitDate: z.string().min(1),
    lastWorkingDay: z.string().min(1),
    noticePeriodDays: z.number().optional(),
    reason: z.string().optional(),
    notes: z.string().optional(),
    deductions: z.number().optional(),
})

export async function exitRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/my-exit — the current employee's most recent non-rejected
    // exit, or null if none exists. Drives the employee-portal exit-interview
    // page + Home CTA. Auth-only (no role gate) because every authenticated
    // user can read their own row.
    fastify.get('/my-exit', { ...auth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        if (!request.user.employeeId) {
            return reply.send({ data: null })
        }
        const data = await getMyOpenExit(request.user.tenantId, request.user.employeeId)
        return reply.send({ data })
    })

    // GET /api/v1/my-exit/interview — questions catalog + the employee's own
    // prior responses, bundled in one call so the portal page can render with
    // a single round trip. Resolves the exitId from the user's own employeeId;
    // returns 404 when no open exit exists.
    fastify.get('/my-exit/interview', { ...auth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        if (!request.user.employeeId) {
            return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'No exit on file' })
        }
        const exit = await getMyOpenExit(request.user.tenantId, request.user.employeeId)
        if (!exit) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'No exit on file' })
        const [questions, responses] = await Promise.all([
            listInterviewQuestions(request.user.tenantId),
            listInterviewResponses(request.user.tenantId, exit.id),
        ])
        return reply.send({ data: { exit, questions: questions.filter(q => q.isActive), responses } })
    })

    // GET /api/v1/exit/settlement-preview?employeeId=&exitDate=&exitType=&deductions=
    // Employees may only preview their own settlement; HR roles can preview any employee's.
    fastify.get('/exit/settlement-preview', { ...auth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { employeeId, exitDate, exitType, deductions } = request.query as Record<string, string>
        if (!employeeId || !exitDate || !exitType) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'employeeId, exitDate and exitType are required' })
        }
        const isElevated = ['hr_manager', 'super_admin'].includes(request.user.role)
        if (!isElevated && employeeId !== request.user.employeeId) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only preview your own settlement.' })
        }
        const data = await calculateSettlement(request.user.tenantId, employeeId, exitDate, exitType, Number(deductions ?? 0))
        return reply.send({ data })
    })

    // POST /api/v1/exit
    fastify.post('/exit', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const parse = initiateExitSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await initiateExit(request.user.tenantId, parse.data as any)
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'exit_request', entityId: data.request.id, entityName: data.settlement.employeeName, action: 'create', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        if (data.request.employeeId) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'employee',
                entityId: data.request.employeeId,
                entityName: data.settlement.employeeName,
                action: 'submit',
                metadata: {
                    kind: 'exit',
                    subKind: 'initiate',
                    exitRequestId: data.request.id,
                    exitDate: (data.request as any).exitDate,
                    exitType: (data.request as any).exitType,
                },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        return reply.code(201).send({ data })
    })

    // GET /api/v1/exit — HR only; exit records contain confidential settlement and financial data
    fastify.get('/exit', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { limit = '50', offset = '0', status, q, filter } = request.query as Record<string, string>
        if (filter && filter.length > 2000) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'filter param too long' })
        const result = await getExitRequests(request.user.tenantId, {
            limit: Number(limit), offset: Number(offset), status, q, filter,
        })
        return reply.send(result)
    })

    // GET /api/v1/exit/:id — HR only
    fastify.get('/exit/:id', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await getExitRequest(request.user.tenantId, id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found' })
        return reply.send({ data })
    })

    // GET /api/v1/exit/:id/readiness — clearance-pending check used by the
    // approval UI. Returns the full readiness payload (clearance counts,
    // interview submission, document count, canApprove flag).
    fastify.get('/exit/:id/readiness', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any) => {
        const { id } = request.params as { id: string }
        const data = await getExitApprovalReadiness(request.user.tenantId, id)
        return { data }
    })

    // PATCH /api/v1/exit/:id/approve
    // Refuses when clearances are pending unless the caller passes
    // { override: true } in the body — HR escape hatch, audit-logged.
    fastify.patch('/exit/:id/approve', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const { override = false } = (request.body ?? {}) as { override?: boolean }
        const data = await approveExit(request.user.tenantId, id, request.user.id, { override })
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found or not pending' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'exit_request', entityId: id, entityName: (data as any).employeeName, action: 'approve', metadata: override ? { override: true } : undefined, ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        if ((data as any).employeeId) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'employee',
                entityId: (data as any).employeeId,
                entityName: (data as any).employeeName,
                action: 'approve',
                metadata: { kind: 'exit', subKind: 'approve', exitRequestId: id, override },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        return reply.send({ data })
    })

    // PATCH /api/v1/exit/:id/reject
    fastify.patch('/exit/:id/reject', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const { reason } = (request.body ?? {}) as { reason?: string }
        const data = await rejectExit(request.user.tenantId, id, request.user.id, reason)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found or not pending' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'exit_request', entityId: id, entityName: (data as any).employeeName, action: 'reject', metadata: reason ? { reason } : undefined, ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        if ((data as any).employeeId) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'employee',
                entityId: (data as any).employeeId,
                entityName: (data as any).employeeName,
                action: 'reject',
                metadata: { kind: 'exit', subKind: 'reject', exitRequestId: id, reason: reason ?? null },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        return reply.send({ data })
    })

    // PATCH /api/v1/exit/:id/settlement-paid
    fastify.patch('/exit/:id/settlement-paid', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await markSettlementPaid(request.user.tenantId, id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found or not approved' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'exit_request', entityId: id, entityName: (data as any).employeeName, action: 'update', metadata: { settlementPaid: true }, ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        if ((data as any).employeeId) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'employee',
                entityId: (data as any).employeeId,
                entityName: (data as any).employeeName,
                action: 'update',
                metadata: { kind: 'exit', subKind: 'settlement-paid', exitRequestId: id },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        return reply.send({ data })
    })

    // GET /api/v1/exit/export?format=csv|pdf
    fastify.get('/exit/export', { ...adminAuth, schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const { format = 'csv', status } = request.query as Record<string, string>
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const { data: rows } = await getExitRequests(request.user.tenantId, { limit: 10_000, offset: 0, status })
        const dateStr = new Date().toISOString().slice(0, 10)

        if (format === 'pdf') {
            const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
            const pdf = await generateReportPdf({
                title: 'Employee Exit Report',
                companyName: tenantRow?.name ?? '',
                columns: [
                    { header: 'Employee', key: 'employeeName', width: 120 },
                    { header: 'Emp No', key: 'employeeNo', width: 70 },
                    { header: 'Department', key: 'employeeDepartment', width: 90 },
                    { header: 'Exit Type', key: 'exitType', width: 80 },
                    { header: 'Exit Date', key: 'exitDate', width: 75 },
                    { header: 'Status', key: 'status', width: 70 },
                    { header: 'Total Settlement (AED)', key: 'totalSettlement', width: 110, align: 'right', currency: true },
                    { header: 'Settled', key: 'settlementPaid' },
                ],
                rows,
            })
            reply.header('Content-Type', 'application/pdf')
            reply.header('Content-Disposition', `attachment; filename="exit-report-${dateStr}.pdf"`)
            return reply.send(pdf)
        }

        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const headers = ['Employee No', 'Employee Name', 'Department', 'Exit Type', 'Exit Date', 'Last Working Day', 'Status', 'Gratuity (AED)', 'Leave Encashment (AED)', 'Total Settlement (AED)', 'Settlement Paid']
        const lines = [headers.join(',')]
        for (const r of rows) {
            lines.push([r.employeeNo, r.employeeName, r.employeeDepartment, r.exitType, r.exitDate, r.lastWorkingDay, r.status, r.gratuityAmount ?? '', r.leaveEncashmentAmount ?? '', r.totalSettlement ?? '', r.settlementPaid ? 'Yes' : 'No'].map(escape).join(','))
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', `attachment; filename="exit-export-${dateStr}.csv"`)
        return reply.send(lines.join('\r\n'))
    })

    // ── Public token-validated routes ─────────────────────────────────────
    // Lets HR send "complete your exit interview" emails with a one-click
    // link. The token carries the tenant + exit + employee context — no JWT
    // / session needed. Routes are intentionally outside `auth` and instead
    // verify the signed token themselves.
    //
    // GET  /exit-interview/by-token/:token  → returns the bundle
    // POST /exit-interview/by-token/:token  → submits answers

    const tokenAnswersSchema = z.object({
        answers: z.array(z.object({
            questionId: z.string().uuid(),
            questionSnapshot: z.string().min(1),
            answerText: z.string().optional(),
            answerValue: z.unknown().optional(),
        })),
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function verifyOrReject(token: string, reply: any) {
        const result = verifyExitInterviewToken(token)
        if (result.ok === true) return result.payload
        // result is the error variant here. Manual cast keeps tsc happy on
        // configs that don't narrow on negated discriminants reliably.
        const reason = (result as { ok: false; reason: string }).reason
        const message = reason === 'expired'
            ? 'This exit-interview link has expired. Please ask HR for a new one.'
            : 'Invalid exit-interview link.'
        reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message, reason })
        return null
    }

    fastify.get('/exit-interview/by-token/:token', { schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const payload = verifyOrReject(request.params.token, reply)
        if (!payload) return
        const exit = await getExitRequest(payload.tenantId, payload.exitRequestId)
        if (!exit) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit not found.' })
        // Defense in depth: the token carries the employeeId but we still
        // verify the exit actually belongs to that employee (in case someone
        // crafts a token with mismatched ids using a stolen secret).
        if (exit.employeeId !== payload.employeeId) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Link does not match this exit.' })
        }
        const [questions, responses] = await Promise.all([
            listInterviewQuestions(payload.tenantId),
            listInterviewResponses(payload.tenantId, payload.exitRequestId),
        ])
        return reply.send({
            data: {
                exit: {
                    id: exit.id,
                    exitType: exit.exitType,
                    exitDate: exit.exitDate,
                    lastWorkingDay: exit.lastWorkingDay,
                    employeeName: exit.employeeName,
                    status: exit.status,
                },
                questions: questions.filter(q => q.isActive),
                responses,
            },
        })
    })

    fastify.post('/exit-interview/by-token/:token', { schema: { tags: ['Exit'] } }, async (request: any, reply: any) => {
        const payload = verifyOrReject(request.params.token, reply)
        if (!payload) return
        const parse = tokenAnswersSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const exit = await getExitRequest(payload.tenantId, payload.exitRequestId)
        if (!exit || exit.employeeId !== payload.employeeId) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Link does not match this exit.' })
        }
        const data = await submitInterviewResponses(payload.tenantId, payload.exitRequestId, parse.data.answers)
        // No actor user in this flow (the employee signed in via the token,
        // not via the user table) — log the activity attributed to the
        // tenant level with a synthetic actor name.
        recordActivity({
            tenantId: payload.tenantId,
            userId: null,
            actorName: exit.employeeName ?? 'Exit subject',
            actorRole: 'employee',
            entityType: 'exit_interview_response',
            entityId: payload.exitRequestId,
            entityName: 'Exit interview (via link)',
            action: 'submit',
            metadata: { count: data.length, via: 'email-link' },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data })
    })
}
