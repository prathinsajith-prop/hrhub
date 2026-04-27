import { listOrgUnits, getOrgUnitTree, createOrgUnit, updateOrgUnit, deleteOrgUnit, getOrgUnitStats } from './orgUnits.service.js'
import { z } from 'zod'

const orgUnitSchema = z.object({
    name: z.string().min(1).max(150),
    code: z.string().max(20).optional(),
    type: z.enum(['division', 'department', 'branch']),
    parentId: z.string().uuid().nullable().optional(),
    headEmployeeId: z.string().uuid().nullable().optional(),
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
})

export async function orgUnitsRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/org-units — flat list
    fastify.get('/org-units', { ...auth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const data = await listOrgUnits(request.user.tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/org-units/tree — hierarchical tree
    fastify.get('/org-units/tree', { ...auth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const data = await getOrgUnitTree(request.user.tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/org-units/stats
    fastify.get('/org-units/stats', { ...auth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const data = await getOrgUnitStats(request.user.tenantId)
        return reply.send({ data })
    })

    // POST /api/v1/org-units
    fastify.post('/org-units', { ...adminAuth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const parsed = orgUnitSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        const data = await createOrgUnit(request.user.tenantId, parsed.data)
        return reply.code(201).send({ data })
    })

    // PATCH /api/v1/org-units/:id
    fastify.patch('/org-units/:id', { ...adminAuth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const parsed = orgUnitSchema.partial().safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        const data = await updateOrgUnit(request.user.tenantId, id, parsed.data)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Org unit not found' })
        return reply.send({ data })
    })

    // DELETE /api/v1/org-units/:id
    fastify.delete('/org-units/:id', { ...adminAuth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await deleteOrgUnit(request.user.tenantId, id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Org unit not found' })
        return reply.code(204).send()
    })
}
