import { eq, and, ne } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { tenants, users, passwordResetTokens } from '../../db/schema/index.js'
import { randomBytes, createHash } from 'crypto'
import { hash } from 'bcrypt'
import { sendEmail, emailUserInvite } from '../../lib/email.js'
import { loadEnv } from '../../config/env.js'

export async function getCompanySettings(tenantId: string) {
    const [tenant] = await db
        .select({
            id: tenants.id,
            name: tenants.name,
            tradeLicenseNo: tenants.tradeLicenseNo,
            jurisdiction: tenants.jurisdiction,
            industryType: tenants.industryType,
            subscriptionPlan: tenants.subscriptionPlan,
            logoUrl: tenants.logoUrl,
        })
        .from(tenants)
        .where(eq(tenants.id, tenantId))
        .limit(1)

    return tenant ?? null
}

export async function updateCompanySettings(
    tenantId: string,
    data: Partial<{
        name: string
        tradeLicenseNo: string
        jurisdiction: 'mainland' | 'freezone'
        industryType: string
        logoUrl: string
    }>,
) {
    const [updated] = await db
        .update(tenants)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(tenants.id, tenantId))
        .returning({
            id: tenants.id,
            name: tenants.name,
            tradeLicenseNo: tenants.tradeLicenseNo,
            jurisdiction: tenants.jurisdiction,
            industryType: tenants.industryType,
            subscriptionPlan: tenants.subscriptionPlan,
            logoUrl: tenants.logoUrl,
        })

    return updated ?? null
}

export async function listTenantUsers(tenantId: string) {
    const rows = await db
        .select({
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            department: users.department,
            isActive: users.isActive,
            lastLoginAt: users.lastLoginAt,
            createdAt: users.createdAt,
        })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), ne(users.role, 'employee')))
        .orderBy(users.createdAt)

    return rows
}

export async function inviteUser(tenantId: string, data: { name: string; email: string; role: string }) {
    const env = loadEnv()
    // Create user with random temp password and isActive=false
    const tempPassword = randomBytes(12).toString('base64url')
    const passwordHash = await hash(tempPassword, 12)

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1)
    if (existing) {
        throw new Error('A user with this email already exists')
    }

    const [user] = await db.insert(users).values({
        tenantId,
        email: data.email,
        name: data.name,
        passwordHash,
        role: data.role as 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee',
        isActive: false,
    }).returning({ id: users.id })

    // Create 48h reset token for invite link
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt })

    const inviteUrl = `${env.APP_URL}/reset-password?token=${rawToken}`
    await sendEmail({
        to: data.email,
        subject: `You've been invited to HRHub`,
        html: emailUserInvite(data.name, 'HRHub', data.role, inviteUrl),
    })
}
