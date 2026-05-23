// ─── Offboarding Flow routes ─────────────────────────────────────────────────
// Mounted under /api/v1/offboarding-flow.  All endpoints require an HR-tier
// role (hr_manager or super_admin) except the per-exit clearance/interview
// helpers which are reachable by the assigned owner or the employee themselves.

import { z } from 'zod'
import { recordActivity } from '../audit/audit.service.js'
import {
    getSettings,
    updateSettings,
    listClearanceTemplates,
    createClearanceTemplate,
    updateClearanceTemplate,
    deleteClearanceTemplate,
    listInterviewQuestions,
    createInterviewQuestion,
    updateInterviewQuestion,
    deleteInterviewQuestion,
    reorderInterviewQuestions,
    listExitDocuments,
    createExitDocument,
    updateExitDocument,
    deleteExitDocument,
    listWorkflows,
    createWorkflow,
    updateWorkflow,
    deleteWorkflow,
    listClearancesForExit,
    updateClearanceItem,
    addClearanceItem,
    listInterviewResponses,
    submitInterviewResponses,
} from './offboarding.service.js'
import { getExitRequest } from '../exit/exit.service.js'

// ─── Validation schemas ─────────────────────────────────────────────────────

const settingsSchema = z.object({
    noticePeriodEnabled: z.boolean().optional(),
    noticePeriodValue: z.number().int().min(0).max(365).optional(),
    noticePeriodUnit: z.enum(['days', 'months']).optional(),
    hrPartnerUserIds: z.array(z.string().uuid()).optional(),
    approvalReportingLevels: z.number().int().min(0).max(5).optional(),
    approvalRequireHrPartner: z.boolean().optional(),
    interviewIntroMessage: z.string().nullable().optional(),
    interviewThankYouMessage: z.string().nullable().optional(),
    workflowTrigger: z.enum(['on_request_added', 'on_approved', 'on_relieving_date']).optional(),
})

const clearanceSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().nullable().optional(),
    ownerType: z.enum(['hr_partner', 'reporting_manager', 'specific_user']),
    ownerUserId: z.string().uuid().nullable().optional(),
    startOffsetDays: z.number().int().min(0).max(365),
    endOffsetDays: z.number().int().min(0).max(365),
    position: z.number().int().optional(),
    isActive: z.boolean().optional(),
})

const interviewSchema = z.object({
    questionText: z.string().min(1).max(1000),
    questionType: z.enum(['short_text', 'long_text', 'rating', 'single_choice', 'multi_choice', 'yes_no']),
    options: z.array(z.string().min(1)).nullable().optional(),
    required: z.boolean().optional(),
    position: z.number().int().optional(),
    isActive: z.boolean().optional(),
})

const documentSchema = z.object({
    name: z.string().min(1).max(200),
    bodyTemplate: z.string().max(50_000).nullable().optional(),
    documentTemplateId: z.string().uuid().nullable().optional(),
    autoGenerate: z.boolean().optional(),
    required: z.boolean().optional(),
    position: z.number().int().optional(),
    isActive: z.boolean().optional(),
})

const workflowSchema = z.object({
    name: z.string().min(1).max(200),
    trigger: z.enum(['on_request_added', 'on_approved', 'on_rejected', 'on_clearance_complete', 'on_settlement_paid', 'on_relieving_date']),
    actionType: z.enum(['email_alert', 'notification', 'custom_function']),
    config: z.object({
        recipients: z.array(z.enum(['employee', 'reporting_manager', 'hr_partner', 'custom'])).optional(),
        customEmails: z.array(z.string().email()).optional(),
        subject: z.string().optional(),
        body: z.string().optional(),
        message: z.string().optional(),
        actionUrl: z.string().optional(),
        code: z.string().optional(),
    }),
    enabled: z.boolean().optional(),
    position: z.number().int().optional(),
})

const clearanceItemPatchSchema = z.object({
    status: z.enum(['pending', 'in_progress', 'completed', 'waived']).optional(),
    notes: z.string().optional(),
})

const clearanceItemAddSchema = z.object({
    name: z.string().min(1).max(200),
    description: z.string().nullable().optional(),
    ownerUserId: z.string().uuid().nullable().optional(),
    startDate: z.string().nullable().optional(),
    dueDate: z.string().nullable().optional(),
})

