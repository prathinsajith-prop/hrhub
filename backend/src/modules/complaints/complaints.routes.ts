import { z } from 'zod'
import {
    listComplaints,
    getComplaint,
    createComplaint,
    updateComplaint,
    submitComplaint,
    acknowledgeComplaint,
    assignComplaint,
    escalateComplaint,
    resolveComplaint,
    deleteComplaint,
    getComplaintStats,
} from './complaints.service.js'

const createSchema = z.object({
    title: z.string().min(3).max(200),
    category: z.enum(['harassment', 'pay_dispute', 'leave_dispute', 'working_conditions', 'discrimination', 'other']),
    severity: z.enum(['low', 'medium', 'high', 'critical']),
    confidentiality: z.enum(['anonymous', 'named', 'confidential']).default('confidential'),
    description: z.string().min(10).max(5000),
    subjectEmployeeId: z.string().uuid().nullable().optional(),
})

const updateSchema = createSchema.partial()

export async function complaintsRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const hrAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // ── HR-facing endpoints ───────────────────────────────────────────────────

    // GET /api/v1/complaints — all complaints (HR view)
    fastify.get('/complaints', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const { limit = 30, offset = 0, search, status, severity, category } = req.query as Record<string, string>
        const data = await listComplaints(req.user.tenantId, {
            limit: Math.min(Number(limit), 100),
            offset: Number(offset),
            search,
            status,
            severity,
            category,
        })
        return reply.send({ data })
    })

    // GET /api/v1/complaints/stats
    fastify.get('/complaints/stats', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const data = await getComplaintStats(req.user.tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/complaints/:id
    fastify.get('/complaints/:id', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const data = await getComplaint(req.user.tenantId, req.params.id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found' })
        return reply.send({ data })
    })

    // POST /api/v1/complaints/:id/acknowledge
    fastify.post('/complaints/:id/acknowledge', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const data = await acknowledgeComplaint(req.user.tenantId, req.params.id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found or already acknowledged' })
        return reply.send({ data })
    })

    // POST /api/v1/complaints/:id/assign
    fastify.post('/complaints/:id/assign', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const parsed = z.object({ assignedToId: z.string().uuid() }).safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input' })
        const data = await assignComplaint(req.user.tenantId, req.params.id, parsed.data.assignedToId)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found' })
        return reply.send({ data })
    })

    // POST /api/v1/complaints/:id/escalate
    fastify.post('/complaints/:id/escalate', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const data = await escalateComplaint(req.user.tenantId, req.params.id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found or not in correct state' })
        return reply.send({ data })
    })

    // POST /api/v1/complaints/:id/resolve
    fastify.post('/complaints/:id/resolve', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const parsed = z.object({ resolutionNotes: z.string().min(5).max(2000) }).safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Resolution notes required (min 5 chars)' })
        const data = await resolveComplaint(req.user.tenantId, req.params.id, parsed.data.resolutionNotes)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found or already resolved' })
        return reply.send({ data })
    })

    // ── Employee self-service endpoints ───────────────────────────────────────

    // GET /api/v1/my/complaints
    fastify.get('/my/complaints', { ...auth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const employeeId = req.user.employeeId
        if (!employeeId) return reply.send({ data: [] })
        const { limit = 30, offset = 0 } = req.query as Record<string, string>
        const data = await listComplaints(req.user.tenantId, {
            limit: Math.min(Number(limit), 100),
            offset: Number(offset),
            employeeId,
        })
        return reply.send({ data })
    })

    // POST /api/v1/my/complaints
    fastify.post('/my/complaints', { ...auth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const employeeId = req.user.employeeId
        if (!employeeId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No employee record linked to your account' })
        const parsed = createSchema.safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        const data = await createComplaint(req.user.tenantId, { ...parsed.data, submittedByEmployeeId: employeeId })
        return reply.code(201).send({ data })
    })

    // PATCH /api/v1/my/complaints/:id — only own drafts
    fastify.patch('/my/complaints/:id', { ...auth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const employeeId = req.user.employeeId
        if (!employeeId) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'No employee record' })
        const parsed = updateSchema.safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input' })
        const data = await updateComplaint(req.user.tenantId, req.params.id, parsed.data, employeeId)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found' })
        return reply.send({ data })
    })

    // DELETE /api/v1/complaints/:id — soft delete (HR only)
    fastify.delete('/complaints/:id', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const row = await deleteComplaint(req.user.tenantId, req.params.id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found' })
        return reply.code(204).send()
    })

    // POST /api/v1/my/complaints/:id/submit
    fastify.post('/my/complaints/:id/submit', { ...auth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const employeeId = req.user.employeeId
        if (!employeeId) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'No employee record' })
        const result = await submitComplaint(req.user.tenantId, req.params.id, employeeId)
        if (!result) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found' })
        if ('error' in result) return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Complaint is not in draft state' })
        return reply.send({ data: result })
    })

    // GET /api/v1/my/complaints/:id
    fastify.get('/my/complaints/:id', { ...auth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const employeeId = req.user.employeeId
        if (!employeeId) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'No employee record' })
        const data = await getComplaint(req.user.tenantId, req.params.id, employeeId)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found' })
        return reply.send({ data })
    })
}
