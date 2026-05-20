import { eq, and, count, desc, gte, lte, sql, or, isNull, isNotNull, inArray } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { employees, recruitmentJobs, visaApplications, leaveRequests, notifications, payrollRuns, onboardingChecklists, onboardingSteps } from '../../db/schema/index.js'
import { cacheGet, cacheSet } from '../../lib/redis.js'

// Statuses that represent "currently employed" — i.e. on the payroll today.
// 'active' is the steady state; 'onboarding' covers the period between
// joining and paperwork completion. Anyone with these statuses is counted
// in headcount KPIs, dashboard breakdowns, and compliance ratios. (Earlier
// code only counted 'active' and silently undercounted new hires by ~40%.)
const WORKING_STATUSES = ['active', 'onboarding'] as const

const KPI_TTL_SECONDS = 120 // 2-minute TTL

export async function getDashboardKPIs(tenantId: string) {
    const cacheKey = `dashboard:kpis:${tenantId}`
    const cached = await cacheGet<ReturnType<typeof getDashboardKPIs>>(cacheKey)
    if (cached) return cached

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const in90 = new Date(today); in90.setDate(in90.getDate() + 90)
    const cutoffStr = in90.toISOString().split('T')[0]

    // Run all 5 count queries in parallel — avoids 5 sequential round-trips
    const [
        [{ totalEmployees }],
        [{ openJobs }],
        [{ activeVisas }],
        [{ pendingLeave }],
        [{ expiringVisas }],
    ] = await Promise.all([
        // Headcount KPI matches the dashboard breakdowns (gender / dept / marital
        // / emiratisation / anniversaries / birthdays), which all filter by
        // WORKING_STATUSES. Previously this counted every non-archived employee
        // including terminated, so the KPI tile and the breakdown totals disagreed
        // for any tenant with terminated-but-not-archived records — a confusing
        // mismatch HR couldn't explain.
        db.select({ totalEmployees: count() }).from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                inArray(employees.status, WORKING_STATUSES as unknown as string[]),
            )),
        db.select({ openJobs: count() }).from(recruitmentJobs)
            .where(and(eq(recruitmentJobs.tenantId, tenantId), eq(recruitmentJobs.status, 'open'))),
        db.select({ activeVisas: count() }).from(visaApplications)
            .where(and(eq(visaApplications.tenantId, tenantId), eq(visaApplications.status, 'entry_permit'))),
        db.select({ pendingLeave: count() }).from(leaveRequests)
            .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'pending'))),
        // Filter expiring visas in SQL — no full-table fetch
        db.select({ expiringVisas: count() }).from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                gte(employees.visaExpiry, todayStr),
                lte(employees.visaExpiry, cutoffStr),
            )),
    ])

    const result = {
        totalEmployees: Number(totalEmployees),
        openJobs: Number(openJobs),
        activeVisas: Number(activeVisas),
        pendingLeave: Number(pendingLeave),
        expiringVisas: Number(expiringVisas),
    }

    await cacheSet(cacheKey, result, KPI_TTL_SECONDS)
    return result
}

export async function getRecentNotifications(tenantId: string, userId: string, limit = 5) {
    // Return both tenant-wide (userId = null) and user-specific notifications
    return db.select().from(notifications)
        .where(and(
            eq(notifications.tenantId, tenantId),
            or(eq(notifications.userId, userId), isNull(notifications.userId)),
        ))
        .orderBy(desc(notifications.createdAt))
        .limit(limit)
}

export async function getPayrollTrend(tenantId: string) {
    const rows = await db
        .select({
            year: payrollRuns.year,
            month: payrollRuns.month,
            totalNet: payrollRuns.totalNet,
        })
        .from(payrollRuns)
        .where(
            and(
                eq(payrollRuns.tenantId, tenantId),
                // Last 6 months of finalized runs
                sql`(${payrollRuns.year} * 100 + ${payrollRuns.month}) >= (
                    (EXTRACT(YEAR FROM NOW())::int * 100 + EXTRACT(MONTH FROM NOW())::int) - 6
                )`,
            ),
        )
        .orderBy(payrollRuns.year, payrollRuns.month)
        .limit(6)

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return rows.map(r => ({
        month: monthNames[r.month - 1],
        amount: Number((Number(r.totalNet) / 1_000_000).toFixed(2)),
    }))
}

export async function getNationalityBreakdown(tenantId: string) {
    const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#94a3b8']

    const rows = await db
        .select({
            nationality: employees.nationality,
            count: count(),
        })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false)))
        .groupBy(employees.nationality)
        .orderBy(sql`count(*) desc`)
        .limit(5)

    return rows.map((r, i) => ({
        name: r.nationality ?? 'Unknown',
        value: Number(r.count),
        color: CHART_COLORS[i] ?? '#94a3b8',
    }))
}

