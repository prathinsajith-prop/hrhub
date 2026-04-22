import { eq, and, count, lte, gte, sql, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { employees, payrollRuns } from '../../db/schema/index.js'

export async function getHeadcountReport(tenantId: string) {
    const all = await db
        .select({
            id: employees.id,
            fullName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            department: employees.department,
            designation: employees.designation,
            nationality: employees.nationality,
            status: employees.status,
            joinDate: employees.joinDate,
            visaExpiry: employees.visaExpiry,
            emiratisationCategory: employees.emiratisationCategory,
        })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false)))
        .orderBy(desc(employees.createdAt))

    const byStatus: Record<string, number> = {}
    const byDepartment: Record<string, number> = {}
    const byNationality: Record<string, number> = {}

    for (const e of all) {
        byStatus[e.status ?? 'unknown'] = (byStatus[e.status ?? 'unknown'] ?? 0) + 1
        byDepartment[e.department ?? 'Unassigned'] = (byDepartment[e.department ?? 'Unassigned'] ?? 0) + 1
        byNationality[e.nationality ?? 'Unknown'] = (byNationality[e.nationality ?? 'Unknown'] ?? 0) + 1
    }

    return {
        total: all.length,
        byStatus: Object.entries(byStatus).map(([label, count]) => ({ label, count })),
        byDepartment: Object.entries(byDepartment).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
        byNationality: Object.entries(byNationality).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 15),
        employees: all,
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
            fullName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
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
