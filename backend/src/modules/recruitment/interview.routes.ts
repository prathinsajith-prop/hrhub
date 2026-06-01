import { z } from 'zod'
import { scheduleInterview, getInterviewsForApplication, getInterviewsByTenant, updateInterviewStatus, deleteInterview } from './interview.service.js'
import { recordActivity } from '../audit/audit.service.js'

// A short human label for an interview activity entry. The interview row
// itself doesn't carry the candidate name, so fall back to the type +
// scheduled date when nothing better is available.
const interviewLabel = (row: any): string => {
    const type = row?.type ? String(row.type).replace(/_/g, ' ') : 'interview'
    const when = row?.scheduledAt ? new Date(row.scheduledAt).toISOString().slice(0, 10) : null
    return when ? `${type} interview — ${when}` : `${type} interview`
}

const scheduleInterviewSchema = z.object({
    applicationId: z.string().uuid(),
    scheduledAt: z.string().min(1),
    interviewerUserId: z.string().uuid().optional(),
    durationMinutes: z.number().optional(),
    type: z.enum(['video', 'phone', 'in_person', 'technical']).optional(),
    link: z.string().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
})

export async function interviewRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/interviews
    fastify.get('/interviews', { ...auth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const data = await getInterviewsByTenant(request.user.tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/interviews/application/:applicationId
    fastify.get('/interviews/application/:applicationId', { ...auth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const { applicationId } = request.params as { applicationId: string }
        const data = await getInterviewsForApplication(request.user.tenantId, applicationId)
        return reply.send({ data })
    })

    // POST /api/v1/interviews
    fastify.post('/interviews', { ...adminAuth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const parse = scheduleInterviewSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const data = await scheduleInterview(request.user.tenantId, parse.data)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'interview',
            entityId: data.id,
            entityName: interviewLabel(data),
            action: 'create',
            metadata: { applicationId: data.applicationId },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data })
    })

    // PATCH /api/v1/interviews/:id
    fastify.patch('/interviews/:id', { ...adminAuth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = request.body as Record<string, unknown>
        const data = await updateInterviewStatus(request.user.tenantId, id, {
            ...(b.status !== undefined && { status: b.status as never }),
            ...(b.feedback !== undefined && { feedback: b.feedback as string }),
            ...(b.rating !== undefined && { rating: b.rating as never }),
            ...(b.passed !== undefined && { passed: Boolean(b.passed) }),
        })
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Interview not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'interview',
            entityId: data.id,
            entityName: interviewLabel(data),
            action: 'update',
            metadata: { applicationId: data.applicationId, status: data.status },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data })
    })

    // DELETE /api/v1/interviews/:id
    fastify.delete('/interviews/:id', { ...adminAuth, schema: { tags: ['Recruitment'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await deleteInterview(request.user.tenantId, id)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'interview',
            entityId: id,
            entityName: 'interview',
            action: 'delete',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })
}
