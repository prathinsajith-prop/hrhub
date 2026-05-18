import fp from 'fastify-plugin'
import { eq } from 'drizzle-orm'
import type { JwtPayload, RequestUser } from '../types/index.js'
import { db } from '../db/client.js'
import { users } from '../db/schema/index.js'

/**
 * Bounded LRU-style cache for `isActive` lookups.
 * The main backend caches this in Redis with a 5-minute TTL; the portal backend
 * doesn't have Redis as a dependency, so we keep it in-memory with the same
 * 5-minute window. Bounded so a steady stream of unique users can't grow it forever.
 */
const ACTIVE_TTL_MS = 5 * 60 * 1000
const ACTIVE_CACHE_MAX = 5_000
const activeCache = new Map<string, { value: boolean; expiresAt: number }>()

function cacheGet(key: string): boolean | null {
    const hit = activeCache.get(key)
    if (!hit) return null
    if (hit.expiresAt <= Date.now()) {
        activeCache.delete(key)
        return null
    }
    // Touch — re-insert moves the key to the most-recent position in the Map iteration order.
    activeCache.delete(key)
    activeCache.set(key, hit)
    return hit.value
}

function cacheSet(key: string, value: boolean) {
    if (activeCache.size >= ACTIVE_CACHE_MAX) {
        // Evict the oldest entry — Map preserves insertion order so the first key is the LRU.
        const oldest = activeCache.keys().next().value
        if (oldest !== undefined) activeCache.delete(oldest)
    }
    activeCache.set(key, { value, expiresAt: Date.now() + ACTIVE_TTL_MS })
}

async function authenticatePlugin(fastify: any): Promise<void> {
    fastify.decorate('authenticate', async (request: any, reply: any) => {
        try {
            const payload = (await request.jwtVerify()) as JwtPayload

            const cached = cacheGet(payload.sub)
            let isActive: boolean
            if (cached !== null) {
                isActive = cached
            } else {
                const [row] = await db
                    .select({ isActive: users.isActive })
                    .from(users)
                    .where(eq(users.id, payload.sub))
                    .limit(1)
                isActive = row?.isActive ?? false
                cacheSet(payload.sub, isActive)
            }
            if (!isActive) {
                return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Account is deactivated' })
            }

            if (!payload.employeeId) {
                return reply.code(403).send({
                    statusCode: 403,
                    error: 'Forbidden',
                    message: 'Account setup is incomplete. Please contact your administrator.',
                })
            }

            request.user = {
                id: payload.sub,
                tenantId: payload.tenantId,
                role: payload.role as RequestUser['role'],
                roles: (payload.roles as string[]) ?? [payload.role],
                email: payload.email,
                name: payload.name,
                employeeId: payload.employeeId ?? null,
                department: payload.department ?? null,
            }
        } catch {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' })
        }
    })

    fastify.decorate('requireRole', (...roles: RequestUser['role'][]) => {
        return async (request: any, reply: any) => {
            if (!request.user) {
                return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
            }
            const userRoles: string[] = request.user.roles ?? [request.user.role]
            if (!roles.some((r: string) => userRoles.includes(r))) {
                return reply.code(403).send({
                    statusCode: 403,
                    error: 'Forbidden',
                    message: `Required role: ${roles.join(' or ')}`,
                })
            }
        }
    })
}

export default fp(authenticatePlugin, { name: 'authenticate' })
