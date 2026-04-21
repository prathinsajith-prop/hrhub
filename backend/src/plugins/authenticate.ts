// @ts-nocheck
import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify/types/plugin.js'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { JwtPayload, RequestUser } from '../types/index.js'
import { db } from '../db/index.js'
import { users } from '../db/schema/index.js'
import { eq, and } from 'drizzle-orm'

const authenticatePlugin: FastifyPluginAsync = async (fastify) => {
    /**
     * Decorate request with `authenticate` preHandler.
     * Usage: { preHandler: fastify.authenticate }
     */
    fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
        try {
            const payload = await request.jwtVerify<JwtPayload>()

            const [user] = await db
                .select({
                    id: users.id,
                    tenantId: users.tenantId,
                    role: users.role,
                    email: users.email,
                    name: users.name,
                    isActive: users.isActive,
                })
                .from(users)
                .where(and(eq(users.id, payload.sub), eq(users.isActive, true)))
                .limit(1)

            if (!user) {
                return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'User not found or inactive' })
            }

            request.user = {
                id: user.id,
                tenantId: user.tenantId,
                role: user.role as RequestUser['role'],
                email: user.email,
                name: user.name,
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
        return async (request: FastifyRequest, reply: FastifyReply) => {
            if (!request.user) {
                return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Authentication required' })
            }
            if (!roles.includes(request.user.role)) {
                return reply.code(403).send({ statusCode: 403, error: 'Forbidden', message: `Required role: ${roles.join(' or ')}` })
            }
        }
    })
}

declare module 'fastify' {
    interface FastifyInstance {
        authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
        requireRole: (...roles: RequestUser['role'][]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>
    }
}

export default fp(authenticatePlugin, { name: 'authenticate' })
