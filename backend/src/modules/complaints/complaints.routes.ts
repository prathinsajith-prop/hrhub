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
import { recordActivity } from '../audit/audit.service.js'
import { notifyEmployee, notifyRoles } from '../notifications/notifications.service.js'
import { sendEmail, complaintStatusEmail } from '../../plugins/email.js'
import { db } from '../../db/index.js'
import { employees } from '../../db/schema/index.js'
import { and, eq } from 'drizzle-orm'
import { loadEnv } from '../../config/env.js'

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

    // Local helper to keep the trail tight — every complaint mutation goes
    // through `audit(...)`. Fire-and-forget so an audit failure never breaks
    // the user-facing operation. The entityName is short on purpose: the
    // complaint title may be sensitive (harassment, pay disputes) and the
    // activity log is a wider audience than the complaint itself.
    type AuditAction = 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'submit'
    const audit = (req: any, action: AuditAction, entityId: string, meta?: Record<string, unknown>) =>
        recordActivity({
            tenantId: req.user.tenantId,
            userId: req.user.id,
            actorName: req.user.name,
            actorRole: req.user.role,
            entityType: 'complaint',
            entityId,
            action,
            metadata: meta,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        }).catch(() => { })

    // ── HR-facing endpoints ───────────────────────────────────────────────────

    // GET /api/v1/complaints — all complaints (HR view)
    fastify.get('/complaints', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const { limit = 30, offset = 0, search, status, severity, category, filter } = req.query as Record<string, string>
        const result = await listComplaints(req.user.tenantId, {
            limit: Math.min(Math.max(1, Number(limit)), 100),
            offset: Math.max(0, Number(offset)),
            search,
            status,
            severity,
            category,
            filter,
        })
        return reply.send(result)
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
        audit(req, 'submit', req.params.id, { stage: 'acknowledged' })
        notifyEmployee(req.user.tenantId, data.submittedByEmployeeId, {
            type: 'info', title: 'Complaint acknowledged',
            message: `Your complaint "${data.title}" is now under review.`, actionUrl: '/my/complaints',
        }).catch(() => { })
        return reply.send({ data })
    })

    // POST /api/v1/complaints/:id/assign
    fastify.post('/complaints/:id/assign', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const parsed = z.object({ assignedToId: z.string().uuid() }).safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input' })
        const data = await assignComplaint(req.user.tenantId, req.params.id, parsed.data.assignedToId)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found' })
        audit(req, 'update', req.params.id, { stage: 'assigned', assignedToId: parsed.data.assignedToId })
        return reply.send({ data })
    })

    // POST /api/v1/complaints/:id/escalate
    fastify.post('/complaints/:id/escalate', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const data = await escalateComplaint(req.user.tenantId, req.params.id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found or not in correct state' })
        audit(req, 'update', req.params.id, { stage: 'escalated' })
        return reply.send({ data })
    })

    // POST /api/v1/complaints/:id/resolve
    fastify.post('/complaints/:id/resolve', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const parsed = z.object({ resolutionNotes: z.string().min(5).max(2000) }).safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Resolution notes required (min 5 chars)' })
        const data = await resolveComplaint(req.user.tenantId, req.params.id, parsed.data.resolutionNotes)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found or already resolved' })
        audit(req, 'approve', req.params.id, { stage: 'resolved' })
        notifyEmployee(req.user.tenantId, data.submittedByEmployeeId, {
            type: 'success', title: 'Complaint resolved',
            message: `Your complaint "${data.title}" has been resolved.`, actionUrl: '/my/complaints',
        }).catch(() => { })
        // Email the complainant (to themselves about their own case — safe even if anonymous).
        if (data.submittedByEmployeeId) {
            db.select({ email: employees.email, first: employees.firstName }).from(employees)
                .where(and(eq(employees.tenantId, req.user.tenantId), eq(employees.id, data.submittedByEmployeeId))).limit(1)
                .then(([emp]) => {
                    if (emp?.email) {
                        const appUrl = (loadEnv() as any).APP_URL ?? ''
                        sendEmail({
                            ...complaintStatusEmail({ recipientName: emp.first ?? 'there', title: data.title, status: 'resolved', note: parsed.data.resolutionNotes, actionUrl: appUrl ? `${appUrl}/my/complaints` : '' }),
                            to: emp.email, tenantId: req.user.tenantId,
                        }).catch(() => { })
                    }
                }).catch(() => { })
        }
        return reply.send({ data })
    })

    // ── Employee self-service endpoints ───────────────────────────────────────

    // GET /api/v1/my/complaints
    fastify.get('/my/complaints', { ...auth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const employeeId = req.user.employeeId
        if (!employeeId) return reply.send({ data: [], total: 0, limit: 30, offset: 0, hasMore: false })
        const { limit = 30, offset = 0 } = req.query as Record<string, string>
        const result = await listComplaints(req.user.tenantId, {
            limit: Math.min(Math.max(1, Number(limit)), 100),
            offset: Math.max(0, Number(offset)),
            employeeId,
        })
        return reply.send(result)
    })

    // POST /api/v1/my/complaints
    fastify.post('/my/complaints', { ...auth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const employeeId = req.user.employeeId
        if (!employeeId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No employee record linked to your account' })
        const parsed = createSchema.safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        const data = await createComplaint(req.user.tenantId, { ...parsed.data, submittedByEmployeeId: employeeId })
        audit(req, 'create', data.id, { category: parsed.data.category, severity: parsed.data.severity })
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
        // Only log the names of the fields that were changed — values are
        // intentionally omitted (complaint descriptions can be sensitive).
        audit(req, 'update', data.id, { fields: Object.keys(parsed.data) })
        return reply.send({ data })
    })

    // DELETE /api/v1/complaints/:id — soft delete (HR only)
    fastify.delete('/complaints/:id', { ...hrAuth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const row = await deleteComplaint(req.user.tenantId, req.params.id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found' })
        recordActivity({
            tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role,
            entityType: 'complaint', entityId: row.id, action: 'delete',
            ipAddress: req.ip, userAgent: req.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })

    // POST /api/v1/my/complaints/:id/submit
    fastify.post('/my/complaints/:id/submit', { ...auth, schema: { tags: ['Complaints'] } }, async (req: any, reply: any) => {
        const employeeId = req.user.employeeId
        if (!employeeId) return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'No employee record' })
        const result = await submitComplaint(req.user.tenantId, req.params.id, employeeId)
        if (!result) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Complaint not found' })
        if ('error' in result) return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: 'Complaint is not in draft state' })
        audit(req, 'submit', req.params.id, { stage: 'submitted' })
        // In-app alert to HR (email to HR is already sent inside submitComplaint()).
        notifyRoles(req.user.tenantId, ['hr_manager', 'super_admin'], {
            type: 'warning', title: 'New complaint submitted',
            message: `A ${(result as any).severity ?? ''} severity complaint was submitted.`, actionUrl: '/complaints',
        }).catch(() => { })
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
