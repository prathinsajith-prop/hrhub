import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import { and, eq, lt, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { passwordResetTokens, refreshTokens, tenants, users } from '../../db/schema/index.js'
import { recordLoginEvent } from '../../lib/audit.js'
import { passwordResetEmail, sendEmail } from '../../lib/email.js'
import { loadEnv } from '../../env.js'
import { verifyTotpCode, verifyAndConsumeBackupCode } from './twofa.service.js'

type AnyFastify = FastifyInstance<any, any, any, any, any>

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

export interface LoginInput {
    email: string
    password: string
    ipAddress?: string
    userAgent?: string
}

export async function loginUser(fastify: AnyFastify, input: LoginInput) {
    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, input.email.toLowerCase()), eq(users.isActive, true)))
        .limit(1)

    if (!user) {
        recordLoginEvent({
            email: input.email.toLowerCase(),
            eventType: 'failed_login',
            success: false,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            failureReason: 'user_not_found',
        }).catch(() => {})
        return null
    }

    const fresh = await db.transaction(async (tx) => {
        const [row] = await tx
            .select({
                id: users.id,
                lockedUntil: users.lockedUntil,
                failedLoginCount: users.failedLoginCount,
                passwordHash: users.passwordHash,
                twoFaEnabled: users.twoFaEnabled,
            })
            .from(users)
            .where(eq(users.id, user.id))
            .for('update')
        return row
    })

    if (!fresh) return null

    if (fresh.lockedUntil && fresh.lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((fresh.lockedUntil.getTime() - Date.now()) / 60_000)
        recordLoginEvent({
            tenantId: user.tenantId,
            userId: user.id,
            email: user.email,
            eventType: 'failed_login',
            success: false,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            failureReason: 'account_locked',
        }).catch(() => {})
        throw Object.assign(new Error(`Account locked. Try again in ${minutesLeft} minute(s).`), { statusCode: 423 })
    }

    const passwordMatch = await bcrypt.compare(input.password, fresh.passwordHash)
    if (!passwordMatch) {
        const lockAt = new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
        await db
            .update(users)
            .set({
                failedLoginCount: sql`${users.failedLoginCount} + 1`,
                lockedUntil: sql`CASE WHEN ${users.failedLoginCount} + 1 >= ${MAX_FAILED_ATTEMPTS}
                    THEN ${lockAt.toISOString()}::timestamptz
                    ELSE ${users.lockedUntil} END`,
                updatedAt: new Date(),
            })
            .where(eq(users.id, user.id))

        recordLoginEvent({
            tenantId: user.tenantId,
            userId: user.id,
            email: user.email,
            eventType: 'failed_login',
            success: false,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            failureReason: 'wrong_password',
        }).catch(() => {})
        return null
    }

    // Password is correct — clear any lockout/failed counter regardless of the 2FA path.
    await db
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, user.id))

    if (fresh.twoFaEnabled) {
        // Password verified, but 2FA is on — issue a short-lived, single-purpose
        // pending token. No real session is granted until the code is verified
        // via completeMfaLogin / completeMfaLoginWithBackupCode.
        const mfaToken = fastify.jwt.sign({ sub: user.id, purpose: 'mfa-pending' }, { expiresIn: '5m' })
        return { requiresMfa: true as const, mfaToken }
    }

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
    return issueTokens(fastify, user, input)
}

type MfaMeta = { ipAddress?: string; userAgent?: string }

/** Record a failed 2FA attempt (fire-and-forget). */
function recordMfaFailure(userId: string, reason: string, meta: MfaMeta) {
    recordLoginEvent({
        userId,
        eventType: '2fa_failed',
        success: false,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        failureReason: reason,
    }).catch(() => {})
}

/** Shared tail once a 2FA factor is verified: load the user, stamp last-login,
 *  record the success event, and issue the real session tokens. */
async function finishMfaLogin(fastify: AnyFastify, userId: string, meta: MfaMeta) {
    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.isActive, true)))
        .limit(1)
    if (!user) return null
    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))
    recordLoginEvent({
        tenantId: user.tenantId,
        userId: user.id,
        email: user.email,
        eventType: '2fa_success',
        success: true,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    }).catch(() => {})
    return issueTokens(fastify, user, meta)
}

/**
 * Complete a 2FA login challenge — verifies the TOTP code and issues real tokens.
 * Call after loginUser returned `{ requiresMfa: true, mfaToken }`.
 */
export async function completeMfaLogin(fastify: AnyFastify, userId: string, totpCode: string, meta: MfaMeta) {
    if (!(await verifyTotpCode(userId, totpCode))) {
        recordMfaFailure(userId, 'invalid_totp', meta)
        return null
    }
    return finishMfaLogin(fastify, userId, meta)
}

/**
 * Complete a 2FA login challenge using a single-use backup recovery code,
 * for when the authenticator app is unavailable.
 */
export async function completeMfaLoginWithBackupCode(fastify: AnyFastify, userId: string, backupCode: string, meta: MfaMeta) {
    if (!(await verifyAndConsumeBackupCode(userId, backupCode))) {
        recordMfaFailure(userId, 'invalid_backup_code', meta)
        return null
    }
    return finishMfaLogin(fastify, userId, meta)
}

