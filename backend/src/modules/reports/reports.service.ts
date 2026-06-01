import { eq, and, count, lte, gte, sql, desc, isNull, inArray } from 'drizzle-orm'
import { db, withLongTimeout } from '../../db/index.js'
import {
    employees, payrollRuns, attendanceRecords, leaveRequests,
    exitRequests, onboardingChecklists, performanceReviews,
} from '../../db/schema/index.js'
import { getPROCostReport } from '../visa/visa_costs.service.js'
import { resolveAvatarUrl } from '../../plugins/s3.js'

export { getPROCostReport }

export async function getHeadcountReport(tenantId: string) {
    return withLongTimeout(async (tx) => {
        // Use SQL GROUP BY instead of loading all rows into JS memory (BUG-03)
        const baseWhere = and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false))

        const [
            [{ total }],
            byStatusRows,
            byDeptRows,
            byNatRows,
        ] = await Promise.all([
            tx.select({ total: count() }).from(employees).where(baseWhere),
            tx.select({ label: employees.status, count: count() })
                .from(employees).where(baseWhere)
                .groupBy(employees.status),
            tx.select({ label: employees.department, count: count() })
                .from(employees).where(baseWhere)
                .groupBy(employees.department)
                .orderBy(desc(count())),
            tx.select({ label: employees.nationality, count: count() })
                .from(employees).where(baseWhere)
                .groupBy(employees.nationality)
                .orderBy(desc(count()))
                .limit(15),
        ])

        return {
            total: Number(total),
            byStatus: byStatusRows.map(r => ({ label: r.label ?? 'unknown', count: Number(r.count) })),
            byDepartment: byDeptRows.map(r => ({ label: r.label ?? 'Unassigned', count: Number(r.count) })),
            byNationality: byNatRows.map(r => ({ label: r.label ?? 'Unknown', count: Number(r.count) })),
        }
    })
}

/** Optional `{ startDate, endDate }` (ISO YYYY-MM-DD) window for range-aware reports. */
export type ReportRange = { startDate: string; endDate: string }

export async function getPayrollSummaryReport(tenantId: string, range?: ReportRange) {
    // A payroll run is keyed by (year, month). When a range is supplied we
    // keep runs whose month-start falls between the range's first month and
    // its end date — i.e. every run that overlaps the selected window.
    const rangeWhere = range
        ? sql`make_date(${payrollRuns.year}, ${payrollRuns.month}, 1) >= date_trunc('month', ${range.startDate}::date)
              AND make_date(${payrollRuns.year}, ${payrollRuns.month}, 1) <= ${range.endDate}::date`
        : undefined

    const runs = await db
        .select({
            id: payrollRuns.id,
            month: payrollRuns.month,
            year: payrollRuns.year,
            totalGross: payrollRuns.totalGross,
            totalNet: payrollRuns.totalNet,
            totalDeductions: payrollRuns.totalDeductions,
            status: payrollRuns.status,
            employeeCount: payrollRuns.totalEmployees,
        })
        .from(payrollRuns)
        .where(and(eq(payrollRuns.tenantId, tenantId), rangeWhere))
        .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
        // No range → trailing 12 runs (legacy). With a range, show every run
        // in-window (capped high so a wide "last year" still returns fully).
        .limit(range ? 120 : 12)

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const trend = runs.map(r => ({
        period: `${months[(r.month ?? 1) - 1]} ${r.year}`,
        gross: Number(r.totalGross ?? 0),
        net: Number(r.totalNet ?? 0),
        deductions: Number(r.totalDeductions ?? 0),
        headcount: r.employeeCount ?? 0,
        status: r.status,
    }))

    // Totals reflect what's on the chart: every in-window run when a range is
    // set, else the current calendar year's runs (legacy "YTD" semantics).
    // Without this, a "Last Year" range would chart 2025 data but report 0 for
    // the totals (the old filter hard-coded the current year).
    const scoped = range ? trend : trend.filter(r => r.period.includes(String(new Date().getFullYear())))
    const ytdGross = scoped.reduce((s, r) => s + r.gross, 0)
    const ytdNet = scoped.reduce((s, r) => s + r.net, 0)

    return { trend, ytdGross, ytdNet, totalRuns: runs.length }
}

