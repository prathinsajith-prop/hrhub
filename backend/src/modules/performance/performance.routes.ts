import { z } from 'zod'
import { getReviews, createReview, updateReview, deleteReview } from './performance.service.js'
import { generateReportPdf } from '../../lib/pdf.js'
import { db } from '../../db/index.js'
import { tenants, employees, performanceReviews } from '../../db/schema/index.js'
import { eq, and, inArray } from 'drizzle-orm'
import { recordActivity } from '../audit/audit.service.js'
import { notifyEmployee } from '../notifications/notifications.service.js'
import { sendEmail, performanceReviewEmail } from '../../plugins/email.js'
import { loadEnv } from '../../config/env.js'
import { asDate, asInt, asString, buildTemplateXlsx, validateRows } from '../../lib/bulk-import.js'

// Notify + email the employee about a performance review (best-effort). Only
// fires for meaningful states (submitted/acknowledged/completed) to avoid
// pinging the employee about an HR draft.
async function notifyReviewEmployee(tenantId: string, review: any): Promise<void> {
    const status = String(review?.status ?? '')
    if (!review?.employeeId || !['submitted', 'acknowledged', 'completed'].includes(status)) return
    const period = review.reviewPeriod ?? 'your latest period'
    notifyEmployee(tenantId, review.employeeId, {
        type: status === 'completed' ? 'success' : 'info',
        title: 'Performance review update',
        message: `Your performance review for ${period} is now ${status}.`,
        actionUrl: '/performance',
    }).catch(() => { })
    const [emp] = await db.select({ email: employees.email, first: employees.firstName })
        .from(employees).where(and(eq(employees.tenantId, tenantId), eq(employees.id, review.employeeId))).limit(1)
    if (emp?.email) {
        const appUrl = (loadEnv() as any).APP_URL ?? ''
        sendEmail({
            ...performanceReviewEmail({ employeeName: emp.first ?? 'there', reviewPeriod: period, status, actionUrl: appUrl ? `${appUrl}/performance` : '' }),
            to: emp.email, tenantId,
        }).catch(() => { })
    }
}

const createReviewSchema = z.object({
    employeeId: z.string().uuid(),
    period: z.string().min(1),
    reviewerId: z.string().uuid().optional(),
    overallRating: z.number().min(1).max(5).optional(),
    status: z.enum(['draft', 'submitted', 'acknowledged', 'completed']).optional(),
    strengths: z.string().optional(),
    improvements: z.string().optional(),
    goals: z.string().optional(),
    managerComments: z.string().optional(),
    employeeComments: z.string().optional(),
    reviewDate: z.string().optional(),
})

