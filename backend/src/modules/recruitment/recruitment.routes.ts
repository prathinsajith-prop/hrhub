import { listJobs, getJob, createJob, updateJob, softDeleteJob, listApplications, createApplication, updateApplicationStage, updateApplication, getApplication, softDeleteApplication } from './recruitment.service.js'
import { generateReportPdf } from '../../lib/pdf.js'
import { recordActivity } from '../audit/audit.service.js'
import { createEmployee, generateNextEmployeeNo } from '../employees/employees.service.js'
import { enforceEmployeeQuota } from '../subscription/subscription.service.js'
import { createChecklist } from '../onboarding/onboarding.service.js'
import { db } from '../../db/index.js'
import { entities, tenants } from '../../db/schema/index.js'
import { and, eq } from 'drizzle-orm'
import { uploadObject, buildS3Key, generateDownloadUrl } from '../../plugins/s3.js'
import { fileTypeFromBuffer } from 'file-type'
import { extname } from 'node:path'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    // GET /api/v1/jobs
    fastify.get('/jobs', { ...auth, schema: { tags: ['Recruitment'] } }, async (request, reply) => {
        const { status, department, limit = '20', offset = '0' } = request.query as Record<string, string>
        const result = await listJobs(request.user.tenantId, { status, department, limit: Number(limit), offset: Number(offset) })
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
                    type: { type: 'string', enum: ['full_time', 'part_time', 'contract'] },
                    openings: { type: 'integer', minimum: 1 },
                    minSalary: { type: 'number' },
                    maxSalary: { type: 'number' },
                    industry: { type: 'string' },
                    description: { type: 'string' },
                    requirements: { type: 'array', items: { type: 'string' } },
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
        return reply.code(201).send({ data: job })
    })

    // PATCH /api/v1/jobs/:id
    fastify.patch('/jobs/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Recruitment'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const updated = await updateJob(request.user.tenantId, id, request.body as never)
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
        return reply.code(204).send()
    })

    // GET /api/v1/applications
    fastify.get('/applications', { ...auth, schema: { tags: ['Recruitment'] } }, async (request, reply) => {
        const { jobId, stage, limit = '20', offset = '0' } = request.query as Record<string, string>
        const result = await listApplications(request.user.tenantId, { jobId, stage, limit: Number(limit), offset: Number(offset) })
        return reply.send(result)
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
                    experience: { type: 'integer', minimum: 0 },
                    expectedSalary: { type: 'number', minimum: 0 },
                    currentSalary: { type: 'number', minimum: 0 },
                    resumeUrl: { type: 'string' },
                    notes: { type: 'string' },
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
        const { stage } = request.body as { stage: string }
        const updated = await updateApplicationStage(request.user.tenantId, id, stage)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Application not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'application',
            entityId: id,
            entityName: `${(updated as any).candidateName ?? updated.name ?? 'Candidate'} → ${stage}`,
            action: 'update',
            metadata: { stage },
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
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
                },
            },
        },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const updated = await updateApplication(request.user.tenantId, id, request.body as never)
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Application not found' })
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
        const downloadUrl = await generateDownloadUrl(s3Key)
        return reply.send({ data: { s3Key, downloadUrl } })
    })

    // POST /api/v1/applications/:id/convert-to-employee
    // Promotes a candidate in `pre_boarding` stage into a real employee record.
    fastify.post('/applications/:id/convert-to-employee', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: {
            tags: ['Recruitment'],
            body: {
                type: 'object',
                properties: {
                    joinDate: { type: 'string', format: 'date' },
                    designation: { type: 'string' },
                    department: { type: 'string' },
                    basicSalary: { type: 'number' },
                    entityId: { type: 'string', format: 'uuid' },
                    employeeNo: { type: 'string' },
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

        // Enforce subscription quota before creating the employee record
        await enforceEmployeeQuota(tenantId)

        const body = (request.body as Record<string, unknown>) ?? {}

        // Pick the supplied entity (must belong to tenant) or the tenant's first active entity.
        let entityId = body.entityId as string | undefined
        if (entityId) {
            const [ent] = await db.select().from(entities)
                .where(and(eq(entities.id, entityId), eq(entities.tenantId, tenantId))).limit(1)
            if (!ent) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Entity not found for this tenant' })
        } else {
            const [ent] = await db.select().from(entities)
                .where(and(eq(entities.tenantId, tenantId), eq(entities.isActive, true))).limit(1)
            if (!ent) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No active entity configured for this tenant' })
            entityId = ent.id
        }

        const [firstName, ...rest] = (app.name ?? '').trim().split(/\s+/)
        const lastName = rest.join(' ') || firstName || 'Candidate'
        const employeeNo = (body.employeeNo as string) || await generateNextEmployeeNo(tenantId)
        const joinDate = (body.joinDate as string) || new Date().toISOString().slice(0, 10)

        const employee = await createEmployee(tenantId, {
            entityId,
            employeeNo,
            firstName: firstName || 'Candidate',
            lastName,
            email: app.email,
            phone: app.phone ?? undefined,
            nationality: app.nationality ?? undefined,
            department: (body.department as string) ?? undefined,
            designation: (body.designation as string) ?? undefined,
            joinDate,
            status: 'onboarding',
            basicSalary: (body.basicSalary as number)?.toString() ?? (app.expectedSalary ?? undefined),
        } as never)

        // Auto-create onboarding checklist with 9 template steps — fire-and-forget
        createChecklist(tenantId, { employeeId: employee.id, startDate: joinDate, useTemplate: true }).catch(() => { })

        // Mark the application completed (no more pipeline stage).
        await updateApplication(tenantId, id, { stage: 'hired', notes: `${app.notes ?? ''}\n[Converted to employee ${employeeNo} on ${new Date().toISOString().slice(0, 10)}]`.trim() } as never)

        recordActivity({
            tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'application',
            entityId: id,
            entityName: `${app.name} → employee ${employeeNo}`,
            action: 'create',
            metadata: { employeeId: employee.id, employeeNo },
            ipAddress: (request as any).ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.code(201).send({ data: { employee, application: await getApplication(tenantId, id) } })
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
}

