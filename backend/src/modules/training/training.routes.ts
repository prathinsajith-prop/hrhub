import { z } from 'zod'
import { recordActivity } from '../audit/audit.service.js'
import {
    listTraining,
    getTrainingRecord,
    createTraining,
    updateTraining,
    deleteTraining,
    getEmployeeTraining,
} from './training.service.js'

const createTrainingSchema = z.object({
    employeeId: z.string().uuid(),
    title: z.string().min(1),
    startDate: z.string().min(1),
    provider: z.string().optional(),
    type: z.enum(['internal', 'external', 'online', 'conference']).optional(),
    endDate: z.string().optional(),
    cost: z.string().optional(),
    currency: z.string().optional(),
    status: z.enum(['planned', 'in_progress', 'completed', 'cancelled']).optional(),
    certificateUrl: z.string().optional(),
    certificateExpiry: z.string().optional(),
    notes: z.string().optional(),
})

export default async function trainingRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const hrOnly = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/training?employeeId=&status=&type=&search=&limit=&offset=
    fastify.get('/', auth, async (request: any, reply: any) => {
        const qs = request.query as {
            employeeId?: string
            status?: string
            type?: string
            search?: string
            limit?: string
            offset?: string
        }
        const result = await listTraining(request.user.tenantId, {
            employeeId: qs.employeeId,
            status: qs.status,
            type: qs.type,
            search: qs.search,
            limit: Math.min(Number(qs.limit ?? 25), 100),
            offset: Number(qs.offset ?? 0),
        })
        return reply.send(result)
    })

    // GET /api/v1/training/employee/:employeeId
    fastify.get('/employee/:employeeId', auth, async (request: any, reply: any) => {
        const { employeeId } = request.params as { employeeId: string }
        const user = request.user
        const isElevated = ['hr_manager', 'super_admin', 'dept_head'].includes(user.role)
        if (!isElevated && user.employeeId !== employeeId) {
            return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Access denied' })
        }
        const data = await getEmployeeTraining(user.tenantId, employeeId)
        return reply.send({ data })
    })

    // GET /api/v1/training/my
    fastify.get('/my', auth, async (request: any, reply: any) => {
        const empId = request.user.employeeId
        if (!empId) return reply.send({ data: [] })
        const data = await getEmployeeTraining(request.user.tenantId, empId)
        return reply.send({ data })
    })

    // GET /api/v1/training/:id
    fastify.get('/:id', auth, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const row = await getTrainingRecord(request.user.tenantId, id)
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Training record not found' })
        return reply.send({ data: row })
    })

    // POST /api/v1/training
    fastify.post('/', hrOnly, async (request: any, reply: any) => {
        const parse = createTrainingSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })
        const row = await createTraining(request.user.tenantId, {
            employeeId: parse.data.employeeId,
            title: parse.data.title,
            provider: parse.data.provider,
            type: parse.data.type ?? 'external',
            startDate: parse.data.startDate,
            endDate: parse.data.endDate,
            cost: parse.data.cost,
            currency: parse.data.currency ?? 'AED',
            status: parse.data.status ?? 'planned',
            certificateExpiry: parse.data.certificateExpiry,
            notes: parse.data.notes,
            createdBy: request.user.id,
        })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'training_record',
            entityId: row.id,
            entityName: row.title,
            action: 'create',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(201).send({ data: row })
    })

    // PATCH /api/v1/training/:id
    fastify.patch('/:id', hrOnly, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const b = request.body as Record<string, unknown>
        const updated = await updateTraining(request.user.tenantId, id, {
            ...(b.title !== undefined && { title: b.title as string }),
            ...(b.provider !== undefined && { provider: b.provider as string }),
            ...(b.type !== undefined && { type: b.type as never }),
            ...(b.startDate !== undefined && { startDate: b.startDate as string }),
            ...(b.endDate !== undefined && { endDate: b.endDate as string }),
            ...(b.cost !== undefined && { cost: b.cost as string }),
            ...(b.currency !== undefined && { currency: b.currency as string }),
            ...(b.status !== undefined && { status: b.status as never }),
            ...(b.certificateUrl !== undefined && { certificateUrl: b.certificateUrl as string }),
            ...(b.certificateExpiry !== undefined && { certificateExpiry: b.certificateExpiry as string }),
            ...(b.notes !== undefined && { notes: b.notes as string }),
        })
        if (!updated) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Training record not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'training_record',
            entityId: updated.id,
            entityName: updated.title,
            action: 'update',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.send({ data: updated })
    })

    // DELETE /api/v1/training/:id
    fastify.delete('/:id', hrOnly, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const deleted = await deleteTraining(request.user.tenantId, id)
        if (!deleted) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Training record not found' })
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'training_record',
            entityId: deleted.id,
            entityName: deleted.title,
            action: 'delete',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })
}
