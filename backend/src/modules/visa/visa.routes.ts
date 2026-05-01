import {
    listVisas,
    getVisa,
    createVisa,
    updateVisa,
    advanceVisaStepWithCosts,
    listVisaStepHistory,
    softDeleteVisa,
    cancelVisa,
    recalcVisaUrgency,
} from './visa.service.js'
import { listVisaCosts, addVisaCost, deleteVisaCost, getVisaCost } from './visa_costs.service.js'
import { visaStepLabel, VISA_STEP_LABELS, VISA_TOTAL_STEPS } from './visa.constants.js'
import { recordActivity } from '../audit/audit.service.js'
import { cacheDel } from '../../lib/redis.js'
import { generateReportPdf } from '../../lib/pdf.js'
import { db } from '../../db/index.js'
import { tenants } from '../../db/schema/index.js'
import { eq } from 'drizzle-orm'

/**
 * Audit helper — every mutating route in this module funnels through this so
 * we never miss an entry in `activity_logs`. Read-only routes are NOT audited
 * (auth + RBAC already gate access; auditing every read would balloon the table).
 */
function audit(request: any, params: {
    entityId: string
    entityName?: string
    action: 'create' | 'update' | 'delete' | 'view' | 'approve' | 'reject' | 'submit' | 'export' | 'import'
    metadata?: Record<string, unknown>
    changes?: Record<string, { from: unknown; to: unknown }>
}) {
    return recordActivity({
        tenantId: request.user.tenantId,
        userId: request.user.id,
        actorName: request.user.name,
        actorRole: request.user.role,
        entityType: 'visa',
        entityId: params.entityId,
        entityName: params.entityName,
        action: params.action,
        changes: params.changes,
        metadata: params.metadata,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
    }).catch(() => { })
}

