import { eq, and, count, lte, sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { employees } from '../../db/schema/index.js'

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
