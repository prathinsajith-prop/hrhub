import { eq, and, count, desc, gte, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { employees, recruitmentJobs, visaApplications, leaveRequests, notifications, payrollRuns, onboardingChecklists, onboardingSteps } from '../../db/schema/index.js'

export async function getDashboardKPIs(tenantId: string) {
    const [{ totalEmployees }] = await db.select({ totalEmployees: count() }).from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false)))

    const [{ openJobs }] = await db.select({ openJobs: count() }).from(recruitmentJobs)
        .where(and(eq(recruitmentJobs.tenantId, tenantId), eq(recruitmentJobs.status, 'open')))

    const [{ activeVisas }] = await db.select({ activeVisas: count() }).from(visaApplications)
        .where(and(eq(visaApplications.tenantId, tenantId), eq(visaApplications.status, 'entry_permit')))
    const [{ pendingLeave }] = await db.select({ pendingLeave: count() }).from(leaveRequests)
        .where(and(eq(leaveRequests.tenantId, tenantId), eq(leaveRequests.status, 'pending')))

    // Expiring visas in next 90 days
    const today = new Date().toISOString().split('T')[0]
    const in90 = new Date(); in90.setDate(in90.getDate() + 90)
    const cutoff = in90.toISOString().split('T')[0]

    const expiringVisas = await db.select().from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
        ))
        .then(rows => rows.filter(e => e.visaExpiry && e.visaExpiry >= today && e.visaExpiry <= cutoff).length)

    return {
        totalEmployees: Number(totalEmployees),
        openJobs: Number(openJobs),
        activeVisas: Number(activeVisas),
        pendingLeave: Number(pendingLeave),
        expiringVisas,
    }
}

export async function getRecentNotifications(tenantId: string, userId: string, limit = 5) {
    return db.select().from(notifications)
        .where(and(eq(notifications.tenantId, tenantId), eq(notifications.userId, userId)))
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
                eq(employees.status, 'active'),
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

    const [{ total }] = await db
        .select({ total: count() })
        .from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            eq(employees.status, 'active'),
        ))

    const [{ emiratis }] = await db
        .select({ emiratis: count() })
        .from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            eq(employees.status, 'active'),
            eq(employees.emiratisationCategory, 'emirati'),
        ))

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
