// ─── Dual-auth preHandler for /attendance/external-punch ────────────────────
//
// Accepts EITHER:
//
//   a) Connected-App credentials (vendor / biometric device flow)
//        X-App-Key:     app_live_<hex>
//        X-API-Secret:  sk_<hex>          (or Authorization: Bearer sk_<hex>)
//
//   b) Regular HR JWT (existing flow — same as the rest of the API)
//        Authorization: Bearer <jwt>
//
// On the app-secret path we additionally enforce:
//   • bcrypt-compare against the stored secretHash (never plaintext at rest)
//   • app.status === 'active'      (revoking an app blocks future calls)
//   • app.scopes includes the required scope (default 'attendance:write')
//   • request.ip matches app.ipAllowlist (when non-empty)
//
// Then it attaches:
//   request.appCtx = { appId, tenantId, name, scopes }
//   request.user   = a thin shim so downstream handlers can read tenantId
//                    without branching. The handler should consult
//                    `request.appCtx` (not request.user.role) when deciding
//                    whether to bypass per-user role gates.

import bcrypt from 'bcrypt'
import { eq, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { connectedApps } from '../../db/schema/index.js'
import { ipInAllowlist } from '../../lib/ip-allowlist.js'

export interface AppCallerCtx {
    appId: string
    tenantId: string
    name: string
    scopes: string[]
}

declare module 'fastify' {
    interface FastifyRequest {
        appCtx?: AppCallerCtx
    }
}

/**
 * Pure IP-allowlist check (exported for testing). Delegates to the shared
 * matcher in lib/ip-allowlist.ts, which supports exact IPv4 plus arbitrary
 * CIDR prefixes (/0–/32) and normalises IPv4-mapped IPv6 (`::ffff:…`).
 * NOTE: unlike `ipInAllowlist`, an EMPTY list here means "no match" — the
 * caller treats empty as "no restriction" before calling.
 */
export function ipInList(ip: string, allowlist: readonly string[]): boolean {
    if (!allowlist || allowlist.length === 0) return false
    return ipInAllowlist(ip, allowlist)
}

/**
 * Factory: builds the preHandler attached to a route.
 * `requiredScope` defaults to `attendance:write` since that's the only route
 * wiring this in at present; pass an explicit value if reusing elsewhere.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildAppOrJwtAuth(fastify: any, requiredScope = 'attendance:write') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return async function appOrJwtAuth(request: any, reply: any) {
        const appKey = (request.headers['x-app-key'] as string | undefined)?.trim()
        if (appKey) {
            return appSecretAuth(request, reply, appKey, requiredScope)
        }
        // No app key — fall through to the standard JWT flow. Auth failures
        // there respond directly; we just await them.
        return fastify.authenticate(request, reply)
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function appSecretAuth(request: any, reply: any, appKey: string, requiredScope: string) {
    if (!appKey.startsWith('app_')) {
        return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'X-App-Key must look like app_live_<hex>',
        })
    }

    const xSecret = (request.headers['x-api-secret'] as string | undefined)?.trim()
    const authHeader = request.headers['authorization'] as string | undefined
    const secret =
        xSecret ||
        (authHeader?.startsWith('Bearer sk_') ? authHeader.slice(7).trim() : undefined)

    if (!secret) {
        return reply.code(401).send({
            statusCode: 401,
            error: 'Unauthorized',
            message: 'Provide the app secret via X-API-Secret header (or Authorization: Bearer sk_…)',
        })
    }

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

    const valid = await bcrypt.compare(secret, app.secretHash)
    if (!valid) {
        return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid app secret' })
    }

    if (!app.scopes.includes(requiredScope)) {
        return reply.code(403).send({
            statusCode: 403,
            error: 'Forbidden',
            message: `This app is missing the '${requiredScope}' scope. Grant it in Connected Apps → Edit Permissions.`,
        })
    }

    if (app.ipAllowlist && app.ipAllowlist.length > 0) {
        const ip = (request.ip as string | undefined) ?? '0.0.0.0'
        if (!ipInList(ip, app.ipAllowlist)) {
            return reply.code(403).send({
                statusCode: 403,
                error: 'Forbidden',
                message: `Request IP ${ip} is not in the app's IP allowlist`,
            })
        }
    }

    request.appCtx = {
        appId: app.id,
        tenantId: app.tenantId,
        name: app.name,
        scopes: app.scopes,
    }
    // Synthetic user — only `tenantId` is consulted downstream. `role` is set
    // to `super_admin` solely to keep TS happy with the UserRole union; the
    // route uses `request.appCtx` (not `request.user.role`) to decide whether
    // to bypass per-user gates.
    request.user = {
        id: app.createdBy ?? '00000000-0000-0000-0000-000000000000',
        tenantId: app.tenantId,
        role: 'super_admin',
        roles: ['super_admin'],
        email: '',
        name: `app:${app.name}`,
        employeeId: null,
    }

    // Telemetry — fire-and-forget so a slow update never delays a punch.
    db.update(connectedApps)
        .set({ lastUsedAt: new Date(), requestCount: sql`${connectedApps.requestCount} + 1` })
        .where(eq(connectedApps.id, app.id))
        .catch(() => { /* non-fatal */ })
}