export async function getVisaExpiryReport(tenantId: string, days = 90) {
    const today = new Date().toISOString().split('T')[0]
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() + days)
    const cutoffStr = cutoff.toISOString().split('T')[0]

    const expiring = await db
        .select({
            id: employees.id,
            employeeNo: employees.employeeNo,
            fullName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            avatarUrl: employees.avatarUrl,
            department: employees.department,
            designation: employees.designation,
            nationality: employees.nationality,
            visaExpiry: employees.visaExpiry,
            passportExpiry: employees.passportExpiry,
            visaType: employees.visaType,
            emiratesId: employees.emiratesId,
        })
        .from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            lte(employees.visaExpiry, cutoffStr),
        ))
        .orderBy(employees.visaExpiry)

    const expired: typeof expiring = []
    const critical: typeof expiring = []  // ≤ 30 days
    const urgent: typeof expiring = []    // 31–60 days
    const normal: typeof expiring = []    // 61+ days

    for (const e of expiring) {
        if (!e.visaExpiry) continue
        if (e.visaExpiry < today) {
            expired.push(e)
        } else {
            const daysLeft = Math.ceil((new Date(e.visaExpiry).getTime() - Date.now()) / 86400000)
            if (daysLeft <= 30) critical.push(e)
            else if (daysLeft <= 60) urgent.push(e)
            else normal.push(e)
        }
    }

    const resolvedEmployees = await Promise.all(expiring.map(async e => ({
        ...e,
        avatarUrl: await resolveAvatarUrl(e.avatarUrl),
        daysLeft: e.visaExpiry
            ? Math.ceil((new Date(e.visaExpiry).getTime() - Date.now()) / 86400000)
            : null,
        urgency: e.visaExpiry
            ? (e.visaExpiry < today ? 'expired' : (() => {
                const d = Math.ceil((new Date(e.visaExpiry).getTime() - Date.now()) / 86400000)
                return d <= 30 ? 'critical' : d <= 60 ? 'urgent' : 'normal'
            })())
            : 'unknown',
    })))
    return {
        total: expiring.length,
        expired: expired.length,
        critical: critical.length,
        urgent: urgent.length,
        normal: normal.length,
        employees: resolvedEmployees,
    }
}

// ─── Attendance Summary ──────────────────────────────────────────────────
//
// Roll-up of the last N days of `attendance_records`. The default 90-day
// window mirrors the visa report so the page-level date selector controls
// both simultaneously. All counts come from GROUP BY in SQL — no row-by-row
// JS aggregation — so this stays cheap even for 200-employee tenants.
//
// Shape returned:
//   • KPI counters (working days, present, late, absent, avg hours)
//   • Monthly trend (attendance % per month)
//   • By-department breakdown (present / late / absent counts + rate)
//   • Top-10 late arrivals leaderboard

/**
 * Attendance summary report.
 *
 * Two ways to express the time window:
 *   • `range: { startDate, endDate }` — explicit calendar slice (used by
 *     the Today / This Week / Last Week / This Month / Custom presets on
 *     the Reports page). When provided, `days` is ignored.
 *   • `days` — rolling window ending at "today" (legacy default). Kept
 *     for backward-compatible callers and for the `/reports/summary`
 *     BFF that doesn't need the explicit range yet.
 *
 * `endDate` is inclusive — `BETWEEN startDate AND endDate` semantics —
 * matching the way HR thinks about a date filter on the UI ("show me
 * 1 May through 31 May", not "1 May exclusive 31 May").
 */
