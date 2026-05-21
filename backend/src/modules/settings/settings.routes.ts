import { getCompanySettings, updateCompanySettings, listTenantUsers, listInvitableEmployees, inviteUser, inviteUserBulk, updateUserStatus, resendInvite } from './settings.service.js'
import { db } from '../../db/index.js'
import { tenants, users, employees } from '../../db/schema/index.js'
import { eq, and } from 'drizzle-orm'
import { invalidatePrivacyPolicyCache } from '../../lib/privacy.js'

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
        // Accept either `businessType` (canonical, post-migration 0051) or
        // the legacy `jurisdiction` field name from older clients. Both map
        // to the same DB column.
        const body = request.body as Record<string, string | null>
        const { name, companyCode, tradeLicenseNo, businessType, jurisdiction, industryType, logoUrl, phone, address, companyEmail, companyWebsite } = body
        try {
            const updated = await updateCompanySettings(request.user.tenantId, {
                name: name as string | undefined,
                companyCode: companyCode as string | undefined,
                tradeLicenseNo: tradeLicenseNo as string | undefined,
                businessType: (businessType ?? jurisdiction) as 'mainland' | 'freezone' | undefined,
                industryType: industryType as string | undefined,
                logoUrl: logoUrl as string | undefined,
                phone: phone === undefined ? undefined : phone,
                address: address === undefined ? undefined : address,
                companyEmail: companyEmail === undefined ? undefined : companyEmail,
                companyWebsite: companyWebsite === undefined ? undefined : companyWebsite,
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
        const { employeeId, role, roles } = request.body as { employeeId: string; role: string; roles?: string[] }
        if (!employeeId || !role) {
            return reply.code(400).send({ message: 'employeeId and role are required' })
        }
        const roleError = validateRoleAssignment(request.user.role, role)
        if (roleError) return reply.code(403).send({ message: roleError })
        if (roles) {
            for (const r of roles) {
                const err = validateRoleAssignment(request.user.role, r)
                if (err) return reply.code(403).send({ message: err })
            }
        }
        try {
            const result = await inviteUser(request.user.tenantId, { employeeId, role, roles })
            return reply.code(201).send({ data: result })
        } catch (err: any) {
            return reply.code(err.statusCode ?? 500).send({ message: err.message })
        }
    })

    // POST /settings/users/invite-bulk — grant access to multiple employees at once
    fastify.post('/users/invite-bulk', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { employeeIds, role, roles } = request.body as { employeeIds: string[]; role: string; roles?: string[] }
        if (!Array.isArray(employeeIds) || employeeIds.length === 0 || !role) {
            return reply.code(400).send({ message: 'employeeIds (array) and role are required' })
        }
        const roleError = validateRoleAssignment(request.user.role, role)
        if (roleError) return reply.code(403).send({ message: roleError })
        if (roles) {
            for (const r of roles) {
                const err = validateRoleAssignment(request.user.role, r)
                if (err) return reply.code(403).send({ message: err })
            }
        }
        const results = await inviteUserBulk(request.user.tenantId, employeeIds, role, roles)
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
        const { isActive, role, roles } = request.body as { isActive?: boolean; role?: string; roles?: string[] }

        // Prevent anyone from deactivating themselves
        if (id === request.user.id && isActive === false) {
            return reply.code(400).send({ message: 'You cannot deactivate your own account' })
        }

        if (role) {
            const roleError = validateRoleAssignment(request.user.role, role)
            if (roleError) return reply.code(403).send({ message: roleError })
        }

        if (roles) {
            for (const r of roles) {
                const err = validateRoleAssignment(request.user.role, r)
                if (err) return reply.code(403).send({ message: err })
            }
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

        const updated = await updateUserStatus(request.user.tenantId, id, { isActive, role, roles })
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
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'ipAllowlist must be an array' })
        }
        // Basic CIDR/IP validation
        const cidrRegex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/
        const invalid = ipAllowlist.filter(ip => !cidrRegex.test(ip.trim()))
        if (invalid.length > 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: `Invalid IP/CIDR entries: ${invalid.join(', ')}` })
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

    // ── Organisation Policy ───────────────────────────────────────────────────
    // Org-wide privacy defaults + master notifications kill-switch. The four
    // toggles HR sees on the Org Policy tab map directly to columns/fields:
    //   - notificationsEnabled         → tenants.notifications_enabled
    //   - showBirthday / etc           → tenants.privacy_policy jsonb
    // Per-employee opt-outs live on employees.privacy_overrides — employees
    // can hide their own birthday/anniversary/mobile via /me/privacy below.
    const ORG_POLICY_DEFAULTS = { showBirthday: true, showWorkAnniversary: true, showMobile: true, searchableInDirectory: true }
    fastify.get('/org-policy', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const [row] = await db
            .select({ notificationsEnabled: tenants.notificationsEnabled, privacyPolicy: tenants.privacyPolicy })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        return reply.send({
            data: {
                notificationsEnabled: row?.notificationsEnabled ?? true,
                privacyPolicy: { ...ORG_POLICY_DEFAULTS, ...(row?.privacyPolicy ?? {}) },
            },
        })
    })

    fastify.patch('/org-policy', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const body = request.body as {
            notificationsEnabled?: boolean
            privacyPolicy?: Partial<typeof ORG_POLICY_DEFAULTS>
        }
        const [current] = await db
            .select({ notificationsEnabled: tenants.notificationsEnabled, privacyPolicy: tenants.privacyPolicy })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        // Only spread known boolean keys — refuse to persist arbitrary keys
        // an attacker might smuggle in via the privacyPolicy bag.
        const allowedKeys: (keyof typeof ORG_POLICY_DEFAULTS)[] = ['showBirthday', 'showWorkAnniversary', 'showMobile', 'searchableInDirectory']
        const patch: typeof ORG_POLICY_DEFAULTS = { ...ORG_POLICY_DEFAULTS, ...(current?.privacyPolicy ?? {}) }
        if (body.privacyPolicy && typeof body.privacyPolicy === 'object') {
            for (const k of allowedKeys) {
                const v = body.privacyPolicy[k]
                if (typeof v === 'boolean') patch[k] = v
            }
        }
        const [updated] = await db
            .update(tenants)
            .set({
                ...(typeof body.notificationsEnabled === 'boolean' ? { notificationsEnabled: body.notificationsEnabled } : {}),
                privacyPolicy: patch,
                updatedAt: new Date(),
            })
            .where(eq(tenants.id, request.user.tenantId))
            .returning({ notificationsEnabled: tenants.notificationsEnabled, privacyPolicy: tenants.privacyPolicy })
        // Bust the process-level cache so HR sees their change immediately
        // rather than waiting up to TTL (60s) for the next eviction.
        invalidatePrivacyPolicyCache(request.user.tenantId)
        return reply.send({
            data: {
                notificationsEnabled: updated?.notificationsEnabled ?? true,
                privacyPolicy: { ...ORG_POLICY_DEFAULTS, ...(updated?.privacyPolicy ?? {}) },
            },
        })
    })

    // ── Per-employee privacy overrides ────────────────────────────────────────
    // The employee sees this surface under "My Profile → Privacy". They can
    // opt themselves OUT of the org-wide defaults (hide their own birthday
    // even if HR has the org default on). They cannot opt themselves IN if
    // the org has the default off — HR is the upper bound.
    fastify.get('/me/privacy', { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        if (!request.user.employeeId) return reply.send({ data: {} })
        const [row] = await db
            .select({ privacyOverrides: employees.privacyOverrides })
            .from(employees)
            .where(and(eq(employees.id, request.user.employeeId), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)
        return reply.send({ data: row?.privacyOverrides ?? {} })
    })

    fastify.patch('/me/privacy', { preHandler: [fastify.authenticate], schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        if (!request.user.employeeId) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'No employee linked to this account' })
        const body = request.body as Partial<{ showBirthday: boolean; showWorkAnniversary: boolean; showMobile: boolean; searchableInDirectory: boolean }>
        const allowedKeys: (keyof typeof body)[] = ['showBirthday', 'showWorkAnniversary', 'showMobile', 'searchableInDirectory']
        const patch: Record<string, boolean> = {}
        for (const k of allowedKeys) {
            const v = body[k]
            if (typeof v === 'boolean') patch[k] = v
        }
        const [current] = await db
            .select({ privacyOverrides: employees.privacyOverrides })
            .from(employees)
            .where(and(eq(employees.id, request.user.employeeId), eq(employees.tenantId, request.user.tenantId)))
            .limit(1)
        const merged = { ...(current?.privacyOverrides ?? {}), ...patch }
        const [updated] = await db
            .update(employees)
            .set({ privacyOverrides: merged, updatedAt: new Date() })
            .where(and(eq(employees.id, request.user.employeeId), eq(employees.tenantId, request.user.tenantId)))
            .returning({ privacyOverrides: employees.privacyOverrides })
        return reply.send({ data: updated?.privacyOverrides ?? merged })
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
        const defaults = { rolloverEnabledFrom: null, weekOffDays: ['saturday', 'sunday'], workingWeekStart: 'monday' }
        return reply.send({ data: { ...defaults, ...(row?.leaveSettings ?? {}) } })
    })

    // PATCH /settings/leave
    fastify.patch('/leave', { ...hrAdmin, schema: { tags: ['Settings'] } }, async (request: any, reply: any) => {
        const { rolloverEnabledFrom, weekOffDays, workingWeekStart } = (request.body ?? {}) as {
            rolloverEnabledFrom?: string | null
            weekOffDays?: string[]
            workingWeekStart?: string
        }

        const VALID_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

        if (rolloverEnabledFrom !== undefined && rolloverEnabledFrom !== null) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(rolloverEnabledFrom) || isNaN(Date.parse(rolloverEnabledFrom))) {
                return reply.code(400).send({ message: 'rolloverEnabledFrom must be a valid ISO date (YYYY-MM-DD) or null' })
            }
        }
        if (weekOffDays !== undefined) {
            if (!Array.isArray(weekOffDays) || weekOffDays.some(d => !VALID_DAYS.includes(d))) {
                return reply.code(400).send({ message: 'weekOffDays must be an array of weekday names' })
            }
        }
        if (workingWeekStart !== undefined && !VALID_DAYS.includes(workingWeekStart)) {
            return reply.code(400).send({ message: 'workingWeekStart must be a weekday name' })
        }

        const [row] = await db
            .select({ leaveSettings: tenants.leaveSettings })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        const merged = {
            ...row?.leaveSettings,
            ...(rolloverEnabledFrom !== undefined ? { rolloverEnabledFrom: rolloverEnabledFrom ?? null } : {}),
            ...(weekOffDays !== undefined ? { weekOffDays } : {}),
            ...(workingWeekStart !== undefined ? { workingWeekStart } : {}),
        }
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
