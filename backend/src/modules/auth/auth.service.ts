import bcrypt from 'bcrypt'
import { eq, and, lt, sql } from 'drizzle-orm'
import crypto from 'node:crypto'
import { db } from '../../db/index.js'
import { users, refreshTokens, tenants, passwordResetTokens, entities, employees } from '../../db/schema/index.js'
import { sendEmail, passwordResetEmail } from '../../plugins/email.js'
import { loadEnv } from '../../config/env.js'
import { recordLoginEvent } from '../audit/audit.service.js'
import { verifyTotpCode, verifyAndConsumeBackupCode } from './twofa.service.js'
import { withTimestamp } from '../../lib/db-helpers.js'
import { seedDefaultTemplates } from '../documents/templates.service.js'
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

    // Read current lockout state with a row-level lock, then run bcrypt outside the
    // transaction so the DB connection isn't held for the ~100ms hash duration.
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
        }).catch(() => { })
        throw Object.assign(new Error(`Account locked. Try again in ${minutesLeft} minute(s).`), { statusCode: 423 })
    }

    const passwordMatch = await bcrypt.compare(input.password, fresh.passwordHash)
    if (!passwordMatch) {
        // Atomic increment prevents concurrent requests from both reading count=4 and
        // both incrementing to 5 without triggering lockout on the first failure.
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

        const newCount = (fresh.failedLoginCount ?? 0) + 1
        const shouldLock = newCount >= MAX_FAILED_ATTEMPTS

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

type UserRow = { id: string; firstName: string; lastName: string; name: string; email: string; role: string; tenantId: string; entityId: string | null; employeeId: string; department: string | null; avatarUrl: string | null }

export async function issueTokens(fastify: AnyFastify, user: UserRow, meta: { ipAddress?: string; userAgent?: string }) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, user.tenantId)).limit(1)

    const accessToken = fastify.jwt.sign(
        { sub: user.id, tenantId: user.tenantId, role: user.role, firstName: user.firstName, lastName: user.lastName, name: user.name, email: user.email, employeeId: user.employeeId, department: user.department ?? null },
        { expiresIn: '15m' }
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
        sessionRef: tokenHash.slice(0, 8),
    }).catch(() => { })

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
            tenantId: user.tenantId,
            entityId: user.entityId,
            employeeId: user.employeeId,
            department: user.department,
            avatarUrl: user.avatarUrl,
        },
        tenant: tenant ? {
            id: tenant.id,
            name: tenant.name,
            tradeLicenseNo: tenant.tradeLicenseNo,
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
async function generateUniqueCompanyCode(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], companyName: string): Promise<string> {
    // Build base code from initials of each word, uppercase, max 4 chars
    const initials = companyName
        .trim()
        .split(/\s+/)
        .map(w => w[0]?.toUpperCase() ?? '')
        .join('')
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 4)

    const base = initials.length >= 2
        ? initials.padEnd(4, 'X').slice(0, 4)
        : companyName.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X')

    // Try base code first, then BASE + suffix (1-99) if taken
    let candidate = base
    let suffix = 1
    while (true) {
        const [existing] = await tx
            .select({ id: tenants.id })
            .from(tenants)
            .where(sql`LOWER(${tenants.companyCode}) = LOWER(${candidate})`)
            .limit(1)
        if (!existing) return candidate
        candidate = base.slice(0, 3) + String(suffix)
        suffix++
    }
}

export async function registerTenant(input: {
    firstName: string
    lastName: string
    email: string
    password: string
    company: string
    industry?: string
    jurisdiction?: 'mainland' | 'freezone'
    tradeLicenseNo?: string
    phone?: string
    companySize?: string
}) {
    const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email.toLowerCase()))
        .limit(1)
    if (existing) return { ok: false, reason: 'email_taken' as const }

    const passwordHash = await bcrypt.hash(input.password, 10)

    return db.transaction(async (tx) => {
        const companyCode = await generateUniqueCompanyCode(tx, input.company)

        const [tenant] = await tx.insert(tenants).values({
            name: input.company,
            companyCode,
            tradeLicenseNo: input.tradeLicenseNo?.trim() || `PENDING-${crypto.randomBytes(8).toString('hex')}`,
            jurisdiction: input.jurisdiction ?? 'mainland',
            industryType: input.industry ?? 'general',
            phone: input.phone?.trim() || null,
            companySize: input.companySize ?? null,
            subscriptionPlan: 'starter',
        }).returning()

        // Every tenant needs at least one entity — employees FK to entities.id.
        // Without this default row, the Add Employee flow returns 400.
        const [entity] = await tx.insert(entities).values({
            tenantId: tenant.id,
            entityName: input.company,
            licenseType: input.jurisdiction ?? 'mainland',
        }).returning({ id: entities.id })

        const firstName = input.firstName.trim()
        const lastName = input.lastName.trim()
        const fullName = `${firstName} ${lastName}`.trim()

        // Auto-generate EMP-00001 for the first employee of this tenant
        const employeeNo = 'EMP-00001'
        const today = new Date().toISOString().split('T')[0]

        const [adminEmployee] = await tx.insert(employees).values({
            tenantId: tenant.id,
            entityId: entity.id,
            employeeNo,
            firstName,
            lastName,
            email: input.email.toLowerCase(),
            joinDate: today,
            status: 'active',
            designation: 'Administrator',
        }).returning({ id: employees.id })

        const [adminUser] = await tx.insert(users).values({
            tenantId: tenant.id,
            firstName,
            lastName,
            name: fullName,
            email: input.email.toLowerCase(),
            passwordHash,
            role: 'super_admin',
            employeeId: adminEmployee.id,
        }).returning({ id: users.id })

        // Seed default document templates for the new tenant (non-fatal if it fails)
        seedDefaultTemplates(tenant.id, adminUser.id).catch(() => { })

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

    // Preserve the tenant context the user was in when this refresh token was issued
    // (may differ from user.tenantId when the user switched organizations).
    const tenantId = tokenRecord.tenantId ?? user.tenantId

    await db.insert(refreshTokens).values({ userId: user.id, tenantId, tokenHash: newTokenHash, expiresAt })

    const accessToken = fastify.jwt.sign(
        { sub: user.id, tenantId, role: user.role, name: user.name, email: user.email, employeeId: user.employeeId },
        { expiresIn: '15m' }
    )

    return { accessToken, refreshToken: newRawToken, employeeId: user.employeeId }
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
    const emailResult = await sendEmail({ ...emailTmpl, to: user.email })

    const devToken = env.NODE_ENV !== 'production' ? rawToken : null
    return { sent: emailResult.ok, devToken }
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
        .set(withTimestamp({ passwordHash, isActive: true }))
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
