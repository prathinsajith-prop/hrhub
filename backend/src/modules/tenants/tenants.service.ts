import crypto from 'node:crypto'
import { eq, and, desc, isNull, sql } from 'drizzle-orm'
import { log } from '../../lib/logger.js'
import { db } from '../../db/index.js'
import { tenants, users, tenantMemberships } from '../../db/schema/index.js'
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
    // Memberships
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
    const [tenant] = await db.insert(tenants).values({
        name: input.name,
        tradeLicenseNo: '',
        jurisdiction: (input.jurisdiction ?? 'mainland') as 'mainland' | 'freezone',
        industryType: input.industryType ?? 'Other',
        subscriptionPlan: (input.subscriptionPlan ?? 'free') as any,
    }).returning()

    // Bootstrap: actor becomes super_admin of the new tenant.
    await db.insert(tenantMemberships).values({
        tenantId: tenant.id,
        userId: actorUserId,
        role: 'super_admin',
        inviteStatus: 'accepted',
        acceptedAt: new Date(),
        isActive: true,
    })

    return tenant
}

/* ───────────────────────────── tenant switch ─────────────────────────────── */

/**
 * Validates the actor has an accepted membership in `targetTenantId` and returns
 * the user row needed to mint new tokens. The route layer calls `issueTokens`.
 */
export async function prepareTenantSwitch(actorUserId: string, targetTenantId: string) {
    const role = await loadActorRole(actorUserId, targetTenantId)
    if (!role) throw http('You do not belong to this tenant', 403)

    // We need a user row that lives under the target tenant (since users.tenantId
    // is the JWT tenantId). For multi-tenant users this is the row that already
    // exists (single user record), but the JWT tenantId we set will be the
    // target tenant from the membership.
    const [u] = await db.select().from(users).where(eq(users.id, actorUserId)).limit(1)
    if (!u) throw http('User not found', 404)

    return {
        user: {
            id: u.id,
            firstName: u.firstName,
            lastName: u.lastName,
            name: u.name,
            email: u.email,
            role,
            tenantId: targetTenantId, // <- JWT will carry the target tenant
            entityId: u.entityId,
            employeeId: u.employeeId ?? null,
            department: u.department,
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
        .where(eq(tenantMemberships.id, opts.membershipId))
        .returning()
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
        .where(eq(tenantMemberships.id, opts.membershipId))
    return { ok: true }
}

// silence unused-import warnings if any
void isNull; void sql
