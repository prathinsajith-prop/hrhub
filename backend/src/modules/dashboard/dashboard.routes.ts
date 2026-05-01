import { getDashboardKPIs, getRecentNotifications, getPayrollTrend, getNationalityBreakdown, getDeptHeadcount, getEmiratisationStatus, getOnboardingSummary, getGenderBreakdown, getMaritalStatusBreakdown, getUpcomingBirthdays, getWorkAnniversaries } from './dashboard.service.js'

export default async function (fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    fastify.get('/kpis', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getDashboardKPIs(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/notifications', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const { limit = '10' } = request.query as { limit?: string }
        const data = await getRecentNotifications(request.user.tenantId, request.user.id, Number(limit))
        return reply.send({ data })
    })

    fastify.get('/payroll-trend', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getPayrollTrend(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/nationality-breakdown', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getNationalityBreakdown(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/dept-headcount', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getDeptHeadcount(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/emiratisation', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getEmiratisationStatus(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/onboarding-summary', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getOnboardingSummary(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/gender-breakdown', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getGenderBreakdown(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/marital-breakdown', { ...auth, schema: { tags: ['Dashboard'] } }, async (request, reply) => {
        const data = await getMaritalStatusBreakdown(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.get('/birthdays', { ...auth, schema: { tags: ['Dashboard'] } }, async (request: any, reply: any) => {
        const { month } = request.query as { month?: string }
        const data = await getUpcomingBirthdays(request.user.tenantId, month ? Number(month) : undefined)
        return reply.send({ data })
    })

    fastify.get('/anniversaries', { ...auth, schema: { tags: ['Dashboard'] } }, async (request: any, reply: any) => {
        const { month } = request.query as { month?: string }
        const data = await getWorkAnniversaries(request.user.tenantId, month ? Number(month) : undefined)
        return reply.send({ data })
    })

    // BFF aggregator — single round trip for the full dashboard view.
    // Notifications are intentionally excluded: they are shared with the header
    // and have a separate cache lifecycle.
    fastify.get('/summary', { ...auth, schema: { tags: ['Dashboard'] } }, async (request: any, reply: any) => {
        const tenantId: string = request.user.tenantId
        const [kpis, payrollTrend, nationalityBreakdown, deptHeadcount, emiratisation, onboardingSummary, genderBreakdown, maritalBreakdown, birthdays, anniversaries] =
            await Promise.all([
                getDashboardKPIs(tenantId),
                getPayrollTrend(tenantId),
                getNationalityBreakdown(tenantId),
                getDeptHeadcount(tenantId),
                getEmiratisationStatus(tenantId),
                getOnboardingSummary(tenantId),
                getGenderBreakdown(tenantId),
                getMaritalStatusBreakdown(tenantId),
                getUpcomingBirthdays(tenantId),
                getWorkAnniversaries(tenantId),
            ])
        return reply.send({ kpis, payrollTrend, nationalityBreakdown, deptHeadcount, emiratisation, onboardingSummary, genderBreakdown, maritalBreakdown, birthdays, anniversaries })
    })
}

