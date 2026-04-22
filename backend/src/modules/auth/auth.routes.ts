import { loginUser, refreshAccessToken, revokeRefreshToken, requestPasswordReset, resetPasswordWithToken, changePassword } from './auth.service.js'
import { recordLoginEvent } from '../audit/audit.service.js'

export default async function (fastify: any): Promise<void> {
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
        const ipAddress = (request as any).ip ?? request.headers['x-forwarded-for'] as string
        const userAgent = request.headers['user-agent']

        const result = await loginUser(fastify, { email, password, ipAddress, userAgent })
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
        // Record logout
        const u = (request as any).user
        if (u?.sub) {
            recordLoginEvent({
                tenantId: u.tenantId,
                userId: u.sub,
                eventType: 'logout',
                success: true,
                ipAddress: (request as any).ip ?? request.headers['x-forwarded-for'] as string,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        return reply.code(204).send()
    })

    // GET /api/v1/auth/me
    fastify.get('/me', {
        schema: { tags: ['Auth'] },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        return reply.send({ data: request.user })
    })

    // POST /api/v1/auth/forgot-password
    fastify.post('/forgot-password', {
        config: {
            rateLimit: { max: 5, timeWindow: '15 minutes', keyGenerator: (r: any) => r.ip },
        },
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email' } },
            },
        },
    }, async (request, reply) => {
        const { email } = request.body as { email: string }
        const result = await requestPasswordReset(email)
        // Always 200 to avoid email enumeration; expose dev token only outside production.
        return reply.send({
            data: {
                sent: result.sent,
                ...(result.devToken ? { devToken: result.devToken } : {}),
            },
        })
    })

    // POST /api/v1/auth/reset-password
    fastify.post('/reset-password', {
        config: {
            rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: (r: any) => r.ip },
        },
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                    token: { type: 'string', minLength: 32 },
                    password: { type: 'string', minLength: 8 },
                },
            },
        },
    }, async (request, reply) => {
        const { token, password } = request.body as { token: string; password: string }
        const result = await resetPasswordWithToken(token, password)
        if (!result.ok) {
            const message =
                result.reason === 'token_expired' ? 'This reset link has expired. Please request a new one.'
                    : result.reason === 'token_used' ? 'This reset link has already been used.'
                        : 'Invalid or expired token.'
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message })
        }
        return reply.send({ data: { ok: true } })
    })

    // POST /api/v1/auth/change-password
    fastify.post('/change-password', {
        schema: {
            tags: ['Auth'],
            body: {
                type: 'object',
                required: ['currentPassword', 'newPassword'],
                properties: {
                    currentPassword: { type: 'string', minLength: 6 },
                    newPassword: { type: 'string', minLength: 8 },
                },
            },
        },
        preHandler: [fastify.authenticate],
    }, async (request, reply) => {
        const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string }
        const userId = (request.user as any).sub ?? (request.user as any).id
        const result = await changePassword(userId, currentPassword, newPassword)
        if (!result.ok) {
            const message =
                result.reason === 'invalid_current' ? 'Current password is incorrect.'
                    : result.reason === 'weak_password' ? 'New password must be at least 8 characters.'
                        : 'Unable to change password.'
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message })
        }
        return reply.send({ data: { ok: true } })
    })
}

