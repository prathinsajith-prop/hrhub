import { eq, and, count, lte, gte, sql, isNotNull } from 'drizzle-orm'
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
    const todayStr = today.toISOString().split('T')[0]
    const in30 = new Date(today); in30.setDate(today.getDate() + 30)
    const in60 = new Date(today); in60.setDate(today.getDate() + 60)
    const in90 = new Date(today); in90.setDate(today.getDate() + 90)

    // Run all 3 queries in parallel — also add gte(today) lower bound so
    // already-expired employees and NULL dates are excluded (BUG-02)
    const [
        [visaExpiring30],
        [visaExpiring90],
        [passportExpiring60],
    ] = await Promise.all([
        db.select({ count: count() }).from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                isNotNull(employees.visaExpiry),
                gte(employees.visaExpiry, todayStr),
                lte(employees.visaExpiry, in30.toISOString().split('T')[0]),
            )),
        db.select({ count: count() }).from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                isNotNull(employees.visaExpiry),
                gte(employees.visaExpiry, todayStr),
                lte(employees.visaExpiry, in90.toISOString().split('T')[0]),
            )),
        db.select({ count: count() }).from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                isNotNull(employees.passportExpiry),
                gte(employees.passportExpiry, todayStr),
                lte(employees.passportExpiry, in60.toISOString().split('T')[0]),
            )),
    ])

    return {
        visaExpiring30Days: Number(visaExpiring30.count),
        visaExpiring90Days: Number(visaExpiring90.count),
        passportExpiring60Days: Number(passportExpiring60.count),
    }
}

export async function getComplianceReport(tenantId: string) {
    const today = new Date().toISOString().split('T')[0]
    const in30 = new Date(); in30.setDate(in30.getDate() + 30)
    const cutoff = in30.toISOString().split('T')[0]

    // Run all independent queries in parallel (P1-06)
    const [
        [{ total: totalRuns }],
        [{ compliant }],
        emi,
        [{ total: totalActive }],
        [{ expired }],
        [{ totalDocs }],
        [{ validDocs }],
        [{ expiringDocs }],
    ] = await Promise.all([
        db.select({ total: count() }).from(payrollRuns).where(eq(payrollRuns.tenantId, tenantId)),
        db.select({ compliant: count() }).from(payrollRuns).where(and(
            eq(payrollRuns.tenantId, tenantId),
            sql`${payrollRuns.status} IN ('wps_submitted', 'paid')`,
        )),
        getEmiratisationMetrics(tenantId),
        db.select({ total: count() }).from(employees)
            .where(and(eq(employees.tenantId, tenantId), eq(employees.isArchived, false), eq(employees.status, 'active'))),
        db.select({ expired: count() }).from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                eq(employees.status, 'active'),
                isNotNull(employees.visaExpiry),
                lte(employees.visaExpiry, today),
            )),
        db.select({ totalDocs: count() }).from(documents).where(eq(documents.tenantId, tenantId)),
        db.select({ validDocs: count() }).from(documents)
            .where(and(eq(documents.tenantId, tenantId), eq(documents.status, 'valid'))),
        db.select({ expiringDocs: count() }).from(documents)
            .where(and(eq(documents.tenantId, tenantId), isNotNull(documents.expiryDate), lte(documents.expiryDate, cutoff))),
    ])

    const wpsScore = Number(totalRuns) > 0 ? Math.round((Number(compliant) / Number(totalRuns)) * 100) : 100
    const emiScore = emi.target > 0 ? Math.min(100, Math.round((emi.percentage / emi.target) * 100)) : 100
    const visaScore = Number(totalActive) > 0
        ? Math.round(((Number(totalActive) - Number(expired)) / Number(totalActive)) * 100)
        : 100
    const docScore = Number(totalDocs) > 0 ? Math.round((Number(validDocs) / Number(totalDocs)) * 100) : 100

    const checks = [
        {
            label: 'WPS Compliance',
            score: wpsScore,
            status: wpsScore >= 98 ? 'pass' : wpsScore >= 80 ? 'warning' : 'fail',
            desc: Number(totalRuns) === 0
                ? 'No payroll runs yet'
                : `${Number(compliant)} of ${Number(totalRuns)} runs submitted via WPS`,
            route: '/payroll',
            counts: {
                total: Number(totalRuns),
                compliant: Number(compliant),
                nonCompliant: Number(totalRuns) - Number(compliant),
            },
        },
        {
            label: 'Emiratisation Ratio',
            score: emiScore,
            status: emi.status === 'compliant' ? 'pass' : 'warning',
            desc: `${emi.percentage}% vs ${emi.target}% MOHRE target`,
            route: '/employees',
            counts: {
                total: emi.total,
                emirati: emi.emirati,
                expat: emi.expat,
                gap: emi.gap,
            },
        },
        {
            label: 'Visa Validity',
            score: visaScore,
            status: Number(expired) === 0 ? 'pass' : 'warning',
            desc: Number(expired) === 0
                ? 'All active employees have valid visas'
                : `${Number(expired)} employee${Number(expired) === 1 ? '' : 's'} with expired visa`,
            route: '/visa',
            counts: {
                total: Number(totalActive),
                expired: Number(expired),
                valid: Number(totalActive) - Number(expired),
            },
        },
        {
            label: 'Document Completeness',
            score: docScore,
            status: docScore >= 95 ? 'pass' : 'warning',
            desc: Number(totalDocs) === 0
                ? 'No documents uploaded'
                : `${Number(validDocs)} of ${Number(totalDocs)} documents valid`,
            route: '/documents',
            counts: {
                total: Number(totalDocs),
                valid: Number(validDocs),
                invalid: Number(totalDocs) - Number(validDocs),
            },
        },
        {
            label: 'Expiring Soon',
            score: Number(expiringDocs) === 0 ? 100 : Math.max(0, 100 - Number(expiringDocs) * 5),
            status: Number(expiringDocs) === 0 ? 'pass' : 'warning',
            desc: Number(expiringDocs) === 0
                ? 'Nothing expiring in 30 days'
                : `${Number(expiringDocs)} document${Number(expiringDocs) === 1 ? '' : 's'} expiring in 30 days`,
            route: '/documents',
            counts: {
                expiringDocs: Number(expiringDocs),
            },
        },
    ]

    const overall = Math.round(checks.reduce((a, c) => a + c.score, 0) / checks.length)

    return { overall, checks }
}
