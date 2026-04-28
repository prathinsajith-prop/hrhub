import { z } from 'zod'
import { listDesignations, createDesignation, updateDesignation, deleteDesignation } from './designations.service.js'

const createSchema = z.object({
    name: z.string().min(1).max(120),
    sortOrder: z.number().int().optional(),
})

const updateSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
})

export async function designationsRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/designations
    fastify.get('/designations', { ...auth, schema: { tags: ['Designations'] } }, async (req: any, reply: any) => {
        const data = await listDesignations(req.user.tenantId)
        return reply.send({ data })
    })

    // POST /api/v1/designations
    fastify.post('/designations', { ...adminAuth, schema: { tags: ['Designations'] } }, async (req: any, reply: any) => {
        const parsed = createSchema.safeParse(req.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        const data = await createDesignation(req.user.tenantId, parsed.data)
        return reply.code(201).send({ data })
    })

    // PATCH /api/v1/designations/:id
    fastify.patch('/designations/:id', { ...adminAuth, schema: { tags: ['Designations'] } }, async (req: any, reply: any) => {
        const parsed = updateSchema.safeParse(req.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        const data = await updateDesignation(req.user.tenantId, req.params.id, parsed.data)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Designation not found' })
        return reply.send({ data })
    })

    // DELETE /api/v1/designations/:id
    fastify.delete('/designations/:id', { ...adminAuth, schema: { tags: ['Designations'] } }, async (req: any, reply: any) => {
        const data = await deleteDesignation(req.user.tenantId, req.params.id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Designation not found' })
        return reply.code(204).send()
    })
}
