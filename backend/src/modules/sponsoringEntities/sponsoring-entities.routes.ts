import { z } from 'zod'
import { eq, and, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { sponsoringEntities } from '../../db/schema/index.js'
import { recordActivity } from '../audit/audit.service.js'

const createSchema = z.object({
    name: z.string().min(1).max(200),
    sortOrder: z.number().int().optional(),
})

const updateSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
})

export async function sponsoringEntitiesRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/sponsoring-entities — all active, for authenticated users
    fastify.get('/sponsoring-entities', { ...auth, schema: { tags: ['Sponsoring Entities'] } }, async (req: any, reply: any) => {
        const rows = await db
            .select()
            .from(sponsoringEntities)
            .where(and(eq(sponsoringEntities.tenantId, req.user.tenantId), eq(sponsoringEntities.isActive, true)))
            .orderBy(asc(sponsoringEntities.sortOrder), asc(sponsoringEntities.name))
        return reply.send({ data: rows })
    })

    // POST /api/v1/sponsoring-entities
    fastify.post('/sponsoring-entities', { ...adminAuth, schema: { tags: ['Sponsoring Entities'] } }, async (req: any, reply: any) => {
        const parsed = createSchema.safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input' })
        const [row] = await db.insert(sponsoringEntities).values({
            tenantId: req.user.tenantId,
            name: parsed.data.name.trim(),
            sortOrder: parsed.data.sortOrder ?? 0,
        }).returning()
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'sponsoring_entity', entityId: row.id, entityName: row.name, action: 'create', ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => {})
        return reply.code(201).send({ data: row })
    })

    // PATCH /api/v1/sponsoring-entities/:id
    fastify.patch('/sponsoring-entities/:id', { ...adminAuth, schema: { tags: ['Sponsoring Entities'] } }, async (req: any, reply: any) => {
        const parsed = updateSchema.safeParse(req.body)
        if (!parsed.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input' })
        const patch: Partial<typeof sponsoringEntities.$inferInsert> = {}
        if (parsed.data.name !== undefined) patch.name = parsed.data.name.trim()
        if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive
        if (parsed.data.sortOrder !== undefined) patch.sortOrder = parsed.data.sortOrder
        const [row] = await db.update(sponsoringEntities).set(patch)
            .where(and(eq(sponsoringEntities.id, req.params.id), eq(sponsoringEntities.tenantId, req.user.tenantId)))
            .returning()
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Sponsoring entity not found' })
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'sponsoring_entity', entityId: row.id, entityName: row.name, action: 'update', ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => {})
        return reply.send({ data: row })
    })

    // DELETE /api/v1/sponsoring-entities/:id — soft delete
    fastify.delete('/sponsoring-entities/:id', { ...adminAuth, schema: { tags: ['Sponsoring Entities'] } }, async (req: any, reply: any) => {
        const [row] = await db.update(sponsoringEntities).set({ isActive: false })
            .where(and(eq(sponsoringEntities.id, req.params.id), eq(sponsoringEntities.tenantId, req.user.tenantId)))
            .returning({ id: sponsoringEntities.id, name: sponsoringEntities.name })
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Sponsoring entity not found' })
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'sponsoring_entity', entityId: row.id, action: 'delete', ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => {})
        return reply.code(204).send()
    })
}
