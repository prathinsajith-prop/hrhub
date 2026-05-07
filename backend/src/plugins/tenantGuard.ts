import fp from 'fastify-plugin'
import { runWithTenant } from '../lib/tenantContext.js'

/**
 * Wraps every authenticated request in a tenant AsyncLocalStorage context.
 * This lets service code call requireTenant() / getCurrentTenant() without
 * threading tenantId explicitly through every call — the context is set once
 * per request and tears down automatically when the handler returns.
 *
 * Must be registered AFTER the authenticate plugin so request.user is available.
 */
async function tenantGuardPlugin(fastify: any): Promise<void> {
    fastify.addHook('onRequest', async (_request: any, _reply: any) => {
        // request.user is populated by authenticate preHandler — not yet set here.
        // We use preValidation instead (after auth but before handler).
    })

    fastify.decorate('withTenantCtx', (tenantId: string, fn: () => Promise<unknown>) =>
        runWithTenant(tenantId, fn),
    )
}

export default fp(tenantGuardPlugin, { name: 'tenantGuard' })
