import { issueTokens } from '../auth/auth.service.js'
import {
    listMyTenants,
    getCurrentTenant,
    createTenant,
    prepareTenantSwitch,
    listMembers,
    inviteMember,
    acceptInvite,
    changeMemberRole,
    removeMember,
    deleteTenant,
} from './tenants.service.js'
import type { MemberRole } from '../../lib/permissions.js'
import { recordActivity } from '../audit/audit.service.js'

/**
 * Audit helper — every mutating route in this module funnels through this so
 * tenant lifecycle + membership changes (security-relevant) always land in
 * `activity_logs`. Fire-and-forget; never awaited. Read-only GETs are NOT
 * audited. Platform/org-scoped — no employee mirror entry.
 *
 * `tenantId` is taken from the active JWT by default but can be overridden for
 * cross-tenant actions (e.g. creating a brand-new tenant, or accepting an
 * invite to a different tenant) so the entry is attributed to the right org.
 */
function audit(request: any, params: {
    entityId: string
    entityName?: string
    action: 'create' | 'update' | 'delete' | 'view' | 'invite'
    tenantId?: string
    changes?: Record<string, { from: unknown; to: unknown }>
    metadata?: Record<string, unknown>
}) {
    recordActivity({
        tenantId: params.tenantId ?? request.user.tenantId,
        userId: request.user.id,
        actorName: request.user.name,
        actorRole: request.user.role,
        entityType: 'tenant',
        entityId: params.entityId,
        entityName: params.entityName,
        action: params.action,
        changes: params.changes,
        metadata: params.metadata,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
    }).catch(() => { })
}

