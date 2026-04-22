import fp from 'fastify-plugin'
import type { JwtPayload, RequestUser } from '../types/index.js'

async function authenticatePlugin(fastify: any): Promise<void> {
    /**
     * Decorate request with `authenticate` preHandler.
     * Trusts the verified JWT payload — no extra DB round-trip per request.
     * isActive + name are embedded in the token at login time.
     * Usage: { preHandler: fastify.authenticate }
     */
    fastify.decorate('authenticate', async (request: any, reply: any) => {
        try {
            const payload = await (request.jwtVerify as any)() as JwtPayload

            // JWT signature verification is sufficient. We embed user info at login time
            // so there is no need to re-query the DB on every request.
            request.user = {
                id: payload.sub,
                tenantId: payload.tenantId,
                role: payload.role as RequestUser['role'],
                email: payload.email,
                name: payload.name,
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
