import {
    listApps,
    createApp,
    updateApp,
    regenerateAppSecret,
    deleteApp,
} from './apps.service.js'

export default async function appsRoutes(fastify: any): Promise<void> {
    fastify.get('/', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const data = await listApps(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.post('/', {
        preHandler: [fastify.authenticate, fastify.requireRole('super_admin')],
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

    fastify.patch('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('super_admin')],
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
        preHandler: [fastify.authenticate, fastify.requireRole('super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const data = await regenerateAppSecret(request.user.tenantId, id)
        return reply.send({ data })
    })

    fastify.delete('/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('super_admin')],
        schema: { tags: ['ConnectedApps'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await deleteApp(request.user.tenantId, id)
        return reply.code(204).send()
    })
}
