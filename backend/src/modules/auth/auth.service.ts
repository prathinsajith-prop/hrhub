import bcrypt from 'bcrypt'
import { eq, and, lt } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '../../db/index.js'
import { users, refreshTokens, tenants, passwordResetTokens } from '../../db/schema/index.js'
import { sendEmail, passwordResetEmail } from '../../plugins/email.js'
import { loadEnv } from '../../config/env.js'
import { recordLoginEvent } from '../audit/audit.service.js'
import { verifyTotpCode, verifyAndConsumeBackupCode } from './twofa.service.js'
import { withTimestamp } from '../../lib/db-helpers.js'
import type { FastifyInstance } from 'fastify'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFastify = FastifyInstance<any, any, any, any, any>

/** Max consecutive failures before lockout */
const MAX_FAILED_ATTEMPTS = 5
/** Lockout duration in minutes */
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
        }).catch(() => { })
        return null
    }

    // Check account lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
        const minutesLeft = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000)
        recordLoginEvent({
            tenantId: user.tenantId,
            userId: user.id,
            email: user.email,
            eventType: 'failed_login',
            success: false,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            failureReason: 'account_locked',
        }).catch(() => { })
        throw Object.assign(new Error(`Account locked. Try again in ${minutesLeft} minute(s).`), { statusCode: 423 })
    }

    const passwordMatch = await bcrypt.compare(input.password, user.passwordHash)
    if (!passwordMatch) {
        const newCount = (user.failedLoginCount ?? 0) + 1
        const shouldLock = newCount >= MAX_FAILED_ATTEMPTS
        const lockedUntil = shouldLock
            ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
            : null

        await db
            .update(users)
            .set({
                failedLoginCount: newCount,
                ...(lockedUntil !== null ? { lockedUntil } : {}),
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
            failureReason: shouldLock ? 'account_now_locked' : 'wrong_password',
        }).catch(() => { })
        return null
    }

    // Successful auth — reset failure counter
    await db
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, user.id))

    // If 2FA is enabled, return a short-lived MFA challenge token instead of real tokens
    if (user.twoFaEnabled) {
        const mfaToken = fastify.jwt.sign(
            { sub: user.id, purpose: 'mfa-pending' },
            { expiresIn: '5m' }
        )
        return { requiresMfa: true as const, mfaToken }
    }

    return issueTokens(fastify, user, input)
}

type UserRow = { id: string; name: string; email: string; role: string; tenantId: string; entityId: string | null; department: string | null; avatarUrl: string | null }

async function issueTokens(fastify: AnyFastify, user: UserRow, meta: { ipAddress?: string; userAgent?: string }) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1)

    const accessToken = fastify.jwt.sign(
        { sub: user.id, tenantId: user.tenantId, role: user.role, name: user.name, email: user.email },
        { expiresIn: '15m' }
    )
    const rawRefreshToken = crypto.randomBytes(48).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await db.insert(refreshTokens).values({ userId: user.id, tokenHash, expiresAt })

    recordLoginEvent({
        tenantId: user.tenantId,
        userId: user.id,
        email: user.email,
        eventType: 'login',
        success: true,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        sessionRef: tokenHash.slice(0, 8),
    }).catch(() => { })

    return {
        accessToken,
        refreshToken: rawRefreshToken,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            entityId: user.entityId,
            department: user.department,
            avatarUrl: user.avatarUrl,
        },
        tenant: tenant ? {
            id: tenant.id,
            name: tenant.name,
            jurisdiction: tenant.jurisdiction,
            industryType: tenant.industryType,
            subscriptionPlan: tenant.subscriptionPlan,
            logoUrl: tenant.logoUrl,
        } : null,
    }
}

/**
 * Complete a 2FA login challenge — verifies the TOTP code and issues real tokens.
 * Call this after the user has been issued a `mfa-pending` JWT from loginUser.
 */
export async function completeMfaLogin(
    fastify: AnyFastify,
    userId: string,
    totpCode: string,
    meta: { ipAddress?: string; userAgent?: string }
) {
    const isValid = await verifyTotpCode(userId, totpCode)
    if (!isValid) return null

    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.isActive, true)))
        .limit(1)
    if (!user) return null

    return issueTokens(fastify, user, meta)
}

/**
 * Complete a 2FA login challenge using a single-use backup recovery code.
 * Used when the user has lost access to their authenticator app.
 */
