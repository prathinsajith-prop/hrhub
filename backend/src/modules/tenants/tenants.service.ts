import crypto from 'node:crypto'
import { eq, and, desc, isNull, sql } from 'drizzle-orm'
import { log } from '../../lib/logger.js'
import { db } from '../../db/index.js'
import { tenants, users, tenantMemberships, entities, employees, gradeLevels, sponsoringEntities, orgUnits, onboardingTemplateSteps, recruitmentStages } from '../../db/schema/index.js'
import { buildDefaultOnboardingTemplateRows } from '../onboarding/onboarding.defaults.js'
import { buildDefaultRecruitmentStageRows } from '../recruitment/recruitment.defaults.js'
import {
    type MemberRole,
    buildPermissionMap,
    hasPermission,
} from '../../lib/permissions.js'
import { sendEmail, inviteUserEmail } from '../../plugins/email.js'

/* ───────────────────────────────── helpers ────────────────────────────────── */

function http(message: string, statusCode: number): Error {
    return Object.assign(new Error(message), { statusCode })
}

function generateInviteToken(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(32).toString('hex')
    const hash = crypto.createHash('sha256').update(raw).digest('hex')
    return { raw, hash }
}

/** Returns the highest role the user holds (via direct user row OR membership). */
async function loadActorRole(userId: string, tenantId: string): Promise<MemberRole | null> {
    const [m] = await db
        .select({ role: tenantMemberships.role, isActive: tenantMemberships.isActive, status: tenantMemberships.inviteStatus })
        .from(tenantMemberships)
        .where(and(eq(tenantMemberships.userId, userId), eq(tenantMemberships.tenantId, tenantId)))
        .limit(1)
    if (m && m.isActive && m.status === 'accepted') return m.role as MemberRole
    // Fallback to users.role for backwards compat (no membership row yet).
    const [u] = await db
        .select({ role: users.role, tenantId: users.tenantId })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)
    if (u && u.tenantId === tenantId) return u.role as MemberRole
    return null
}

/* ───────────────────────── tenant / membership listing ─────────────────────── */

export async function listMyTenants(userId: string) {
    // Explicit membership rows (invited or created via dialog)
    const memberships = await db
        .select({
            membershipId: tenantMemberships.id,
            role: tenantMemberships.role,
            isActive: tenantMemberships.isActive,
            status: tenantMemberships.inviteStatus,
            tenantId: tenants.id,
            tenantName: tenants.name,
            jurisdiction: tenants.jurisdiction,
            industryType: tenants.industryType,
            subscriptionPlan: tenants.subscriptionPlan,
            logoUrl: tenants.logoUrl,
        })
        .from(tenantMemberships)
        .innerJoin(tenants, eq(tenants.id, tenantMemberships.tenantId))
        .where(and(
            eq(tenantMemberships.userId, userId),
            eq(tenantMemberships.inviteStatus, 'accepted'),
            eq(tenantMemberships.isActive, true),
        ))
        .orderBy(desc(tenantMemberships.createdAt))

    // Legacy fallback: include the user's primary tenant from users.tenantId
    // for accounts created before the membership system was introduced.
    const [u] = await db
        .select({ tenantId: users.tenantId, role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

    if (u?.tenantId && !memberships.find(m => m.tenantId === u.tenantId)) {
        const [t] = await db
            .select({
                id: tenants.id,
                name: tenants.name,
                jurisdiction: tenants.jurisdiction,
                industryType: tenants.industryType,
                subscriptionPlan: tenants.subscriptionPlan,
                logoUrl: tenants.logoUrl,
            })
            .from(tenants)
            .where(eq(tenants.id, u.tenantId))
            .limit(1)

        if (t) {
            memberships.push({
                membershipId: 'legacy',
                role: u.role as MemberRole,
                isActive: true,
                status: 'accepted',
                tenantId: t.id,
                tenantName: t.name,
                jurisdiction: t.jurisdiction,
                industryType: t.industryType,
                subscriptionPlan: t.subscriptionPlan,
                logoUrl: t.logoUrl,
            })
        }
    }

    return memberships
}

export async function getCurrentTenant(userId: string, tenantId: string) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1)
    if (!tenant) throw http('Tenant not found', 404)
    const role = await loadActorRole(userId, tenantId)
    if (!role) throw http('No active membership in this tenant', 403)
    return {
        tenant,
        role,
        permissions: buildPermissionMap(role),
    }
}

