import { recordActivity } from '../audit/audit.service.js'
import {
    listTraining,
    getTrainingRecord,
    createTraining,
    updateTraining,
    deleteTraining,
    getEmployeeTraining,
} from './training.service.js'

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
        const data = await getEmployeeTraining(request.user.tenantId, employeeId)
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
        const body = request.body as Record<string, unknown>
        const row = await createTraining(request.user.tenantId, {
            employeeId: body.employeeId as string,
            title: body.title as string,
            provider: body.provider as string | undefined,
            type: ((body.type as string | undefined) ?? 'external') as 'external' | 'internal' | 'online' | 'conference',
            startDate: body.startDate as string,
            endDate: body.endDate as string | undefined,
            cost: body.cost as string | undefined,
            currency: (body.currency as string | undefined) ?? 'AED',
            status: ((body.status as string | undefined) ?? 'planned') as 'planned' | 'in_progress' | 'completed' | 'cancelled',
            certificateUrl: body.certificateUrl as string | undefined,
            certificateExpiry: body.certificateExpiry as string | undefined,
            notes: body.notes as string | undefined,
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
        const body = request.body as Record<string, unknown>
        const updated = await updateTraining(request.user.tenantId, id, body as never)
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
