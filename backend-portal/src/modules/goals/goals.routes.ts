import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { employeeGoals } from '../../db/schema/index.js'
import { e400, e403, e404 } from '../../lib/errors.js'
import { recordActivity } from '../../lib/audit.js'

// Personal goals — employee self-service. Every handler scopes to the
// caller's own tenant + employee record (from the verified JWT, never the
// body), so one employee can never read or mutate another's goals.

const VALID_STATUS = ['active', 'completed', 'archived'] as const
type GoalStatus = (typeof VALID_STATUS)[number]

/** Clamp an arbitrary numeric input to an integer 0-100. */
function clampProgress(v: unknown): number | null {
    const n = Number(v)
    if (!Number.isFinite(n)) return null
    return Math.min(100, Math.max(0, Math.round(n)))
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export default async function goalsRoutes(fastify: FastifyInstance): Promise<void> {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /goals — the caller's own goals, newest first.
    fastify.get('/', { ...auth }, async (request: any, reply: any) => {
        const employeeId = request.user.employeeId
        if (!employeeId) return reply.send({ data: [] })
        const rows = await db.select().from(employeeGoals)
            .where(and(
                eq(employeeGoals.tenantId, request.user.tenantId),
                eq(employeeGoals.employeeId, employeeId),
                isNull(employeeGoals.deletedAt),
            ))
            .orderBy(desc(employeeGoals.createdAt))
        return reply.send({ data: rows })
    })

    // POST /goals — create a goal for the caller.
    fastify.post('/', { ...auth }, async (request: any, reply: any) => {
        const employeeId = request.user.employeeId
        if (!employeeId) return reply.code(403).send(e403('No employee record linked to your account'))
        const b = (request.body ?? {}) as Record<string, unknown>
        const title = typeof b.title === 'string' ? b.title.trim() : ''
        if (!title) return reply.code(400).send(e400('Title is required'))
        if (title.length > 200) return reply.code(400).send(e400('Title is too long (max 200 characters)'))

        const description = typeof b.description === 'string' ? b.description.trim().slice(0, 2000) || null : null
        const category = typeof b.category === 'string' && b.category.trim() ? b.category.trim().slice(0, 50) : 'professional'
        const targetDate = typeof b.targetDate === 'string' && ISO_DATE.test(b.targetDate) ? b.targetDate : null
        const progress = clampProgress(b.progress) ?? 0
        const status: GoalStatus = VALID_STATUS.includes(b.status as GoalStatus) ? (b.status as GoalStatus) : 'active'

        const [row] = await db.insert(employeeGoals).values({
            tenantId: request.user.tenantId,
            employeeId,
            title,
            description,
            category,
            status,
            progress,
            targetDate,
            completedAt: status === 'completed' ? new Date() : null,
            createdByUserId: request.user.id ?? null,
        }).returning()

        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'goal', entityId: row.id, entityName: row.title, action: 'create',
            metadata: { kind: 'goal', subKind: 'create' }, ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.code(201).send({ data: row })
    })

    // PATCH /goals/:id — update title/description/category/progress/status.
    // Re-scoped to the caller's own goal; status→completed stamps completedAt.
    fastify.patch('/:id', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const employeeId = request.user.employeeId
        if (!employeeId) return reply.code(403).send(e403('No employee record linked to your account'))

        const [existing] = await db.select().from(employeeGoals)
            .where(and(
                eq(employeeGoals.id, id),
                eq(employeeGoals.tenantId, request.user.tenantId),
                eq(employeeGoals.employeeId, employeeId),
                isNull(employeeGoals.deletedAt),
            )).limit(1)
        if (!existing) return reply.code(404).send(e404('Goal not found'))

        const b = (request.body ?? {}) as Record<string, unknown>
        const patch: Record<string, unknown> = { updatedAt: new Date() }
        if (typeof b.title === 'string') {
            const title = b.title.trim()
            if (!title) return reply.code(400).send(e400('Title cannot be empty'))
            patch.title = title.slice(0, 200)
        }
        if (typeof b.description === 'string') patch.description = b.description.trim().slice(0, 2000) || null
        if (typeof b.category === 'string' && b.category.trim()) patch.category = b.category.trim().slice(0, 50)
        if (b.targetDate === null) patch.targetDate = null
        else if (typeof b.targetDate === 'string' && ISO_DATE.test(b.targetDate)) patch.targetDate = b.targetDate
        if (b.progress !== undefined) {
            const p = clampProgress(b.progress)
            if (p === null) return reply.code(400).send(e400('progress must be a number 0-100'))
            patch.progress = p
            // Reaching 100% auto-completes; dropping below re-activates.
            if (p >= 100 && existing.status !== 'completed') { patch.status = 'completed'; patch.completedAt = new Date() }
            else if (p < 100 && existing.status === 'completed') { patch.status = 'active'; patch.completedAt = null }
        }
        if (b.status !== undefined) {
            if (!VALID_STATUS.includes(b.status as GoalStatus)) return reply.code(400).send(e400('Invalid status'))
            patch.status = b.status
            patch.completedAt = b.status === 'completed' ? (existing.completedAt ?? new Date()) : null
            // Explicit complete also pins progress to 100.
            if (b.status === 'completed' && patch.progress === undefined) patch.progress = 100
        }

        const [row] = await db.update(employeeGoals).set(patch)
            .where(and(eq(employeeGoals.id, id), eq(employeeGoals.tenantId, request.user.tenantId)))
            .returning()

        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'goal', entityId: id, entityName: row?.title ?? existing.title, action: 'update',
            metadata: { kind: 'goal', subKind: 'update' }, ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.send({ data: row })
    })

    // DELETE /goals/:id — soft delete (per the project's soft-delete rule).
    fastify.delete('/:id', { ...auth }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const employeeId = request.user.employeeId
        if (!employeeId) return reply.code(403).send(e403('No employee record linked to your account'))

        const [row] = await db.update(employeeGoals)
            .set({ deletedAt: new Date(), updatedAt: new Date() })
            .where(and(
                eq(employeeGoals.id, id),
                eq(employeeGoals.tenantId, request.user.tenantId),
                eq(employeeGoals.employeeId, employeeId),
                isNull(employeeGoals.deletedAt),
            ))
            .returning({ id: employeeGoals.id, title: employeeGoals.title })
        if (!row) return reply.code(404).send(e404('Goal not found'))

        recordActivity({
            tenantId: request.user.tenantId, userId: request.user.id, actorName: request.user.name, actorRole: request.user.role,
            entityType: 'goal', entityId: id, entityName: row.title, action: 'delete',
            metadata: { kind: 'goal', subKind: 'delete' }, ipAddress: request.ip, userAgent: request.headers['user-agent'],
        }).catch(() => { })

        return reply.send({ data: { ok: true } })
    })
}