export async function getDeptHeadcount(tenantId: string) {
    const rows = await db
        .select({
            dept: employees.department,
            count: count(),
        })
        .from(employees)
        .where(
            and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                inArray(employees.status, WORKING_STATUSES as unknown as string[]),
            ),
        )
        .groupBy(employees.department)
        .orderBy(sql`count(*) desc`)
        .limit(7)

    return rows.map(r => ({
        dept: r.dept ?? 'Other',
        count: Number(r.count),
    }))
}

export async function getEmiratisationStatus(tenantId: string) {
    // MOHRE target ratio (default 2% — actual quota varies by company size & sector).
    const targetRatio = 2.0

    const [[{ total }], [{ emiratis }]] = await Promise.all([
        db.select({ total: count() }).from(employees)
            .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false), inArray(employees.status, WORKING_STATUSES as unknown as string[]))),
        db.select({ emiratis: count() }).from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                inArray(employees.status, WORKING_STATUSES as unknown as string[]),
                eq(employees.emiratisationCategory, 'emirati'),
            )),
    ])

    const totalNum = Number(total)
    const emiratisNum = Number(emiratis)
    const currentRatio = totalNum > 0 ? Number(((emiratisNum / totalNum) * 100).toFixed(2)) : 0
    const gap = Number((currentRatio - targetRatio).toFixed(2))
    const required = Math.max(0, Math.ceil((targetRatio / 100) * totalNum) - emiratisNum)

    return {
        currentRatio,
        targetRatio,
        gap,
        emiratis: emiratisNum,
        totalActive: totalNum,
        required,
        progress: targetRatio > 0
            ? Math.min(100, Math.round((currentRatio / targetRatio) * 100))
            : 100,
    }
}

const GENDER_COLORS: Record<string, string> = {
    male: '#3b82f6',
    female: '#10b981',
    '': '#f59e0b',
}
const MARITAL_COLORS: Record<string, string> = {
    married: '#3b82f6',
    single: '#10b981',
    widowed: '#f59e0b',
    divorced: '#ef4444',
    '': '#8b5cf6',
}

export async function getGenderBreakdown(tenantId: string) {
    const rows = await db
        .select({ gender: employees.gender, count: count() })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false), inArray(employees.status, WORKING_STATUSES as unknown as string[])))
        .groupBy(employees.gender)
    return rows.map(r => ({
        name: r.gender ?? '',
        value: Number(r.count),
        color: GENDER_COLORS[r.gender ?? ''] ?? '#94a3b8',
    }))
}

export async function getMaritalStatusBreakdown(tenantId: string) {
    const rows = await db
        .select({ status: employees.maritalStatus, count: count() })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false), inArray(employees.status, WORKING_STATUSES as unknown as string[])))
        .groupBy(employees.maritalStatus)
    return rows.map(r => ({
        name: r.status ?? '',
        value: Number(r.count),
        color: MARITAL_COLORS[r.status ?? ''] ?? '#94a3b8',
    }))
}

export async function getUpcomingBirthdays(tenantId: string, month?: number) {
    const m = month ?? new Date().getMonth() + 1
    const rows = await db
        .select({
            firstName: employees.firstName,
            lastName: employees.lastName,
            employeeNo: employees.employeeNo,
            department: employees.department,
            avatarUrl: employees.avatarUrl,
            dateOfBirth: employees.dateOfBirth,
        })
        .from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            // Skip terminated employees — you don't celebrate someone who left.
            // Onboarding is included alongside active because they're real
            // colleagues from day one of paperwork.
            inArray(employees.status, WORKING_STATUSES as unknown as string[]),
            isNotNull(employees.dateOfBirth),
            sql`EXTRACT(MONTH FROM ${employees.dateOfBirth}::date) = ${m}`,
        ))
        .orderBy(sql`EXTRACT(DAY FROM ${employees.dateOfBirth}::date)`)
    return rows.map(r => attachBirthdayMeta({
        day: r.dateOfBirth ? new Date(r.dateOfBirth).getUTCDate() : 0,
        month: m,
        name: `${r.firstName} ${r.lastName}`.trim(),
        employeeNo: r.employeeNo,
        department: r.department ?? '',
        avatarUrl: r.avatarUrl ?? null,
    }))
}

/**
 * Compute `daysUntil` and the boolean `isToday` / `isTomorrow` flags for a
 * birthday row, so the UI can show "Today!" / "Tomorrow" / "In N days" without
 * re-deriving from the date on the client. Crosses the year boundary correctly
 * — a birthday on Jan 3 viewed on Dec 28 returns daysUntil = 6.
 */
