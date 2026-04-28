import { getHeadcountReport, getPayrollSummaryReport, getVisaExpiryReport, getPROCostReport } from './reports.service.js'

export default async function (fastify: any): Promise<void> {
    // GET /api/v1/reports/headcount
    fastify.get('/headcount', {
        schema: { tags: ['Reports'] },
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const data = await getHeadcountReport(tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/reports/payroll-summary
    fastify.get('/payroll-summary', {
        schema: { tags: ['Reports'] },
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const data = await getPayrollSummaryReport(tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/reports/visa-expiry
    fastify.get('/visa-expiry', {
        schema: { tags: ['Reports'] },
        preHandler: [fastify.authenticate],
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const days = Number((request.query as any).days ?? 90)
        const data = await getVisaExpiryReport(tenantId, days)
        return reply.send({ data })
    })

    // GET /api/v1/reports/pro-costs
    fastify.get('/pro-costs', {
        schema: { tags: ['Reports'] },
        preHandler: [fastify.authenticate, (fastify as any).requireRole('hr_manager', 'pro_officer', 'super_admin')],
    }, async (request: any, reply: any) => {
        const data = await getPROCostReport(request.user.tenantId)
        return reply.send({ data })
    })

    // BFF aggregator — single round trip for the full reports page.
    // Uses the same hr_manager+ role guard as pro-costs (the most restrictive of the four).
    fastify.get('/summary', {
        schema: { tags: ['Reports'] },
        preHandler: [fastify.authenticate, (fastify as any).requireRole('hr_manager', 'pro_officer', 'super_admin')],
    }, async (request: any, reply: any) => {
        const tenantId: string = request.user.tenantId
        const days = Number((request.query as any).days ?? 90)
        const [headcount, payrollSummary, visaExpiry, proCosts] = await Promise.all([
            getHeadcountReport(tenantId),
            getPayrollSummaryReport(tenantId),
            getVisaExpiryReport(tenantId, days),
            getPROCostReport(tenantId),
        ])
        return reply.send({ headcount, payrollSummary, visaExpiry, proCosts })
    })
}
