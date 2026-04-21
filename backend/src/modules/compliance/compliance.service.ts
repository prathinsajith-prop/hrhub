import { eq, and, count, lte, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { employees, payrollRuns, documents } from '../../db/schema/index.js'

export async function getEmiratisationMetrics(tenantId: string) {
    const [{ total }] = await db.select({ total: count() }).from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false)))

    const [{ emirati }] = await db.select({ emirati: count() }).from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            eq(employees.emiratisationCategory, 'emirati'),
        ))

    const totalNum = Number(total)
    const emiratiNum = Number(emirati)
    const percentage = totalNum > 0 ? Math.round((emiratiNum / totalNum) * 100) : 0

    // UAE Emiratisation target: 2% of workforce per year (escalating)
    const target = 2

    return {
        total: totalNum,
        emirati: emiratiNum,
        expat: totalNum - emiratiNum,
        percentage,
        target,
        gap: Math.max(0, Math.ceil((target / 100) * totalNum) - emiratiNum),
        status: percentage >= target ? 'compliant' : 'non_compliant',
    }
}

export async function getExpiryAlerts(tenantId: string) {
    const today = new Date()
    const in30 = new Date(today); in30.setDate(today.getDate() + 30)
    const in60 = new Date(today); in60.setDate(today.getDate() + 60)
    const in90 = new Date(today); in90.setDate(today.getDate() + 90)

    const [visaExpiring30] = await db.select({ count: count() }).from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false), lte(employees.visaExpiry, in30.toISOString().split('T')[0])))

    const [visaExpiring90] = await db.select({ count: count() }).from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false), lte(employees.visaExpiry, in90.toISOString().split('T')[0])))

    const [passportExpiring60] = await db.select({ count: count() }).from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false), lte(employees.passportExpiry, in60.toISOString().split('T')[0])))

    return {
        visaExpiring30Days: Number(visaExpiring30.count),
        visaExpiring90Days: Number(visaExpiring90.count),
        passportExpiring60Days: Number(passportExpiring60.count),
    }
}

export async function getComplianceReport(tenantId: string) {
    // ── WPS: ratio of recent payroll runs that reached wps_submitted or paid ──
    const [{ total: totalRuns }] = await db.select({ total: count() }).from(payrollRuns)
        .where(eq(payrollRuns.tenantId, tenantId))
    const [{ compliant }] = await db.select({ compliant: count() }).from(payrollRuns)
        .where(and(
            eq(payrollRuns.tenantId, tenantId),
            sql`${payrollRuns.status} IN ('wps_submitted', 'paid')`,
        ))
    const wpsScore = Number(totalRuns) > 0 ? Math.round((Number(compliant) / Number(totalRuns)) * 100) : 100

    // ── Emiratisation ──
    const emi = await getEmiratisationMetrics(tenantId)
    const emiScore = emi.target > 0
        ? Math.min(100, Math.round((emi.percentage / emi.target) * 100))
        : 100

    // ── Visa validity: active employees without expired visas ──
    const today = new Date().toISOString().split('T')[0]
    const [{ total: totalActive }] = await db.select({ total: count() }).from(employees)
        .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false), eq(employees.status, 'active')))
    const [{ expired }] = await db.select({ expired: count() }).from(employees)
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            eq(employees.status, 'active'),
            lte(employees.visaExpiry, today),
        ))
    const visaScore = Number(totalActive) > 0
        ? Math.round(((Number(totalActive) - Number(expired)) / Number(totalActive)) * 100)
        : 100

    // ── Document completeness: valid vs total documents ──
    const [{ totalDocs }] = await db.select({ totalDocs: count() }).from(documents)
        .where(eq(documents.tenantId, tenantId))
    const [{ validDocs }] = await db.select({ validDocs: count() }).from(documents)
        .where(and(eq(documents.tenantId, tenantId), eq(documents.status, 'valid')))
    const docScore = Number(totalDocs) > 0
        ? Math.round((Number(validDocs) / Number(totalDocs)) * 100)
        : 100

    // ── Expiring soon: documents/visas needing attention soon ──
    const in30 = new Date(); in30.setDate(in30.getDate() + 30)
    const cutoff = in30.toISOString().split('T')[0]
    const [{ expiringDocs }] = await db.select({ expiringDocs: count() }).from(documents)
        .where(and(eq(documents.tenantId, tenantId), lte(documents.expiryDate, cutoff)))

    const checks = [
        {
            label: 'WPS Compliance',
            score: wpsScore,
            status: wpsScore >= 98 ? 'pass' : wpsScore >= 80 ? 'warning' : 'fail',
            desc: Number(totalRuns) === 0
                ? 'No payroll runs yet'
                : `${Number(compliant)} of ${Number(totalRuns)} runs submitted via WPS`,
        },
        {
            label: 'Emiratisation Ratio',
            score: emiScore,
            status: emi.status === 'compliant' ? 'pass' : 'warning',
            desc: `${emi.percentage}% vs ${emi.target}% MOHRE target`,
        },
        {
            label: 'Visa Validity',
            score: visaScore,
            status: Number(expired) === 0 ? 'pass' : 'warning',
            desc: Number(expired) === 0
                ? 'All active employees have valid visas'
                : `${Number(expired)} employee${Number(expired) === 1 ? '' : 's'} with expired visa`,
        },
        {
            label: 'Document Completeness',
            score: docScore,
            status: docScore >= 95 ? 'pass' : 'warning',
            desc: Number(totalDocs) === 0
                ? 'No documents uploaded'
                : `${Number(validDocs)} of ${Number(totalDocs)} documents valid`,
        },
        {
            label: 'Expiring Soon',
            score: Number(expiringDocs) === 0 ? 100 : Math.max(0, 100 - Number(expiringDocs) * 5),
            status: Number(expiringDocs) === 0 ? 'pass' : 'warning',
            desc: Number(expiringDocs) === 0
                ? 'Nothing expiring in 30 days'
                : `${Number(expiringDocs)} document${Number(expiringDocs) === 1 ? '' : 's'} expiring in 30 days`,
        },
    ]

    const overall = Math.round(checks.reduce((a, c) => a + c.score, 0) / checks.length)

    return { overall, checks }
}
