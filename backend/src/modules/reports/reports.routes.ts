import {
    getHeadcountReport,
    getPayrollSummaryReport,
    getVisaExpiryReport,
    getPROCostReport,
    getAttendanceSummaryReport,
    getLeaveSummaryReport,
    getTurnoverReport,
    getOnboardingReport,
    getPerformanceReport,
    getDocumentExpiryReport,
} from './reports.service.js'

export default async function (fastify: any): Promise<void> {
    const reportsAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'pro_officer', 'dept_head', 'super_admin')] }

    // GET /api/v1/reports/headcount
    fastify.get('/headcount', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const data = await getHeadcountReport(tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/reports/payroll-summary
    fastify.get('/payroll-summary', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const data = await getPayrollSummaryReport(tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/reports/visa-expiry
    fastify.get('/visa-expiry', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
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

    // GET /api/v1/reports/attendance-summary?days=90
    fastify.get('/attendance-summary', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const days = Number((request.query as any).days ?? 90)
        const data = await getAttendanceSummaryReport(tenantId, days)
        return reply.send({ data })
    })

    // GET /api/v1/reports/leave-summary?year=2026
    fastify.get('/leave-summary', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const yearRaw = (request.query as any).year
        const year = yearRaw !== undefined ? Number(yearRaw) : undefined
        const data = await getLeaveSummaryReport(tenantId, year)
        return reply.send({ data })
    })

    // GET /api/v1/reports/turnover?months=12
    fastify.get('/turnover', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const months = Number((request.query as any).months ?? 12)
        const data = await getTurnoverReport(tenantId, months)
        return reply.send({ data })
    })

    // GET /api/v1/reports/onboarding
    fastify.get('/onboarding', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const data = await getOnboardingReport(request.user.tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/reports/performance
    fastify.get('/performance', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const data = await getPerformanceReport(request.user.tenantId)
        return reply.send({ data })
    })

    // GET /api/v1/reports/document-expiry?days=90
    // Unified expiry view across visa, passport, EID, labour card, contract.
    // Supersedes /reports/visa-expiry on the FE; the latter stays for legacy.
    fastify.get('/document-expiry', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const days = Number((request.query as any).days ?? 90)
        const data = await getDocumentExpiryReport(tenantId, days)
        return reply.send({ data })
    })

    // BFF aggregator — single round trip for the full reports page. Includes
    // every sub-report the ReportsPage needs, so the page never makes more
    // than one request on first load. All sub-reports run in parallel.
    fastify.get('/summary', {
        schema: { tags: ['Reports'] },
        preHandler: [fastify.authenticate, (fastify as any).requireRole('hr_manager', 'pro_officer', 'super_admin')],
    }, async (request: any, reply: any) => {
        const tenantId: string = request.user.tenantId
        const days = Number((request.query as any).days ?? 90)
        const year = new Date().getFullYear()
        const [
            headcount, payrollSummary, visaExpiry, proCosts,
            attendanceSummary, leaveSummary,
            turnover, onboarding, performance,
            documentExpiry,
        ] = await Promise.all([
            getHeadcountReport(tenantId),
            getPayrollSummaryReport(tenantId),
            getVisaExpiryReport(tenantId, days),
            getPROCostReport(tenantId),
            getAttendanceSummaryReport(tenantId, days),
            getLeaveSummaryReport(tenantId, year),
            getTurnoverReport(tenantId, 12),
            getOnboardingReport(tenantId),
            getPerformanceReport(tenantId),
            getDocumentExpiryReport(tenantId, days),
        ])
        return reply.send({
            headcount, payrollSummary, visaExpiry, proCosts,
            attendanceSummary, leaveSummary,
            turnover, onboarding, performance,
            documentExpiry,
        })
    })
}
