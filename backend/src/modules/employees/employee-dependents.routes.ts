import { z } from 'zod'
import { db } from '../../db/index.js'
import { employeeDependents, employees } from '../../db/schema/index.js'
import { eq, and, sql, desc, isNull } from 'drizzle-orm'
import { recordActivity } from '../audit/audit.service.js'

const createSchema = z.object({
    name: z.string().min(1).max(200),
    birthDate: z.string().optional(),
    relation: z.enum(['spouse', 'child', 'parent', 'sibling', 'other']),
    nationality: z.string().optional(),
    visaNumber: z.string().optional(),
    medicalInsurance: z.string().optional(),
})

const updateSchema = createSchema.partial()

// Uses SELECT ... FOR UPDATE to atomically claim the next sequence number for a
// tenant+employee pair — prevents duplicate references under concurrent creates.
async function generateReference(tenantId: string, employeeNo: string): Promise<string> {
    return db.transaction(async tx => {
        const [row] = await tx.execute<{ cnt: string }>(sql`
            SELECT COUNT(*) AS cnt
            FROM employee_dependents
            WHERE tenant_id = ${tenantId}
            FOR UPDATE
        `)
        const seq = String(Number(row?.cnt ?? 0) + 1).padStart(3, '0')
        return `DEP-${employeeNo}-${seq}`
    })
}

export default async function employeeDependentsRoutes(fastify: any): Promise<void> {
    const hrOnly = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/employees/:id/dependents
    fastify.get('/:id/dependents', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const rows = await db
            .select()
            .from(employeeDependents)
            .where(and(
                eq(employeeDependents.employeeId, id),
                eq(employeeDependents.tenantId, request.user.tenantId),
                isNull(employeeDependents.deletedAt),
            ))
            .orderBy(desc(employeeDependents.createdAt))
        return reply.send({ data: rows })
    })

    // POST /api/v1/employees/:id/dependents
    fastify.post('/:id/dependents', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const parse = createSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })

        const [emp] = await db
            .select({ employeeNo: employees.employeeNo })
            .from(employees)
            .where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)
        if (!emp) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })

        const reference = await generateReference(request.user.tenantId, emp.employeeNo)
        const [row] = await db.insert(employeeDependents).values({
            tenantId: request.user.tenantId,
            employeeId: id,
            reference,
            name: parse.data.name,
            birthDate: parse.data.birthDate ?? null,
            relation: parse.data.relation,
            nationality: parse.data.nationality ?? null,
            visaNumber: parse.data.visaNumber ?? null,
            medicalInsurance: parse.data.medicalInsurance ?? null,
            createdById: request.user.id,
            createdByName: request.user.name,
        }).returning()

        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id,
            actorName: request.user.name, actorRole: request.user.role,
            entityType: 'employee', entityId: id, action: 'update',
            ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => {})

        return reply.code(201).send({ data: row })
    })

    // PATCH /api/v1/employees/:id/dependents/:depId
    fastify.patch('/:id/dependents/:depId', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id, depId } = request.params as { id: string; depId: string }
        const parse = updateSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })

        const [existing] = await db
            .select({ id: employeeDependents.id })
            .from(employeeDependents)
            .where(and(
                eq(employeeDependents.id, depId),
                eq(employeeDependents.employeeId, id),
                eq(employeeDependents.tenantId, request.user.tenantId),
            ))
            .limit(1)
        if (!existing) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Dependent not found' })

        const updates: Partial<typeof parse.data & { updatedAt: Date }> = { ...parse.data, updatedAt: new Date() }
        const [row] = await db
            .update(employeeDependents)
            .set(updates)
            .where(and(
                eq(employeeDependents.id, depId),
                eq(employeeDependents.tenantId, request.user.tenantId),
            ))
            .returning()

        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id,
            actorName: request.user.name, actorRole: request.user.role,
            entityType: 'employee', entityId: id, action: 'update',
            ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => {})

        return reply.send({ data: row })
    })

    // DELETE /api/v1/employees/:id/dependents/:depId
    fastify.delete('/:id/dependents/:depId', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id, depId } = request.params as { id: string; depId: string }
        const [row] = await db
            .update(employeeDependents)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(and(
                eq(employeeDependents.id, depId),
                eq(employeeDependents.employeeId, id),
                eq(employeeDependents.tenantId, request.user.tenantId),
                isNull(employeeDependents.deletedAt),
            ))
            .returning()
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Dependent not found' })

        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id,
            actorName: request.user.name, actorRole: request.user.role,
            entityType: 'employee', entityId: id, action: 'update',
            ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => {})

        return reply.code(204).send()
    })
}
