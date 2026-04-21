import { listJobs, getJob, createJob, updateJob, softDeleteJob, listApplications, createApplication, updateApplicationStage, softDeleteApplication } from './recruitment.service.js'

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
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin', 'dept_head')],
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
        schema: { tags: ['Recruitment'] },
    }, async (request, reply) => {
        const { id } = request.params as { id: string }
        const job = await getJob(request.user?.tenantId ?? '', id)
        if (!job) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found' })
        const body = request.body as Record<string, unknown>
        const application = await createApplication(job.tenantId, id, body as never)
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
}