export default async function tenantsRoutes(fastify: any): Promise<void> {
    /* ────────────────────── tenant memberships (per user) ────────────────────── */

    // List tenants the current user belongs to.
    fastify.get('/', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Tenants'] },
    }, async (request: any, reply: any) => {
        const data = await listMyTenants(request.user.id)
        return reply.send({ data })
    })

    // Current tenant + permission map for the active JWT.
    fastify.get('/current', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Tenants'] },
    }, async (request: any, reply: any) => {
        const data = await getCurrentTenant(request.user.id, request.user.tenantId)
        return reply.send({ data })
    })

    // Create a new tenant. Caller becomes super_admin of the new tenant.
    fastify.post('/', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Tenants'] },
    }, async (request: any, reply: any) => {
        const body = request.body as {
            name: string
            businessType?: string
            /** @deprecated legacy alias for businessType */
            jurisdiction?: string
            industryType?: string
            subscriptionPlan?: string
        }
        if (!body?.name || body.name.trim().length < 2) {
            return reply.code(400).send({ statusCode: 400, error: 'BadRequest', message: 'name is required' })
        }
        // Accept either field name from older clients; canonical is businessType.
        const tenant = await createTenant(request.user.id, {
            ...body,
            businessType: body.businessType ?? body.jurisdiction,
        })
        audit(request, {
            tenantId: tenant.id,
            entityId: tenant.id,
            entityName: tenant.name,
            action: 'create',
            metadata: { businessType: tenant.businessType, subscriptionPlan: tenant.subscriptionPlan },
        })
        return reply.code(201).send({ data: tenant })
    })

    // Switch active tenant: validates membership, mints a fresh JWT pair.
    fastify.post('/switch', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Tenants'] },
    }, async (request: any, reply: any) => {
        const body = request.body as { tenantId: string }
        if (!body?.tenantId) {
            return reply.code(400).send({ statusCode: 400, error: 'BadRequest', message: 'tenantId is required' })
        }
        const { user } = await prepareTenantSwitch(request.user.id, body.tenantId)
        const tokens = await issueTokens(fastify, user, {
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        })
        // Session-level action — logged as a low-noise 'view' against the
        // target tenant the user is now operating in.
        audit(request, {
            tenantId: body.tenantId,
            entityId: body.tenantId,
            action: 'view',
            metadata: { kind: 'tenant_switch', fromTenantId: request.user.tenantId },
        })
        return reply.send(tokens)
    })

    /* ─────────────────────────── invitation accept ────────────────────────────── */

    // Authenticated user accepts an invite token. Tenant is added to their list.
    fastify.post('/invites/accept', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Tenants'] },
    }, async (request: any, reply: any) => {
        const body = request.body as { token: string }
        if (!body?.token) {
            return reply.code(400).send({ statusCode: 400, error: 'BadRequest', message: 'token is required' })
        }
        const data = await acceptInvite(request.user.id, body.token)
        // Member joined the tenant by accepting their invite. Attributed to the
        // joined tenant, with the accepting user as the target entity.
        audit(request, {
            tenantId: data.tenantId,
            entityId: request.user.id,
            entityName: request.user.name,
            action: 'update',
            metadata: { kind: 'invite_accepted', role: data.role },
        })
        return reply.send({ data })
    })

    /* ─────────────────────────────── members ──────────────────────────────────── */

    fastify.get('/members', {
        preHandler: [fastify.authenticate],
        schema: { tags: ['Tenants'] },
    }, async (request: any, reply: any) => {
        const data = await listMembers(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.post('/members', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Tenants'] },
    }, async (request: any, reply: any) => {
        const body = request.body as { email: string; role: MemberRole }
        if (!body?.email || !body?.role) {
            return reply.code(400).send({ statusCode: 400, error: 'BadRequest', message: 'email and role are required' })
        }
        const result = await inviteMember({
            tenantId: request.user.tenantId,
            actorUserId: request.user.id,
            actorRole: request.user.role,
            email: body.email,
            role: body.role,
        })
        // Target = the invited member (membership row id + invited email).
        // Never log the invite token/url.
        audit(request, {
            entityId: result.membership.userId ?? result.membership.id,
            entityName: result.membership.invitedEmail ?? body.email,
            action: 'invite',
            metadata: { role: result.membership.role, membershipId: result.membership.id },
        })
        return reply.code(201).send({ data: result })
    })

    fastify.patch('/members/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Tenants'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const body = request.body as { role: MemberRole }
        if (!body?.role) {
            return reply.code(400).send({ statusCode: 400, error: 'BadRequest', message: 'role is required' })
        }
        // Capture the prior role from the current member list so the audit
        // entry carries a real from→to diff (the service only returns the
        // post-update row).
        const before = (await listMembers(request.user.tenantId)).find(m => m.id === id)
        const data = await changeMemberRole({
            tenantId: request.user.tenantId,
            actorUserId: request.user.id,
            actorRole: request.user.role,
            membershipId: id,
            newRole: body.role,
        })
        audit(request, {
            entityId: data.userId ?? data.id,
            entityName: before?.userName ?? before?.invitedEmail ?? undefined,
            action: 'update',
            changes: { role: { from: before?.role ?? null, to: data.role } },
            metadata: { membershipId: data.id },
        })
        return reply.send({ data })
    })

    fastify.delete('/members/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Tenants'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        // Resolve the target member's identity before the row is revoked so the
        // audit entry can name who was removed.
        const target = (await listMembers(request.user.tenantId)).find(m => m.id === id)
        await removeMember({
            tenantId: request.user.tenantId,
            actorUserId: request.user.id,
            actorRole: request.user.role,
            membershipId: id,
        })
        audit(request, {
            entityId: target?.userId ?? id,
            entityName: target?.userName ?? target?.invitedEmail ?? undefined,
            action: 'delete',
            metadata: { kind: 'member_removed', membershipId: id, role: target?.role },
        })
        return reply.code(204).send()
    })

    /* ───── delete current tenant (super_admin only) ───── */
    fastify.delete('/current', {
        preHandler: [fastify.authenticate, fastify.requireRole('super_admin')],
        schema: { tags: ['Tenants'] },
    }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as { confirmName?: string }
        const result = await deleteTenant({
            tenantId: request.user.tenantId,
            actorUserId: request.user.id,
            confirmName: body.confirmName ?? '',
        })
        // NOTE: `activity_logs.tenant_id` is `NOT NULL … ON DELETE CASCADE`, so a
        // 'tenant' entry attributed to this tenant cannot survive its own deletion
        // (the FK insert races the cascade and any surviving row is removed). We
        // still emit it fire-and-forget for completeness/local-dev visibility; a
        // durable record of org deletion belongs in a platform-level log that is
        // out of scope for this module.
        audit(request, {
            entityId: request.user.tenantId,
            entityName: result.name,
            action: 'delete',
            metadata: { kind: 'tenant_deleted' },
        })
        return reply.send({ data: result })
    })
}
