import { db } from '../../db/index.js'
import { performanceReviews } from '../../db/schema/index.js'
import { eq, and, desc } from 'drizzle-orm'

export async function getReviews(tenantId: string, params: { employeeId?: string; limit?: number; offset?: number }) {
    const { employeeId, limit = 20, offset = 0 } = params
    const conditions = [eq(performanceReviews.tenantId, tenantId)]
    if (employeeId) conditions.push(eq(performanceReviews.employeeId, employeeId))

    const rows = await db.select().from(performanceReviews)
        .where(and(...conditions))
        .orderBy(desc(performanceReviews.createdAt))
        .limit(limit)
        .offset(offset)
    return rows
}

export async function createReview(tenantId: string, reviewerId: string, data: {
    employeeId: string
    period: string
    reviewDate?: string
    overallRating?: number
    qualityScore?: number
    productivityScore?: number
    teamworkScore?: number
    attendanceScore?: number
    initiativeScore?: number
    strengths?: string
    improvements?: string
    goals?: string
    managerComments?: string
}) {
    const [review] = await db.insert(performanceReviews).values({
        tenantId,
        reviewerId,
        ...data,
    }).returning()
    return review
}

export async function updateReview(tenantId: string, id: string, data: Partial<{
    overallRating: number
    qualityScore: number
    productivityScore: number
    teamworkScore: number
    attendanceScore: number
    initiativeScore: number
    strengths: string
    improvements: string
    goals: string
    managerComments: string
    employeeComments: string
    status: 'draft' | 'submitted' | 'acknowledged' | 'completed'
    reviewDate: string
}>) {
    const [review] = await db.update(performanceReviews)
        .set({ ...data, updatedAt: new Date() })
        .where(and(eq(performanceReviews.id, id), eq(performanceReviews.tenantId, tenantId)))
        .returning()
    return review
}

export async function deleteReview(tenantId: string, id: string) {
    await db.delete(performanceReviews)
        .where(and(eq(performanceReviews.id, id), eq(performanceReviews.tenantId, tenantId)))
}
