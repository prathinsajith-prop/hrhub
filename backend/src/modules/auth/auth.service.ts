import bcrypt from 'bcrypt'
import { eq, and } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '../../db/index.js'
import { users, refreshTokens, tenants, passwordResetTokens } from '../../db/schema/index.js'
import type { FastifyInstance } from 'fastify'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFastify = FastifyInstance<any, any, any, any, any>

export interface LoginInput {
    email: string
    password: string
}

export async function loginUser(fastify: AnyFastify, input: LoginInput) {
    const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, input.email.toLowerCase()), eq(users.isActive, true)))
        .limit(1)

    if (!user) {
        return null
    }

    const passwordMatch = await bcrypt.compare(input.password, user.passwordHash)
    if (!passwordMatch) {
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

    // TODO: send email via provider; for now expose token in dev for testing.
    const devToken = process.env.NODE_ENV === 'production' ? null : rawToken
    return { sent: true, devToken }
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
