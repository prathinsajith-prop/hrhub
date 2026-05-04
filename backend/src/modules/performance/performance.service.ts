import { db } from '../../db/index.js'
import { performanceReviews } from '../../db/schema/index.js'
import { eq, and, desc, gte, lte, isNull, sql } from 'drizzle-orm'

export async function getReviews(tenantId: string, params: { employeeId?: string; from?: string; to?: string; limit?: number; offset?: number }) {
    const { employeeId, from, to, limit = 20, offset = 0 } = params
    const conditions = [eq(performanceReviews.tenantId, tenantId), isNull(performanceReviews.deletedAt)]
    if (employeeId) conditions.push(eq(performanceReviews.employeeId, employeeId))
    if (from) conditions.push(gte(performanceReviews.reviewDate, from))
    if (to) conditions.push(lte(performanceReviews.reviewDate, to))

    const rows = await db.select({
        id: performanceReviews.id,
        tenantId: performanceReviews.tenantId,
        employeeId: performanceReviews.employeeId,
        reviewerId: performanceReviews.reviewerId,
        period: performanceReviews.period,
        reviewDate: performanceReviews.reviewDate,
        status: performanceReviews.status,
        overallRating: performanceReviews.overallRating,
        qualityScore: performanceReviews.qualityScore,
        productivityScore: performanceReviews.productivityScore,
        teamworkScore: performanceReviews.teamworkScore,
        attendanceScore: performanceReviews.attendanceScore,
        initiativeScore: performanceReviews.initiativeScore,
        strengths: performanceReviews.strengths,
        improvements: performanceReviews.improvements,
        goals: performanceReviews.goals,
        managerComments: performanceReviews.managerComments,
        employeeComments: performanceReviews.employeeComments,
        createdAt: performanceReviews.createdAt,
        updatedAt: performanceReviews.updatedAt,
        deletedAt: performanceReviews.deletedAt,
        total: sql<number>`COUNT(*) OVER()`,
    }).from(performanceReviews)
        .where(and(...conditions))
        .orderBy(desc(performanceReviews.createdAt))
        .limit(limit)
        .offset(offset)

    const total = rows[0]?.total ?? 0
    const data = rows.map(({ total: _, ...r }) => r)
    return { data, total, limit, offset, hasMore: offset + limit < total }
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
        .where(and(eq(performanceReviews.id, id), eq(performanceReviews.tenantId, tenantId), isNull(performanceReviews.deletedAt)))
        .returning()
    return review
}

export async function deleteReview(tenantId: string, id: string) {
    const [row] = await db.update(performanceReviews)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(performanceReviews.id, id), eq(performanceReviews.tenantId, tenantId), isNull(performanceReviews.deletedAt)))
        .returning({ id: performanceReviews.id })
    return row ?? null
}
