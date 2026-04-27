import { eq, and, ne } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { tenants, users, passwordResetTokens, employees } from '../../db/schema/index.js'
import { randomBytes, createHash } from 'crypto'
import { hash } from 'bcrypt'
import { sendEmail, inviteUserEmail } from '../../plugins/email.js'
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
            employeeId: users.employeeId,
        })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), ne(users.role, 'employee')))
        .orderBy(users.createdAt)

    return rows
}

export async function updateUserStatus(tenantId: string, userId: string, data: { isActive?: boolean; role?: string }) {
    const [updated] = await db
        .update(users)
        .set({
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            ...(data.role ? { role: data.role as 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee' | 'super_admin' } : {}),
            updatedAt: new Date(),
        })
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
    return updated ?? null
}

export async function inviteUser(
    tenantId: string,
    data: { name: string; email: string; role: string; employeeId?: string },
) {
    const env = loadEnv()
    const tempPassword = randomBytes(12).toString('base64url')
    const passwordHash = await hash(tempPassword, 12)

    // Reject duplicate email (global — emails are unique across all tenants in this system)
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email)).limit(1)
    if (existing) {
        throw Object.assign(new Error('A user with this email already exists'), { statusCode: 409 })
    }

    // When linking to an employee, validate the employee and ensure no duplicate account
    if (data.employeeId) {
        const [emp] = await db
            .select({ id: employees.id })
            .from(employees)
            .where(and(eq(employees.id, data.employeeId), eq(employees.tenantId, tenantId)))
            .limit(1)
        if (!emp) {
            throw Object.assign(new Error('Employee not found'), { statusCode: 404 })
        }

        const [linked] = await db
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.employeeId, data.employeeId), eq(users.tenantId, tenantId)))
            .limit(1)
        if (linked) {
            throw Object.assign(new Error('This employee already has a linked account'), { statusCode: 409 })
        }
    }

    const [user] = await db.insert(users).values({
        tenantId,
        email: data.email,
        name: data.name,
        passwordHash,
        role: data.role as 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee',
        isActive: false,
        employeeId: data.employeeId ?? null,
    }).returning({ id: users.id })

    // 48-hour invite link via password reset token
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)

    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt })

    const inviteUrl = `${env.APP_URL}/reset-password?token=${rawToken}`
    const emailOpts = inviteUserEmail({ inviteeName: data.name, workspaceName: 'HRHub', role: data.role, inviteUrl })
    await sendEmail({ ...emailOpts, to: data.email })
}
