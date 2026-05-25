import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import {
    changePassword,
    loginUser,
    refreshAccessToken,
    requestPasswordReset,
    resetPasswordWithToken,
    revokeRefreshToken,
} from './auth.service.js'
import {
    changePasswordSchema,
    forgotPasswordSchema,
    loginSchema,
    refreshSchema,
    resetPasswordSchema,
    validate,
} from '../../lib/validation.js'
import { e400, e401 } from '../../lib/errors.js'
import { db } from '../../db/client.js'
import { users } from '../../db/schema/index.js'

export default async function authRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /api/v1/auth/me — returns the JWT-derived identity enriched with
    // the per-user attendance switches (read fresh from the DB so HR toggles
    // take effect without a re-login).
    fastify.get('/me', { ...auth }, async (request: any, reply: any) => {
        const [row] = await db
            .select({
                attendancePunchEnabled: users.attendancePunchEnabled,
                attendanceManualEntryEnabled: users.attendanceManualEntryEnabled,
            })
            .from(users)
            .where(eq(users.id, request.user.id))
            .limit(1)
        return reply.send({
            data: {
                ...request.user,
                attendancePunchEnabled: row?.attendancePunchEnabled ?? true,
                attendanceManualEntryEnabled: row?.attendanceManualEntryEnabled ?? true,
            },
        })
    })

    fastify.post('/login', async (request: any, reply: any) => {
        const body = validate(loginSchema, request.body)
        const ipAddress = request.ip as string | undefined
        const userAgent = request.headers['user-agent'] as string | undefined

        const result = await loginUser(fastify as any, { ...body, ipAddress, userAgent })
        if (!result) {
            return reply.code(401).send(e401('Invalid email or password'))
        }
        return reply.send({ data: result })
    })

    fastify.post('/refresh', async (request: any, reply: any) => {
        const body = validate(refreshSchema, request.body)
        const result = await refreshAccessToken(fastify as any, body.refreshToken)
        if (!result) return reply.code(401).send(e401('Invalid or expired refresh token'))
        return reply.send({ data: result })
    })

    fastify.post('/logout', async (request: any, reply: any) => {
        const body = (request.body ?? {}) as { refreshToken?: string }
        if (body.refreshToken) {
            await revokeRefreshToken(body.refreshToken).catch(() => {})
        }
        return reply.send({ data: { ok: true } })
    })

    // POST /api/v1/auth/forgot-password — issues a reset token and emails it.
    // Always returns 200 even if the email is unknown (prevents enumeration).
    fastify.post('/forgot-password', async (request: any, reply: any) => {
        const body = validate(forgotPasswordSchema, request.body)
        const result = await requestPasswordReset(body.email)
        // In production we never echo the token; in dev it helps with manual testing.
        return reply.send({
            data: {
                sent: true,
                ...(result.devToken ? { devToken: result.devToken } : {}),
            },
        })
    })

    // POST /api/v1/auth/change-password — authenticated user changes their own password.
    fastify.post('/change-password', { ...auth }, async (request: any, reply: any) => {
        const body = validate(changePasswordSchema, request.body)
        const result = await changePassword(request.user.id, body.currentPassword, body.newPassword)
        if (!result.ok) {
            const message =
                result.reason === 'invalid_current'
                    ? 'Current password is incorrect.'
                    : result.reason === 'same_password'
                      ? 'New password must be different from the current one.'
                      : result.reason === 'weak_password'
                        ? 'Password must be at least 8 characters.'
                        : 'Could not change password.'
            return reply.code(400).send(e400(message))
        }
        return reply.send({ data: { ok: true } })
    })

    // POST /api/v1/auth/reset-password — consumes a reset token and sets a new password.
    fastify.post('/reset-password', async (request: any, reply: any) => {
        const body = validate(resetPasswordSchema, request.body)
        const result = await resetPasswordWithToken(body.token, body.password)
        if (!result.ok) {
            const message =
                result.reason === 'token_expired'
                    ? 'This reset link has expired. Please request a new one.'
                    : result.reason === 'token_used'
                      ? 'This reset link has already been used.'
                      : result.reason === 'invalid_token'
                        ? 'This reset link is invalid.'
                        : 'Could not reset password. Please try again.'
            return reply.code(400).send(e400(message))
        }
        return reply.send({ data: { ok: true } })
    })
}
