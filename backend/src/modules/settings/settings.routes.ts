import { getCompanySettings, updateCompanySettings, listTenantUsers, listInvitableEmployees, inviteUser, inviteUserBulk, updateUserStatus, resendInvite } from './settings.service.js'
import { db } from '../../db/index.js'
import { tenants, users } from '../../db/schema/index.js'
import { eq, and } from 'drizzle-orm'

const VALID_ROLES = ['employee', 'dept_head', 'pro_officer', 'hr_manager', 'super_admin'] as const
type ValidRole = typeof VALID_ROLES[number]

function validateRoleAssignment(callerRole: string, targetRole: string): string | null {
    if (!VALID_ROLES.includes(targetRole as ValidRole)) {
        return `Invalid role: ${targetRole}`
    }
    // hr_manager cannot assign super_admin
    if (callerRole === 'hr_manager' && targetRole === 'super_admin') {
        return 'You do not have permission to assign the super_admin role'
    }
    return null
}

export default async function settingsRoutes(fastify: any): Promise<void> {
    const hrAdmin = {
        preHandler: [
            fastify.authenticate,
            fastify.requireRole('hr_manager', 'super_admin'),
        ],
    }

    // GET /settings/company — returns current tenant profile
    fastify.get('/company', { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const data = await getCompanySettings(request.user.tenantId)
        if (!data) return reply.code(404).send({ message: 'Tenant not found' })
        return reply.send({ data })
    })

    // PATCH /settings/company — update tenant profile (hr_manager / super_admin only)
    fastify.patch('/company', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { name, companyCode, tradeLicenseNo, jurisdiction, industryType, logoUrl } = request.body as Record<string, string>
        try {
            const updated = await updateCompanySettings(request.user.tenantId, {
                name,
                companyCode,
                tradeLicenseNo,
                jurisdiction: jurisdiction as 'mainland' | 'freezone',
                industryType,
                logoUrl,
            })
            return reply.send({ data: updated })
        } catch (err: any) {
            return reply.code(err.statusCode ?? 500).send({ message: err.message })
        }
    })

    // GET /settings/users — list employee-linked users in tenant
    fastify.get('/users', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const data = await listTenantUsers(request.user.tenantId)
        return reply.send({ data })
    })

    // GET /settings/invitable-employees — employees without a user account (invite picker source)
    fastify.get('/invitable-employees', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const data = await listInvitableEmployees(request.user.tenantId)
        return reply.send({ data })
    })

    // POST /settings/users/invite — create a user account for an existing employee
    fastify.post('/users/invite', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { employeeId, role } = request.body as { employeeId: string; role: string }
        if (!employeeId || !role) {
            return reply.code(400).send({ message: 'employeeId and role are required' })
        }
        const roleError = validateRoleAssignment(request.user.role, role)
        if (roleError) return reply.code(403).send({ message: roleError })
        try {
            const result = await inviteUser(request.user.tenantId, { employeeId, role })
            return reply.code(201).send({ data: result })
        } catch (err: any) {
            return reply.code(err.statusCode ?? 500).send({ message: err.message })
        }
    })

    // POST /settings/users/invite-bulk — grant access to multiple employees at once
    fastify.post('/users/invite-bulk', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { employeeIds, role } = request.body as { employeeIds: string[]; role: string }
        if (!Array.isArray(employeeIds) || employeeIds.length === 0 || !role) {
            return reply.code(400).send({ message: 'employeeIds (array) and role are required' })
        }
        const roleError = validateRoleAssignment(request.user.role, role)
        if (roleError) return reply.code(403).send({ message: roleError })
        const results = await inviteUserBulk(request.user.tenantId, employeeIds, role)
        return reply.code(207).send({ data: results })
    })

    // POST /settings/users/:employeeId/resend-invite — resend invite link to inactive user
    fastify.post('/users/:employeeId/resend-invite', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { employeeId } = request.params as { employeeId: string }
        try {
            await resendInvite(request.user.tenantId, employeeId)
            return reply.send({ message: 'Invite resent' })
        } catch (err: any) {
            return reply.code(err.statusCode ?? 500).send({ message: err.message })
        }
    })

    // PATCH /settings/users/:id — deactivate/reactivate a user or change their role
    fastify.patch('/users/:id', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const { isActive, role } = request.body as { isActive?: boolean; role?: string }

        // Prevent anyone from deactivating themselves
        if (id === request.user.id && isActive === false) {
            return reply.code(400).send({ message: 'You cannot deactivate your own account' })
        }

        if (role) {
            const roleError = validateRoleAssignment(request.user.role, role)
            if (roleError) return reply.code(403).send({ message: roleError })
        }

        // hr_manager cannot modify super_admin users (role change or deactivation)
        if (request.user.role !== 'super_admin') {
            const [target] = await db
                .select({ role: users.role })
                .from(users)
                .where(and(eq(users.id, id), eq(users.tenantId, request.user.tenantId)))
                .limit(1)
            if (target?.role === 'super_admin') {
                return reply.code(403).send({ message: 'You do not have permission to modify a Super Admin account' })
            }
        }

        const updated = await updateUserStatus(request.user.tenantId, id, { isActive, role })
        if (!updated) return reply.code(404).send({ message: 'User not found' })

        // Invalidate the isActive cache for this user so the change is effective immediately
        const { cacheDel } = await import('../../lib/redis.js')
        await cacheDel(`user:active:${id}`)

        return reply.send({ data: updated })
    })

    // ── IP Allowlist routes ──────────────────────────────────────────────
    // GET /settings/ip-allowlist
    fastify.get('/ip-allowlist', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const [tenant] = await db
            .select({ ipAllowlist: tenants.ipAllowlist })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        return reply.send({ data: { ipAllowlist: tenant?.ipAllowlist ?? [] } })
    })

    // PUT /settings/ip-allowlist
    fastify.put('/ip-allowlist', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { ipAllowlist } = request.body as { ipAllowlist: string[] }
        if (!Array.isArray(ipAllowlist)) {
            return reply.code(400).send({ error: 'ipAllowlist must be an array' })
        }
        // Basic CIDR/IP validation
        const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
        const invalid = ipAllowlist.filter(ip => !cidrRegex.test(ip.trim()))
        if (invalid.length > 0) {
            return reply.code(400).send({ error: `Invalid IP/CIDR entries: ${invalid.join(', ')}` })
        }
        const [updated] = await db
            .update(tenants)
            .set({ ipAllowlist: ipAllowlist.map(s => s.trim()), updatedAt: new Date() })
            .where(eq(tenants.id, request.user.tenantId))
            .returning({ ipAllowlist: tenants.ipAllowlist })
        return reply.send({ data: { ipAllowlist: updated?.ipAllowlist ?? [] } })
    })

    // ── Regional Settings ────────────────────────────────────────────────────
    // GET /settings/regional
    fastify.get('/regional', { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const [row] = await db
            .select({ regionalSettings: tenants.regionalSettings })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        return reply.send({ data: row?.regionalSettings ?? { timezone: 'Asia/Dubai', currency: 'AED', dateFormat: 'DD/MM/YYYY' } })
    })

    // PATCH /settings/regional
    fastify.patch('/regional', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { timezone, currency, dateFormat } = request.body as { timezone?: string; currency?: string; dateFormat?: string }
        const [current] = await db
            .select({ regionalSettings: tenants.regionalSettings })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        const merged = { ...current?.regionalSettings, ...(timezone ? { timezone } : {}), ...(currency ? { currency } : {}), ...(dateFormat ? { dateFormat } : {}) }
        const [updated] = await db
            .update(tenants)
            .set({ regionalSettings: merged, updatedAt: new Date() })
            .where(eq(tenants.id, request.user.tenantId))
            .returning({ regionalSettings: tenants.regionalSettings })
        return reply.send({ data: updated?.regionalSettings })
    })

    // ── Security Settings ─────────────────────────────────────────────────────
    // GET /settings/security
    fastify.get('/security', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const [row] = await db
            .select({ securitySettings: tenants.securitySettings })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        return reply.send({ data: row?.securitySettings ?? { sessionTimeoutMinutes: 480, auditLoggingEnabled: true } })
    })

    // PATCH /settings/security
    fastify.patch('/security', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { sessionTimeoutMinutes, auditLoggingEnabled } = request.body as { sessionTimeoutMinutes?: number; auditLoggingEnabled?: boolean }
        const [current] = await db
            .select({ securitySettings: tenants.securitySettings })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        const merged = {
            ...current?.securitySettings,
            ...(sessionTimeoutMinutes !== undefined ? { sessionTimeoutMinutes } : {}),
            ...(auditLoggingEnabled !== undefined ? { auditLoggingEnabled } : {}),
        }
        const [updated] = await db
            .update(tenants)
            .set({ securitySettings: merged, updatedAt: new Date() })
            .where(eq(tenants.id, request.user.tenantId))
            .returning({ securitySettings: tenants.securitySettings })
        return reply.send({ data: updated?.securitySettings })
    })

    // ── Notification Preferences (per user) ───────────────────────────────────
    // GET /settings/notifications
    fastify.get('/notifications', { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const [row] = await db
            .select({ notifPrefs: users.notifPrefs })
            .from(users)
            .where(eq(users.id, request.user.id))
            .limit(1)
        return reply.send({ data: row?.notifPrefs ?? {} })
    })

    // PUT /settings/notifications
    fastify.put('/notifications', { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const prefs = request.body as Record<string, { email: boolean; push: boolean }>
        if (typeof prefs !== 'object' || Array.isArray(prefs)) {
            return reply.code(400).send({ message: 'Body must be a notification preferences object' })
        }
        const [updated] = await db
            .update(users)
            .set({ notifPrefs: prefs, updatedAt: new Date() })
            .where(eq(users.id, request.user.id))
            .returning({ notifPrefs: users.notifPrefs })
        return reply.send({ data: updated?.notifPrefs ?? {} })
    })

    // ── Leave Settings ───────────────────────────────────────────────────────
    // GET /settings/leave
    fastify.get('/leave', { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const [row] = await db
            .select({ leaveSettings: tenants.leaveSettings })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        return reply.send({ data: row?.leaveSettings ?? { rolloverEnabledFrom: null } })
    })

    // PATCH /settings/leave
    fastify.patch('/leave', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { rolloverEnabledFrom } = (request.body ?? {}) as { rolloverEnabledFrom?: string | null }
        // Validate date format if provided
        if (rolloverEnabledFrom !== undefined && rolloverEnabledFrom !== null) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(rolloverEnabledFrom) || isNaN(Date.parse(rolloverEnabledFrom))) {
                return reply.code(400).send({ message: 'rolloverEnabledFrom must be a valid ISO date (YYYY-MM-DD) or null' })
            }
        }
        const [row] = await db
            .select({ leaveSettings: tenants.leaveSettings })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        const merged = { ...row?.leaveSettings, rolloverEnabledFrom: rolloverEnabledFrom ?? null }
        const [updated] = await db
            .update(tenants)
            .set({ leaveSettings: merged, updatedAt: new Date() })
            .where(eq(tenants.id, request.user.tenantId))
            .returning({ leaveSettings: tenants.leaveSettings })
        return reply.send({ data: updated?.leaveSettings })
    })

    // ── Mail diagnostics ─────────────────────────────────────────────────────
    // GET /settings/mail/status — verify SMTP/Resend connection (hr_admin only)
    fastify.get('/mail/status', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (_request: any, reply: any) => {
        const { verifyEmailConfig } = await import('../../plugins/email.js')
        const status = await verifyEmailConfig()
        return reply.send({ data: status })
    })

    // POST /settings/mail/test — send a test email to a chosen address
    fastify.post('/mail/test', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { to } = (request.body ?? {}) as { to?: string }
        if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
            return reply.code(400).send({ message: 'Provide a valid `to` email address.' })
        }
        const { sendEmail, mailTestEmail } = await import('../../plugins/email.js')
        const tmpl = mailTestEmail({ recipientName: to })
        const result = await sendEmail({ ...tmpl, to })
        return reply.send({ data: result })
    })
}
