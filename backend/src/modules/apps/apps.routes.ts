import bcrypt from 'bcrypt'
import { z } from 'zod'
import { eq, and, gte, desc, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { connectedApps, appRequestLogs } from '../../db/schema/index.js'
import { recordActivity } from '../audit/audit.service.js'
import { e400, e401, e403, e404 } from '../../lib/errors.js'
import {
    listApps,
    getApp,
    createApp,
    updateApp,
    regenerateAppSecret,
    deleteApp,
} from './apps.service.js'

// ── Zod schemas ─────────────────────────────────────────────────────────────
const createAppSchema = z.object({
    name: z.string().trim().min(1, 'name is required').max(120),
    description: z.string().trim().max(1000).optional(),
    scopes: z.array(z.string()).optional(),
    ipAllowlist: z.array(z.string()).optional(),
})

const updateAppSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    scopes: z.array(z.string()).optional(),
    ipAllowlist: z.array(z.string()).optional(),
    status: z.enum(['active', 'revoked']).optional(),
})

const requestLogsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(['errors']).optional(),
})

export default async function appsRoutes(fastify: any): Promise<void> {
    /**
     * Dual-auth preHandler for GET /:id.
     * Accepts either:
     *   a) JWT Bearer (existing hr_manager / super_admin flow), or
     *   b) App-secret (sk_... via Authorization: Bearer or X-API-Secret)
     *      — lets an app authenticate itself to read its own record by appKey.
     */
    async function authenticateGetApp(request: any, reply: any) {
        const authHeader = request.headers['authorization'] as string | undefined
        const xSecret = request.headers['x-api-secret'] as string | undefined

        const rawSecret =
            xSecret?.trim() ||
            (authHeader?.startsWith('Bearer sk_') ? authHeader.slice(7).trim() : undefined)

        if (rawSecret) {
            const { id } = request.params as { id: string }
            if (!id.startsWith('app_')) {
                return reply.code(401).send(e401('App-secret auth requires an appKey (app_live_...) in the URL, not a UUID'))
            }
            const [app] = await db.select().from(connectedApps).where(eq(connectedApps.appKey, id)).limit(1)
            if (!app) {
                return reply.code(401).send(e401('Invalid app key'))
            }
            const valid = await bcrypt.compare(rawSecret, app.secretHash)
            if (!valid) {
                return reply.code(401).send(e401('Invalid app secret'))
            }
            if (app.status !== 'active') {
                return reply.code(403).send(e403('This app has been revoked'))
            }
            request.user = { tenantId: app.tenantId, id: app.createdBy }
            return // authenticated
        }

        // Fall back to JWT + role check
        await fastify.authenticate(request, reply)
        if (reply.sent) return
        await fastify.requireRole('hr_manager', 'super_admin')(request, reply)
    }

    // Local audit helper — every app mutation goes through this.
    // Fire-and-forget so an audit failure never breaks the user-facing op.
    type AuditAction = 'create' | 'update' | 'delete'
    const audit = (req: any, action: AuditAction, entityId: string, entityName?: string, meta?: Record<string, unknown>) =>
        recordActivity({
            tenantId: req.user.tenantId,
            userId: req.user.id,
            actorName: req.user.name,
            actorRole: req.user.role,
            entityType: 'connected_app',
            entityId,
            entityName,
            action,
            metadata: meta,
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
        }).catch(() => { })

    fastify.get('/', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const data = await listApps(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.post('/', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const parsed = createAppSchema.safeParse(request.body)
        if (!parsed.success) {
            return reply.code(400).send({ ...e400('Invalid input'), validationErrors: parsed.error.issues })
        }
        const result = await createApp({
            tenantId: request.user.tenantId,
            actorUserId: request.user.id,
            name: parsed.data.name,
            description: parsed.data.description,
            scopes: parsed.data.scopes,
            ipAllowlist: parsed.data.ipAllowlist,
        })
        audit(request, 'create', result.app.id, result.app.name, { scopes: parsed.data.scopes ?? [] })
        return reply.code(201).send({ data: result })
    })

    fastify.get('/:id', {
        preHandler: [authenticateGetApp],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await getApp(request.user.tenantId, id)
        return reply.send({ data })
    })

    fastify.patch('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const parsed = updateAppSchema.safeParse(request.body ?? {})
        if (!parsed.success) {
            return reply.code(400).send({ ...e400('Invalid input'), validationErrors: parsed.error.issues })
        }
        const data = await updateApp({
            tenantId: request.user.tenantId,
            appId: id,
            patch: parsed.data,
        })
        audit(request, 'update', data.id, data.name, { fields: Object.keys(parsed.data) })
        return reply.send({ data })
    })

    fastify.post('/:id/regenerate-secret', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await regenerateAppSecret(request.user.tenantId, id)
        audit(request, 'update', data.app.id, data.app.name, { action: 'regenerate_secret' })
        return reply.send({ data })
    })

    fastify.delete('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        // Read for entityName before delete so the audit row has context.
        const existing = await getApp(request.user.tenantId, id).catch(() => null)
        await deleteApp(request.user.tenantId, id)
        if (existing) audit(request, 'delete', existing.id, existing.name)
        return reply.code(204).send()
    })

    // ── Analytics ──────────────────────────────────────────────────────────────
    fastify.get('/:id/analytics', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const tenantId = request.user.tenantId

        const [app] = await db.select({ id: connectedApps.id, requestCount: connectedApps.requestCount })
            .from(connectedApps)
            .where(and(eq(connectedApps.id, id), eq(connectedApps.tenantId, tenantId)))
            .limit(1)
        if (!app) return reply.code(404).send(e404('App not found'))

        const now = new Date()
        const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const d7ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const d30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        const appWhere = and(eq(appRequestLogs.appId, id), eq(appRequestLogs.tenantId, tenantId))

        const [[r24h], [r7d], [errRow], [latRow], dailyVolume, byPath, byStatusCode] = await Promise.all([
            // Last 24h count
            db.select({ n: sql<number>`count(*)::int` }).from(appRequestLogs)
                .where(and(appWhere, gte(appRequestLogs.createdAt, h24ago))),
            // Last 7d count
            db.select({ n: sql<number>`count(*)::int` }).from(appRequestLogs)
                .where(and(appWhere, gte(appRequestLogs.createdAt, d7ago))),
            // Error count (status >= 400)
            db.select({ n: sql<number>`count(*)::int` }).from(appRequestLogs)
                .where(and(appWhere, sql`${appRequestLogs.statusCode} >= 400`)),
            // Latency stats
            db.select({
                avg: sql<number>`round(avg(${appRequestLogs.latencyMs}))::int`,
                min: sql<number>`min(${appRequestLogs.latencyMs})`,
                max: sql<number>`max(${appRequestLogs.latencyMs})`,
            }).from(appRequestLogs).where(appWhere),
            // Daily volume (last 30d)
            db.select({
                date: sql<string>`to_char(${appRequestLogs.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
                count: sql<number>`count(*)::int`,
            }).from(appRequestLogs)
                .where(and(appWhere, gte(appRequestLogs.createdAt, d30ago)))
                .groupBy(sql`to_char(${appRequestLogs.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`)
                .orderBy(sql`1`),
            // By path
            db.select({ path: appRequestLogs.path, count: sql<number>`count(*)::int` })
                .from(appRequestLogs).where(appWhere)
                .groupBy(appRequestLogs.path)
                .orderBy(desc(sql`count(*)`))
                .limit(10),
            // By status code
            db.select({ statusCode: appRequestLogs.statusCode, count: sql<number>`count(*)::int` })
                .from(appRequestLogs).where(appWhere)
                .groupBy(appRequestLogs.statusCode)
                .orderBy(appRequestLogs.statusCode),
        ])

        const total = app.requestCount
        const errCount = errRow?.n ?? 0
        const successRate = total > 0 ? Math.round(((total - errCount) / total) * 1000) / 10 : 0

        return reply.send({
            data: {
                stats: {
                    totalRequests: total,
                    last24h: r24h?.n ?? 0,
                    last7d: r7d?.n ?? 0,
                    successRate,
                    totalErrors: errCount,
                    avgLatencyMs: latRow?.avg ?? 0,
                    minLatencyMs: latRow?.min ?? 0,
                    maxLatencyMs: latRow?.max ?? 0,
                },
                dailyVolume,
                byPath,
                byStatusCode,
            },
        })
    })

    // ── Request logs ───────────────────────────────────────────────────────────
    fastify.get('/:id/request-logs', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const tenantId = request.user.tenantId

        const qParsed = requestLogsQuerySchema.safeParse(request.query)
        if (!qParsed.success) {
            return reply.code(400).send({ ...e400('Invalid query'), validationErrors: qParsed.error.issues })
        }
        const q = qParsed.data

        const [app] = await db.select({ id: connectedApps.id }).from(connectedApps)
            .where(and(eq(connectedApps.id, id), eq(connectedApps.tenantId, tenantId))).limit(1)
        if (!app) return reply.code(404).send(e404('App not found'))

        const limitN = q.limit ?? 50
        const page = q.page ?? 1
        const offset = (page - 1) * limitN

        const baseWhere = and(
            eq(appRequestLogs.appId, id),
            eq(appRequestLogs.tenantId, tenantId),
            q.status === 'errors' ? sql`${appRequestLogs.statusCode} >= 400` : undefined,
        )

        const [[{ total }], logs] = await Promise.all([
            db.select({ total: sql<number>`count(*)::int` }).from(appRequestLogs).where(baseWhere),
            db.select().from(appRequestLogs).where(baseWhere)
                .orderBy(desc(appRequestLogs.createdAt))
                .limit(limitN).offset(offset),
        ])

        return reply.send({
            data: logs,
            meta: { page, limit: limitN, total: total ?? 0 },
        })
    })
}