function attachBirthdayMeta(b: { day: number; month: number; name: string; employeeNo: string; department: string; avatarUrl: string | null }) {
    const now = new Date()
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    // Build this year's birthday in UTC; if it's already passed, roll to next year.
    let next = new Date(Date.UTC(now.getUTCFullYear(), b.month - 1, b.day))
    if (next < today) next = new Date(Date.UTC(now.getUTCFullYear() + 1, b.month - 1, b.day))
    const daysUntil = Math.round((next.getTime() - today.getTime()) / 86_400_000)
    return {
        ...b,
        daysUntil,
        isToday: daysUntil === 0,
        isTomorrow: daysUntil === 1,
    }
}

export type UpcomingBirthday = Awaited<ReturnType<typeof getUpcomingBirthdays>>[number]

/**
 * Birthdays within a rolling window — used by the portal so an employee sees
 * "whose birthday is in the next 30 days" rather than a calendar-month snapshot.
 *
 * `scopeEmployeeIds` lets callers restrict to a manager's subtree or a
 * department; pass null/undefined to include every active employee in the tenant.
 */
export async function getBirthdaysInWindow(
    tenantId: string,
    days: number,
    scopeEmployeeIds: string[] | null,
) {
    if (scopeEmployeeIds && scopeEmployeeIds.length === 0) return []
    const conds = [
        eq(employees.tenantId, tenantId),
        eq(employees.isArchived, false),
        isNotNull(employees.dateOfBirth),
    ]
    if (scopeEmployeeIds) {
        const inList = sql`(${sql.join(scopeEmployeeIds.map(id => sql`${id}`), sql`, `)})`
        conds.push(sql`${employees.id} IN ${inList}`)
    }

    const rows = await db
        .select({
            firstName: employees.firstName,
            lastName: employees.lastName,
            employeeNo: employees.employeeNo,
            department: employees.department,
            avatarUrl: employees.avatarUrl,
            dateOfBirth: employees.dateOfBirth,
        })
        .from(employees)
        .where(and(...conds))

    return rows
        .map(r => {
            if (!r.dateOfBirth) return null
            const d = new Date(r.dateOfBirth)
            const meta = attachBirthdayMeta({
                day: d.getUTCDate(),
                month: d.getUTCMonth() + 1,
                name: `${r.firstName} ${r.lastName}`.trim(),
                employeeNo: r.employeeNo,
                department: r.department ?? '',
                avatarUrl: r.avatarUrl ?? null,
            })
            return meta
        })
        .filter((b): b is NonNullable<typeof b> => !!b && b.daysUntil <= days)
        .sort((a, b) => a.daysUntil - b.daysUntil)
}

export async function getWorkAnniversaries(tenantId: string, month?: number) {
    const m = month ?? new Date().getMonth() + 1
    const currentYear = new Date().getFullYear()
    const rows = await db
        .select({
            firstName: employees.firstName,
            lastName: employees.lastName,
            employeeNo: employees.employeeNo,
            department: employees.department,
            joinDate: employees.joinDate,
        })
        .from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            inArray(employees.status, WORKING_STATUSES as unknown as string[]),
            isNotNull(employees.joinDate),
            sql`EXTRACT(MONTH FROM ${employees.joinDate}::date) = ${m}`,
            sql`EXTRACT(YEAR FROM ${employees.joinDate}::date) < ${currentYear}`,
        ))
        .orderBy(sql`EXTRACT(YEAR FROM ${employees.joinDate}::date)`)
    return rows.map(r => {
        const joinYear = r.joinDate ? new Date(r.joinDate).getUTCFullYear() : currentYear
        return {
            name: `${r.firstName} ${r.lastName}`.trim(),
            employeeNo: r.employeeNo,
            department: r.department ?? '',
            joinYear,
            years: currentYear - joinYear,
        }
    })
}

export async function getOnboardingSummary(tenantId: string) {
    const [{ active }] = await db
        .select({ active: count() })
        .from(onboardingChecklists)
        .where(eq(onboardingChecklists.tenantId, tenantId))

    const today = new Date().toISOString().split('T')[0]
    const [{ overdue }] = await db
        .select({ overdue: count() })
        .from(onboardingSteps)
        .innerJoin(onboardingChecklists, eq(onboardingSteps.checklistId, onboardingChecklists.id))
        .where(
            and(
                eq(onboardingChecklists.tenantId, tenantId),
                eq(onboardingSteps.status, 'overdue'),
                sql`${onboardingSteps.dueDate} < ${today}`,
            )
        )

    return { active: Number(active), overdue: Number(overdue) }
}
