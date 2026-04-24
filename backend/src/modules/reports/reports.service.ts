import { eq, and, count, lte, gte, sql, desc, isNotNull } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { employees, payrollRuns } from '../../db/schema/index.js'

export async function getHeadcountReport(tenantId: string) {
    // Use SQL GROUP BY instead of loading all rows into JS memory (BUG-03)
    const baseWhere = and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false))

    const [
        [{ total }],
        byStatusRows,
        byDeptRows,
        byNatRows,
    ] = await Promise.all([
        db.select({ total: count() }).from(employees).where(baseWhere),
        db.select({ label: employees.status, count: count() })
            .from(employees).where(baseWhere)
            .groupBy(employees.status),
        db.select({ label: employees.department, count: count() })
            .from(employees).where(baseWhere)
            .groupBy(employees.department)
            .orderBy(desc(count())),
        db.select({ label: employees.nationality, count: count() })
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
}

export async function getPayrollSummaryReport(tenantId: string) {
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
        .where(eq(payrollRuns.tenantId, tenantId))
        .orderBy(desc(payrollRuns.year), desc(payrollRuns.month))
        .limit(12)

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const trend = runs.map(r => ({
        period: `${months[(r.month ?? 1) - 1]} ${r.year}`,
        gross: Number(r.totalGross ?? 0),
        net: Number(r.totalNet ?? 0),
        deductions: Number(r.totalDeductions ?? 0),
        headcount: r.employeeCount ?? 0,
        status: r.status,
    }))

    const ytdGross = trend.filter(r => r.period.includes(String(new Date().getFullYear()))).reduce((s, r) => s + r.gross, 0)
    const ytdNet = trend.filter(r => r.period.includes(String(new Date().getFullYear()))).reduce((s, r) => s + r.net, 0)

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

    return {
        total: expiring.length,
        expired: expired.length,
        critical: critical.length,
        urgent: urgent.length,
        normal: normal.length,
        employees: expiring.map(e => ({
            ...e,
            daysLeft: e.visaExpiry
                ? Math.ceil((new Date(e.visaExpiry).getTime() - Date.now()) / 86400000)
                : null,
            urgency: e.visaExpiry
                ? (e.visaExpiry < today ? 'expired' : (() => {
                    const d = Math.ceil((new Date(e.visaExpiry).getTime() - Date.now()) / 86400000)
                    return d <= 30 ? 'critical' : d <= 60 ? 'urgent' : 'normal'
                })())
                : 'unknown',
        })),
    }
}