/* ───────────────────────────── create tenant ─────────────────────────────── */

export async function createTenant(actorUserId: string, input: {
    name: string
    jurisdiction?: string
    industryType?: string
    subscriptionPlan?: string
}) {
    // Load creator user info so we can build their employee record
    const [actor] = await db.select().from(users).where(eq(users.id, actorUserId)).limit(1)
    if (!actor) throw http('User not found', 404)

    return db.transaction(async (tx) => {
        // 1. Create the tenant
        // tradeLicenseNo must be unique — use a placeholder that won't collide
        const placeholderLicense = `PENDING-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
        const [tenant] = await tx.insert(tenants).values({
            name: input.name,
            tradeLicenseNo: placeholderLicense,
            jurisdiction: (input.jurisdiction ?? 'mainland') as 'mainland' | 'freezone',
            industryType: input.industryType ?? 'Other',
            subscriptionPlan: (input.subscriptionPlan ?? 'starter') as any,
        }).returning()

        // 2. Bootstrap: actor becomes super_admin of the new tenant
        await tx.insert(tenantMemberships).values({
            tenantId: tenant.id,
            userId: actorUserId,
            role: 'super_admin',
            inviteStatus: 'accepted',
            acceptedAt: new Date(),
            isActive: true,
        })

        // 2b. Seed default grade levels so the tenant can assign grades on day 1.
        // Categories map to the `roles` array — Director, Manager, Employee.
        // Admins can edit / extend later.
        const insertedGradeLevels = await tx.insert(gradeLevels).values([
            {
                tenantId: tenant.id,
                name: 'C-Level',
                code: 'CL',
                level: 1,
                hierarchy: 'Leadership',
                roles: ['director'],
                description: 'Executive / C-Suite leadership.',
                sortOrder: 1,
            },
            {
                tenantId: tenant.id,
                name: 'Director',
                code: 'DR',
                level: 2,
                hierarchy: 'Leadership',
                roles: ['director'],
                description: 'Director-level leadership reporting into the C-Suite.',
                sortOrder: 2,
            },
            {
                tenantId: tenant.id,
                name: 'Manager',
                code: 'MG',
                level: 3,
                hierarchy: 'Management',
                roles: ['manager'],
                description: 'People managers leading teams or departments.',
                sortOrder: 3,
            },
            {
                tenantId: tenant.id,
                name: 'Employee',
                code: 'EM',
                level: 4,
                hierarchy: 'Individual Contributor',
                roles: ['employee'],
                description: 'Individual contributors and team members.',
                sortOrder: 4,
            },
        ]).returning()
        const cLevelId = insertedGradeLevels.find(g => g.code === 'CL')?.id ?? null

        // 3. Create a default entity for the tenant
        const [entity] = await tx.insert(entities).values({
            tenantId: tenant.id,
            entityName: input.name,
            licenseType: null,
            freeZoneId: null,
            isActive: true,
        }).returning()

        // 3b. Seed a default sponsoring entity named after the organization.
        const [sponsoringEntity] = await tx.insert(sponsoringEntities).values({
            tenantId: tenant.id,
            name: input.name,
            isActive: true,
            sortOrder: 1,
        }).returning()

        // 3c. Seed a default org structure: Branch → Divisions → Departments.
        // Admins can rename / extend this on day 1.
        const [mainBranch] = await tx.insert(orgUnits).values({
            tenantId: tenant.id,
            name: 'Main',
            type: 'branch',
            sortOrder: 1,
            isActive: true,
        }).returning()

        const divisionsSeed = [
            { name: 'Sales and Marketing', sortOrder: 1, departments: ['Sales', 'Marketing'] },
            { name: 'Technology',          sortOrder: 2, departments: ['Engineering', 'IT'] },
            { name: 'Admin',               sortOrder: 3, departments: ['HR', 'Accounts'] },
        ] as const

        const insertedDivisions = await tx.insert(orgUnits).values(
            divisionsSeed.map(d => ({
                tenantId: tenant.id,
                name: d.name,
                type: 'division' as const,
                parentId: mainBranch.id,
                sortOrder: d.sortOrder,
                isActive: true,
            })),
        ).returning()

        const deptRows = divisionsSeed.flatMap((d, i) =>
            d.departments.map((dept, j) => ({
                tenantId: tenant.id,
                name: dept,
                type: 'department' as const,
                parentId: insertedDivisions[i].id,
                sortOrder: j + 1,
                isActive: true,
            })),
        )
        const insertedDepts = deptRows.length ? await tx.insert(orgUnits).values(deptRows).returning() : []

        // Look up the Admin division and its HR department to assign the org creator
        const adminDivision = insertedDivisions.find(d => d.name === 'Admin')
        const hrDepartment = insertedDepts.find(d => d.name === 'HR' && d.parentId === adminDivision?.id)

        // 4. Generate employee number: ORG-001-MM-YYYY
        const now = new Date()
        const mm = String(now.getMonth() + 1).padStart(2, '0')
        const yyyy = String(now.getFullYear())
        const employeeNo = `ORG-001-${mm}-${yyyy}`

        // 5. Create the founder employee record fully populated so they show up
        // in Employees with proper org context (branch / division / department,
        // grade, designation, work email, contract type) on day one.
        const [employee] = await tx.insert(employees).values({
            tenantId: tenant.id,
            entityId: entity.id,
            employeeNo,
            firstName: actor.firstName,
            lastName: actor.lastName,
            email: actor.email,
            workEmail: actor.email,
            joinDate: now.toISOString().slice(0, 10),
            status: 'active',
            branchId: mainBranch.id,
            divisionId: adminDivision?.id ?? null,
            departmentId: hrDepartment?.id ?? null,
            department: hrDepartment?.name ?? null,
            gradeLevelId: cLevelId,
            sponsoringEntityId: sponsoringEntity?.id ?? null,
            designation: 'Founder',
            contractType: 'permanent',
        } as any).returning()

        // 5b. Make the founder the head of the seeded Admin/HR org units so the
        // hierarchy isn't blank on day one.
        if (mainBranch?.id) {
            await tx.update(orgUnits).set({ headEmployeeId: employee.id }).where(eq(orgUnits.id, mainBranch.id))
        }
        if (adminDivision?.id) {
            await tx.update(orgUnits).set({ headEmployeeId: employee.id }).where(eq(orgUnits.id, adminDivision.id))
        }
        if (hrDepartment?.id) {
            await tx.update(orgUnits).set({ headEmployeeId: employee.id }).where(eq(orgUnits.id, hrDepartment.id))
        }

        // 5c. Seed default onboarding template steps + recruitment stages.
        // Admins can edit/reorder/recolour these from Organization Settings.
        await tx.insert(onboardingTemplateSteps).values(buildDefaultOnboardingTemplateRows(tenant.id))
        await tx.insert(recruitmentStages).values(buildDefaultRecruitmentStageRows(tenant.id))

        // 6. Link the user row to this employee. We always update for the active
        // tenant so the Employees list, my-account, and the JWT all resolve to
        // the right per-tenant employee. Users with a prior tenant keep working
        // because tenant-switch resolves the per-tenant employee by email anyway.
        await tx.update(users)
            .set({ employeeId: employee.id })
            .where(eq(users.id, actorUserId))

        return tenant
    })
}

/* ───────────────────────────── tenant switch ─────────────────────────────── */

/**
 * Validates the actor has an accepted membership in `targetTenantId` and returns
 * the user row needed to mint new tokens. The route layer calls `issueTokens`.
 */
export async function prepareTenantSwitch(actorUserId: string, targetTenantId: string) {
    const role = await loadActorRole(actorUserId, targetTenantId)
    if (!role) throw http('You do not belong to this tenant', 403)

    const [u] = await db.select().from(users).where(eq(users.id, actorUserId)).limit(1)
    if (!u) throw http('User not found', 404)

    // Resolve the employee record for this user in the TARGET tenant by email.
    // This enables per-tenant employee profiles (different dept, salary, etc.).
    let [emp] = await db
        .select({ id: employees.id, department: employees.department })
        .from(employees)
        .where(and(
            eq(employees.tenantId, targetTenantId),
            eq(employees.email, u.email),
        ))
        .limit(1)

    // If no employee record exists in the target tenant, auto-provision one.
    // The authenticate plugin requires a non-null employeeId in every JWT.
    if (!emp) {
        const newEmp = await db.transaction(async (tx) => {
            // Find or create the default entity for this tenant
            let [entity] = await tx
                .select({ id: entities.id })
                .from(entities)
                .where(eq(entities.tenantId, targetTenantId))
                .limit(1)

            if (!entity) {
                const [t] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, targetTenantId)).limit(1)
                const [newEntity] = await tx.insert(entities).values({
                    tenantId: targetTenantId,
                    entityName: t?.name ?? 'Default',
                    isActive: true,
                }).returning()
                entity = newEntity
            }

            // Use a UUID suffix to guarantee uniqueness regardless of concurrent switches
            const now = new Date()
            const mm = String(now.getMonth() + 1).padStart(2, '0')
            const yyyy = String(now.getFullYear())
            const suffix = crypto.randomUUID().slice(0, 6).toUpperCase()
            const employeeNo = `EMP-${suffix}-${mm}-${yyyy}`

            const [inserted] = await tx.insert(employees).values({
                tenantId: targetTenantId,
                entityId: entity.id,
                employeeNo,
                firstName: u.firstName,
                lastName: u.lastName,
                email: u.email,
                joinDate: now.toISOString().slice(0, 10),
                status: 'active',
            } as any).returning()

            return inserted
        })

        emp = { id: newEmp.id, department: null }
    }

    return {
        user: {
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            name: u.name,
            email: u.email,
            role,
            // Per-tenant role — `users.roles` is the (user-level) initial
            // signup default and would lie about this tenant's permissions.
            roles: [role],
            tenantId: targetTenantId,
            entityId: u.entityId,
            employeeId: emp.id,
            department: emp.department ?? u.department,
            avatarUrl: u.avatarUrl,
        },
    }
}

/* ───────────────────────────── team members ──────────────────────────────── */

export async function listMembers(tenantId: string) {
    const rows = await db
        .select({
            id: tenantMemberships.id,
            userId: tenantMemberships.userId,
            role: tenantMemberships.role,
            isActive: tenantMemberships.isActive,
            status: tenantMemberships.inviteStatus,
            invitedEmail: tenantMemberships.invitedEmail,
            invitedAt: tenantMemberships.invitedAt,
            acceptedAt: tenantMemberships.acceptedAt,
            expiresAt: tenantMemberships.expiresAt,
            createdAt: tenantMemberships.createdAt,
            userName: users.name,
            userEmail: users.email,
            userAvatar: users.avatarUrl,
        })
        .from(tenantMemberships)
        .leftJoin(users, eq(users.id, tenantMemberships.userId))
        .where(eq(tenantMemberships.tenantId, tenantId))
        .orderBy(desc(tenantMemberships.createdAt))
    return rows
}

export async function inviteMember(opts: {
    tenantId: string
    actorUserId: string
    actorRole: MemberRole
    email: string
    role: MemberRole
}) {
    if (!hasPermission(opts.actorRole, 'invite_member')) {
        throw http('You do not have permission to invite members', 403)
    }
    if (opts.role === 'super_admin' && opts.actorRole !== 'super_admin') {
        throw http('Only super admins can invite super admins', 403)
    }

    // If the email belongs to an existing user, attach them directly. Otherwise
    // create a pending membership keyed by email + invite token.
    const [existingUser] = await db.select().from(users).where(eq(users.email, opts.email.toLowerCase())).limit(1)

    // Reject duplicate membership (by userId if user exists).
    if (existingUser) {
        const [dup] = await db.select({ id: tenantMemberships.id })
            .from(tenantMemberships)
            .where(and(
                eq(tenantMemberships.tenantId, opts.tenantId),
                eq(tenantMemberships.userId, existingUser.id),
            ))
            .limit(1)
        if (dup) throw http('This person is already a member of your team', 409)
    }

    // Reject duplicate pending invite by email (covers unregistered users and edge cases
    // where userId is null on the existing pending row).
    const [pendingDup] = await db.select({ id: tenantMemberships.id })
        .from(tenantMemberships)
        .where(and(
            eq(tenantMemberships.tenantId, opts.tenantId),
            eq(tenantMemberships.invitedEmail, opts.email.toLowerCase()),
            eq(tenantMemberships.inviteStatus, 'pending'),
        ))
        .limit(1)
    if (pendingDup) throw http('An invitation is already pending for this email address', 409)

    const { raw, hash } = generateInviteToken()
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

    const [row] = await db.insert(tenantMemberships).values({
        tenantId: opts.tenantId,
        userId: existingUser?.id ?? null,
        role: opts.role,
        inviteStatus: 'pending',
        invitedEmail: opts.email.toLowerCase(),
        invitedBy: opts.actorUserId,
        inviteTokenHash: hash,
        invitedAt: new Date(),
        expiresAt,
        isActive: true,
    }).returning()

    const acceptUrl = `${process.env.APP_URL ?? 'http://localhost:5173'}/invite/accept?token=${raw}`
    log.info({ tenantId: opts.tenantId, email: opts.email, role: opts.role, acceptUrl }, 'invite created')

    // Fetch tenant name for the email subject
    const [tenant] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, opts.tenantId)).limit(1)
    const workspaceName = tenant?.name ?? 'HRHub'
    const emailPayload = inviteUserEmail({
        inviteeName: opts.email.split('@')[0],
        workspaceName,
        role: opts.role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        inviteUrl: acceptUrl,
    })
    emailPayload.to = opts.email
    sendEmail(emailPayload).catch((err) => log.error({ err }, 'invite email send failed'))

    return {
        membership: row,
        inviteToken: raw,
        acceptUrl,
        expiresAt,
    }
}

export async function acceptInvite(actorUserId: string, rawToken: string) {
    const hash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const [m] = await db.select().from(tenantMemberships).where(eq(tenantMemberships.inviteTokenHash, hash)).limit(1)
    if (!m) throw http('Invalid invite token', 404)
    if (m.inviteStatus !== 'pending') throw http('Invite already used or revoked', 410)
    if (m.expiresAt && m.expiresAt.getTime() < Date.now()) throw http('Invite expired', 410)

    await db.update(tenantMemberships)
        .set({
            userId: actorUserId,
            inviteStatus: 'accepted',
            acceptedAt: new Date(),
            inviteTokenHash: null,
            updatedAt: new Date(),
        })
        .where(eq(tenantMemberships.id, m.id))

    return { tenantId: m.tenantId, role: m.role }
}

export async function changeMemberRole(opts: {
    tenantId: string
    actorUserId: string
    actorRole: MemberRole
    membershipId: string
    newRole: MemberRole
}) {
    if (!hasPermission(opts.actorRole, 'change_role')) {
        throw http('You do not have permission to change roles', 403)
    }
    const [m] = await db.select().from(tenantMemberships)
        .where(and(eq(tenantMemberships.id, opts.membershipId), eq(tenantMemberships.tenantId, opts.tenantId)))
        .limit(1)
    if (!m) throw http('Membership not found', 404)

    if (m.role === 'super_admin') {
        // Prevent demoting the last super_admin.
        const others = await db.select({ id: tenantMemberships.id })
            .from(tenantMemberships)
            .where(and(
                eq(tenantMemberships.tenantId, opts.tenantId),
                eq(tenantMemberships.role, 'super_admin'),
                eq(tenantMemberships.isActive, true),
                eq(tenantMemberships.inviteStatus, 'accepted'),
            ))
        if (others.length <= 1 && opts.newRole !== 'super_admin') {
            throw http('Cannot demote the last super admin', 409)
        }
    }
    if (opts.newRole === 'super_admin' && opts.actorRole !== 'super_admin') {
        throw http('Only super admins can grant super_admin', 403)
    }
    if (m.userId && m.userId === opts.actorUserId && m.role === 'super_admin' && opts.newRole !== 'super_admin') {
        throw http('You cannot demote yourself', 409)
    }

    const [updated] = await db.update(tenantMemberships)
        .set({ role: opts.newRole, updatedAt: new Date() })
        .where(and(eq(tenantMemberships.id, opts.membershipId), eq(tenantMemberships.tenantId, opts.tenantId)))
        .returning()

    // Keep users.role / users.roles in sync for the member's primary tenant —
    // otherwise the next JWT (issued from the users row) would carry the stale
    // role and the frontend route guard would deny the new permissions.
    if (m.userId) {
        await db.update(users)
            .set({ role: opts.newRole, roles: [opts.newRole], updatedAt: new Date() })
            .where(and(eq(users.id, m.userId), eq(users.tenantId, opts.tenantId)))
    }

    return updated
}

export async function removeMember(opts: {
    tenantId: string
    actorUserId: string
    actorRole: MemberRole
    membershipId: string
}) {
    if (!hasPermission(opts.actorRole, 'remove_member')) {
        throw http('You do not have permission to remove members', 403)
    }
    const [m] = await db.select().from(tenantMemberships)
        .where(and(eq(tenantMemberships.id, opts.membershipId), eq(tenantMemberships.tenantId, opts.tenantId)))
        .limit(1)
    if (!m) throw http('Membership not found', 404)
    if (m.userId === opts.actorUserId) throw http('You cannot remove yourself', 409)

    if (m.role === 'super_admin') {
        const others = await db.select({ id: tenantMemberships.id })
            .from(tenantMemberships)
            .where(and(
                eq(tenantMemberships.tenantId, opts.tenantId),
                eq(tenantMemberships.role, 'super_admin'),
                eq(tenantMemberships.isActive, true),
                eq(tenantMemberships.inviteStatus, 'accepted'),
            ))
        if (others.length <= 1) throw http('Cannot remove the last super admin', 409)
    }

    await db.update(tenantMemberships)
        .set({ isActive: false, inviteStatus: 'revoked', updatedAt: new Date() })
        .where(and(eq(tenantMemberships.id, opts.membershipId), eq(tenantMemberships.tenantId, opts.tenantId)))
    return { ok: true }
}

/* ───────────────────────── delete tenant ───────────────────────────────── */

/**
 * Permanently delete a tenant and all its data. Requires super_admin role on
 * the target tenant. Foreign keys on every dependent table use ON DELETE
 * CASCADE so the row delete cleans up employees, payroll, leave, audit, etc.
 *
 * Safety: caller must pass `confirmName` matching the tenant's name (case-
 * insensitive, trimmed) so an accidental delete is unlikely.
 */
export async function deleteTenant(opts: {
    tenantId: string
    actorUserId: string
    confirmName: string
}) {
    const role = await loadActorRole(opts.actorUserId, opts.tenantId)
    if (role !== 'super_admin') {
        throw http('Only a super admin can delete this organization', 403)
    }

    const [tenant] = await db.select({ id: tenants.id, name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, opts.tenantId))
        .limit(1)
    if (!tenant) throw http('Tenant not found', 404)

    const expected = tenant.name.trim().toLowerCase()
    const provided = (opts.confirmName ?? '').trim().toLowerCase()
    if (!provided || provided !== expected) {
        throw http('Confirmation does not match the organization name', 400)
    }

    await db.delete(tenants).where(eq(tenants.id, opts.tenantId))
    return { ok: true, name: tenant.name }
}

// silence unused-import warnings if any
void isNull; void sql
