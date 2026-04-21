import { eq, and, count, desc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { employees, recruitmentJobs, visaApplications, leaveRequests, notifications } from '../../db/schema/index.js'

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
