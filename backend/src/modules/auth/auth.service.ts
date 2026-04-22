import bcrypt from 'bcrypt'
import { eq, and, lt } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '../../db/index.js'
import { users, refreshTokens, tenants, passwordResetTokens } from '../../db/schema/index.js'
import { sendEmail, passwordResetEmail } from '../../plugins/email.js'
import { loadEnv } from '../../config/env.js'
import { recordLoginEvent } from '../audit/audit.service.js'
import type { FastifyInstance } from 'fastify'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFastify = FastifyInstance<any, any, any, any, any>

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
        // Record failed attempt without userId
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

    const passwordMatch = await bcrypt.compare(input.password, user.passwordHash)
    if (!passwordMatch) {
        recordLoginEvent({
            tenantId: user.tenantId,
            userId: user.id,
            email: user.email,
            eventType: 'failed_login',
            success: false,
            ipAddress: input.ipAddress,
            userAgent: input.userAgent,
            failureReason: 'wrong_password',
        }).catch(() => { })
        return null
    }

    const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.id, user.tenantId))
        .limit(1)

    // Generate tokens
    const accessToken = fastify.jwt.sign(
        { sub: user.id, tenantId: user.tenantId, role: user.role },
        { expiresIn: '15m' }
    )

    const rawRefreshToken = crypto.randomBytes(48).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawRefreshToken).digest('hex')

    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7)

    await db.insert(refreshTokens).values({
        userId: user.id,
        tokenHash,
        expiresAt,
    })

    // Update last login
    await db.update(users).set({ lastLoginAt: new Date() } as any).where(eq(users.id, user.id))

    // Record successful login event
    recordLoginEvent({
        tenantId: user.tenantId,
        userId: user.id,
        email: user.email,
        eventType: 'login',
        success: true,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
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
        { sub: user.id, tenantId: user.tenantId, role: user.role },
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
        .set({ passwordHash, updatedAt: new Date() } as any)
        .where(eq(users.id, record.userId))
    await db.update(passwordResetTokens)
        .set({ usedAt: new Date() } as any)
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
        .set({ passwordHash, updatedAt: new Date() } as any)
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
