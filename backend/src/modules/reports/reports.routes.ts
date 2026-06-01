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

// Coerce a query-string number to a safe, bounded integer. A missing or
// non-numeric value (`?days=abc`, `?days=`) falls back to `def`; anything
// outside [min, max] is clamped. This keeps a malformed `days` / `months`
// / `year` param from ever reaching the date math in the service layer,
// where `new Date(NaN).toISOString()` would throw a RangeError and 500
// the endpoint.
function boundedInt(raw: unknown, def: number, min: number, max: number): number {
    const n = Number(raw)
    if (!Number.isFinite(n)) return def
    return Math.min(max, Math.max(min, Math.trunc(n)))
}

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
        const days = boundedInt((request.query as any).days, 90, 1, 3650)
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
        const days = boundedInt((request.query as any).days, 90, 1, 3650)
        const data = await getAttendanceSummaryReport(tenantId, days)
        return reply.send({ data })
    })

    // GET /api/v1/reports/leave-summary?year=2026
    fastify.get('/leave-summary', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        // Year defaults to the current year inside the service when undefined;
        // clamp any provided value to a sane window so a bad `?year=99999`
        // can't build an invalid date string.
        const yearRaw = (request.query as any).year
        const year = yearRaw !== undefined ? boundedInt(yearRaw, new Date().getFullYear(), 2000, 2100) : undefined
        const data = await getLeaveSummaryReport(tenantId, year)
        return reply.send({ data })
    })

    // GET /api/v1/reports/turnover?months=12
    fastify.get('/turnover', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const months = boundedInt((request.query as any).months, 12, 1, 120)
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
        const days = boundedInt((request.query as any).days, 90, 1, 3650)
        const data = await getDocumentExpiryReport(tenantId, days)
        return reply.send({ data })
    })

    // BFF aggregator — single round trip for the full reports page. Includes
    // every sub-report the ReportsPage needs, so the page never makes more
    // than one request on first load. All sub-reports run in parallel.
    fastify.get('/summary', {
        schema: { tags: ['Reports'] },
        preHandler: [fastify.authenticate, (fastify as any).requireRole('hr_manager', 'super_admin')],
    }, async (request: any, reply: any) => {
        const tenantId: string = request.user.tenantId
        const days = boundedInt((request.query as any).days, 90, 1, 3650)
        const year = new Date().getFullYear()

        // allSettled, not all: one failing sub-report (a bad migration on
        // one table, a transient timeout) must not blank the entire reports
        // page. Each failed slice comes back as `null`; the frontend already
        // guards every field with optional chaining + `?? 0`, so a null
        // section renders its empty state while the other tabs work. The
        // rejection reason is logged so we still see failures in the logs.
        const results = await Promise.allSettled([
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
        const keys = [
            'headcount', 'payrollSummary', 'visaExpiry', 'proCosts',
            'attendanceSummary', 'leaveSummary',
            'turnover', 'onboarding', 'performance',
            'documentExpiry',
        ] as const
        const payload: Record<string, unknown> = {}
        results.forEach((res, i) => {
            const key = keys[i]
            if (res.status === 'fulfilled') {
                payload[key] = res.value
            } else {
                payload[key] = null
                request.log.error({ err: res.reason, report: key, tenantId }, 'reports/summary sub-report failed')
            }
        })
        return reply.send(payload)
    })
}
