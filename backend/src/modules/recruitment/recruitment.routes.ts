import { listJobs, getJob, createJob, updateJob, softDeleteJob, listApplications, createApplication, updateApplicationStage, updateApplication, getApplication, softDeleteApplication } from './recruitment.service.js'
import { recordActivity } from '../audit/audit.service.js'
import { createEmployee, generateNextEmployeeNo } from '../employees/employees.service.js'
import { enforceEmployeeQuota } from '../subscription/subscription.service.js'
import { db } from '../../db/index.js'
import { entities } from '../../db/schema/index.js'
import { and, eq } from 'drizzle-orm'

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
        const application = await createApplication(job.tenantId, id, { ...body, stage: 'received' } as never)
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
}

