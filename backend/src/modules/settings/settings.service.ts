import { eq, and, isNull, isNotNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { tenants, users, passwordResetTokens, employees } from '../../db/schema/index.js'
import { randomBytes, createHash } from 'crypto'
import { hash } from 'bcrypt'
import { sendEmail, inviteUserEmail } from '../../plugins/email.js'
import { loadEnv } from '../../config/env.js'
import type { UserRole } from '../../types/index.js'

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

/**
 * All users who are linked to an employee record, enriched with employee
 * profile data. Users without an employeeId are not shown — every user
 * account must trace back to a real employee.
 */
export async function listTenantUsers(tenantId: string) {
    const rows = await db
        .select({
            // User fields
            id: users.id,
            name: users.name,
            email: users.email,
            role: users.role,
            isActive: users.isActive,
            lastLoginAt: users.lastLoginAt,
            createdAt: users.createdAt,
            employeeId: users.employeeId,
            // Employee profile enrichment
            employeeNo: employees.employeeNo,
            designation: employees.designation,
            department: employees.department,
            avatarUrl: employees.avatarUrl,
        })
        .from(users)
        .innerJoin(employees, and(
            eq(employees.id, users.employeeId!),
            eq(employees.tenantId, tenantId),
        ))
        .where(and(
            eq(users.tenantId, tenantId),
            isNotNull(users.employeeId),
        ))
        .orderBy(employees.firstName, employees.lastName)

    return rows
}

export async function updateUserStatus(tenantId: string, userId: string, data: { isActive?: boolean; role?: string }) {
    const [updated] = await db
        .update(users)
        .set({
            ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            ...(data.role ? { role: data.role as UserRole } : {}),
            updatedAt: new Date(),
        })
        .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)))
        .returning({ id: users.id, name: users.name, email: users.email, role: users.role, isActive: users.isActive })
    return updated ?? null
}

/**
 * Employees in this tenant who do NOT yet have a user account. These are the
 * candidates available in the invite picker. Ordered alphabetically so the
 * list is easy to scan.
 */
export async function listInvitableEmployees(tenantId: string) {
    const rows = await db
        .select({
            id: employees.id,
            employeeNo: employees.employeeNo,
            firstName: employees.firstName,
            lastName: employees.lastName,
            email: employees.email,
            workEmail: employees.workEmail,
            personalEmail: employees.personalEmail,
            department: employees.department,
            designation: employees.designation,
            avatarUrl: employees.avatarUrl,
        })
        .from(employees)
        .leftJoin(
            users,
            and(eq(users.employeeId, employees.id), eq(users.tenantId, tenantId)),
        )
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            isNull(users.id),       // no linked user account yet
        ))
        .orderBy(employees.firstName, employees.lastName)

    return rows.map(e => ({
        ...e,
        fullName: `${e.firstName} ${e.lastName}`.trim(),
        // Prefer work email (company email) for login, fall back to personal email
        inviteEmail: e.workEmail || e.email || e.personalEmail || null,
    }))
}

/**
 * Create a user account for an existing employee and send a 48-hour invite
 * link. Name and email are derived from the employee record — no free-text
 * inputs mean no stale data or typos.
 *
 * Throws 404 if the employee does not exist, 422 if the employee has no email,
 * 409 if the employee already has an account.
 */
export async function inviteUser(
    tenantId: string,
    data: { employeeId: string; role: string },
) {
    const env = loadEnv()

    const [emp] = await db
        .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            email: employees.email,
            workEmail: employees.workEmail,
            personalEmail: employees.personalEmail,
        })
        .from(employees)
        .where(and(
            eq(employees.id, data.employeeId),
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
        ))
        .limit(1)

    if (!emp) {
        throw Object.assign(new Error('Employee not found'), { statusCode: 404 })
    }

    // Prefer work (company) email, fall back to personal email
    const email = emp.workEmail || emp.email || emp.personalEmail
    if (!email) {
        throw Object.assign(
            new Error('This employee has no email address. Add a work or personal email to their profile before inviting.'),
            { statusCode: 422 },
        )
    }

    const name = `${emp.firstName} ${emp.lastName}`.trim()

    // Guard: employee already has an account
    const [alreadyLinked] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.employeeId, data.employeeId), eq(users.tenantId, tenantId)))
        .limit(1)
    if (alreadyLinked) {
        throw Object.assign(new Error('This employee already has a user account'), { statusCode: 409 })
    }

    // Guard: email in use within this tenant (case-insensitive handled by DB unique index)
    const [emailTaken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.email, email.toLowerCase())))
        .limit(1)
    if (emailTaken) {
        throw Object.assign(new Error('A user with this email already exists in this workspace'), { statusCode: 409 })
    }

    const tempPassword = randomBytes(12).toString('base64url')
    const passwordHash = await hash(tempPassword, 12)

    const [user] = await db.insert(users).values({
        tenantId,
        email: email.toLowerCase(),
        firstName: emp.firstName,
        lastName: emp.lastName,
        name,
        passwordHash,
        role: data.role as UserRole,
        isActive: false,
        employeeId: data.employeeId,
    }).returning({ id: users.id })

    // 48-hour invite link via password-reset token flow
    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)
    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt })

    const inviteUrl = `${env.APP_URL}/reset-password?token=${rawToken}`
    const emailOpts = inviteUserEmail({ inviteeName: name, workspaceName: 'HRHub', role: data.role, inviteUrl })
    await sendEmail({ ...emailOpts, to: email })

    return { id: user.id, name, email, role: data.role, employeeId: data.employeeId }
}

/**
 * Invite multiple employees at once. Processes each independently so one
 * failure doesn't block the rest. Returns succeeded + failed arrays.
 */
export async function inviteUserBulk(
    tenantId: string,
    employeeIds: string[],
    role: string,
): Promise<{
    succeeded: Array<{ employeeId: string; name: string; email: string }>
    failed: Array<{ employeeId: string; reason: string }>
}> {
    const succeeded: Array<{ employeeId: string; name: string; email: string }> = []
    const failed: Array<{ employeeId: string; reason: string }> = []

    for (const employeeId of employeeIds) {
        try {
            const result = await inviteUser(tenantId, { employeeId, role })
            succeeded.push({ employeeId: result.employeeId, name: result.name, email: result.email })
        } catch (err: any) {
            failed.push({ employeeId, reason: err.message ?? 'Unknown error' })
        }
    }

    return { succeeded, failed }
}

/**
 * Resend an invite to an employee whose account exists but is still inactive
 * (i.e. they haven't completed the password-reset / onboarding link yet).
 * Generates a fresh 48-hour token and emails a new invite link.
 */
export async function resendInvite(tenantId: string, employeeId: string) {
    const env = loadEnv()

    const [user] = await db
        .select({ id: users.id, email: users.email, name: users.name, isActive: users.isActive })
        .from(users)
        .where(and(eq(users.employeeId, employeeId), eq(users.tenantId, tenantId)))
        .limit(1)

    if (!user) {
        throw Object.assign(new Error('No account found for this employee'), { statusCode: 404 })
    }
    if (user.isActive) {
        throw Object.assign(new Error('Account is already active — invite already accepted'), { statusCode: 409 })
    }

    const rawToken = randomBytes(32).toString('hex')
    const tokenHash = createHash('sha256').update(rawToken).digest('hex')
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000)
    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash, expiresAt })

    const inviteUrl = `${env.APP_URL}/reset-password?token=${rawToken}`
    const emailOpts = inviteUserEmail({ inviteeName: user.name, workspaceName: 'HRHub', role: 'employee', inviteUrl })
    await sendEmail({ ...emailOpts, to: user.email })
}
