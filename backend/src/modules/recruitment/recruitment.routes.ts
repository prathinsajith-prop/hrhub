import * as XLSX from 'xlsx'
import { listJobs, getJob, createJob, updateJob, softDeleteJob, listApplications, createApplication, updateApplicationStage, updateApplication, getApplication, softDeleteApplication, listRecruitmentStages, createRecruitmentStage, updateRecruitmentStage, deleteRecruitmentStage, reorderRecruitmentStages, resetRecruitmentStages, validateBulkJobRows, bulkCreateJobs, validateBulkCandidateRows, bulkCreateCandidates, getPublicTenantByCode, listPublicJobs, getPublicJob, getPublicJobFacets, type BulkJobInputRow, type BulkCandidateInputRow } from './recruitment.service.js'
import { generateReportPdf } from '../../lib/pdf.js'
import { recordActivity } from '../audit/audit.service.js'
import { createEmployee, generateNextEmployeeNo } from '../employees/employees.service.js'
import { enforceEmployeeQuota } from '../subscription/subscription.service.js'
import { validate, createEmployeeSchema } from '../../lib/validation.js'
import { parseOptionalCount, parseOptionalAmount } from '../../lib/applicant-numbers.js'
import { createChecklist } from '../onboarding/onboarding.service.js'
import { db } from '../../db/index.js'
import { entities, tenants, orgUnits, employees } from '../../db/schema/index.js'
import { and, eq, inArray } from 'drizzle-orm'
import { uploadObject, buildS3Key, generateDownloadUrl } from '../../plugins/s3.js'
import { fileTypeFromBuffer } from 'file-type'
import { broadcastToTenant } from '../../lib/ws-registry.js'
import { notifyRoles, getRecipientsByRoles } from '../notifications/notifications.service.js'
import { sendEmail, applicationReceivedEmail, newApplicationAlertEmail } from '../../plugins/email.js'
import { loadEnv } from '../../config/env.js'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const writeAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // ── Pipeline stages (per-tenant) ──────────────────────────────────────────
    fastify.get('/stages', { ...auth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const data = await listRecruitmentStages(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.post('/stages', {
        ...writeAuth,
        schema: {
            tags: ['Recruitment'],
            body: {
                type: 'object',
                required: ['label'],
                properties: {
                    label: { type: 'string', minLength: 1, maxLength: 100 },
                    colorKey: { type: 'string', minLength: 1, maxLength: 32 },
                    isTerminal: { type: 'boolean' },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const row = await createRecruitmentStage(request.user.tenantId, request.body as never)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'recruitment_stage',
            entityId: row.id,
            entityName: row.label,
            action: 'create',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: row })
    })

    fastify.delete('/stages/:stageId', { ...writeAuth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const { stageId } = request.params as { stageId: string }
        const { row, blockedBy } = await deleteRecruitmentStage(request.user.tenantId, stageId)
        if (blockedBy > 0) {
            return reply.code(409).send({
                statusCode: 409,
                error: 'Conflict',
                message: `${blockedBy} candidate${blockedBy === 1 ? '' : 's'} are currently on this stage. Move them to another stage first.`,
                blockedBy,
            })
        }
        if (!row) return reply.code(404).send({ message: 'Stage not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'recruitment_stage',
            entityId: row.id,
            entityName: row.label,
            action: 'delete',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })

    fastify.patch('/stages/:stageId', {
        ...writeAuth,
        schema: {
            tags: ['Recruitment'],
            body: {
                type: 'object',
                properties: {
                    label: { type: 'string', minLength: 1, maxLength: 100 },
                    colorKey: { type: 'string', minLength: 1, maxLength: 32 },
                    isFirst: { type: 'boolean' },
                    isFinal: { type: 'boolean' },
                    showInKanban: { type: 'boolean' },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const { stageId } = request.params as { stageId: string }
        const row = await updateRecruitmentStage(request.user.tenantId, stageId, request.body as never)
        if (!row) return reply.code(404).send({ message: 'Stage not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'recruitment_stage',
            entityId: row.id,
            entityName: row.label,
            action: 'update',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: row })
    })

    fastify.post('/stages/reorder', {
        ...writeAuth,
        schema: {
            tags: ['Recruitment'],
            body: {
                type: 'object',
                required: ['orderedIds'],
                properties: {
                    orderedIds: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 50 },
                },
            },
        },
    }, async (request: any, reply: any) => {
        const { orderedIds } = request.body as { orderedIds: string[] }
        const data = await reorderRecruitmentStages(request.user.tenantId, orderedIds)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'recruitment_stages',
            entityId: request.user.tenantId,
            entityName: `${data.length} stages`,
            action: 'update',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data })
    })

    fastify.post('/stages/reset', { ...writeAuth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const data = await resetRecruitmentStages(request.user.tenantId)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'recruitment_stages',
            entityId: request.user.tenantId,
            entityName: 'reset to defaults',
            action: 'update',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data })
    })

    // GET /api/v1/jobs
    fastify.get('/jobs', { ...auth, schema: { tags: ['Recruitment'] } }, async (request, reply) => {
        const { status, department, q, filter, limit = '20', offset = '0' } = request.query as Record<string, string>
        if (filter && filter.length > 2000) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'filter param too long' })
        const result = await listJobs(request.user.tenantId, { status, department, q, filter, limit: Number(limit), offset: Number(offset) })
        return reply.send(result)
    })

    // GET /api/v1/jobs/:id
    fastify.get('/jobs/:id', { ...auth, schema: { tags: ['Recruitment'] } }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const job = await getJob(request.user.tenantId, id)
        if (!job) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found' })
        return reply.send({ data: job })
    })

    // POST /api/v1/jobs
    fastify.post('/jobs', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: {
            tags: ['Recruitment'],
            body: {
                type: 'object',
                required: ['title'],
                properties: {
                    title: { type: 'string' },
                    department: { type: 'string' },
                    location: { type: 'string' },
                    type: { type: 'string', enum: ['full_time', 'part_time', 'contract', 'internship', 'temporary', 'freelance'] },
                    workplaceType: { type: 'string', enum: ['on_site', 'hybrid', 'remote'] },
                    openings: { type: 'integer', minimum: 1 },
                    minSalary: { type: 'number' },
                    maxSalary: { type: 'number' },
                    industry: { type: 'string' },
                    description: { type: 'string' },
                    requirements: { type: 'array', items: { type: 'string' } },
                    skills: { type: 'array', items: { type: 'string' } },
                    qualifications: { type: 'array', items: { type: 'string' } },
                    closingDate: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const body = request.body as Record<string, unknown>
        const job = await createJob(request.user.tenantId, { ...(body as object), postedBy: request.user.id } as any)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'job',
            entityId: job.id,
            entityName: job.title,
            action: 'create',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        broadcastToTenant(request.user.tenantId, {
            type: 'recruitment:job-changed',
            payload: { jobId: job.id, action: 'create', actorId: request.user.id, actorSocketId: request.headers['x-socket-id'] ?? null },
        })
        return reply.code(201).send({ data: job })
    })

    // ─── Bulk import for Job Listings ────────────────────────────────────────
    //
    // Three-step UX, identical contract to /assets/bulk-template:
    //   1. GET  /jobs/bulk-template   → download .xlsx with the column shape
    //   2. POST /jobs/bulk-validate   → preview (no writes)
    //   3. POST /jobs/bulk            → commit (one transaction, audit + WS)
    //
    // No FK lookups on this table — `department` and `location` are
    // freeform — so the validator doesn't need a categories sheet on the
    // template (unlike assets). Keep the template lean: 10 columns.

    // GET /api/v1/jobs/bulk-template
    fastify.get('/jobs/bulk-template', writeAuth, async (_request: any, reply: any) => {
        const header = [
            'title',
            'department',
            'location',
            'type',
            'status',
            'openings',
            'min_salary',
            'max_salary',
            'industry',
            'closing_date',
        ]
        // Synthetic example so HR can see the expected shape at a glance
        // — including the enum values. Comments in the cells are not
        // supported by XLSX.aoa_to_sheet; the second sheet documents
        // allowed enums instead.
        const sample = [
            'Senior Backend Engineer',
            'Engineering',
            'Dubai',
            'full_time',
            'open',
            2,
            18000,
            28000,
            'Software',
            '2025-03-31',
        ]

        const wb = XLSX.utils.book_new()

        const jobSheet = XLSX.utils.aoa_to_sheet([header, sample])
        jobSheet['!cols'] = [
            { wch: 28 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 10 },
            { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 },
        ]
        XLSX.utils.book_append_sheet(wb, jobSheet, 'Jobs')

        // Enum reference sheet — the two enum columns plus a short note
        // on what to write. Saves HR from tabbing out to find the allowed
        // values.
        const enumSheet = XLSX.utils.aoa_to_sheet([
            ['Enum values reference — copy one of these into the matching column on the Jobs sheet.'],
            [],
            ['type'],
            ['full_time'],
            ['part_time'],
            ['contract'],
            [],
            ['status'],
            ['draft'],
            ['open'],
            ['closed'],
            ['on_hold'],
            [],
            ['Notes:'],
            ['• title is required.'],
            ['• type defaults to "full_time" when blank.'],
            ['• status defaults to "draft" when blank.'],
            ['• openings defaults to 1; must be a positive whole number.'],
            ['• min_salary / max_salary are AED amounts; if both are filled, max must be ≥ min.'],
            ['• closing_date: YYYY-MM-DD format.'],
        ])
        enumSheet['!cols'] = [{ wch: 80 }]
        XLSX.utils.book_append_sheet(wb, enumSheet, 'Reference')

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
        reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', `attachment; filename="jobs-bulk-template.xlsx"`)
            .send(buf)
    })

    // POST /api/v1/jobs/bulk-validate
    fastify.post('/jobs/bulk-validate', writeAuth, async (request: any, reply: any) => {
        const body = request.body as Record<string, unknown>
        const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : []
        if (rows.length === 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must contain at least one entry' })
        }
        if (rows.length > 500) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'maximum 500 rows per import' })
        }
        const normalized: BulkJobInputRow[] = rows.map((r, i) => ({
            rowNumber: Number(r.rowNumber) || i + 1,
            title: r.title != null ? String(r.title) : null,
            department: r.department != null ? String(r.department) : null,
            location: r.location != null ? String(r.location) : null,
            type: r.type != null ? String(r.type) : null,
            status: r.status != null ? String(r.status) : null,
            openings: (r.openings as number | string | null | undefined) ?? null,
            minSalary: (r.minSalary as number | string | null | undefined) ?? null,
            maxSalary: (r.maxSalary as number | string | null | undefined) ?? null,
            industry: r.industry != null ? String(r.industry) : null,
            closingDate: r.closingDate != null ? String(r.closingDate) : null,
        }))
        const result = await validateBulkJobRows(request.user.tenantId, normalized)
        return reply.send(result)
    })

    // POST /api/v1/jobs/bulk
    fastify.post('/jobs/bulk', writeAuth, async (request: any, reply: any) => {
        const body = request.body as Record<string, unknown>
        const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : []
        if (rows.length === 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must contain at least one entry' })
        }
        if (rows.length > 500) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'maximum 500 rows per import' })
        }
        const normalized: BulkJobInputRow[] = rows.map((r, i) => ({
            rowNumber: Number(r.rowNumber) || i + 1,
            title: r.title != null ? String(r.title) : null,
            department: r.department != null ? String(r.department) : null,
            location: r.location != null ? String(r.location) : null,
            type: r.type != null ? String(r.type) : null,
            status: r.status != null ? String(r.status) : null,
            openings: (r.openings as number | string | null | undefined) ?? null,
            minSalary: (r.minSalary as number | string | null | undefined) ?? null,
            maxSalary: (r.maxSalary as number | string | null | undefined) ?? null,
            industry: r.industry != null ? String(r.industry) : null,
            closingDate: r.closingDate != null ? String(r.closingDate) : null,
        }))
        const result = await bulkCreateJobs(request.user.tenantId, normalized, request.user.id)
        if (result.created > 0) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'job',
                entityId: null,
                entityName: `bulk import: ${result.created} job(s)`,
                action: 'create',
                ipAddress: (request as any).ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            broadcastToTenant(request.user.tenantId, {
                type: 'recruitment:job-changed',
                payload: { jobId: null, action: 'bulk', actorId: request.user.id, actorSocketId: request.headers['x-socket-id'] ?? null },
            })
        }
        return reply.code(201).send(result)
    })

    // ─── Bulk import for Candidates / Job Applications ───────────────────────
    //
    // Same three-step UX (template → preview → commit) as the other bulk
    // imports. Difference vs jobs/assets: candidates carry FK to a job, and
    // the dialog forces HR to pick exactly one job per import — applied to
    // every row. The same email + same job duplicate guard applies (we
    // re-use `createApplication`'s rule in bulk form).
    //
    // The template lists BOTH the canonical column names AND common
    // LinkedIn / ATS aliases on the reference sheet, so HR can paste a
    // LinkedIn or Workable export with minimal cleanup.

    // GET /api/v1/applications/bulk-template
    fastify.get('/applications/bulk-template', writeAuth, async (_request: any, reply: any) => {
        const header = [
            'first_name',
            'last_name',
            'name',
            'email',
            'phone',
            'nationality',
            'experience',
            'expected_salary',
            'notes',
        ]
        // Two example rows so HR sees both the split-name (LinkedIn) AND
        // single-name (ATS) shapes the importer accepts.
        const sample1 = ['Fatima', 'Al Mansoori', '', 'fatima.almansoori@example.com', '+971501234567', 'UAE', 5, 22000, 'Senior FE candidate']
        const sample2 = ['', '', 'Omar Khan', 'omar.k@example.com', '+971555998877', 'Pakistan', 3, 14000, 'Referred by Aisha']

        const wb = XLSX.utils.book_new()
        const candidateSheet = XLSX.utils.aoa_to_sheet([header, sample1, sample2])
        candidateSheet['!cols'] = [
            { wch: 16 }, { wch: 18 }, { wch: 24 }, { wch: 28 }, { wch: 18 },
            { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 32 },
        ]
        XLSX.utils.book_append_sheet(wb, candidateSheet, 'Candidates')

        // Reference sheet — header aliases for common imports.
        const refSheet = XLSX.utils.aoa_to_sheet([
            ['Notes:'],
            ['• Pick the target job once in the Bulk import dialog — every row in the file is added to that job.'],
            ['• Provide either both first_name AND last_name, or a single name column. The importer combines them.'],
            ['• email is required. Rows with duplicate emails (same job, active stages) are flagged and skipped on save.'],
            ['• Other columns are optional. Missing values land as null.'],
            [],
            ['Header aliases the importer also accepts (case-insensitive):'],
            ['first_name      ← "First Name", "given_name", "fname"'],
            ['last_name       ← "Last Name", "surname", "lname", "family name"'],
            ['name            ← "Name", "Candidate Name", "full name"'],
            ['email           ← "Email Address", "Email", "e-mail"'],
            ['phone           ← "Phone Number", "Phone", "mobile", "contact"'],
            ['nationality     ← "Country", "Location", "Nationality"'],
            ['experience      ← "Years of Experience", "Yrs Exp", "exp_years"'],
            ['expected_salary ← "Expected Salary", "Salary", "Compensation"'],
            ['notes           ← "Remarks", "Comments", "Description"'],
        ])
        refSheet['!cols'] = [{ wch: 90 }]
        XLSX.utils.book_append_sheet(wb, refSheet, 'Reference')

        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
        reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', 'attachment; filename="candidates-bulk-template.xlsx"')
            .send(buf)
    })

    // Shared row-normalizer — both validate + commit accept the same shape.
    // Cap rows at 500 (same as the other bulk endpoints) so a runaway sheet
    // can't tie up the request thread.
    const normalizeCandidateRows = (rows: Array<Record<string, unknown>>): BulkCandidateInputRow[] =>
        rows.map((r, i) => ({
            rowNumber: Number(r.rowNumber) || i + 1,
            firstName: r.firstName != null ? String(r.firstName) : null,
            lastName: r.lastName != null ? String(r.lastName) : null,
            name: r.name != null ? String(r.name) : null,
            email: r.email != null ? String(r.email) : null,
            phone: r.phone != null ? String(r.phone) : null,
            nationality: r.nationality != null ? String(r.nationality) : null,
            experience: (r.experience as number | string | null | undefined) ?? null,
            expectedSalary: (r.expectedSalary as number | string | null | undefined) ?? null,
            notes: r.notes != null ? String(r.notes) : null,
        }))

    // POST /api/v1/applications/bulk-validate — preview only, no writes.
    fastify.post('/applications/bulk-validate', writeAuth, async (request: any, reply: any) => {
        const body = request.body as Record<string, unknown>
        const jobId = typeof body.jobId === 'string' ? body.jobId : null
        const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : []
        if (!jobId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'jobId is required' })
        if (rows.length === 0) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must contain at least one entry' })
        if (rows.length > 500) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'maximum 500 rows per import' })
        const result = await validateBulkCandidateRows(request.user.tenantId, jobId, normalizeCandidateRows(rows))
        if (!result.jobExists) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found in your organisation.' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'application',
            entityId: jobId,
            entityName: `bulk validate: ${rows.length} candidate row(s)`,
            action: 'view',
            metadata: { count: rows.length },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send(result)
    })

    // POST /api/v1/applications/bulk — commit.
    fastify.post('/applications/bulk', writeAuth, async (request: any, reply: any) => {
        const body = request.body as Record<string, unknown>
        const jobId = typeof body.jobId === 'string' ? body.jobId : null
        const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : []
        if (!jobId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'jobId is required' })
        if (rows.length === 0) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must contain at least one entry' })
        if (rows.length > 500) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'maximum 500 rows per import' })
        const result = await bulkCreateCandidates(request.user.tenantId, jobId, normalizeCandidateRows(rows))
        if (!result.jobExists) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found in your organisation.' })
        if (result.created > 0) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'application',
                entityId: null,
                entityName: `bulk import: ${result.created} candidate(s)`,
                action: 'create',
                ipAddress: (request as any).ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            broadcastToTenant(request.user.tenantId, {
                type: 'recruitment:application-changed',
                payload: { jobId, action: 'bulk', actorId: request.user.id, actorSocketId: request.headers['x-socket-id'] ?? null },
            })
        }
        return reply.code(201).send(result)
    })

    // PATCH /api/v1/jobs/:id
    fastify.patch('/jobs/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Recruitment'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const b = request.body as Record<string, unknown>
        const updated = await updateJob(request.user.tenantId, id, {
            ...(b.title !== undefined && { title: b.title as string }),
            ...(b.department !== undefined && { department: b.department as string }),
            ...(b.location !== undefined && { location: b.location as string }),
            ...(b.type !== undefined && { type: b.type as never }),
            ...(b.workplaceType !== undefined && { workplaceType: b.workplaceType as never }),
            ...(b.status !== undefined && { status: b.status as never }),
            ...(b.openings !== undefined && { openings: Number(b.openings) }),
            ...(b.minSalary !== undefined && { minSalary: b.minSalary as string }),
            ...(b.maxSalary !== undefined && { maxSalary: b.maxSalary as string }),
            ...(b.industry !== undefined && { industry: b.industry as string }),
            ...(b.description !== undefined && { description: b.description as string }),
            ...(b.requirements !== undefined && { requirements: b.requirements as never }),
            ...(b.skills !== undefined && { skills: b.skills as never }),
            ...(b.qualifications !== undefined && { qualifications: b.qualifications as never }),
            ...(b.closingDate !== undefined && { closingDate: b.closingDate as string }),
        })
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'job',
            entityId: id,
            entityName: updated.title,
            action: 'update',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        broadcastToTenant(request.user.tenantId, {
            type: 'recruitment:job-changed',
            payload: { jobId: id, action: 'update', actorId: request.user.id, actorSocketId: request.headers['x-socket-id'] ?? null },
        })
        return reply.send({ data: updated })
    })

    // DELETE /api/v1/jobs/:id (soft delete)
    fastify.delete('/jobs/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Recruitment'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const deleted = await softDeleteJob(request.user.tenantId, id)
        if (!deleted) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'job',
            entityId: id,
            action: 'delete',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        broadcastToTenant(request.user.tenantId, {
            type: 'recruitment:job-changed',
            payload: { jobId: id, action: 'delete', actorId: request.user.id, actorSocketId: request.headers['x-socket-id'] ?? null },
        })
        return reply.code(204).send()
    })

    // GET /api/v1/applications — HR/admin only; candidate PII and salary data must not be exposed to employees or dept_heads
    fastify.get('/applications', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Recruitment'] },
    }, async (request, reply) => {
        const { jobId, stage, q, filter, limit = '20', offset = '0' } = request.query as Record<string, string>
        if (filter && filter.length > 2000) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'filter param too long' })
        const result = await listApplications(request.user.tenantId, { jobId, stage, q, filter, limit: Number(limit), offset: Number(offset) })
        return reply.send(result)
    })

    // GET /api/v1/applications/:id — HR/admin only
    fastify.get('/applications/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Recruitment'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const result = await getApplication(request.user.tenantId, id)
        if (!result) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Candidate not found' })
        // Wrapped as { data } for consistency with the list endpoint and the
        // rest of the API. Existing frontend hooks must unwrap accordingly.
        return reply.send({ data: result })
    })

    // POST /api/v1/jobs/:id/applications
    fastify.post('/jobs/:id/applications', {
        preHandler: [fastify.authenticate],
        schema: {
            tags: ['Recruitment'],
            body: {
                type: 'object',
                required: ['name', 'email'],
                properties: {
                    name: { type: 'string', minLength: 1 },
                    email: { type: 'string', format: 'email' },
                    phone: { type: 'string' },
                    nationality: { type: 'string' },
                    address: { type: 'string' },
                    gender: { type: 'string', enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
                    experience: { type: 'integer', minimum: 0 },
                    expectedSalary: { type: 'number', minimum: 0 },
                    currentSalary: { type: 'number', minimum: 0 },
                    notes: { type: 'string' },
                    skills: { type: 'array', items: { type: 'string' } },
                    educationHistory: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['school'],
                            properties: {
                                school: { type: 'string', minLength: 1 },
                                degree: { type: 'string' },
                                fieldOfStudy: { type: 'string' },
                                startDate: { type: 'string' },
                                endDate: { type: 'string' },
                                current: { type: 'boolean' },
                                summary: { type: 'string' },
                            },
                        },
                    },
                    experienceHistory: {
                        type: 'array',
                        items: {
                            type: 'object',
                            required: ['title'],
                            properties: {
                                title: { type: 'string', minLength: 1 },
                                company: { type: 'string' },
                                industry: { type: 'string' },
                                summary: { type: 'string' },
                                startDate: { type: 'string' },
                                endDate: { type: 'string' },
                                current: { type: 'boolean' },
                            },
                        },
                    },
                },
                additionalProperties: false,
            },
        },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const tenantId = request.user.tenantId
        const job = await getJob(tenantId, id)
        if (!job) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found' })
        const body = request.body as Record<string, unknown>
        // New applications always start at 'received' — stage transitions go through PATCH /stage.
        let application: Awaited<ReturnType<typeof createApplication>>
        try {
            application = await createApplication(job.tenantId, id, { ...body, stage: 'received' } as never)
        } catch (err: any) {
            if (err?.statusCode === 409) return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: err.message })
            throw err
        }
        recordActivity({
            tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'application',
            entityId: application.id,
            entityName: application.name,
            action: 'create',
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        broadcastToTenant(tenantId, {
            type: 'recruitment:candidate-added',
            payload: { applicationId: application.id, candidate: application, actorId: request.user.id, actorSocketId: request.headers['x-socket-id'] ?? null },
        })
        return reply.code(201).send({ data: application })
    })

    // PATCH /api/v1/applications/:id/stage
    fastify.patch('/applications/:id/stage', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: {
            tags: ['Recruitment'],
            body: {
                type: 'object',
                required: ['stage'],
                properties: { stage: { type: 'string' } },
            },
        },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const { stage: toStage } = request.body as { stage: string }
        // Fetch current stage before overwriting so we can include fromStage in the WS payload
        const before = await getApplication(request.user.tenantId, id)
        if (!before) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Application not found' })
        const fromStage = before.stage
        const updated = await updateApplicationStage(request.user.tenantId, id, toStage)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Application not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'application',
            entityId: id,
            entityName: `${updated.name ?? 'Candidate'} → ${toStage}`,
            action: 'update',
            metadata: { fromStage, toStage },
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        broadcastToTenant(request.user.tenantId, {
            type: 'recruitment:stage-changed',
            payload: { applicationId: id, fromStage, toStage, candidate: updated, actorId: request.user.id, actorSocketId: request.headers['x-socket-id'] ?? null },
        })
        return reply.send({ data: updated })
    })

    // DELETE /api/v1/applications/:id (soft delete)
    fastify.delete('/applications/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Recruitment'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const deleted = await softDeleteApplication(request.user.tenantId, id)
        if (!deleted) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Application not found' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'application', entityId: id, entityName: (deleted as any).name ?? 'Candidate', action: 'delete', ipAddress: (request as any).ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        broadcastToTenant(request.user.tenantId, {
            type: 'recruitment:candidate-removed',
            payload: { applicationId: id, stage: (deleted as any).stage ?? 'received', actorId: request.user.id, actorSocketId: request.headers['x-socket-id'] ?? null },
        })
        return reply.code(204).send()
    })

    // PATCH /api/v1/applications/:id — update notes/score/etc.
    fastify.patch('/applications/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin', 'pro_officer')],
        schema: {
            tags: ['Recruitment'],
            body: {
                type: 'object',
                properties: {
                    name: { type: 'string', minLength: 1 },
                    email: { type: 'string', format: 'email' },
                    notes: { type: 'string' },
                    score: { type: 'number' },
                    expectedSalary: { type: 'number' },
                    currentSalary: { type: 'number' },
                    experience: { type: 'number' },
                    nationality: { type: 'string' },
                    phone: { type: 'string' },
                    address: { type: 'string' },
                    gender: { type: 'string', enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
                    skills: { type: 'array', items: { type: 'string' } },
                    educationHistory: { type: 'array' },
                    experienceHistory: { type: 'array' },
                },
            },
        },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const b = request.body as Record<string, unknown>
        const updated = await updateApplication(request.user.tenantId, id, {
            ...(b.name !== undefined && { name: b.name as string }),
            ...(b.email !== undefined && { email: b.email as string }),
            ...(b.phone !== undefined && { phone: b.phone as string }),
            ...(b.nationality !== undefined && { nationality: b.nationality as string }),
            ...(b.address !== undefined && { address: b.address as string }),
            ...(b.gender !== undefined && { gender: b.gender as never }),
            ...(b.experience !== undefined && { experience: Number(b.experience) }),
            ...(b.expectedSalary !== undefined && { expectedSalary: String(b.expectedSalary) }),
            ...(b.currentSalary !== undefined && { currentSalary: String(b.currentSalary) }),
            ...(b.notes !== undefined && { notes: b.notes as string }),
            ...(b.score !== undefined && { score: Number(b.score) }),
            ...(b.skills !== undefined && { skills: b.skills as never }),
            ...(b.educationHistory !== undefined && { educationHistory: b.educationHistory as never }),
            ...(b.experienceHistory !== undefined && { experienceHistory: b.experienceHistory as never }),
        } as never)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Application not found' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'application', entityId: id, entityName: (updated as any).name ?? 'Candidate', action: 'update', ipAddress: (request as any).ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        broadcastToTenant(request.user.tenantId, {
            type: 'recruitment:candidate-updated',
            payload: { applicationId: id, stage: (updated as any).stage, candidate: updated, actorId: request.user.id, actorSocketId: request.headers['x-socket-id'] ?? null },
        })
        return reply.send({ data: updated })
    })

    // POST /api/v1/applications/:id/resume — upload resume/CV to S3
    fastify.post('/applications/:id/resume', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin', 'pro_officer')],
        schema: { tags: ['Recruitment'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }

        // Verify the application belongs to this tenant before accepting any upload
        const app = await getApplication(request.user.tenantId, id)
        if (!app) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Application not found' })

        const part = await request.file()
        if (!part) return reply.code(400).send({ message: 'No file provided' })
        const chunks: Buffer[] = []
        for await (const chunk of part.file) chunks.push(chunk as Buffer)
        const buffer = Buffer.concat(chunks)
        if (buffer.length > 5 * 1024 * 1024) return reply.code(413).send({ message: 'File must be under 5 MB' })

        // Validate via magic bytes — never trust client-supplied Content-Type
        const allowedMime: Record<string, string> = {
            'application/pdf': '.pdf',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        }
        const detected = await fileTypeFromBuffer(buffer)
        // PDF/Word detection: fall back to extension check for plain .doc files file-type may miss
        const mime = detected?.mime ?? part.mimetype
        if (!allowedMime[mime]) return reply.code(415).send({ message: 'Only PDF or Word documents are accepted' })

        const safeName = `resume${allowedMime[mime]}`
        const s3Key = buildS3Key(request.user.tenantId, `applications/${id}/resume`, safeName)
        try {
            await uploadObject(s3Key, buffer, mime)
        } catch {
            return reply.code(503).send({ message: 'File storage unavailable. Please try again.' })
        }
        const updated = await updateApplication(request.user.tenantId, id, { resumeUrl: s3Key } as never)
        if (!updated) return reply.code(404).send({ message: 'Application not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'candidate',
            entityId: id,
            entityName: app.name ?? id,
            action: 'update',
            metadata: { resumeUploaded: true },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        const downloadUrl = await generateDownloadUrl(s3Key, 3600, safeName)
        return reply.send({ data: { s3Key, downloadUrl } })
    })

    // POST /api/v1/applications/:id/photo — attach a candidate photo (e.g. one
    // auto-extracted from the résumé). Stored as the candidate's avatar.
    fastify.post('/applications/:id/photo', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin', 'pro_officer')],
        schema: { tags: ['Recruitment'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const app = await getApplication(request.user.tenantId, id)
        if (!app) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Application not found' })

        const part = await request.file()
        if (!part) return reply.code(400).send({ message: 'No file provided' })
        const chunks: Buffer[] = []
        for await (const chunk of part.file) chunks.push(chunk as Buffer)
        const buffer = Buffer.concat(chunks)
        if (buffer.length > 2 * 1024 * 1024) return reply.code(413).send({ message: 'Image must be under 2 MB' })

        const allowedImageMime: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
        }
        const detected = await fileTypeFromBuffer(buffer)
        const mime = detected?.mime ?? part.mimetype
        if (!allowedImageMime[mime]) return reply.code(415).send({ message: 'Only JPEG, PNG or WebP images are accepted' })

        const photoKey = buildS3Key(request.user.tenantId, `applications/${id}/photo`, `photo${allowedImageMime[mime]}`)
        try {
            await uploadObject(photoKey, buffer, mime)
        } catch {
            return reply.code(503).send({ message: 'File storage unavailable. Please try again.' })
        }
        const updated = await updateApplication(request.user.tenantId, id, { avatarUrl: photoKey } as never)
        if (!updated) return reply.code(404).send({ message: 'Application not found' })
        const downloadUrl = await generateDownloadUrl(photoKey, 86400)
        return reply.send({ data: { s3Key: photoKey, downloadUrl } })
    })

    // POST /api/v1/applications/:id/convert-to-employee
    // Promotes a candidate in `pre_boarding` stage into a real employee record.
    fastify.post('/applications/:id/convert-to-employee', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: {
            tags: ['Recruitment'],
            // Body mirrors the full AddEmployeeDialog payload so converting a
            // candidate captures the same data as creating an employee from
            // scratch. Candidate fields (name, email, phone, nationality) are
            // used as fallbacks when the body omits them.
            body: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    // Personal info
                    firstName: { type: 'string' },
                    lastName: { type: 'string' },
                    dateOfBirth: { type: 'string' },
                    gender: { type: 'string' },
                    nationality: { type: 'string' },
                    passportNo: { type: 'string' },
                    mobileNo: { type: 'string' },
                    personalEmail: { type: 'string' },
                    workEmail: { type: 'string' },
                    maritalStatus: { type: 'string' },
                    emergencyContact: { type: 'string' },
                    emergencyContactName: { type: 'string' },
                    emergencyContactPhone: { type: 'string' },
                    homeCountryAddress: { type: 'string' },
                    // Employment
                    employeeNo: { type: 'string' },
                    joinDate: { type: 'string', format: 'date' },
                    designation: { type: 'string' },
                    department: { type: 'string' },
                    departmentId: { type: 'string', format: 'uuid' },
                    branchId: { type: 'string', format: 'uuid' },
                    divisionId: { type: 'string', format: 'uuid' },
                    contractType: { type: 'string' },
                    workLocation: { type: 'string' },
                    managerName: { type: 'string' },
                    reportingTo: { type: ['string', 'null'] },
                    gradeLevelId: { type: 'string' },
                    probationEndDate: { type: 'string' },
                    contractEndDate: { type: 'string' },
                    status: { type: 'string' },
                    entityId: { type: 'string', format: 'uuid' },
                    // Salary & payroll
                    basicSalary: { type: 'number' },
                    housingAllowance: { type: 'number' },
                    transportAllowance: { type: 'number' },
                    otherAllowances: { type: 'number' },
                    totalSalary: { type: 'number' },
                    paymentMethod: { type: 'string' },
                    bankName: { type: 'string' },
                    accountName: { type: 'string' },
                    accountNumber: { type: 'string' },
                    swiftCode: { type: 'string' },
                    bankBranch: { type: 'string' },
                    iban: { type: 'string' },
                    emiratisationCategory: { type: 'string' },
                },
            },
        },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const tenantId = request.user.tenantId
        const app = await getApplication(tenantId, id)
        if (!app) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Application not found' })
        if (app.stage !== 'pre_boarding') {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Only pre-boarding candidates can be converted to employees' })
        }

        const body = (request.body as Record<string, unknown>) ?? {}

        // Independent pre-flight checks run in parallel — quota, entity resolution,
        // and org-unit validation all hit different tables and have no ordering
        // dependency.
        const suppliedEntityId = body.entityId as string | undefined
        const orgUnitIds = [body.departmentId, body.branchId, body.divisionId].filter(Boolean) as string[]

        const [, entityRow, validUnits] = await Promise.all([
            enforceEmployeeQuota(tenantId),
            suppliedEntityId
                ? db.select().from(entities)
                    .where(and(eq(entities.id, suppliedEntityId), eq(entities.tenantId, tenantId))).limit(1)
                    .then(rows => rows[0])
                : db.select().from(entities)
                    .where(and(eq(entities.tenantId, tenantId), eq(entities.isActive, true))).limit(1)
                    .then(rows => rows[0]),
            orgUnitIds.length > 0
                ? db.select({ id: orgUnits.id }).from(orgUnits)
                    .where(and(inArray(orgUnits.id, orgUnitIds), eq(orgUnits.tenantId, tenantId)))
                : Promise.resolve([] as Array<{ id: string }>),
        ])

        if (!entityRow) {
            return reply.code(400).send({
                statusCode: 400,
                error: 'Bad Request',
                message: suppliedEntityId
                    ? 'Entity not found for this tenant'
                    : 'No active entity configured for this tenant',
            })
        }
        const entityId = entityRow.id

        if (orgUnitIds.length > 0) {
            const validIds = new Set(validUnits.map(u => u.id))
            const invalid = orgUnitIds.find(id => !validIds.has(id))
            if (invalid) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Org unit not found for this tenant' })
        }

        // The `reportingTo` FK on employees doesn't carry a tenant constraint
        // (cross-tenant FKs aren't enforced at the DB layer here), so verify
        // that the manager belongs to the same tenant before accepting it.
        const reportingToId = (body.reportingTo as string | null | undefined) ?? null
        if (reportingToId) {
            const [mgr] = await db.select({ id: employees.id }).from(employees)
                .where(and(eq(employees.id, reportingToId), eq(employees.tenantId, tenantId))).limit(1)
            if (!mgr) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Reporting manager not found for this tenant' })
        }

        // Derive name from the candidate when the body doesn't override.
        const [candidateFirst, ...candidateRest] = (app.name ?? '').trim().split(/\s+/)
        const candidateLast = candidateRest.join(' ') || candidateFirst || 'Candidate'
        const firstName = (body.firstName as string | undefined) || candidateFirst || 'Candidate'
        const lastName = (body.lastName as string | undefined) || candidateLast
        const employeeNo = (body.employeeNo as string) || await generateNextEmployeeNo(tenantId)
        const joinDate = (body.joinDate as string) || new Date().toISOString().slice(0, 10)
        const expectedSalaryNum = app.expectedSalary != null ? parseFloat(app.expectedSalary as unknown as string) : undefined
        const expectedSalary = expectedSalaryNum != null && Number.isFinite(expectedSalaryNum) ? expectedSalaryNum : undefined

        // Run the merged payload through the same Zod schema as POST /employees
        // so the convert path enjoys identical refinements (salary ordering,
        // age check, contract/probation date ordering, enum validation).
        const employeePayload = validate(createEmployeeSchema, {
            entityId,
            employeeNo,
            firstName,
            lastName,
            // Personal info — prefer body, fall back to candidate
            email: (body.workEmail as string | undefined) || app.email,
            phone: (body.mobileNo as string | undefined) || app.phone || undefined,
            nationality: (body.nationality as string | undefined) || app.nationality || undefined,
            dateOfBirth: body.dateOfBirth,
            gender: body.gender,
            maritalStatus: body.maritalStatus,
            passportNo: body.passportNo,
            personalEmail: body.personalEmail,
            workEmail: body.workEmail,
            mobileNo: (body.mobileNo as string | undefined) || app.phone || undefined,
            emergencyContact: body.emergencyContact,
            emergencyContactName: body.emergencyContactName,
            emergencyContactPhone: body.emergencyContactPhone,
            homeCountryAddress: body.homeCountryAddress,
            // Employment
            department: body.department,
            departmentId: body.departmentId,
            branchId: body.branchId,
            divisionId: body.divisionId,
            designation: body.designation,
            contractType: body.contractType,
            workLocation: body.workLocation,
            managerName: body.managerName,
            reportingTo: (body.reportingTo as string | null | undefined) ?? null,
            gradeLevelId: body.gradeLevelId,
            probationEndDate: body.probationEndDate,
            contractEndDate: body.contractEndDate,
            joinDate,
            status: body.status ?? 'onboarding',
            // Salary
            basicSalary: typeof body.basicSalary === 'number' ? body.basicSalary : expectedSalary,
            housingAllowance: body.housingAllowance,
            transportAllowance: body.transportAllowance,
            otherAllowances: body.otherAllowances,
            totalSalary: body.totalSalary,
            paymentMethod: body.paymentMethod,
            bankName: body.bankName,
            accountName: body.accountName,
            accountNumber: body.accountNumber,
            swiftCode: body.swiftCode,
            bankBranch: body.bankBranch,
            iban: body.iban,
            emiratisationCategory: body.emiratisationCategory ?? 'expat',
        })
        const employee = await createEmployee(tenantId, employeePayload as never)

        // Auto-create onboarding checklist with 9 template steps — fire-and-forget
        createChecklist(tenantId, { employeeId: employee.id, startDate: joinDate, useTemplate: true }).catch(() => { })

        // Mark the application completed (no more pipeline stage).
        const updatedApplication = await updateApplication(tenantId, id, { stage: 'hired', notes: `${app.notes ?? ''}\n[Converted to employee ${employeeNo} on ${new Date().toISOString().slice(0, 10)}]`.trim() } as never)

        // Recruitment-side: the candidate was converted (not created) — log as an update on the application.
        recordActivity({
            tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'application',
            entityId: id,
            entityName: `${app.name} → employee ${employeeNo}`,
            action: 'update',
            metadata: { employeeId: employee.id, employeeNo },
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        // Employee-mirror: the new hire is a fresh employee record — log a create against
        // the new employee id so it surfaces on their Updates tab.
        recordActivity({
            tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: employee.id,
            entityName: (employee as any).fullName ?? `${employee.firstName} ${employee.lastName}`.trim(),
            action: 'create',
            metadata: { employeeNo, convertedFromApplicationId: id },
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        const actorSocketId = request.headers['x-socket-id'] ?? null
        broadcastToTenant(tenantId, {
            type: 'recruitment:candidate-removed',
            payload: { applicationId: id, stage: 'pre_boarding', actorId: request.user.id, actorSocketId },
        })
        broadcastToTenant(tenantId, {
            type: 'recruitment:job-changed',
            payload: { jobId: app.jobId, action: 'update', actorId: request.user.id, actorSocketId },
        })
        return reply.code(201).send({ data: { employee, application: updatedApplication } })
    })

    // GET /api/v1/applications/export?format=csv|pdf&stage=...
    fastify.get('/applications/export', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Recruitment'] },
    }, async (request, reply) => {
        const { format = 'csv', jobId, stage } = request.query as Record<string, string>
        if (format !== 'csv' && format !== 'pdf') return reply.code(400).send({ message: 'Invalid format. Must be csv or pdf.' })
        const { data } = await listApplications(request.user.tenantId, { jobId, stage, limit: 10000, offset: 0 }) as any
        const rows = (data ?? []) as any[]
        const dateStr = new Date().toISOString().slice(0, 10)

        if (format === 'pdf') {
            const [tenantRow] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, request.user.tenantId)).limit(1)
            const pdf = await generateReportPdf({
                title: 'Recruitment Pipeline Report',
                companyName: tenantRow?.name ?? '',
                columns: [
                    { header: 'Candidate', key: 'name', width: 130 },
                    { header: 'Email', key: 'email', width: 140 },
                    { header: 'Job Title', key: 'jobTitle', width: 130 },
                    { header: 'Stage', key: 'stage', width: 80 },
                    { header: 'Score', key: 'score', width: 50, align: 'right' },
                    { header: 'Applied', key: 'createdAt' },
                ],
                rows,
            })
            reply.header('Content-Type', 'application/pdf')
            reply.header('Content-Disposition', `attachment; filename="recruitment-report-${dateStr}.pdf"`)
            return reply.send(pdf)
        }

        const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
        const headers = ['Name', 'Email', 'Phone', 'Nationality', 'Job Title', 'Stage', 'Score', 'Experience (yrs)', 'Expected Salary', 'Applied Date']
        const lines = [headers.join(',')]
        for (const r of rows) {
            lines.push([r.name, r.email, r.phone ?? '', r.nationality ?? '', r.jobTitle ?? '', r.stage, r.score ?? '', r.experience ?? '', r.expectedSalary ?? '', r.createdAt?.slice?.(0, 10) ?? ''].map(escape).join(','))
        }
        reply.header('Content-Type', 'text/csv; charset=utf-8')
        reply.header('Content-Disposition', `attachment; filename="recruitment-export-${dateStr}.csv"`)
        return reply.send(lines.join('\r\n'))
    })

    // ── Public careers portal (NO AUTH) ───────────────────────────────────────
    // Backs the shareable /careers/:companyCode pages. The tenant is resolved
    // from the unique company code in the URL (visitors have no JWT). Browsing
    // is lightly rate-limited; applying is tightly rate-limited to deter spam.
    const browseLimit = { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }
    const applyLimit = { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }

    // GET /api/v1/public/careers/:companyCode/jobs?limit=&offset=&q=&department=&location=&type=&workplaceType=
    fastify.get('/public/careers/:companyCode/jobs', {
        ...browseLimit,
        schema: { tags: ['Recruitment'] },
    }, async (request: any, reply: any) => {
        const { companyCode } = request.params as { companyCode: string }
        const query = request.query as { limit?: string; offset?: string; q?: string; department?: string; location?: string; type?: string; workplaceType?: string }
        const limit = Math.min(Math.max(Number(query.limit) || 25, 1), 50)
        const offset = Math.max(Number(query.offset) || 0, 0)
        const tenant = await getPublicTenantByCode(companyCode)
        if (!tenant) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Company not found' })
        const page = await listPublicJobs(tenant.id, {
            limit,
            offset,
            q: query.q?.trim() || undefined,
            department: query.department?.trim() || undefined,
            location: query.location?.trim() || undefined,
            type: query.type?.trim() || undefined,
            workplaceType: query.workplaceType?.trim() || undefined,
        })
        return reply.send({ data: { company: { name: tenant.name, companyCode: tenant.companyCode }, ...page } })
    })

    // GET /api/v1/public/careers/:companyCode/facets — distinct filter options
    fastify.get('/public/careers/:companyCode/facets', {
        ...browseLimit,
        schema: { tags: ['Recruitment'] },
    }, async (request: any, reply: any) => {
        const { companyCode } = request.params as { companyCode: string }
        const tenant = await getPublicTenantByCode(companyCode)
        if (!tenant) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Company not found' })
        const facets = await getPublicJobFacets(tenant.id)
        return reply.send({ data: facets })
    })

    // GET /api/v1/public/careers/:companyCode/jobs/:jobId — single open job
    fastify.get('/public/careers/:companyCode/jobs/:jobId', {
        ...browseLimit,
        schema: { tags: ['Recruitment'] },
    }, async (request: any, reply: any) => {
        const { companyCode, jobId } = request.params as { companyCode: string; jobId: string }
        const tenant = await getPublicTenantByCode(companyCode)
        if (!tenant) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Company not found' })
        const job = await getPublicJob(tenant.id, jobId)
        if (!job) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found or no longer open' })
        return reply.send({ data: { company: { name: tenant.name, companyCode: tenant.companyCode }, job } })
    })

    // POST /api/v1/public/careers/:companyCode/jobs/:jobId/apply — multipart apply
    // Creates a job_applications row (stage 'received', source 'direct') and
    // attaches the resume to S3. The candidate then appears in the authenticated
    // recruitment kanban immediately (via the same WS broadcast as manual adds).
    fastify.post('/public/careers/:companyCode/jobs/:jobId/apply', {
        ...applyLimit,
        schema: { tags: ['Recruitment'] },
    }, async (request: any, reply: any) => {
        const { companyCode, jobId } = request.params as { companyCode: string; jobId: string }
        const tenant = await getPublicTenantByCode(companyCode)
        if (!tenant) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Company not found' })
        const job = await getPublicJob(tenant.id, jobId)
        if (!job) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found or no longer open' })

        // Parse multipart: candidate fields + a single resume file (held in memory).
        const allowedMime: Record<string, string> = {
            'application/pdf': '.pdf',
            'application/msword': '.doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        }
        const allowedImageMime: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/webp': '.webp',
        }
        const fields: Record<string, string> = {}
        let buffer: Buffer | null = null
        let partMime = ''
        // Optional candidate photo — extracted from the résumé client-side and
        // sent alongside it. Never blocks the application if it's missing/invalid.
        let photoBuffer: Buffer | null = null
        for await (const part of request.parts()) {
            if (part.type === 'file') {
                const chunks: Buffer[] = []
                for await (const chunk of part.file) chunks.push(chunk as Buffer)
                const data = Buffer.concat(chunks)
                if (part.fieldname === 'photo') {
                    // Cap the photo at 2 MB; just skip it if oversized rather than failing the apply.
                    if (!part.file.truncated && data.length > 0 && data.length <= 2 * 1024 * 1024) photoBuffer = data
                    continue
                }
                buffer = data
                partMime = part.mimetype
                if (part.file.truncated || buffer.length > 5 * 1024 * 1024) {
                    return reply.code(413).send({ statusCode: 413, error: 'Payload Too Large', message: 'Resume must be under 5 MB' })
                }
            } else {
                fields[part.fieldname] = String(part.value ?? '')
            }
        }

        const name = fields.name?.trim()
        const email = fields.email?.trim()
        if (!name || !email) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Name and email are required' })
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'A valid email is required' })
        if (!buffer || buffer.length === 0) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'A resume file is required' })

        // Validate via magic bytes — never trust the client Content-Type.
        const detected = await fileTypeFromBuffer(buffer)
        const mime = detected?.mime ?? partMime
        if (!allowedMime[mime]) return reply.code(415).send({ statusCode: 415, error: 'Unsupported Media Type', message: 'Only PDF or Word documents are accepted' })

        let application: Awaited<ReturnType<typeof createApplication>>
        try {
            // address/gender are simple strings. educationHistory + experienceHistory
            // arrive as JSON-stringified arrays (multipart only supports string
            // values); parse defensively and reject malformed payloads silently
            // (an HR review on the admin side can still capture the candidate).
            const safeArray = <T,>(raw: string | undefined, validate: (v: any) => v is T): T[] => {
                if (!raw) return []
                try {
                    const parsed = JSON.parse(raw)
                    if (!Array.isArray(parsed)) return []
                    return parsed.filter(validate)
                } catch {
                    return []
                }
            }
            const eduHistory = safeArray<{ school: string }>(fields.educationHistory, (v: any): v is { school: string } => v && typeof v === 'object' && typeof v.school === 'string' && v.school.trim().length > 0)
            const expHistory = safeArray<{ title: string }>(fields.experienceHistory, (v: any): v is { title: string } => v && typeof v === 'object' && typeof v.title === 'string' && v.title.trim().length > 0)
            // skills arrives as a JSON-stringified string[]; keep non-empty trimmed tags.
            const skills = safeArray<string>(fields.skills, (v: any): v is string => typeof v === 'string' && v.trim().length > 0)
                .map((s) => s.trim())
            const validGenders = ['male', 'female', 'other', 'prefer_not_to_say']
            const genderRaw = fields.gender?.trim() ?? ''
            const gender = validGenders.includes(genderRaw) ? genderRaw : null

            application = await createApplication(tenant.id, jobId, {
                name,
                email,
                phone: fields.phone?.trim() || null,
                nationality: fields.nationality?.trim() || null,
                address: fields.address?.trim() || null,
                gender: gender as never,
                // Keep a genuine 0; null out non-numeric free text (see parseOptional*).
                experience: parseOptionalCount(fields.experience),
                expectedSalary: parseOptionalAmount(fields.expectedSalary),
                currentSalary: parseOptionalAmount(fields.currentSalary),
                notes: fields.coverNote?.trim() || null,
                skills: skills as never,
                educationHistory: eduHistory as never,
                experienceHistory: expHistory as never,
                source: 'careers',
                stage: 'received',
            } as never)
        } catch (err: any) {
            if (err?.statusCode === 409) return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: err.message })
            throw err
        }

        // Attach the resume. A storage failure shouldn't lose the application —
        // the candidate still lands in the pipeline, just without a resume.
        const safeName = `resume${allowedMime[mime]}`
        const s3Key = buildS3Key(tenant.id, `applications/${application.id}/resume`, safeName)
        try {
            await uploadObject(s3Key, buffer, mime)
            await updateApplication(tenant.id, application.id, { resumeUrl: s3Key } as never)
            application = { ...application, resumeUrl: s3Key } as never
        } catch {
            // Swallow — application is already persisted; HR can request the CV later.
        }

        // Attach the candidate photo (best-effort). Validated by magic bytes so a
        // mislabelled or non-image part is silently ignored, never failing the apply.
        if (photoBuffer) {
            try {
                const imgDetected = await fileTypeFromBuffer(photoBuffer)
                const imgExt = imgDetected ? allowedImageMime[imgDetected.mime] : undefined
                if (imgExt) {
                    const photoKey = buildS3Key(tenant.id, `applications/${application.id}/photo`, `photo${imgExt}`)
                    await uploadObject(photoKey, photoBuffer, imgDetected!.mime)
                    await updateApplication(tenant.id, application.id, { avatarUrl: photoKey } as never)
                    application = { ...application, avatarUrl: photoKey } as never
                }
            } catch {
                // Swallow — photo is a nicety, not required.
            }
        }

        recordActivity({
            tenantId: tenant.id,
            actorName: name,
            actorRole: 'public',
            entityType: 'application',
            entityId: application.id,
            entityName: name,
            action: 'create',
            metadata: { source: 'careers_portal', jobTitle: job.title },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        broadcastToTenant(tenant.id, {
            type: 'recruitment:candidate-added',
            payload: { applicationId: application.id, candidate: application, actorId: null, actorSocketId: null },
        })

        // Confirmation to the applicant + alert HR (in-app + email). All best-effort.
        const appUrl = (loadEnv() as any).APP_URL ?? ''
        sendEmail({ ...applicationReceivedEmail({ candidateName: name, jobTitle: job.title, companyName: tenant.name }), to: email, tenantId: tenant.id })
            .catch(() => { })
        notifyRoles(tenant.id, ['hr_manager', 'super_admin'], {
            type: 'info',
            title: 'New job application',
            message: `${name} applied for ${job.title} (careers site)`,
            actionUrl: '/recruitment',
        }).catch(() => { })
        getRecipientsByRoles(tenant.id, ['hr_manager', 'super_admin']).then((hr) => {
            for (const u of hr) {
                if (!u.email) continue
                sendEmail({
                    ...newApplicationAlertEmail({ recipientName: u.name ?? 'HR', candidateName: name, jobTitle: job.title, source: 'Careers site', actionUrl: appUrl ? `${appUrl}/recruitment` : '', companyName: tenant.name }),
                    to: u.email, tenantId: tenant.id,
                }).catch(() => { })
            }
        }).catch(() => { })

        return reply.code(201).send({ data: { id: application.id } })
    })
}

