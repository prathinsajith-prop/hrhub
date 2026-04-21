import bcrypt from 'bcrypt'
import { eq, and } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '../../db/index.js'
import { users, refreshTokens, tenants } from '../../db/schema/index.js'
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
