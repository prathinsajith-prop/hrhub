import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import {
    changePassword,
    completeMfaLogin,
    completeMfaLoginWithBackupCode,
    loginUser,
    refreshAccessToken,
    requestPasswordReset,
    resetPasswordWithToken,
    revokeRefreshToken,
} from './auth.service.js'
import {
    disableTotp,
    getTotpStatus,
    regenerateBackupCodes,
    setupTotp,
    verifyAndEnableTotp,
} from './twofa.service.js'
import { recordActivity } from '../../lib/audit.js'
import {
    changePasswordSchema,
    forgotPasswordSchema,
    loginSchema,
    mfaChallengeSchema,
    refreshSchema,
    resetPasswordSchema,
    totpTokenSchema,
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
                portalPostEnabled: users.portalPostEnabled,
            })
            .from(users)
            .where(eq(users.id, request.user.id))
            .limit(1)
        return reply.send({
            data: {
                ...request.user,
                attendancePunchEnabled: row?.attendancePunchEnabled ?? true,
                attendanceManualEntryEnabled: row?.attendanceManualEntryEnabled ?? true,
                portalPostEnabled: row?.portalPostEnabled ?? false,
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

    // ── 2FA / TOTP ───────────────────────────────────────────────────────────
    // Stricter rate limit on the public challenge endpoints to slow code guessing,
    // keyed by IP (the global limiter is 200/min which is far too loose for OTP).
    const challengeLimit = {
        config: { rateLimit: { max: 10, timeWindow: '15 minutes', keyGenerator: (r: any) => r.ip } },
    }

    /** Record a security activity event so it shows on the user's audit/updates feed. */
    const auditSecurity = (request: any, subKind: string, name: string) => {
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'employee',
            entityId: request.user.employeeId ?? request.user.id,
            entityName: name,
            action: 'update',
            metadata: { kind: 'security', subKind },
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => {})
    }

    // POST /api/v1/auth/2fa/challenge — finish login with a TOTP code (public; mfaToken proves the password step).
    fastify.post('/2fa/challenge', challengeLimit, async (request: any, reply: any) => {
        const { mfaToken, code } = validate(mfaChallengeSchema, request.body)
        let payload: any
        try { payload = (fastify as any).jwt.verify(mfaToken) } catch {
            return reply.code(401).send(e401('Invalid or expired MFA session.'))
        }
        if (payload?.purpose !== 'mfa-pending') return reply.code(401).send(e401('Invalid MFA token.'))
        const result = await completeMfaLogin(fastify as any, payload.sub, String(code), {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        })
        if (!result) return reply.code(401).send(e401('Invalid or expired MFA code.'))
        return reply.send({ data: result })
    })

    // POST /api/v1/auth/2fa/backup-challenge — finish login with a single-use backup code (public).
    fastify.post('/2fa/backup-challenge', challengeLimit, async (request: any, reply: any) => {
        const { mfaToken, code } = validate(mfaChallengeSchema, request.body)
        let payload: any
        try { payload = (fastify as any).jwt.verify(mfaToken) } catch {
            return reply.code(401).send(e401('Invalid or expired MFA session.'))
        }
        if (payload?.purpose !== 'mfa-pending') return reply.code(401).send(e401('Invalid MFA token.'))
        const result = await completeMfaLoginWithBackupCode(fastify as any, payload.sub, String(code), {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        })
        if (!result) return reply.code(401).send(e401('Invalid backup code or already used.'))
        return reply.send({ data: result })
    })

    // GET /api/v1/auth/2fa/status — whether 2FA is on + remaining backup codes.
    fastify.get('/2fa/status', { ...auth }, async (request: any, reply: any) => {
        return reply.send({ data: await getTotpStatus(request.user.id) })
    })

    // POST /api/v1/auth/2fa/setup — generate a secret + QR (does NOT enable until verified).
    fastify.post('/2fa/setup', { ...auth }, async (request: any, reply: any) => {
        const result = await setupTotp(request.user.id)
        return reply.send({ data: { qrDataUrl: result.qrDataUrl, secret: result.secret } })
    })

    // POST /api/v1/auth/2fa/verify — confirm a code to activate 2FA; returns backup codes ONCE.
    fastify.post('/2fa/verify', { ...auth }, async (request: any, reply: any) => {
        const { token } = validate(totpTokenSchema, request.body)
        const result = await verifyAndEnableTotp(request.user.id, token)
        if (!result.enabled) return reply.code(400).send(e400('Invalid or expired token'))
        auditSecurity(request, '2fa-enable', 'Two-factor authentication')
        return reply.send({ data: { enabled: true, backupCodes: result.backupCodes ?? [] } })
    })

    // POST /api/v1/auth/2fa/disable — turn 2FA off (requires a current TOTP code as proof).
    fastify.post('/2fa/disable', { ...auth }, async (request: any, reply: any) => {
        const { token } = validate(totpTokenSchema, request.body)
        const ok = await disableTotp(request.user.id, token)
        if (!ok) return reply.code(400).send(e400('Invalid token or 2FA not enabled'))
        auditSecurity(request, '2fa-disable', 'Two-factor authentication')
        return reply.send({ data: { enabled: false } })
    })

    // POST /api/v1/auth/2fa/backup-codes/regenerate — fresh codes, invalidates old (requires TOTP code).
    fastify.post('/2fa/backup-codes/regenerate', { ...auth }, async (request: any, reply: any) => {
        const { token } = validate(totpTokenSchema, request.body)
        const codes = await regenerateBackupCodes(request.user.id, token)
        if (!codes) return reply.code(400).send(e400('Invalid token or 2FA not enabled'))
        auditSecurity(request, '2fa-backup-regenerate', 'Two-factor authentication')
        return reply.send({ data: { backupCodes: codes } })
    })
}
