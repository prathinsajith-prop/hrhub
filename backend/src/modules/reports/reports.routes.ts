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

/**
 * Parse an optional `?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` pair from
 * the request query string. Returns `null` if either side is missing,
 * malformed, or the order is inverted — letting the calling handler
 * fall back to its legacy rolling-window param (`days` / `months`).
 *
 * Strict validation here is the whole point: the date strings flow
 * straight into SQL `BETWEEN` predicates downstream, and a `Date(NaN)`
 * would throw when we go to format it. Rejecting at the edge keeps the
 * service layer's contract simple.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
function parseDateRange(query: any): { startDate: string; endDate: string } | null {
    const startDate = typeof query?.startDate === 'string' ? query.startDate : ''
    const endDate = typeof query?.endDate === 'string' ? query.endDate : ''
    if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) return null
    // Calendar order — `startDate <= endDate`. Lexicographic compare is
    // correct for YYYY-MM-DD without any Date() parsing.
    if (startDate > endDate) return null
    // Sanity-cap the year window — keeps a stray `0099-01-01` or
    // `9999-12-31` out of the indexed date range scans.
    const startYear = Number(startDate.slice(0, 4))
    const endYear = Number(endDate.slice(0, 4))
    if (startYear < 2000 || endYear > 2100) return null
    return { startDate, endDate }
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
    //   OR /reports/attendance-summary?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
    //
    // Explicit range wins when valid — that's what the Today / This Week /
    // Last Week / This Month / Custom presets on the Reports page send.
    fastify.get('/attendance-summary', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const range = parseDateRange(request.query)
        if (range) {
            const data = await getAttendanceSummaryReport(tenantId, range)
            return reply.send({ data })
        }
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
    //   OR /reports/turnover?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
    fastify.get('/turnover', {
        schema: { tags: ['Reports'] },
        ...reportsAuth,
    }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const range = parseDateRange(request.query)
        if (range) {
            const data = await getTurnoverReport(tenantId, range)
            return reply.send({ data })
        }
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
        // Range-aware sub-reports (attendance + turnover) honour an
        // explicit `?startDate&endDate` window when the Reports page
        // sends one. Other sub-reports keep their original windowing
        // contract — visa/document expiry are forward-looking "next N
        // days", leave summary is year-based, headcount is a snapshot.
        const range = parseDateRange(request.query)

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
            getAttendanceSummaryReport(tenantId, range ?? days),
            getLeaveSummaryReport(tenantId, year),
            getTurnoverReport(tenantId, range ?? 12),
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