export async function getAttendanceSummaryReport(
    tenantId: string,
    daysOrRange: number | { startDate: string; endDate: string } = 90,
) {
    return withLongTimeout(async (tx) => {
        const range = typeof daysOrRange === 'number'
            ? {
                startDate: new Date(Date.now() - daysOrRange * 86_400_000).toISOString().slice(0, 10),
                endDate: new Date().toISOString().slice(0, 10),
            }
            : daysOrRange
        const baseWhere = and(
            eq(attendanceRecords.tenantId, tenantId),
            gte(attendanceRecords.date, range.startDate),
            lte(attendanceRecords.date, range.endDate),
        )

        // Five independent SELECTs — run them in parallel against the
        // shared connection pool. Sequential would cost ~5× latency for
        // no reason (Drizzle pools the connections; Postgres handles the
        // concurrent reads). Same pattern across all the new reports.
        const [statusRows, avgHoursRow, trendRows, deptRows, lateRows] = await Promise.all([
            tx
                .select({ status: attendanceRecords.status, count: count() })
                .from(attendanceRecords)
                .where(baseWhere)
                .groupBy(attendanceRecords.status),
            tx
                .select({ avgHours: sql<string>`COALESCE(AVG(${attendanceRecords.hoursWorked}), 0)` })
                .from(attendanceRecords)
                .where(and(baseWhere, sql`${attendanceRecords.hoursWorked} IS NOT NULL`)),
            tx
                .select({
                    month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${attendanceRecords.date}), 'Mon YYYY')`,
                    bucket: sql<string>`TO_CHAR(DATE_TRUNC('month', ${attendanceRecords.date}), 'YYYY-MM')`,
                    present: sql<string>`COUNT(*) FILTER (WHERE ${attendanceRecords.status} IN ('present','late','half_day','wfh'))`,
                    late: sql<string>`COUNT(*) FILTER (WHERE ${attendanceRecords.status} = 'late')`,
                    absent: sql<string>`COUNT(*) FILTER (WHERE ${attendanceRecords.status} = 'absent')`,
                    total: count(),
                })
                .from(attendanceRecords)
                .where(baseWhere)
                .groupBy(sql`DATE_TRUNC('month', ${attendanceRecords.date})`)
                .orderBy(sql`DATE_TRUNC('month', ${attendanceRecords.date})`),
            tx
                .select({
                    department: employees.department,
                    present: sql<string>`COUNT(*) FILTER (WHERE ${attendanceRecords.status} IN ('present','late','half_day','wfh'))`,
                    late: sql<string>`COUNT(*) FILTER (WHERE ${attendanceRecords.status} = 'late')`,
                    absent: sql<string>`COUNT(*) FILTER (WHERE ${attendanceRecords.status} = 'absent')`,
                    total: count(),
                })
                .from(attendanceRecords)
                .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
                .where(baseWhere)
                .groupBy(employees.department)
                .orderBy(desc(count())),
            tx
                .select({
                    employeeId: employees.id,
                    employeeNo: employees.employeeNo,
                    fullName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
                    department: employees.department,
                    designation: employees.designation,
                    lateCount: count(),
                })
                .from(attendanceRecords)
                .innerJoin(employees, eq(employees.id, attendanceRecords.employeeId))
                .where(and(baseWhere, eq(attendanceRecords.status, 'late')))
                .groupBy(employees.id, employees.employeeNo, employees.firstName, employees.lastName, employees.department, employees.designation)
                .orderBy(desc(count()))
                .limit(10),
        ])

        const byStatus: Record<string, number> = {}
        for (const r of statusRows) byStatus[r.status ?? 'unknown'] = Number(r.count)
        const present = (byStatus.present ?? 0) + (byStatus.half_day ?? 0) + (byStatus.wfh ?? 0) + (byStatus.late ?? 0)
        const late = byStatus.late ?? 0
        const absent = byStatus.absent ?? 0
        const onLeave = byStatus.on_leave ?? 0
        const totalRecords = present + absent + onLeave
        const attendanceRate = totalRecords > 0 ? Math.round((present / totalRecords) * 1000) / 10 : 0
        const avgHours = avgHoursRow[0]?.avgHours ?? '0'

        const trend = trendRows.map((r) => {
            const p = Number(r.present), t = Number(r.total)
            return {
                period: r.month,
                bucket: r.bucket,
                present: p,
                late: Number(r.late),
                absent: Number(r.absent),
                rate: t > 0 ? Math.round((p / t) * 1000) / 10 : 0,
            }
        })

        const byDepartment = deptRows.map((r) => {
            const p = Number(r.present), t = Number(r.total)
            return {
                department: r.department ?? 'Unassigned',
                present: p,
                late: Number(r.late),
                absent: Number(r.absent),
                rate: t > 0 ? Math.round((p / t) * 1000) / 10 : 0,
            }
        })
        const lateLeaderboard = lateRows.map((r) => ({
            employeeId: r.employeeId,
            employeeNo: r.employeeNo,
            fullName: r.fullName,
            department: r.department,
            designation: r.designation,
            lateCount: Number(r.lateCount),
        }))

        // Days span of the resolved window (inclusive). Used by the UI
        // to print "Showing 7 days / 31 days" alongside the chart.
        const windowDays = Math.max(
            1,
            Math.round((Date.parse(range.endDate) - Date.parse(range.startDate)) / 86_400_000) + 1,
        )
        return {
            windowDays,
            windowStart: range.startDate,
            windowEnd: range.endDate,
            present,
            late,
            absent,
            onLeave,
            attendanceRate,
            avgHoursPerDay: Math.round(Number(avgHours) * 100) / 100,
            trend,
            byDepartment,
            lateLeaderboard,
        }
    })
}

// ─── Leave Summary ───────────────────────────────────────────────────────
//
// Year-to-date breakdown of `leave_requests`. KPIs cover request counts +
// total approved days; breakdowns surface leave-type distribution + per-
// department days taken + top-10 takers. Excludes soft-deleted rows.

export async function getLeaveSummaryReport(tenantId: string, year?: number) {
    return withLongTimeout(async (tx) => {
        const targetYear = year ?? new Date().getFullYear()
        const yearStart = `${targetYear}-01-01`
        const yearEnd = `${targetYear}-12-31`
        const baseWhere = and(
            eq(leaveRequests.tenantId, tenantId),
            sql`${leaveRequests.deletedAt} IS NULL`,
            gte(leaveRequests.startDate, yearStart),
            lte(leaveRequests.startDate, yearEnd),
        )

        // Four independent SELECTs run in parallel — same parallelisation
        // pattern as getAttendanceSummaryReport.
        const [statusRows, typeRows, deptRows, takerRows] = await Promise.all([
            tx
                .select({
                    status: leaveRequests.status,
                    count: count(),
                    days: sql<string>`COALESCE(SUM(${leaveRequests.days}), 0)`,
                })
                .from(leaveRequests)
                .where(baseWhere)
                .groupBy(leaveRequests.status),
            tx
                .select({
                    leaveType: leaveRequests.leaveType,
                    requests: count(),
                    days: sql<string>`COALESCE(SUM(${leaveRequests.days}), 0)`,
                })
                .from(leaveRequests)
                .where(and(baseWhere, eq(leaveRequests.status, 'approved')))
                .groupBy(leaveRequests.leaveType)
                .orderBy(desc(sql`SUM(${leaveRequests.days})`)),
            tx
                .select({
                    department: employees.department,
                    days: sql<string>`COALESCE(SUM(${leaveRequests.days}), 0)`,
                    requests: count(),
                })
                .from(leaveRequests)
                .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
                .where(and(baseWhere, eq(leaveRequests.status, 'approved')))
                .groupBy(employees.department)
                .orderBy(desc(sql`SUM(${leaveRequests.days})`))
                .limit(15),
            tx
                .select({
                    employeeId: employees.id,
                    employeeNo: employees.employeeNo,
                    fullName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
                    department: employees.department,
                    designation: employees.designation,
                    days: sql<string>`COALESCE(SUM(${leaveRequests.days}), 0)`,
                    requests: count(),
                })
                .from(leaveRequests)
                .innerJoin(employees, eq(employees.id, leaveRequests.employeeId))
                .where(and(baseWhere, eq(leaveRequests.status, 'approved')))
                .groupBy(employees.id, employees.employeeNo, employees.firstName, employees.lastName, employees.department, employees.designation)
                .orderBy(desc(sql`SUM(${leaveRequests.days})`))
                .limit(10),
        ])

        const byStatus: Record<string, { count: number; days: number }> = {}
        for (const r of statusRows) byStatus[r.status ?? 'unknown'] = { count: Number(r.count), days: Number(r.days) }
        const byType = typeRows.map((r) => ({
            leaveType: r.leaveType,
            requests: Number(r.requests),
            days: Number(r.days),
        }))
        const byDepartment = deptRows.map((r) => ({
            department: r.department ?? 'Unassigned',
            days: Number(r.days),
            requests: Number(r.requests),
        }))
        const topTakers = takerRows.map((r) => ({
            employeeId: r.employeeId,
            employeeNo: r.employeeNo,
            fullName: r.fullName,
            department: r.department,
            designation: r.designation,
            days: Number(r.days),
            requests: Number(r.requests),
        }))

        return {
            year: targetYear,
            approvedRequests: byStatus.approved?.count ?? 0,
            approvedDays: byStatus.approved?.days ?? 0,
            pendingRequests: byStatus.pending?.count ?? 0,
            pendingDays: byStatus.pending?.days ?? 0,
            rejectedRequests: byStatus.rejected?.count ?? 0,
            cancelledRequests: byStatus.cancelled?.count ?? 0,
            byType,
            byDepartment,
            topTakers,
        }
    })
}

// ─── Turnover & Attrition ───────────────────────────────────────────────
//
// Joins vs exits over the last `months` (default 12), turnover rate %,
// per-department breakdown, and tenure distribution of the current
// workforce. Turnover rate uses the standard formula:
//   exits / avg(headcount) over the period × 100
//
// Joins come from `employees.joinDate` (everyone, regardless of current
// status). Exits come from `exit_requests.lastWorkingDay` where the
// request is approved or completed — pending/rejected ones don't count
// as real exits yet.

/**
 * Turnover report.
 *
 * Same shape contract as the attendance summary: accepts either an
 * explicit calendar range or a rolling-N-months window for back-compat
 * with `/reports/summary`. The explicit range bounds *both* the joins
 * (employees with `joinDate` within the window) and the exits
 * (approved/completed exits with `lastWorkingDay` within the window).
 */
export async function getTurnoverReport(
    tenantId: string,
    monthsOrRange: number | { startDate: string; endDate: string } = 12,
) {
    return withLongTimeout(async (tx) => {
        let startIso: string
        let todayIso: string
        if (typeof monthsOrRange === 'number') {
            const now = new Date()
            const start = new Date(now.getFullYear(), now.getMonth() - monthsOrRange + 1, 1)
            startIso = start.toISOString().slice(0, 10)
            todayIso = now.toISOString().slice(0, 10)
        } else {
            startIso = monthsOrRange.startDate
            todayIso = monthsOrRange.endDate
        }

        const baseEmpWhere = and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
        )

        // Six independent SELECTs run in parallel.
        const exitsBaseWhere = and(
            eq(exitRequests.tenantId, tenantId),
            gte(exitRequests.lastWorkingDay, startIso),
            lte(exitRequests.lastWorkingDay, todayIso),
            inArray(exitRequests.status, ['approved', 'completed']),
        )
        const [joinRows, exitRows, headcountRow, deptRows, tenureRows, exitTypeRows] = await Promise.all([
            tx
                .select({
                    month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${employees.joinDate}), 'Mon YYYY')`,
                    bucket: sql<string>`TO_CHAR(DATE_TRUNC('month', ${employees.joinDate}), 'YYYY-MM')`,
                    count: count(),
                })
                .from(employees)
                .where(and(
                    eq(employees.tenantId, tenantId),
                    gte(employees.joinDate, startIso),
                    lte(employees.joinDate, todayIso),
                ))
                .groupBy(sql`DATE_TRUNC('month', ${employees.joinDate})`)
                .orderBy(sql`DATE_TRUNC('month', ${employees.joinDate})`),
            tx
                .select({
                    month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${exitRequests.lastWorkingDay}), 'Mon YYYY')`,
                    bucket: sql<string>`TO_CHAR(DATE_TRUNC('month', ${exitRequests.lastWorkingDay}), 'YYYY-MM')`,
                    count: count(),
                })
                .from(exitRequests)
                .where(exitsBaseWhere)
                .groupBy(sql`DATE_TRUNC('month', ${exitRequests.lastWorkingDay})`)
                .orderBy(sql`DATE_TRUNC('month', ${exitRequests.lastWorkingDay})`),
            tx
                .select({ headcount: count() })
                .from(employees)
                .where(baseEmpWhere),
            tx
                .select({ department: employees.department, exits: count() })
                .from(exitRequests)
                .innerJoin(employees, eq(employees.id, exitRequests.employeeId))
                .where(exitsBaseWhere)
                .groupBy(employees.department)
                .orderBy(desc(count()))
                .limit(15),
            tx
                .select({
                    joinDate: employees.joinDate,
                    department: employees.department,
                })
                .from(employees)
                .where(baseEmpWhere),
            tx
                .select({ exitType: exitRequests.exitType, count: count() })
                .from(exitRequests)
                .where(exitsBaseWhere)
                .groupBy(exitRequests.exitType),
        ])

        // Merge joins+exits into a single trend keyed by bucket so the FE
        // can render one chart with two series.
        const trendMap = new Map<string, { period: string; bucket: string; joins: number; exits: number }>()
        for (const r of joinRows) trendMap.set(r.bucket, { period: r.month, bucket: r.bucket, joins: Number(r.count), exits: 0 })
        for (const r of exitRows) {
            const existing = trendMap.get(r.bucket) ?? { period: r.month, bucket: r.bucket, joins: 0, exits: 0 }
            existing.exits = Number(r.count)
            trendMap.set(r.bucket, existing)
        }
        const trend = Array.from(trendMap.values()).sort((a, b) => a.bucket.localeCompare(b.bucket))

        const totalJoins = trend.reduce((s, r) => s + r.joins, 0)
        const totalExits = trend.reduce((s, r) => s + r.exits, 0)

        const headcount = headcountRow[0]?.headcount ?? 0
        const denom = Math.max(1, Number(headcount))
        const turnoverRate = Math.round((totalExits / denom) * 1000) / 10

        const byDepartment = deptRows.map((r) => ({ department: r.department ?? 'Unassigned', exits: Number(r.exits) }))

        const buckets = { '<1y': 0, '1–3y': 0, '3–5y': 0, '5y+': 0 } as Record<string, number>
        for (const r of tenureRows) {
            if (!r.joinDate) continue
            const years = (Date.now() - new Date(r.joinDate).getTime()) / (365 * 86_400_000)
            if (years < 1) buckets['<1y']++
            else if (years < 3) buckets['1–3y']++
            else if (years < 5) buckets['3–5y']++
            else buckets['5y+']++
        }
        const tenureDistribution = Object.entries(buckets).map(([label, count]) => ({ label, count }))

        const byExitType = exitTypeRows.map((r) => ({ label: r.exitType ?? 'unknown', count: Number(r.count) }))

        // Derive windowMonths from the resolved range so the UI can still
        // show "Last 12 months" when no explicit range was given, and
        // "1 May - 31 May (1 month)" when one was.
        const windowMonths = Math.max(
            1,
            Math.round((Date.parse(todayIso) - Date.parse(startIso)) / (30 * 86_400_000)),
        )
        return {
            windowMonths,
            windowStart: startIso,
            windowEnd: todayIso,
            totalJoins,
            totalExits,
            currentHeadcount: Number(headcount),
            turnoverRate,
            netChange: totalJoins - totalExits,
            trend,
            byDepartment,
            tenureDistribution,
            byExitType,
        }
    })
}

// ─── Onboarding Completion ──────────────────────────────────────────────
//
// Snapshot of every onboarding checklist for the tenant: how many are
// in progress / completed, which are stalled (no movement >30 days), and
// the average days-to-complete for the ones that finished. Drives the
// "Onboarding" tab on the reports page.

export async function getOnboardingReport(tenantId: string, range?: ReportRange) {
    return withLongTimeout(async (tx) => {
        // Range filters on the checklist startDate (when onboarding began).
        const rangeWhere = range
            ? and(
                gte(onboardingChecklists.startDate, range.startDate),
                lte(onboardingChecklists.startDate, range.endDate),
            )
            : undefined
        const checklists = await tx
            .select({
                id: onboardingChecklists.id,
                employeeId: onboardingChecklists.employeeId,
                progress: onboardingChecklists.progress,
                startDate: onboardingChecklists.startDate,
                dueDate: onboardingChecklists.dueDate,
                createdAt: onboardingChecklists.createdAt,
                updatedAt: onboardingChecklists.updatedAt,
                employeeNo: employees.employeeNo,
                firstName: employees.firstName,
                lastName: employees.lastName,
                department: employees.department,
                designation: employees.designation,
            })
            .from(onboardingChecklists)
            .innerJoin(employees, eq(employees.id, onboardingChecklists.employeeId))
            .where(and(eq(onboardingChecklists.tenantId, tenantId), rangeWhere))

        const now = Date.now()
        const STALL_MS = 30 * 86_400_000

        let inProgress = 0, completed = 0, stalled = 0, overdue = 0
        const completionDays: number[] = []
        const stalledList: Array<{
            id: string
            employeeId: string
            employeeNo: string | null
            fullName: string
            department: string | null
            designation: string | null
            progress: number
            stalledDays: number
            dueDate: string | null
        }> = []
        const byDepartmentMap = new Map<string, { total: number; completed: number; inProgress: number }>()

        for (const c of checklists) {
            const dep = c.department ?? 'Unassigned'
            const slot = byDepartmentMap.get(dep) ?? { total: 0, completed: 0, inProgress: 0 }
            slot.total++

            if (c.progress >= 100) {
                completed++
                slot.completed++
                if (c.startDate && c.updatedAt) {
                    const days = (new Date(c.updatedAt).getTime() - new Date(c.startDate).getTime()) / 86_400_000
                    if (days >= 0 && days < 365) completionDays.push(days)
                }
            } else {
                inProgress++
                slot.inProgress++
                const sinceUpdate = now - new Date(c.updatedAt).getTime()
                if (sinceUpdate > STALL_MS) {
                    stalled++
                    stalledList.push({
                        id: c.id,
                        employeeId: c.employeeId,
                        employeeNo: c.employeeNo,
                        fullName: `${c.firstName} ${c.lastName}`,
                        department: c.department,
                        designation: c.designation,
                        progress: c.progress,
                        stalledDays: Math.floor(sinceUpdate / 86_400_000),
                        dueDate: c.dueDate,
                    })
                }
                if (c.dueDate && c.dueDate < new Date().toISOString().slice(0, 10)) overdue++
            }
            byDepartmentMap.set(dep, slot)
        }

        const total = checklists.length
        const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0
        const avgDaysToComplete = completionDays.length > 0
            ? Math.round((completionDays.reduce((s, d) => s + d, 0) / completionDays.length) * 10) / 10
            : 0

        stalledList.sort((a, b) => b.stalledDays - a.stalledDays)

        const byDepartment = Array.from(byDepartmentMap.entries())
            .map(([department, v]) => ({
                department,
                total: v.total,
                completed: v.completed,
                inProgress: v.inProgress,
                completionRate: v.total > 0 ? Math.round((v.completed / v.total) * 1000) / 10 : 0,
            }))
            .sort((a, b) => b.total - a.total)

        return {
            total,
            completed,
            inProgress,
            stalled,
            overdue,
            completionRate,
            avgDaysToComplete,
            stalledList: stalledList.slice(0, 10),
            byDepartment,
        }
    })
}

// ─── Performance Review Summary ─────────────────────────────────────────
//
// Counts by status, average rating, distribution across the 1-5 scale,
// per-department average ratings, and the 10 most recent submitted /
// completed reviews. Excludes soft-deleted rows.

export async function getPerformanceReport(tenantId: string, range?: ReportRange) {
    return withLongTimeout(async (tx) => {
        // Range filters on reviewDate (when the review took place). Reviews
        // with no reviewDate are excluded from a windowed view by nature.
        const rangeWhere = range
            ? and(
                gte(performanceReviews.reviewDate, range.startDate),
                lte(performanceReviews.reviewDate, range.endDate),
            )
            : undefined
        const baseWhere = and(
            eq(performanceReviews.tenantId, tenantId),
            isNull(performanceReviews.deletedAt),
            rangeWhere,
        )

        // Five independent SELECTs run in parallel.
        const ratedWhere = and(baseWhere, sql`${performanceReviews.overallRating} IS NOT NULL`)
        const [statusRows, ratingRows, avgRow, deptRows, recentRows] = await Promise.all([
            tx
                .select({ status: performanceReviews.status, count: count() })
                .from(performanceReviews)
                .where(baseWhere)
                .groupBy(performanceReviews.status),
            tx
                .select({ rating: performanceReviews.overallRating, count: count() })
                .from(performanceReviews)
                .where(ratedWhere)
                .groupBy(performanceReviews.overallRating)
                .orderBy(performanceReviews.overallRating),
            tx
                .select({ avg: sql<string>`COALESCE(AVG(${performanceReviews.overallRating}), 0)` })
                .from(performanceReviews)
                .where(ratedWhere),
            tx
                .select({
                    department: employees.department,
                    avgRating: sql<string>`COALESCE(AVG(${performanceReviews.overallRating}), 0)`,
                    count: count(),
                })
                .from(performanceReviews)
                .innerJoin(employees, eq(employees.id, performanceReviews.employeeId))
                .where(ratedWhere)
                .groupBy(employees.department)
                .orderBy(desc(count()))
                .limit(15),
            tx
                .select({
                    id: performanceReviews.id,
                    employeeId: performanceReviews.employeeId,
                    period: performanceReviews.period,
                    status: performanceReviews.status,
                    overallRating: performanceReviews.overallRating,
                    reviewDate: performanceReviews.reviewDate,
                    employeeNo: employees.employeeNo,
                    firstName: employees.firstName,
                    lastName: employees.lastName,
                    department: employees.department,
                    designation: employees.designation,
                })
                .from(performanceReviews)
                .innerJoin(employees, eq(employees.id, performanceReviews.employeeId))
                .where(and(
                    baseWhere,
                    inArray(performanceReviews.status, ['submitted', 'acknowledged', 'completed']),
                ))
                .orderBy(desc(performanceReviews.updatedAt))
                .limit(10),
        ])

        const byStatus: Record<string, number> = {}
        for (const r of statusRows) byStatus[r.status ?? 'unknown'] = Number(r.count)
        const total = Object.values(byStatus).reduce((s, n) => s + n, 0)
        const completed = (byStatus.completed ?? 0) + (byStatus.acknowledged ?? 0)
        const completionRate = total > 0 ? Math.round((completed / total) * 1000) / 10 : 0

        const ratingDistribution = ratingRows.map((r) => ({
            rating: Number(r.rating),
            count: Number(r.count),
        }))

        const avgRating = Math.round(Number(avgRow[0]?.avg ?? 0) * 100) / 100

        const byDepartment = deptRows.map((r) => ({
            department: r.department ?? 'Unassigned',
            avgRating: Math.round(Number(r.avgRating) * 100) / 100,
            count: Number(r.count),
        }))

        const recent = recentRows.map((r) => ({
            id: r.id,
            employeeId: r.employeeId,
            employeeNo: r.employeeNo,
            fullName: `${r.firstName} ${r.lastName}`,
            department: r.department,
            designation: r.designation,
            period: r.period,
            status: r.status,
            overallRating: r.overallRating,
            reviewDate: r.reviewDate,
        }))

        return {
            total,
            completed,
            inProgress: (byStatus.submitted ?? 0) + (byStatus.acknowledged ?? 0),
            draft: byStatus.draft ?? 0,
            completionRate,
            avgRating,
            ratingDistribution,
            byDepartment,
            recent,
        }
    })
}

// ─── Document Expiry (unified) ──────────────────────────────────────────
//
// Single roll-up across every document the tenant tracks expiry for:
//   visa · passport · emirates_id · labour_card · contract
//
// Replaces the standalone visa-expiry report on the frontend (still
// exposed for legacy callers). Each expiring document becomes one row
// with a `docType` discriminator + the same urgency bucketing as visa
// (expired / critical ≤30d / urgent 31-60d / normal 61+d). Totals are
// pre-computed per `docType` and per `urgency` so the FE doesn't have
// to recompute them per render.

type DocType = 'visa' | 'passport' | 'emirates_id' | 'labour_card' | 'contract'

interface DocExpiryRow {
    employeeId: string
    employeeNo: string | null
    fullName: string
    avatarUrl: string | null
    department: string | null
    designation: string | null
    nationality: string | null
    docType: DocType
    docNumber: string | null
    expiryDate: string
    daysLeft: number
    urgency: 'expired' | 'critical' | 'urgent' | 'normal'
}

export async function getDocumentExpiryReport(tenantId: string, days = 90) {
    return withLongTimeout(async (tx) => {
        const today = new Date().toISOString().slice(0, 10)
        const cutoff = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

        // Pull every employee with at least one expiry that lands in-window
        // OR is already expired. Done in a single query — cheaper than five
        // separate calls and gives us the row data once for each employee.
        const rows = await tx
            .select({
                id: employees.id,
                employeeNo: employees.employeeNo,
                firstName: employees.firstName,
                lastName: employees.lastName,
                avatarUrl: employees.avatarUrl,
                department: employees.department,
                designation: employees.designation,
                nationality: employees.nationality,
                visaExpiry: employees.visaExpiry,
                visaType: employees.visaType,
                passportNo: employees.passportNo,
                passportExpiry: employees.passportExpiry,
                emiratesId: employees.emiratesId,
                emiratesIdExpiry: employees.emiratesIdExpiry,
                labourCardNumber: employees.labourCardNumber,
                labourCardExpiry: employees.labourCardExpiry,
                contractEndDate: employees.contractEndDate,
            })
            .from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                sql`(
                    ${employees.visaExpiry}      <= ${cutoff} OR
                    ${employees.passportExpiry}  <= ${cutoff} OR
                    ${employees.emiratesIdExpiry}<= ${cutoff} OR
                    ${employees.labourCardExpiry}<= ${cutoff} OR
                    ${employees.contractEndDate} <= ${cutoff}
                )`,
            ))

        // Flatten each employee into one row per expiring document.
        const flat: DocExpiryRow[] = []
        const pushIfExpiring = (
            base: Omit<DocExpiryRow, 'docType' | 'docNumber' | 'expiryDate' | 'daysLeft' | 'urgency'>,
            docType: DocType,
            docNumber: string | null,
            expiry: string | null,
        ) => {
            if (!expiry) return
            if (expiry > cutoff) return
            const daysLeft = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000)
            const urgency: DocExpiryRow['urgency'] =
                expiry < today ? 'expired' : daysLeft <= 30 ? 'critical' : daysLeft <= 60 ? 'urgent' : 'normal'
            flat.push({ ...base, docType, docNumber, expiryDate: expiry, daysLeft, urgency })
        }
        for (const r of rows) {
            const base = {
                employeeId: r.id,
                employeeNo: r.employeeNo,
                fullName: `${r.firstName} ${r.lastName}`,
                avatarUrl: r.avatarUrl,
                department: r.department,
                designation: r.designation,
                nationality: r.nationality,
            }
            pushIfExpiring(base, 'visa',         r.visaType ?? null,            r.visaExpiry)
            pushIfExpiring(base, 'passport',     r.passportNo ?? null,          r.passportExpiry)
            pushIfExpiring(base, 'emirates_id',  r.emiratesId ?? null,          r.emiratesIdExpiry)
            pushIfExpiring(base, 'labour_card',  r.labourCardNumber ?? null,    r.labourCardExpiry)
            pushIfExpiring(base, 'contract',     null,                          r.contractEndDate)
        }
        // Sort by closest expiry first.
        flat.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))

        // Aggregate by docType + urgency.
        const initBucket = () => ({ total: 0, expired: 0, critical: 0, urgent: 0, normal: 0 })
        type BucketKey = DocType | 'total'
        const byType: Record<BucketKey, ReturnType<typeof initBucket>> = {
            total: initBucket(),
            visa: initBucket(),
            passport: initBucket(),
            emirates_id: initBucket(),
            labour_card: initBucket(),
            contract: initBucket(),
        }
        for (const row of flat) {
            byType[row.docType].total++
            byType[row.docType][row.urgency]++
            byType.total.total++
            byType.total[row.urgency]++
        }

        // Resolve avatars in parallel — same pattern as the visa report.
        const documents = await Promise.all(flat.map(async (row) => ({
            ...row,
            avatarUrl: await resolveAvatarUrl(row.avatarUrl),
        })))

        return {
            windowDays: days,
            byType,
            documents,
        }
    })
}