export async function performanceRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'dept_head', 'super_admin')] }

    // GET /api/v1/performance
    // hr_manager/super_admin see all; dept_head scoped to their department; employees see own only.
    fastify.get('/performance', { ...auth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const { employeeId, status, from, to, search, q, filter, limit = '20', offset = '0' } = request.query as Record<string, string>
        if (filter && filter.length > 2000) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'filter param too long' })
        const role = request.user.role
        const isHrAdmin = ['hr_manager', 'super_admin'].includes(role)
        const isDeptHead = role === 'dept_head'
        if (isDeptHead && !request.user.department) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Your account has no department assigned. Contact an HR admin.' })
        }
        const resolvedEmployeeId = isHrAdmin ? employeeId : isDeptHead ? employeeId : (request.user.employeeId ?? undefined)
        const resolvedDepartment = isDeptHead ? request.user.department : undefined
        const result = await getReviews(request.user.tenantId, { employeeId: resolvedEmployeeId, department: resolvedDepartment, status, from, to, search: q || search || undefined, filter: filter || undefined, limit: Number(limit), offset: Number(offset) })
        return reply.send(result)
    })

    // POST /api/v1/performance
    fastify.post('/performance', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const parse = createReviewSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const review = await createReview(request.user.tenantId, request.user.id, parse.data as any)
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'performance_review', entityId: review.id, entityName: (review as any).employeeName ?? (request.body as any).reviewPeriod, action: 'create', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        if ((review as any).employeeId) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'employee',
                entityId: (review as any).employeeId,
                entityName: (review as any).reviewPeriod ?? 'Performance review',
                action: 'create',
                metadata: { kind: 'performance', subKind: 'create', reviewId: review.id, reviewPeriod: (review as any).reviewPeriod ?? null },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        notifyReviewEmployee(request.user.tenantId, review).catch(() => { })
        return reply.code(201).send({ data: review })
    })

    // PATCH /api/v1/performance/:id
    fastify.patch('/performance/:id', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = request.body as Record<string, unknown>
        const review = await updateReview(request.user.tenantId, id, {
            ...(b.overallRating !== undefined && { overallRating: Number(b.overallRating) }),
            ...(b.qualityScore !== undefined && { qualityScore: Number(b.qualityScore) }),
            ...(b.productivityScore !== undefined && { productivityScore: Number(b.productivityScore) }),
            ...(b.teamworkScore !== undefined && { teamworkScore: Number(b.teamworkScore) }),
            ...(b.attendanceScore !== undefined && { attendanceScore: Number(b.attendanceScore) }),
            ...(b.initiativeScore !== undefined && { initiativeScore: Number(b.initiativeScore) }),
            ...(b.strengths !== undefined && { strengths: b.strengths as string }),
            ...(b.improvements !== undefined && { improvements: b.improvements as string }),
            ...(b.goals !== undefined && { goals: b.goals as string }),
            ...(b.managerComments !== undefined && { managerComments: b.managerComments as string }),
            ...(b.employeeComments !== undefined && { employeeComments: b.employeeComments as string }),
            ...(b.status !== undefined && { status: b.status as never }),
            ...(b.reviewDate !== undefined && { reviewDate: b.reviewDate as string }),
        })
        if (!review) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Performance review not found' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'performance_review', entityId: id, entityName: (review as any).employeeName ?? (review as any).reviewPeriod, action: 'update', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        if ((review as any).employeeId) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'employee',
                entityId: (review as any).employeeId,
                entityName: (review as any).reviewPeriod ?? 'Performance review',
                action: 'update',
                metadata: {
                    kind: 'performance',
                    subKind: (review as any).status === 'completed' ? 'complete' : 'update',
                    reviewId: id,
                    status: (review as any).status ?? null,
                    overallRating: (review as any).overallRating ?? null,
                },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        notifyReviewEmployee(request.user.tenantId, review).catch(() => { })
        return reply.send({ data: review })
    })

    // DELETE /api/v1/performance/:id
    fastify.delete('/performance/:id', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const deleted = await deleteReview(request.user.tenantId, id)
        if (!deleted) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Performance review not found' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'performance_review', entityId: id, action: 'delete', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        if ((deleted as any).employeeId) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'employee',
                entityId: (deleted as any).employeeId,
                entityName: (deleted as any).reviewPeriod ?? 'Performance review',
                action: 'delete',
                metadata: { kind: 'performance', subKind: 'delete', reviewId: id },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        return reply.code(204).send()
    })

    // GET /api/v1/performance/export?format=csv|pdf
    fastify.get('/performance/export', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const { format = 'csv', employeeId, from, to } = request.query as Record<string, string>
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const { data } = await getReviews(request.user.tenantId, { employeeId, from, to, limit: 10000, offset: 0 }) as any
        const rows = (data ?? []) as any[]
        const dateStr = new Date().toISOString().slice(0, 10)

        if (format === 'pdf') {
            const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
            const pdf = await generateReportPdf({
                title: 'Performance Reviews Report',
                companyName: tenantRow?.name ?? '',
                subtitle: from && to ? `${from} – ${to}` : undefined,
                columns: [
                    { header: 'Employee', key: 'employeeName', width: 130 },
                    { header: 'Review Period', key: 'reviewPeriod', width: 100 },
                    { header: 'Rating', key: 'rating', width: 55, align: 'right' },
                    { header: 'Status', key: 'status', width: 70 },
                    { header: 'Reviewer', key: 'reviewerName', width: 120 },
                    { header: 'Comments', key: 'comments' },
                ],
                rows,
            })
            reply.header('Content-Type', 'application/pdf')
            reply.header('Content-Disposition', `attachment; filename="performance-report-${dateStr}.pdf"`)
            return reply.send(pdf)
        }

        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const headers = ['Employee Name', 'Review Period', 'Rating', 'Status', 'Reviewer', 'Comments']
        const lines = [headers.join(',')]
        for (const r of rows) {
            lines.push([r.employeeName, r.reviewPeriod, r.rating ?? '', r.status, r.reviewerName ?? '', r.comments ?? ''].map(escape).join(','))
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', `attachment; filename="performance-export-${dateStr}.csv"`)
        return reply.send(lines.join('\r\n'))
    })

    // ─── Bulk Import: template + validate + commit ────────────────────────
    // Period-end workflow: HR exports the grader's spreadsheet, batch-uploads
    // it here, previews errors, and commits one cycle's worth of reviews in
    // a single round trip. Identifies employees by employee_no (the column
    // HR actually has in their grading sheet) rather than UUID.

    const TEMPLATE_COLUMNS = [
        { key: 'employeeNo', width: 14 },
        { key: 'period', width: 12 },
        { key: 'reviewDate', width: 14 },
        { key: 'overallRating', width: 12 },
        { key: 'qualityScore', width: 12 },
        { key: 'productivityScore', width: 14 },
        { key: 'teamworkScore', width: 12 },
        { key: 'attendanceScore', width: 14 },
        { key: 'initiativeScore', width: 12 },
        { key: 'strengths', width: 30 },
        { key: 'improvements', width: 30 },
        { key: 'goals', width: 30 },
        { key: 'managerComments', width: 30 },
    ]
    const SAMPLE_ROWS = [
        {
            employeeNo: 'EMP-1001', period: '2026-Q1', reviewDate: '2026-04-15',
            overallRating: 4, qualityScore: 4, productivityScore: 5,
            teamworkScore: 4, attendanceScore: 5, initiativeScore: 3,
            strengths: 'Strong delivery, mentors juniors',
            improvements: 'Time-boxing scope on R&D spikes',
            goals: 'Lead the payroll module migration', managerComments: '',
        },
        {
            employeeNo: 'EMP-1002', period: '2026-Q1', reviewDate: '2026-04-15',
            overallRating: 3, qualityScore: 3, productivityScore: 3,
            teamworkScore: 4, attendanceScore: 4, initiativeScore: 3,
            strengths: 'Reliable on BAU', improvements: 'Communicate blockers earlier',
            goals: 'Complete certification', managerComments: '',
        },
    ]

    interface ValidatedReview {
        employeeNo: string
        period: string
        reviewDate: string | null
        overallRating: number | null
        qualityScore: number | null
        productivityScore: number | null
        teamworkScore: number | null
        attendanceScore: number | null
        initiativeScore: number | null
        strengths: string | null
        improvements: string | null
        goals: string | null
        managerComments: string | null
        /** Resolved server-side during validation from employeeNo lookup. */
        employeeId?: string
    }

    function validateReviewRow(row: Record<string, unknown>): { ok: true; value: ValidatedReview } | { ok: false; errors: string[] } {
        const errors: string[] = []
        const employeeNo = asString(row.employeeNo)
        const period = asString(row.period)
        if (!employeeNo) errors.push('employeeNo is required')
        if (!period) errors.push('period is required (e.g. 2026-Q1)')
        let reviewDate: string | null = null
        if (row.reviewDate != null && row.reviewDate !== '') {
            const d = asDate(row.reviewDate)
            if (d.ok === false) errors.push(`reviewDate: ${d.error}`)
            else reviewDate = d.value
        }
        const intField = (name: string, v: unknown): number | null => {
            if (v == null || v === '') return null
            const r = asInt(v, { min: 1, max: 5 })
            if (r.ok === false) { errors.push(`${name}: ${r.error}`); return null }
            return r.value
        }
        const overallRating = intField('overallRating', row.overallRating)
        const qualityScore = intField('qualityScore', row.qualityScore)
        const productivityScore = intField('productivityScore', row.productivityScore)
        const teamworkScore = intField('teamworkScore', row.teamworkScore)
        const attendanceScore = intField('attendanceScore', row.attendanceScore)
        const initiativeScore = intField('initiativeScore', row.initiativeScore)
        if (errors.length > 0 || !employeeNo || !period) {
            return { ok: false, errors }
        }
        return {
            ok: true,
            value: {
                employeeNo,
                period,
                reviewDate,
                overallRating,
                qualityScore,
                productivityScore,
                teamworkScore,
                attendanceScore,
                initiativeScore,
                strengths: asString(row.strengths),
                improvements: asString(row.improvements),
                goals: asString(row.goals),
                managerComments: asString(row.managerComments),
            },
        }
    }

    // GET /performance/import/template
    fastify.get('/performance/import/template', { ...adminAuth, schema: { tags: ['Performance'] } }, async (_request: any, reply: any) => {
        const buf = buildTemplateXlsx({
            sheetName: 'Performance Reviews',
            columns: TEMPLATE_COLUMNS,
            sampleRows: SAMPLE_ROWS,
        })
        return reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', 'attachment; filename="performance-reviews-template.xlsx"')
            .send(buf)
    })

    // POST /performance/import/validate
    fastify.post('/performance/import/validate', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as { rows?: Array<Record<string, unknown>> }
        if (!Array.isArray(body.rows)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must be an array' })
        }
        const validated = validateRows(body.rows, validateReviewRow)

        // Resolve employeeNo → employeeId in one query, then flag unknown
        // codes per-row. Two-pass approach keeps the hot path single-query
        // even for big spreadsheets.
        const okNos = Array.from(new Set(validated.filter((r) => r.ok && r.value).map((r) => (r.value as ValidatedReview).employeeNo)))
        const empMap = new Map<string, string>()
        if (okNos.length > 0) {
            const rows = await db
                .select({ id: employees.id, employeeNo: employees.employeeNo })
                .from(employees)
                .where(and(eq(employees.tenantId, request.user.tenantId), inArray(employees.employeeNo, okNos)))
            rows.forEach((r) => { if (r.employeeNo) empMap.set(r.employeeNo, r.id) })
        }

        const enriched = validated.map((r) => {
            if (!r.ok || !r.value) return r
            const empNo = (r.value as ValidatedReview).employeeNo
            if (!empMap.has(empNo)) {
                return { ...r, ok: false, errors: [...r.errors, `employeeNo "${empNo}" not found in your tenant`] }
            }
            return { ...r, value: { ...(r.value as ValidatedReview), employeeId: empMap.get(empNo)! } }
        })

        const summary = {
            total: enriched.length,
            ok: enriched.filter((r) => r.ok).length,
            invalid: enriched.filter((r) => !r.ok).length,
        }
        return reply.send({ data: { rows: enriched, summary } })
    })

    // POST /performance/import/commit
    fastify.post('/performance/import/commit', { ...adminAuth, schema: { tags: ['Performance'] } }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as { rows?: Array<Record<string, unknown>> }
        if (!Array.isArray(body.rows) || body.rows.length === 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must be a non-empty array' })
        }
        const validated = validateRows(body.rows, validateReviewRow)
        const okNos = Array.from(new Set(validated.filter((r) => r.ok && r.value).map((r) => (r.value as ValidatedReview).employeeNo)))
        if (okNos.length === 0) return reply.send({ data: { inserted: 0 } })

        const rows = await db
            .select({ id: employees.id, employeeNo: employees.employeeNo })
            .from(employees)
            .where(and(eq(employees.tenantId, request.user.tenantId), inArray(employees.employeeNo, okNos)))
        const empMap = new Map(rows.filter((r) => r.employeeNo).map((r) => [r.employeeNo as string, r.id]))

        const toInsert = validated
            .filter((r) => r.ok && r.value && empMap.has((r.value as ValidatedReview).employeeNo))
            .map((r) => {
                const v = r.value as ValidatedReview
                return {
                    tenantId: request.user.tenantId,
                    employeeId: empMap.get(v.employeeNo)!,
                    reviewerId: request.user.id,
                    period: v.period,
                    reviewDate: v.reviewDate,
                    status: 'submitted' as const,
                    overallRating: v.overallRating,
                    qualityScore: v.qualityScore,
                    productivityScore: v.productivityScore,
                    teamworkScore: v.teamworkScore,
                    attendanceScore: v.attendanceScore,
                    initiativeScore: v.initiativeScore,
                    strengths: v.strengths,
                    improvements: v.improvements,
                    goals: v.goals,
                    managerComments: v.managerComments,
                }
            })
        if (toInsert.length === 0) return reply.send({ data: { inserted: 0 } })

        const inserted = await db.insert(performanceReviews).values(toInsert).returning({ id: performanceReviews.id })
        return reply.code(201).send({ data: { inserted: inserted.length } })
    })
}
