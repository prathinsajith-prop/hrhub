import bcrypt from 'bcrypt'
import { eq, and, gte, desc, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { connectedApps, appRequestLogs } from '../../db/schema/index.js'
import {
    listApps,
    getApp,
    createApp,
    updateApp,
    regenerateAppSecret,
    deleteApp,
} from './apps.service.js'

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
                return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'App-secret auth requires an appKey (app_live_...) in the URL, not a UUID' })
            }
            const [app] = await db.select().from(connectedApps).where(eq(connectedApps.appKey, id)).limit(1)
            if (!app) {
                return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid app key' })
            }
            const valid = await bcrypt.compare(rawSecret, app.secretHash)
            if (!valid) {
                return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid app secret' })
            }
            if (app.status !== 'active') {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'This app has been revoked' })
            }
            request.user = { tenantId: app.tenantId, id: app.createdBy }
            return // authenticated
        }

        // Fall back to JWT + role check
        await fastify.authenticate(request, reply)
        if (reply.sent) return
        await fastify.requireRole('hr_manager', 'super_admin')(request, reply)
    }

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
        const body = request.body as {
            name: string
            description?: string
            scopes?: string[]
            ipAllowlist?: string[]
        }
        const result = await createApp({
            tenantId: request.user.tenantId,
            actorUserId: request.user.id,
            name: body.name,
            description: body.description,
            scopes: body.scopes,
            ipAllowlist: body.ipAllowlist,
        })
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
        const data = await updateApp({
            tenantId: request.user.tenantId,
            appId: id,
            patch: request.body ?? {},
        })
        return reply.send({ data })
    })

    fastify.post('/:id/regenerate-secret', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await regenerateAppSecret(request.user.tenantId, id)
        return reply.send({ data })
    })

    fastify.delete('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await deleteApp(request.user.tenantId, id)
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
        if (!app) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'App not found' })

        const now = new Date()
        const h24ago = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        const d7ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const d30ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

        const appWhere = eq(appRequestLogs.appId, id)

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
        const q = request.query as { page?: string; limit?: string; status?: string }

        const [app] = await db.select({ id: connectedApps.id }).from(connectedApps)
            .where(and(eq(connectedApps.id, id), eq(connectedApps.tenantId, tenantId))).limit(1)
        if (!app) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'App not found' })

        const limitN = Math.min(100, Math.max(1, Number(q.limit ?? 50)))
        const offset = (Math.max(1, Number(q.page ?? 1)) - 1) * limitN

        const baseWhere = and(
            eq(appRequestLogs.appId, id),
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
            meta: { page: Number(q.page ?? 1), limit: limitN, total: total ?? 0 },
        })
    })
}
