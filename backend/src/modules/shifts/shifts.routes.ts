import { z } from 'zod'
import { createShift, deleteShift, listShifts, updateShift } from './shifts.service.js'
import { recordActivity } from '../audit/audit.service.js'

// 24-hour HH:MM. Same rule as the inline validation removed from employees.
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/
const weekDay = z.enum(['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'])

const createSchema = z.object({
    name: z.string().min(1).max(120),
    startTime: z.string().regex(timeRegex, 'Use 24-hour HH:MM'),
    endTime: z.string().regex(timeRegex, 'Use 24-hour HH:MM'),
    weeklyOffDays: z.array(weekDay).default([]),
    sortOrder: z.number().int().optional(),
})

const updateSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    startTime: z.string().regex(timeRegex, 'Use 24-hour HH:MM').optional(),
    endTime: z.string().regex(timeRegex, 'Use 24-hour HH:MM').optional(),
    weeklyOffDays: z.array(weekDay).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
})

export async function shiftsRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/shifts?includeInactive=true
    fastify.get('/shifts', { ...auth, schema: { tags: ['Shifts'] } }, async (req: any, reply: any) => {
        const includeInactive = req.query?.includeInactive === 'true'
        const data = await listShifts(req.user.tenantId, { includeInactive })
        return reply.send({ data })
    })

    // POST /api/v1/shifts
    fastify.post('/shifts', { ...adminAuth, schema: { tags: ['Shifts'] } }, async (req: any, reply: any) => {
        const parsed = createSchema.safeParse(req.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        try {
            const data = await createShift(req.user.tenantId, parsed.data)
            recordActivity({
                tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role,
                entityType: 'shift', entityId: data.id, entityName: data.name, action: 'create',
                ipAddress: req.ip, userAgent: req.headers['user-agent'],
            }).catch(() => { })
            return reply.code(201).send({ data })
        } catch (err: any) {
            if (err?.code === '23505') {
                return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: `Shift "${parsed.data.name}" already exists` })
            }
            throw err
        }
    })

    // PATCH /api/v1/shifts/:id
    fastify.patch('/shifts/:id', { ...adminAuth, schema: { tags: ['Shifts'] } }, async (req: any, reply: any) => {
        const parsed = updateSchema.safeParse(req.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        try {
            const data = await updateShift(req.user.tenantId, req.params.id, parsed.data)
            if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Shift not found' })
            recordActivity({
                tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role,
                entityType: 'shift', entityId: data.id, entityName: data.name, action: 'update',
                ipAddress: req.ip, userAgent: req.headers['user-agent'],
            }).catch(() => { })
            return reply.send({ data })
        } catch (err: any) {
            if (err?.code === '23505') {
                return reply.code(409).send({ statusCode: 409, error: 'Conflict', message: `Shift "${parsed.data.name}" already exists` })
            }
            throw err
        }
    })

    // DELETE /api/v1/shifts/:id — soft delete; existing employee.shiftId stays.
    fastify.delete('/shifts/:id', { ...adminAuth, schema: { tags: ['Shifts'] } }, async (req: any, reply: any) => {
        const data = await deleteShift(req.user.tenantId, req.params.id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Shift not found' })
        recordActivity({
            tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role,
            entityType: 'shift', entityId: req.params.id, action: 'delete',
            ipAddress: req.ip, userAgent: req.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })
}
