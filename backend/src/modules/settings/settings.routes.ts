import { getCompanySettings, updateCompanySettings, listTenantUsers, inviteUser } from './settings.service.js'
import { db } from '../../db/index.js'
import { tenants } from '../../db/schema/index.js'
import { eq } from 'drizzle-orm'

export default async function settingsRoutes(fastify: any): Promise<void> {
    const hrAdmin = {
        preHandler: [
            fastify.authenticate,
            fastify.requireRole('hr_manager', 'super_admin'),
        ],
    }

    // GET /settings/company — returns current tenant profile
    fastify.get('/company', { preHandler: [fastify.authenticate] }, async (request: any, reply: any) => {
        const data = await getCompanySettings(request.user.tenantId)
        if (!data) return reply.code(404).send({ message: 'Tenant not found' })
        return reply.send({ data })
    })

    // PATCH /settings/company — update tenant profile (hr_manager / super_admin only)
    fastify.patch('/company', hrAdmin, async (request: any, reply: any) => {
        const { name, tradeLicenseNo, jurisdiction, industryType, logoUrl } = request.body as Record<string, string>
        const updated = await updateCompanySettings(request.user.tenantId, {
            name,
            tradeLicenseNo,
            jurisdiction: jurisdiction as 'mainland' | 'freezone',
            industryType,
            logoUrl,
        })
        return reply.send({ data: updated })
    })

    // GET /settings/users — list admin/staff users in tenant
    fastify.get('/users', hrAdmin, async (request: any, reply: any) => {
        const data = await listTenantUsers(request.user.tenantId)
        return reply.send({ data })
    })

    // POST /settings/users/invite — invite a new user by email
    fastify.post('/users/invite', hrAdmin, async (request: any, reply: any) => {
        const { name, email, role } = request.body as { name: string; email: string; role: string }
        if (!name || !email || !role) {
            return reply.code(400).send({ message: 'name, email and role are required' })
        }
        await inviteUser(request.user.tenantId, { name, email, role })
        return reply.send({ message: 'Invitation sent' })
    })

    // ── IP Allowlist routes ──────────────────────────────────────────────
    // GET /settings/ip-allowlist
    fastify.get('/ip-allowlist', hrAdmin, async (request: any, reply: any) => {
        const [tenant] = await db
            .select({ ipAllowlist: tenants.ipAllowlist })
            .from(tenants)
            .where(eq(tenants.id, request.user.tenantId))
            .limit(1)
        return reply.send({ data: { ipAllowlist: tenant?.ipAllowlist ?? [] } })
    })

    // PUT /settings/ip-allowlist
    fastify.put('/ip-allowlist', hrAdmin, async (request: any, reply: any) => {
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
}