const COST_CATEGORIES = ['govt_fee', 'medical', 'typing', 'translation', 'other'] as const

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    // ─── List & detail (read-only, not audited) ───────────────────────────────

    // Step label catalogue — served once, cached indefinitely client-side.
    fastify.get('/steps', { ...auth, schema: { tags: ['Visa'] } }, async (_request: any, reply: any) => {
        return reply.send({ data: VISA_STEP_LABELS, totalSteps: VISA_TOTAL_STEPS })
    })

    fastify.get('/', { ...auth, schema: { tags: ['Visa'] } }, async (request: any, reply: any) => {
        const { status, urgencyLevel, from, to, limit = '20', offset = '0', after } = request.query as Record<string, string>
        const result = await listVisas(request.user.tenantId, {
            status, urgencyLevel, from, to,
            limit: Number(limit), offset: Number(offset), after,
        })
        return reply.send({
            data: result.data, total: result.total,
            hasMore: result.hasMore, nextCursor: result.nextCursor,
        })
    })

    fastify.get('/:id', { ...auth, schema: { tags: ['Visa'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const visa = await getVisa(request.user.tenantId, id)
        if (!visa) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Visa application not found' })
        return reply.send({ data: visa })
    })

    fastify.get('/:id/history', { ...auth, schema: { tags: ['Visa'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const history = await listVisaStepHistory(request.user.tenantId, id)
        return reply.send({ data: history })
    })

    // ─── Mutations ────────────────────────────────────────────────────────────

    fastify.post('/', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: {
            tags: ['Visa'],
            body: {
                type: 'object',
                required: ['employeeId', 'visaType'],
                properties: {
                    employeeId: { type: 'string', format: 'uuid' },
                    visaType: { type: 'string' },
                    urgencyLevel: { type: 'string', enum: ['normal', 'urgent', 'critical'] },
                    notes: { type: 'string' },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const visa = await createVisa(request.user.tenantId, request.body as never)
        cacheDel(`dashboard:kpis:${request.user.tenantId}`).catch(() => { })
        audit(request, {
            entityId: visa.id,
            entityName: `Visa - ${visa.visaType ?? 'application'}`,
            action: 'create',
            metadata: { visaType: visa.visaType, employeeId: visa.employeeId },
        })
        return reply.code(201).send({ data: visa })
    })

    fastify.patch('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Visa'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = request.body as Record<string, unknown>
        const updated = await updateVisa(request.user.tenantId, id, {
            ...(b.mohreRef !== undefined && { mohreRef: b.mohreRef as string }),
            ...(b.gdfrRef !== undefined && { gdfrRef: b.gdfrRef as string }),
            ...(b.icpRef !== undefined && { icpRef: b.icpRef as string }),
            ...(b.expiryDate !== undefined && { expiryDate: b.expiryDate as string }),
            ...(b.startDate !== undefined && { startDate: b.startDate as string }),
            ...(b.urgencyLevel !== undefined && { urgencyLevel: b.urgencyLevel as never }),
            ...(b.notes !== undefined && { notes: b.notes as string }),
        })
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Visa application not found' })
        audit(request, {
            entityId: id,
            entityName: `Visa ${updated.visaType ?? ''}`.trim(),
            action: 'update',
            metadata: { fields: Object.keys((request.body as object) ?? {}) },
        })
        return reply.send({ data: updated })
    })

    /**
     * Atomic stage advance with optional cost capture. Costs are tagged with
     * the step they were incurred in (the step being completed) and a
     * `visa_step_history` row is written summarising the transition.
     *
     * Body:
     *   notes?: string
     *   costs?: Array<{ employeeId, category, amount, paidDate, ... }>
     *
     * Backwards-compatible with the original `POST /:id/advance` (empty body).
     */
    fastify.post('/:id/advance', {
        preHandler: [fastify.authenticate, fastify.requireRole('pro_officer', 'hr_manager', 'super_admin')],
        schema: {
            tags: ['Visa'],
            body: {
                type: 'object',
                properties: {
                    notes: { type: 'string' },
                    costs: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['employeeId', 'category', 'amount', 'paidDate'],
                            properties: {
                                employeeId: { type: 'string', format: 'uuid' },
                                category: { type: 'string', enum: COST_CATEGORIES as unknown as string[] },
                                description: { type: 'string' },
                                amount: { type: 'number', exclusiveMinimum: 0 },
                                currency: { type: 'string' },
                                paidDate: { type: 'string', format: 'date' },
                                receiptRef: { type: 'string' },
                            },
                        },
                    },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const body = (request.body as any) ?? {}
        const costsInput = Array.isArray(body.costs) ? body.costs : []

        const { result, savedCosts } = await advanceVisaStepWithCosts(
            request.user.tenantId,
            id,
            costsInput.map((c: any) => ({
                employeeId: c.employeeId,
                category: c.category,
                description: c.description,
                amount: Number(c.amount),
                currency: c.currency,
                paidDate: c.paidDate,
                receiptRef: c.receiptRef,
            })),
            {
                userId: request.user.id,
                userName: request.user.name,
                userRole: request.user.role,
                notes: typeof body.notes === 'string' ? body.notes : undefined,
            },
        )

        if (!result) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Visa application not found' })

        // Audit each saved cost individually so the activity log shows full
        // financial detail per stage transition.
        for (const cost of savedCosts) {
            audit(request, {
                entityId: id,
                entityName: `Visa cost — ${cost.category} ${cost.currency} ${cost.amount} (${cost.stepLabel ?? 'stage'})`,
                action: 'create',
                metadata: {
                    costId: cost.id,
                    category: cost.category,
                    amount: Number(cost.amount),
                    currency: cost.currency,
                    stepNumber: cost.stepNumber,
                    stepLabel: cost.stepLabel,
                    paidDate: cost.paidDate,
                    receiptRef: cost.receiptRef,
                },
            })
        }

        audit(request, {
            entityId: id,
            entityName: result.advanced
                ? `Visa step ${result.fromStep} → ${result.toStep} (${result.toStepLabel})`
                : `Visa step advance — no-op (already at ${result.fromStepLabel})`,
            action: 'approve',
            metadata: {
                fromStep: result.fromStep,
                toStep: result.toStep,
                fromStepLabel: result.fromStepLabel,
                toStepLabel: result.toStepLabel,
                fromStatus: result.fromStatus,
                toStatus: result.toStatus,
                advanced: result.advanced,
                historyId: result.historyId,
                costsCount: savedCosts.length,
                costsTotal: savedCosts.reduce((s, c) => s + Number(c.amount), 0),
            },
        })

        if (result.advanced) cacheDel(`dashboard:kpis:${request.user.tenantId}`).catch(() => { })

        return reply.send({
            data: result.visa,
            transition: {
                advanced: result.advanced,
                fromStep: result.fromStep,
                toStep: result.toStep,
                fromStepLabel: result.fromStepLabel,
                toStepLabel: result.toStepLabel,
                historyId: result.historyId,
            },
            costs: savedCosts,
        })
    })

    fastify.delete('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Visa'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const deleted = await softDeleteVisa(request.user.tenantId, id)
        if (!deleted) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Visa application not found' })
        audit(request, { entityId: id, action: 'delete' })
        return reply.code(204).send()
    })

    fastify.post('/:id/cancel', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: {
            tags: ['Visa'],
            body: { type: 'object', properties: { reason: { type: 'string' } } },
        },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const { reason } = (request.body as any) ?? {}
        const updated = await cancelVisa(request.user.tenantId, id, reason as string | undefined)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Visa application not found' })
        cacheDel(`dashboard:kpis:${request.user.tenantId}`).catch(() => { })
        audit(request, {
            entityId: id,
            action: 'reject',
            metadata: reason ? { reason } : undefined,
        })
        return reply.send({ data: updated })
    })

    fastify.post('/recalc-urgency', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Visa'] },
    }, async (request: any, reply: any) => {
        const result = await recalcVisaUrgency(request.user.tenantId)
        audit(request, {
            entityId: request.user.tenantId,
            entityName: 'Bulk visa urgency recalc',
            action: 'update',
            metadata: { updated: result.updated },
        })
        return reply.send({ data: result })
    })

    // ─── Visa Cost Tracking ───────────────────────────────────────────────────

    fastify.get('/:id/costs', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Visa'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const costs = await listVisaCosts(request.user.tenantId, id)
        return reply.send({ data: costs })
    })

    /**
     * Direct cost insertion (out of band of stage advance). Step number/label
     * may be supplied to associate the cost with a particular stage; if
     * omitted, the visa's *current* step is used as a sensible default.
     */
    fastify.post('/:id/costs', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: {
            tags: ['Visa'],
            body: {
                type: 'object',
                required: ['employeeId', 'category', 'amount', 'paidDate'],
                properties: {
                    employeeId: { type: 'string', format: 'uuid' },
                    category: { type: 'string', enum: COST_CATEGORIES as unknown as string[] },
                    description: { type: 'string' },
                    amount: { type: 'number', minimum: 0 },
                    currency: { type: 'string' },
                    paidDate: { type: 'string', format: 'date' },
                    receiptRef: { type: 'string' },
                    stepNumber: { type: 'integer', minimum: 1 },
                    stepLabel: { type: 'string' },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const body = request.body as Record<string, unknown>

        // Always verify the visa exists before creating the cost record.
        // This prevents orphaned costs that would corrupt the PRO cost report.
        const visa = await getVisa(request.user.tenantId, id)
        if (!visa) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Visa application not found' })

        const stepNumber = (body.stepNumber as number | undefined) ?? visa.currentStep
        const stepLabel = (body.stepLabel as string | undefined) ?? visaStepLabel(stepNumber)

        const cost = await addVisaCost(request.user.tenantId, {
            visaApplicationId: id,
            employeeId: body.employeeId as string,
            category: body.category as 'govt_fee' | 'medical' | 'typing' | 'translation' | 'other',
            description: body.description as string | undefined,
            amount: Number(body.amount),
            currency: body.currency as string | undefined,
            paidDate: body.paidDate as string,
            receiptRef: body.receiptRef as string | undefined,
            stepNumber,
            stepLabel,
            createdBy: request.user.id,
        })
        audit(request, {
            entityId: id,
            entityName: `Visa cost — ${body.category} ${cost.currency} ${body.amount} (${stepLabel ?? 'no stage'})`,
            action: 'create',
            metadata: {
                costId: cost.id,
                category: cost.category,
                amount: Number(cost.amount),
                stepNumber,
                stepLabel,
                paidDate: cost.paidDate,
                receiptRef: cost.receiptRef,
            },
        })
        return reply.code(201).send({ data: cost })
    })

    fastify.delete('/costs/:costId', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Visa'] },
    }, async (request: any, reply: any) => {
        const { costId } = request.params as { costId: string }
        const before = await getVisaCost(request.user.tenantId, costId)
        const deleted = await deleteVisaCost(request.user.tenantId, costId)
        if (!deleted) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Cost record not found' })
        audit(request, {
            entityId: before?.visaApplicationId ?? costId,
            entityName: before
                ? `Visa cost removed — ${before.category} ${before.currency} ${before.amount} (${before.stepLabel ?? 'no stage'})`
                : 'Visa cost removed',
            action: 'delete',
            metadata: before
                ? {
                    costId,
                    category: before.category,
                    amount: Number(before.amount),
                    stepNumber: before.stepNumber,
                    stepLabel: before.stepLabel,
                    paidDate: before.paidDate,
                }
                : { costId },
        })
        return reply.code(204).send()
    })

    // GET /export?format=csv|pdf
    fastify.get('/export', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'super_admin')],
        schema: { tags: ['Visa'] },
    }, async (request: any, reply: any) => {
        const { format = 'csv', status, urgencyLevel, from, to } = request.query as Record<string, string>
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const { data } = await listVisas(request.user.tenantId, { status, urgencyLevel, from, to, limit: 10000, offset: 0 })
        const rows = data as any[]
        const dateStr = new Date().toISOString().slice(0, 10)

        if (format === 'pdf') {
            const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
            const pdf = await generateReportPdf({
                title: 'Visa Applications Report',
                companyName: tenantRow?.name ?? '',
                columns: [
                    { header: 'Employee', key: 'employeeName', width: 120 },
                    { header: 'Visa Type', key: 'visaType', width: 90 },
                    { header: 'Status', key: 'status', width: 70 },
                    { header: 'Step', key: 'currentStep', width: 50, align: 'right' },
                    { header: 'Expiry Date', key: 'expiryDate', width: 80 },
                    { header: 'Days Remaining', key: 'daysRemaining', width: 85, align: 'right' },
                    { header: 'Urgency', key: 'urgencyLevel', width: 65 },
                    { header: 'Nationality', key: 'nationality' },
                ],
                rows,
            })
            reply.header('Content-Type', 'application/pdf')
            reply.header('Content-Disposition', `attachment; filename="visa-report-${dateStr}.pdf"`)
            return reply.send(pdf)
        }

        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const headers = ['Employee Name', 'Visa Type', 'Passport No', 'Nationality', 'Status', 'Current Step', 'Expiry Date', 'Days Remaining', 'Urgency Level']
        const lines = [headers.join(',')]
        for (const r of rows) {
            lines.push([r.employeeName, r.visaType, r.passportNo, r.nationality, r.status, r.currentStep, r.expiryDate ?? '', r.daysRemaining ?? '', r.urgencyLevel].map(escape).join(','))
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', `attachment; filename="visa-export-${dateStr}.csv"`)
        return reply.send(lines.join('\r\n'))
    })
}
