import { db } from '../../db/index.js'
import { interviews } from '../../db/schema/index.js'
import { eq, and } from 'drizzle-orm'

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

export async function getInterviewsForApplication(applicationId: string) {
    return db.select().from(interviews).where(eq(interviews.applicationId, applicationId))
}

export async function getInterviewsByTenant(tenantId: string) {
    return db.select().from(interviews).where(eq(interviews.tenantId, tenantId))
}

export async function updateInterviewStatus(tenantId: string, id: string, data: {
    status?: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
    feedback?: string
    rating?: '1' | '2' | '3' | '4' | '5'
    passed?: boolean
}) {
    const [interview] = await db.update(interviews)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(interviews.id, id), eq(interviews.tenantId, tenantId)))
        .returning()
    return interview
}

export async function deleteInterview(tenantId: string, id: string) {
    await db.update(interviews)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(interviews.id, id), eq(interviews.tenantId, tenantId)))
}