const responseSubmitSchema = z.object({
    answers: z.array(z.object({
        questionId: z.string().uuid(),
        questionSnapshot: z.string().min(1),
        answerText: z.string().optional(),
        answerValue: z.unknown().optional(),
    })),
})

// ─── Route registration ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function offboardingFlowRoutes(fastify: any) {
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }
    const auth = { preHandler: [fastify.authenticate] }

    const TAG = ['OffboardingFlow']

    // ── Settings (singleton) ────────────────────────────────────────────────
    fastify.get('/offboarding-flow/settings', { ...adminAuth, schema: { tags: TAG } }, async (request: any) => {
        const data = await getSettings(request.user.tenantId)
        return { data }
    })

    fastify.patch('/offboarding-flow/settings', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = settingsSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await updateSettings(request.user.tenantId, parse.data)
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'offboarding_flow_settings', entityId: data.id, entityName: 'Offboarding preferences', action: 'update', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return { data }
    })

    // ── Clearance templates ─────────────────────────────────────────────────
    fastify.get('/offboarding-flow/clearances', { ...adminAuth, schema: { tags: TAG } }, async (request: any) => {
        const data = await listClearanceTemplates(request.user.tenantId)
        return { data }
    })

    fastify.post('/offboarding-flow/clearances', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = clearanceSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await createClearanceTemplate(request.user.tenantId, parse.data)
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'offboarding_clearance_template', entityId: data.id, entityName: data.name, action: 'create', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.code(201).send({ data })
    })

    fastify.patch('/offboarding-flow/clearances/:id', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = clearanceSchema.partial().safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await updateClearanceTemplate(request.user.tenantId, request.params.id, parse.data)
        return { data }
    })

    fastify.delete('/offboarding-flow/clearances/:id', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        await deleteClearanceTemplate(request.user.tenantId, request.params.id)
        return reply.code(204).send()
    })

    // ── Interview questions ─────────────────────────────────────────────────
    fastify.get('/offboarding-flow/interview-questions', { ...adminAuth, schema: { tags: TAG } }, async (request: any) => {
        const data = await listInterviewQuestions(request.user.tenantId)
        return { data }
    })

    fastify.post('/offboarding-flow/interview-questions', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = interviewSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await createInterviewQuestion(request.user.tenantId, parse.data)
        return reply.code(201).send({ data })
    })

    fastify.patch('/offboarding-flow/interview-questions/:id', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = interviewSchema.partial().safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await updateInterviewQuestion(request.user.tenantId, request.params.id, parse.data)
        return { data }
    })

    fastify.delete('/offboarding-flow/interview-questions/:id', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        await deleteInterviewQuestion(request.user.tenantId, request.params.id)
        return reply.code(204).send()
    })

    // Persist a new question order. Body: { orderedIds: string[] }
    fastify.post('/offboarding-flow/interview-questions/reorder', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = z.object({ orderedIds: z.array(z.string().uuid()).max(200) }).safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await reorderInterviewQuestions(request.user.tenantId, parse.data.orderedIds)
        return { data }
    })

    // ── Exit documents ──────────────────────────────────────────────────────
    fastify.get('/offboarding-flow/documents', { ...adminAuth, schema: { tags: TAG } }, async (request: any) => {
        const data = await listExitDocuments(request.user.tenantId)
        return { data }
    })

    fastify.post('/offboarding-flow/documents', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = documentSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await createExitDocument(request.user.tenantId, parse.data)
        return reply.code(201).send({ data })
    })

    fastify.patch('/offboarding-flow/documents/:id', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = documentSchema.partial().safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await updateExitDocument(request.user.tenantId, request.params.id, parse.data)
        return { data }
    })

    fastify.delete('/offboarding-flow/documents/:id', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        await deleteExitDocument(request.user.tenantId, request.params.id)
        return reply.code(204).send()
    })

    // ── Workflows ───────────────────────────────────────────────────────────
    fastify.get('/offboarding-flow/workflows', { ...adminAuth, schema: { tags: TAG } }, async (request: any) => {
        const data = await listWorkflows(request.user.tenantId)
        return { data }
    })

    fastify.post('/offboarding-flow/workflows', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = workflowSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await createWorkflow(request.user.tenantId, parse.data)
        return reply.code(201).send({ data })
    })

    fastify.patch('/offboarding-flow/workflows/:id', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = workflowSchema.partial().safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await updateWorkflow(request.user.tenantId, request.params.id, parse.data)
        return { data }
    })

    fastify.delete('/offboarding-flow/workflows/:id', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        await deleteWorkflow(request.user.tenantId, request.params.id)
        return reply.code(204).send()
    })

    // ── Per-exit clearance items ────────────────────────────────────────────
    // Reachable by:
    //   - HR / super_admin  (see every item)
    //   - dept_head         (see every item — needed for the team view)
    //   - clearance owner   (see only items they own — needed to action them)
    //   - exit subject      (see only their own exit's items)
    // Tenant scoping is enforced by the service.
    fastify.get('/exit/:exitId/clearances', { ...auth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const exit = await getExitRequest(request.user.tenantId, request.params.exitId)
        if (!exit) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found' })
        const role = request.user.role
        const isElevated = ['hr_manager', 'super_admin', 'dept_head'].includes(role)
        const isExitSubject = exit.employeeId === request.user.employeeId
        const all = await listClearancesForExit(request.user.tenantId, request.params.exitId)
        const data = isElevated || isExitSubject
            ? all
            : all.filter((i) => i.ownerUserId === request.user.id)
        return { data }
    })

    // Ad-hoc clearance item — HR-only. Used when an exit needs a one-off
    // check that wasn't part of the standard template set.
    fastify.post('/exit/:exitId/clearances', { ...adminAuth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = clearanceItemAddSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const exit = await getExitRequest(request.user.tenantId, request.params.exitId)
        if (!exit) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found' })
        const data = await addClearanceItem(request.user.tenantId, request.params.exitId, parse.data)
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'exit_clearance_item', entityId: data.id, entityName: data.name, action: 'create', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.code(201).send({ data })
    })

    fastify.patch('/exit/:exitId/clearances/:itemId', { ...auth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = clearanceItemPatchSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const isElevated = ['hr_manager', 'super_admin'].includes(request.user.role)
        if (!isElevated) {
            // Non-HR users must own the clearance item to mutate it.
            const items = await listClearancesForExit(request.user.tenantId, request.params.exitId)
            const item = items.find(i => i.id === request.params.itemId)
            if (!item || item.ownerUserId !== request.user.id) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'You are not the assigned owner of this clearance.' })
            }
        }
        const data = await updateClearanceItem(
            request.user.tenantId,
            request.params.exitId,
            request.params.itemId,
            { ...parse.data, completedBy: parse.data.status === 'completed' ? request.user.id : undefined },
        )
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'exit_clearance_item', entityId: data.id, entityName: data.name, action: 'update', metadata: { status: data.status }, ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return { data }
    })

    // ── Per-exit interview responses ────────────────────────────────────────
    // Exit-interview answers are confidential by design — only HR and the
    // exit subject themselves can read them. POST is for the leaver to fill
    // in (HR may also submit on the leaver's behalf).
    fastify.get('/exit/:exitId/interview-responses', { ...auth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const exit = await getExitRequest(request.user.tenantId, request.params.exitId)
        if (!exit) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found' })
        const isElevated = ['hr_manager', 'super_admin'].includes(request.user.role)
        const isExitSubject = exit.employeeId === request.user.employeeId
        if (!isElevated && !isExitSubject) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Not authorized to view this exit interview.' })
        }
        const data = await listInterviewResponses(request.user.tenantId, request.params.exitId)
        return { data }
    })

    fastify.post('/exit/:exitId/interview-responses', { ...auth, schema: { tags: TAG } }, async (request: any, reply: any) => {
        const parse = responseSubmitSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const exit = await getExitRequest(request.user.tenantId, request.params.exitId)
        if (!exit) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Exit request not found' })
        const isElevated = ['hr_manager', 'super_admin'].includes(request.user.role)
        const isExitSubject = exit.employeeId === request.user.employeeId
        if (!isElevated && !isExitSubject) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Not authorized to submit this exit interview.' })
        }
        const data = await submitInterviewResponses(request.user.tenantId, request.params.exitId, parse.data.answers)
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'exit_interview_response', entityId: request.params.exitId, entityName: 'Exit interview', action: 'submit', metadata: { count: data.length }, ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.code(201).send({ data })
    })
}
