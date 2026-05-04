import { listOrgUnits, getOrgUnitTree, getScopedOrgUnitTree, createOrgUnit, updateOrgUnit, deleteOrgUnit, getOrgUnitStats, cascadeDepartmentManager } from './orgUnits.service.js'
import { z } from 'zod'
import { recordActivity } from '../audit/audit.service.js'

const createOrgUnitSchema = z.object({
    name: z.string().min(1).max(150),
    type: z.enum(['division', 'department', 'branch']),
    parentId: z.string().uuid().nullable().optional(),
    headEmployeeId: z.string().uuid().nullable().optional(),
    description: z.string().max(500).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
})

const updateOrgUnitSchema = createOrgUnitSchema.omit({ type: true }).partial().extend({
    type: z.enum(['division', 'department', 'branch']).optional(),
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
    // hr_manager / super_admin: full tree; employee / dept_head / pro_officer: scoped to own branch
    fastify.get('/org-units/tree', { ...auth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const scopedRoles = ['employee', 'dept_head', 'pro_officer']
        const data = scopedRoles.includes(request.user.role) && request.user.employeeId
            ? await getScopedOrgUnitTree(request.user.tenantId, request.user.employeeId, request.user.role)
            : await getOrgUnitTree(request.user.tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/org-units/stats
    fastify.get('/org-units/stats', { ...auth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const data = await getOrgUnitStats(request.user.tenantId)
        return reply.send({ data })
    })

    // POST /api/v1/org-units
    fastify.post('/org-units', { ...adminAuth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const parsed = createOrgUnitSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        const data = await createOrgUnit(request.user.tenantId, parsed.data)
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'org_unit', entityId: data.id, entityName: data.name, action: 'create', metadata: { type: data.type }, ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.code(201).send({ data })
    })

    // PATCH /api/v1/org-units/:id
    fastify.patch('/org-units/:id', { ...adminAuth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const parsed = updateOrgUnitSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        const data = await updateOrgUnit(request.user.tenantId, id, parsed.data)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Org unit not found' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'org_unit', entityId: id, entityName: data.name, action: 'update', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.send({ data })
    })

    // POST /api/v1/org-units/:id/cascade-manager
    // Updates reportingTo + managerName for all employees in the department to the current head.
    fastify.post('/org-units/:id/cascade-manager', { ...adminAuth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const result = await cascadeDepartmentManager(request.user.tenantId, id)
        if (!result) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Department not found or no head assigned' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'org_unit', entityId: id, action: 'update', metadata: { cascadeManager: true, updated: result.updated }, ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.send({ data: result })
    })

    // DELETE /api/v1/org-units/:id
    fastify.delete('/org-units/:id', { ...adminAuth, schema: { tags: ['OrgUnits'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await deleteOrgUnit(request.user.tenantId, id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Org unit not found' })
        recordActivity({ tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role, entityType: 'org_unit', entityId: id, entityName: data.name, action: 'delete', ipAddress: request.ip, userAgent: request.headers['user-agent'] }).catch(() => { })
        return reply.code(204).send()
    })
}
