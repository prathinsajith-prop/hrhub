import bcrypt from 'bcrypt'
import { eq } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { connectedApps } from '../../db/schema/index.js'
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
}
