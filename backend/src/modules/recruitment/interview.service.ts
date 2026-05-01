import { db } from '../../db/index.js'
import { interviews, jobApplications } from '../../db/schema/index.js'
import { eq, and, isNull, getTableColumns } from 'drizzle-orm'

export async function scheduleInterview(tenantId: string, data: {
    applicationId: string
    interviewerUserId?: string
    scheduledAt: string
    durationMinutes?: number
    type?: 'video' | 'phone' | 'in_person' | 'technical'
    link?: string
    location?: string
    notes?: string
}) {
    const [interview] = await db.insert(interviews).values({
        tenantId,
        applicationId: data.applicationId,
        interviewerUserId: data.interviewerUserId,
        scheduledAt: new Date(data.scheduledAt),
        durationMinutes: String(data.durationMinutes ?? 60),
        type: data.type ?? 'video',
        link: data.link,
        location: data.location,
        notes: data.notes,
    }).returning()
    return interview
}

export async function getInterviewsForApplication(tenantId: string, applicationId: string) {
    // Scope by tenantId via a join to prevent IDOR across tenants
    return db.select(getTableColumns(interviews))
        .from(interviews)
        .innerJoin(jobApplications, and(
            eq(jobApplications.id, interviews.applicationId),
            eq(jobApplications.tenantId, tenantId),
        ))
        .where(and(eq(interviews.applicationId, applicationId), isNull(interviews.deletedAt)))
}

export async function getInterviewsByTenant(tenantId: string) {
    return db.select().from(interviews).where(and(eq(interviews.tenantId, tenantId), isNull(interviews.deletedAt)))
}

export async function updateInterviewStatus(tenantId: string, id: string, data: {
    status?: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
    feedback?: string
    rating?: '1' | '2' | '3' | '4' | '5'
    passed?: boolean
}) {
    const [interview] = await db.update(interviews)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(interviews.id, id), eq(interviews.tenantId, tenantId), isNull(interviews.deletedAt)))
        .returning()
    return interview
}

export async function deleteInterview(tenantId: string, id: string) {
    await db.update(interviews)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(interviews.id, id), eq(interviews.tenantId, tenantId), isNull(interviews.deletedAt)))
}
