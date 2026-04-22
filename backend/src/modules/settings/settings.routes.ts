import { getCompanySettings, updateCompanySettings, listTenantUsers } from './settings.service.js'

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
}
