/**
 * External API authentication middleware.
 *
 * Third-party apps authenticate using:
 *   URL:    /api/ext/:appKey/<resource>
 *   Header: X-API-Secret: sk_<secret>
 *          OR Authorization: Bearer sk_<secret>
 *
 * The middleware:
 *  1. Looks up the connected_app row by appKey
 *  2. Verifies the secret against the stored bcrypt hash
 *  3. Checks the app is active
 *  4. Checks IP allowlist (if configured)
 *  5. Attaches app context to request.appCtx
 *  6. Increments requestCount + updates lastUsedAt (async, non-blocking)
 */

import bcrypt from 'bcrypt'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { connectedApps } from '../../db/schema/index.js'

export interface AppContext {
    appId: string
    tenantId: string
    name: string
    scopes: string[]
}

function clientIp(request: any): string {
    const forwarded = request.headers['x-forwarded-for']
    if (forwarded) return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim()
    return request.socket?.remoteAddress ?? '0.0.0.0'
}

function ipInList(ip: string, allowlist: string[]): boolean {
    // Simple exact-match + CIDR for /24 and /16 only (sufficient for most allowlist use-cases)
    for (const entry of allowlist) {
        if (entry === ip) return true
        if (entry.endsWith('/24')) {
            const prefix = entry.slice(0, entry.lastIndexOf('.'))
            if (ip.startsWith(prefix + '.')) return true
        }
        if (entry.endsWith('/16')) {
            const parts = entry.split('.')
            const prefix = parts[0] + '.' + parts[1]
            if (ip.startsWith(prefix + '.')) return true
        }
    }
    return false
}

/**
 * Fastify preHandler for external API routes.
 * Attach to routes as: preHandler: [extAuthenticate]
 */
export async function extAuthenticate(request: any, reply: any) {
    const { appKey } = request.params as { appKey?: string }
    if (!appKey) {
        return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Missing appKey in URL' })
    }

    // Extract secret from X-API-Secret or Authorization: Bearer
    const xSecret = request.headers['x-api-secret'] as string | undefined
    const authHeader = request.headers['authorization'] as string | undefined
    const secret =
        xSecret?.trim() ||
        (authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined)

    if (!secret) {
        return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Provide the app secret via X-API-Secret header or Authorization: Bearer <secret>',
        })
    }

    // Lookup app
    const [app] = await db
        .select()
        .from(connectedApps)
        .where(eq(connectedApps.appKey, appKey))
        .limit(1)

    if (!app) {
        return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid app key' })
    }

    if (app.status !== 'active') {
        return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'This app has been revoked' })
    }

    // Verify secret
    const valid = await bcrypt.compare(secret, app.secretHash)
    if (!valid) {
        return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid app secret' })
    }

    // IP allowlist check
    if (app.ipAllowlist && app.ipAllowlist.length > 0) {
        const ip = clientIp(request)
        if (!ipInList(ip, app.ipAllowlist)) {
            return reply.code(403).send({
                statusCode: 403,
                error: 'Forbidden',
                message: `Request IP ${ip} is not in the app's IP allowlist`,
            })
        }
    }

    // Attach context
    request.appCtx = {
        appId: app.id,
        tenantId: app.tenantId,
        name: app.name,
        scopes: app.scopes,
    } satisfies AppContext

    // Fire-and-forget: update lastUsedAt + increment requestCount
    db.update(connectedApps)
        .set({
            lastUsedAt: new Date(),
            requestCount: sql`${connectedApps.requestCount} + 1`,
        })
        .where(eq(connectedApps.id, app.id))
        .catch(() => { /* non-fatal */ })
}

/**
 * Scope guard factory.
 * Usage: preHandler: [extAuthenticate, requireScope('employees:read')]
 */
export function requireScope(scope: string) {
    return async (request: any, reply: any) => {
        const ctx: AppContext | undefined = request.appCtx
        if (!ctx) {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
        }
        if (!ctx.scopes.includes(scope)) {
            return reply.code(403).send({
                statusCode: 403,
                error: 'Forbidden',
                message: `This app does not have the '${scope}' scope. Grant it in Connected Apps → Edit Permissions.`,
            })
        }
    }
}