export async function issueTokens(fastify: AnyFastify, user: any, meta: { ipAddress?: string; userAgent?: string }) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1)

    const accessToken = fastify.jwt.sign(
        {
            sub: user.id,
            tenantId: user.tenantId,
            role: user.role,
            roles: user.roles ?? [user.role],
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
            email: user.email,
            employeeId: user.employeeId,
            department: user.department ?? null,
        },
        { expiresIn: '15m' },
    )
    const rawRefreshToken = crypto.randomBytes(48).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await db.insert(refreshTokens).values({ userId: user.id, tenantId: user.tenantId, tokenHash, expiresAt })

    recordLoginEvent({
        tenantId: user.tenantId,
        userId: user.id,
        email: user.email,
        eventType: 'login',
        success: true,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
    }).catch(() => {})

    return {
        accessToken,
        refreshToken: rawRefreshToken,
        user: {
            id: user.id,
            firstName: user.firstName,
            lastName: user.lastName,
            name: user.name,
            email: user.email,
            role: user.role,
            roles: user.roles ?? [user.role],
            tenantId: user.tenantId,
            employeeId: user.employeeId,
            department: user.department,
            avatarUrl: user.avatarUrl,
        },
        tenant: tenant
            ? {
                  id: tenant.id,
                  name: tenant.name,
                  tradeLicenseNo: tenant.tradeLicenseNo,
                  // Renamed from `jurisdiction` in migration 0051 — keep the
                  // response field name aligned with the main backend.
                  businessType: tenant.businessType,
                  industryType: tenant.industryType,
                  subscriptionPlan: tenant.subscriptionPlan,
                  logoUrl: tenant.logoUrl,
              }
            : null,
    }
}

export async function refreshAccessToken(fastify: AnyFastify, rawToken: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const [tokenRecord] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1)

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) return null

    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, tokenRecord.userId), eq(users.isActive, true)))
        .limit(1)

    if (!user) return null

    await db.delete(refreshTokens).where(eq(refreshTokens.id, tokenRecord.id))

    const newRawToken = crypto.randomBytes(48).toString('hex')
    const newTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    const tenantId = tokenRecord.tenantId ?? user.tenantId

    await db.insert(refreshTokens).values({ userId: user.id, tenantId, tokenHash: newTokenHash, expiresAt })

    const accessToken = fastify.jwt.sign(
        {
            sub: user.id,
            tenantId,
            role: user.role,
            roles: user.roles ?? [user.role],
            name: user.name,
            email: user.email,
            employeeId: user.employeeId,
            department: user.department ?? null,
        },
        { expiresIn: '15m' },
    )

    return { accessToken, refreshToken: newRawToken }
}

export async function revokeRefreshToken(rawToken: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash))
}

export async function cleanupExpiredTokens(): Promise<void> {
    const now = new Date()
    await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now))
    await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now))
}

const PASSWORD_RESET_TTL_MINUTES = 60

/**
 * Issue a password reset token for the given email and send it via email.
 * Always returns success-shaped result to prevent account enumeration.
 * In dev (NODE_ENV !== 'production') the raw token is returned for testing.
 */
export async function requestPasswordReset(email: string) {
    const normalised = email.toLowerCase().trim()

    // Look up active user. We never tell the API caller whether the email exists
    // (anti-enumeration), but we do log it server-side so operators can diagnose.
    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalised))
        .limit(1)

    if (!user) {
        console.warn(`[forgot-password] no user found for "${normalised}" — returning anti-enumeration success`)
        return { sent: true, devToken: null as string | null }
    }
    if (!user.isActive) {
        console.warn(`[forgot-password] user ${user.id} (${normalised}) is deactivated — skipping send`)
        return { sent: true, devToken: null as string | null }
    }

    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + PASSWORD_RESET_TTL_MINUTES)

    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt })

    const env = loadEnv()
    const resetUrl = `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${rawToken}`
    const tmpl = passwordResetEmail({
        name: user.name,
        resetUrl,
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
    })

    console.info(`[forgot-password] queued reset for ${user.email} via ${env.EMAIL_PROVIDER}`)

    // Send the email fire-and-forget — we MUST NOT block the HTTP response on SMTP.
    // Railway has a 30s LB timeout; if SMTP egress is slow (Gmail handshake from a
    // fresh Railway IP, etc.) the user sees a 502 even though the token was created.
    // The API contract is "we'll send it if the address exists" — callers can't tell
    // success from failure anyway (anti-enumeration), so deferring the actual send
    // is safe and avoids the hang. Failures are logged for operators.
    sendEmail({ ...tmpl, to: user.email })
        .then((result) => {
            if (result.ok) {
                console.info(`[forgot-password] sent ok (messageId=${result.messageId})`)
            } else {
                console.error(`[forgot-password] send FAILED: ${result.error}`)
            }
        })
        .catch((err) => {
            console.error('[forgot-password] send threw:', err instanceof Error ? err.message : err)
        })

    const devToken = env.NODE_ENV !== 'production' ? rawToken : null
    return { sent: true, devToken }
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (newPassword.length < 8) return { ok: false as const, reason: 'weak_password' as const }
    if (currentPassword === newPassword) return { ok: false as const, reason: 'same_password' as const }

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) return { ok: false as const, reason: 'not_found' as const }

    const matches = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!matches) return { ok: false as const, reason: 'invalid_current' as const }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await db.update(users).set({ passwordHash, updatedAt: new Date() } as any).where(eq(users.id, userId))
    // Invalidate every refresh token for this user — other devices have to sign in again.
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
    return { ok: true as const }
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string) {
    if (!rawToken || newPassword.length < 8) return { ok: false as const, reason: 'invalid_input' as const }
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const [record] = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1)

    if (!record) return { ok: false as const, reason: 'invalid_token' as const }
    if (record.usedAt) return { ok: false as const, reason: 'token_used' as const }
    if (record.expiresAt < new Date()) return { ok: false as const, reason: 'token_expired' as const }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await db
        .update(users)
        .set({ passwordHash, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() } as any)
        .where(eq(users.id, record.userId))
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, record.id))
    // Invalidate all refresh tokens — force re-login everywhere.
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, record.userId))

    return { ok: true as const }
}
