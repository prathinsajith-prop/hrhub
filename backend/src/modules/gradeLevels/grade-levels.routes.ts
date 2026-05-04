import { z } from 'zod'
import { eq, and, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { gradeLevels } from '../../db/schema/index.js'
import { recordActivity } from '../audit/audit.service.js'

const createSchema = z.object({
    name: z.string().min(1).max(80),
    sortOrder: z.number().int().optional(),
})

const updateSchema = z.object({
    name: z.string().min(1).max(80).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
})

export async function gradeLevelsRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/grade-levels — all authenticated users (needed for employee forms)
    fastify.get('/grade-levels', { ...auth, schema: { tags: ['Grade Levels'] } }, async (req: any, reply: any) => {
        const rows = await db
            .select()
            .from(gradeLevels)
            .where(and(eq(gradeLevels.tenantId, req.user.tenantId), eq(gradeLevels.isActive, true)))
            .orderBy(asc(gradeLevels.sortOrder), asc(gradeLevels.name))
        return reply.send({ data: rows })
    })

    // POST /api/v1/grade-levels
    fastify.post('/grade-levels', { ...adminAuth, schema: { tags: ['Grade Levels'] } }, async (req: any, reply: any) => {
        const parsed = createSchema.safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        const [row] = await db.insert(gradeLevels).values({
            tenantId: req.user.tenantId,
            name: parsed.data.name.trim(),
            sortOrder: parsed.data.sortOrder ?? 0,
        }).returning()
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'grade_level', entityId: row.id, entityName: row.name, action: 'create', ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => {})
        return reply.code(201).send({ data: row })
    })

    // PATCH /api/v1/grade-levels/:id
    fastify.patch('/grade-levels/:id', { ...adminAuth, schema: { tags: ['Grade Levels'] } }, async (req: any, reply: any) => {
        const parsed = updateSchema.safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        const patch: Partial<typeof gradeLevels.$inferInsert> = {}
        if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim()
        if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive
        if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder
        const [row] = await db.update(gradeLevels).set(patch)
            .where(and(eq(gradeLevels.id, req.params.id), eq(gradeLevels.tenantId, req.user.tenantId)))
            .returning()
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Grade level not found' })
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'grade_level', entityId: row.id, entityName: row.name, action: 'update', ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => {})
        return reply.send({ data: row })
    })

    // DELETE /api/v1/grade-levels/:id — soft delete (set isActive = false)
    fastify.delete('/grade-levels/:id', { ...adminAuth, schema: { tags: ['Grade Levels'] } }, async (req: any, reply: any) => {
        const [row] = await db.update(gradeLevels).set({ isActive: false })
            .where(and(eq(gradeLevels.id, req.params.id), eq(gradeLevels.tenantId, req.user.tenantId)))
            .returning({ id: gradeLevels.id, name: gradeLevels.name })
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Grade level not found' })
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'grade_level', entityId: row.id, action: 'delete', ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => {})
        return reply.code(204).send()
    })
}
