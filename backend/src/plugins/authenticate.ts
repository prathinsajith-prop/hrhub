import fp from 'fastify-plugin'
import type { JwtPayload, RequestUser } from '../types/index.js'
import { cacheGet, cacheSet } from '../lib/redis.js'
import { db } from '../db/index.js'
import { users } from '../db/schema/index.js'
import { eq } from 'drizzle-orm'

async function authenticatePlugin(fastify: any): Promise<void> {
    /**
     * Decorate request with `authenticate` preHandler.
     * Verifies JWT signature then checks isActive via Redis cache (TTL 5 min).
     * This ensures deactivated users are blocked within 5 minutes without a DB
     * hit on every request.
     * Usage: { preHandler: fastify.authenticate }
     */
    fastify.decorate('authenticate', async (request: any, reply: any) => {
        try {
            const payload = await (request.jwtVerify as any)() as JwtPayload

            // Check isActive — use Redis cache to avoid a DB hit per request.
            // Cache key: user:active:<userId>  TTL: 5 minutes.
            const cacheKey = `user:active:${payload.sub}`
            let isActive = await cacheGet<boolean>(cacheKey)
            if (isActive === null) {
                const [user] = await db
                    .select({ isActive: users.isActive })
                    .from(users)
                    .where(eq(users.id, payload.sub))
                    .limit(1)
                isActive = user?.isActive ?? false
                await cacheSet(cacheKey, isActive, 300) // cache for 5 minutes
            }
            if (!isActive) {
                return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Account is deactivated' })
            }

            // Every user must have a linked employee record (enforced since migration 0018).
            // A null employeeId means the account was created before the invariant was
            // established — the user needs to re-authenticate after the migration runs
            // or contact an admin to have their account backfilled.
            if (!payload.employeeId) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: 'Account setup is incomplete. Please contact your administrator.' })
            }

            request.user = {
                id: payload.sub,
                tenantId: payload.tenantId,
                role: payload.role as RequestUser['role'],
                email: payload.email,
                name: payload.name,
                employeeId: payload.employeeId ?? null,
                department: payload.department ?? null,
            }
        } catch {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token' })
        }
    })

    /**
     * Role guard factory.
     * Usage: { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }
     */
    fastify.decorate('requireRole', (...roles: RequestUser['role'][]) => {
        return async (request: any, reply: any) => {
            if (!request.user) {
                return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
            }
            if (!roles.includes(request.user.role)) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: `Required role: ${roles.join(' or ')}` })
            }
        }
    })

}

export default fp(authenticatePlugin, { name: 'authenticate' })
