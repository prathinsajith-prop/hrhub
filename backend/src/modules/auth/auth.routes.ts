// @ts-nocheck
import type { FastifyPluginAsync } from 'fastify/types/plugin.js'
import { loginUser, refreshAccessToken, revokeRefreshToken } from './auth.service.js'

const authRoutes: FastifyPluginAsync = async (fastify) => {
    // POST /api/v1/auth/login
    fastify.post('/login', {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '15 minutes',
                keyGenerator: (request: any) => request.ip,
                errorResponseBuilder: (_req: any, context: any) => ({
                    statusCode: 429,
                    error: 'Too Many Requests',
                    message: `Too many login attempts. Try again in ${Math.ceil(context.ttl / 60000)} minutes.`,
                }),
            },
        },
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 6 },
                },
            },
        },
    }, async (request, reply) => {
        const { email, password } = request.body as { email: string; password: string }

        const result = await loginUser(fastify, { email, password })
        if (!result) {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password' })
        }

        return reply.send({ data: result })
    })

    // POST /api/v1/auth/refresh
    fastify.post('/refresh', {
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
            },
        },
    }, async (request, reply) => {
        const { refreshToken } = request.body as { refreshToken: string }

        const result = await refreshAccessToken(fastify, refreshToken)
        if (!result) {
            return reply.code(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired refresh token' })
        }

        return reply.send({ data: result })
    })

    // POST /api/v1/auth/logout
    fastify.post('/logout', {
        schema: { tags: ['Auth'] },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const { refreshToken } = request.body as { refreshToken?: string }
        if (refreshToken) await revokeRefreshToken(refreshToken)
        return reply.code(204).send()
    })

    // GET /api/v1/auth/me
    fastify.get('/me', {
        schema: { tags: ['Auth'] },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        return reply.send({ data: request.user })
    })
}

export default authRoutes