export async function completeMfaLoginWithBackupCode(
    fastify: AnyFastify,
    userId: string,
    backupCode: string,
    meta: { ipAddress?: string; userAgent?: string }
) {
    const isValid = await verifyAndConsumeBackupCode(userId, backupCode)
    if (!isValid) return null

    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, userId), eq(users.isActive, true)))
        .limit(1)
    if (!user) return null

    return issueTokens(fastify, user, meta)
}

/**
 * Register a new tenant + super_admin user in a single transaction.
 */
export async function registerTenant(input: { name: string; email: string; password: string; company: string }) {
    const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()))
        .limit(1)
    if (existing) return { ok: false, reason: 'email_taken' as const }

    const passwordHash = await bcrypt.hash(input.password, 10)

    return db.transaction(async (tx) => {
        const [tenant] = await tx.insert(tenants).values({
            name: input.company,
            tradeLicenseNo: `PENDING-${crypto.randomBytes(8).toString('hex')}`,
            jurisdiction: 'mainland',
            industryType: 'general',
            subscriptionPlan: 'starter',
        }).returning()

        await tx.insert(users).values({
            tenantId: tenant.id,
            name: input.name,
            email: input.email.toLowerCase(),
            passwordHash,
            role: 'super_admin',
        })

        return { ok: true as const }
    })
}

export async function refreshAccessToken(fastify: AnyFastify, rawToken: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const [tokenRecord] = await db
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1)

    if (!tokenRecord || tokenRecord.expiresAt < new Date()) {
        return null
    }

    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, tokenRecord.userId), eq(users.isActive, true)))
        .limit(1)

    if (!user) return null

    // Rotate refresh token
    await db.delete(refreshTokens).where(eq(refreshTokens.id, tokenRecord.id))

    const newRawToken = crypto.randomBytes(48).toString('hex')
    const newTokenHash = crypto.createHash('sha256').update(newRawToken).digest('hex')
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await db.insert(refreshTokens).values({ userId: user.id, tokenHash: newTokenHash, expiresAt })

    const accessToken = fastify.jwt.sign(
        { sub: user.id, tenantId: user.tenantId, role: user.role, name: user.name, email: user.email },
        { expiresIn: '15m' }
    )

    return { accessToken, refreshToken: newRawToken }
}

export async function revokeRefreshToken(rawToken: string) {
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash))
}

/**
 * Issue a password reset token for the given email.
 * Always returns success-shaped result to avoid email enumeration.
 * In dev (NODE_ENV !== 'production') the raw token is returned for testing.
 */
export async function requestPasswordReset(email: string) {
    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, email.toLowerCase()), eq(users.isActive, true)))
        .limit(1)

    if (!user) return { sent: true, devToken: null as string | null }

    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 1)

    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt })

    const env = loadEnv()
    const resetUrl = `${env.APP_URL}/reset-password?token=${rawToken}`
    const emailTmpl = passwordResetEmail({ name: user.name, resetUrl, expiresInMinutes: 60 })
    await sendEmail({ ...emailTmpl, to: user.email })

    return { sent: true, devToken: null as string | null }
}

export async function resetPasswordWithToken(rawToken: string, newPassword: string) {
    if (!rawToken || newPassword.length < 8) return { ok: false, reason: 'invalid_input' as const }
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')

    const [record] = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.tokenHash, tokenHash))
        .limit(1)

    if (!record) return { ok: false, reason: 'invalid_token' as const }
    if (record.usedAt) return { ok: false, reason: 'token_used' as const }
    if (record.expiresAt < new Date()) return { ok: false, reason: 'token_expired' as const }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await db.update(users)
        .set(withTimestamp({ passwordHash }))
        .where(eq(users.id, record.userId))
    await db.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, record.id))
    // Invalidate all refresh tokens for the user.
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, record.userId))

    return { ok: true as const }
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (newPassword.length < 8) return { ok: false, reason: 'weak_password' as const }
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
    if (!user) return { ok: false, reason: 'not_found' as const }

    const match = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!match) return { ok: false, reason: 'invalid_current' as const }

    const passwordHash = await bcrypt.hash(newPassword, 10)
    await db.update(users)
        .set(withTimestamp({ passwordHash }))
        .where(eq(users.id, user.id))

    return { ok: true as const }
}

/**
 * Task 2.8 — Delete expired refresh tokens and password reset tokens.
 * Run periodically (every 6 hours) to keep the tokens table lean.
 */
export async function cleanupExpiredTokens(): Promise<void> {
    const now = new Date()
    await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, now))
    await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now))
}
