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
} from './tenants.service.js'
import type { MemberRole } from '../../lib/permissions.js'

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
            jurisdiction?: string
            industryType?: string
            subscriptionPlan?: string
        }
        if (!body?.name || body.name.trim().length < 2) {
            return reply.code(400).send({ statusCode: 400, error: 'BadRequest', message: 'name is required' })
        }
        const tenant = await createTenant(request.user.id, body)
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
        const data = await changeMemberRole({
            tenantId: request.user.tenantId,
            actorUserId: request.user.id,
            actorRole: request.user.role,
            membershipId: id,
            newRole: body.role,
        })
        return reply.send({ data })
    })

    fastify.delete('/members/:id', {
        preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')],
        schema: { tags: ['Tenants'] },
    }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await removeMember({
            tenantId: request.user.tenantId,
            actorUserId: request.user.id,
            actorRole: request.user.role,
            membershipId: id,
        })
        return reply.code(204).send()
    })
}
