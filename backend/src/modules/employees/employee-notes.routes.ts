import { z } from 'zod'
import { db } from '../../db/index.js'
import { employeeNotes, employees } from '../../db/schema/index.js'
import { eq, and, desc, isNull } from 'drizzle-orm'
import { recordActivity } from '../audit/audit.service.js'

const createSchema = z.object({
    content: z.string().min(1).max(5000),
})

export default async function employeeNotesRoutes(fastify: any): Promise<void> {
    const hrOnly = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/employees/:id/notes
    fastify.get('/:id/notes', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const rows = await db
            .select()
            .from(employeeNotes)
            .where(and(
                eq(employeeNotes.employeeId, id),
                eq(employeeNotes.tenantId, request.user.tenantId),
                isNull(employeeNotes.deletedAt),
            ))
            .orderBy(desc(employeeNotes.createdAt))
        return reply.send({ data: rows })
    })

    // POST /api/v1/employees/:id/notes
    fastify.post('/:id/notes', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const parse = createSchema.safeParse(request.body)
        if (!parse.success) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: parse.error.issues[0]?.message ?? 'Invalid input' })

        const [emp] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.id, id), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)
        if (!emp) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Employee not found' })

        const [row] = await db.insert(employeeNotes).values({
            tenantId: request.user.tenantId,
            employeeId: id,
            content: parse.data.content,
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

    // DELETE /api/v1/employees/:id/notes/:noteId
    fastify.delete('/:id/notes/:noteId', { ...hrOnly, schema: { tags: ['Employees'] } }, async (request: any, reply: any) => {
        const { id, noteId } = request.params as { id: string; noteId: string }
        const [row] = await db
            .update(employeeNotes)
            .set({ deletedAt: new Date() })
            .where(and(
                eq(employeeNotes.id, noteId),
                eq(employeeNotes.employeeId, id),
                eq(employeeNotes.tenantId, request.user.tenantId),
                isNull(employeeNotes.deletedAt),
            ))
            .returning()
        if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Note not found' })

        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id,
            actorName: request.user.name, actorRole: request.user.role,
            entityType: 'employee', entityId: id, action: 'update',
            ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => {})

        return reply.code(204).send()
    })
}
