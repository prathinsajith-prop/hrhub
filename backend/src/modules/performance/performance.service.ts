import { db } from '../../db/index.js'
import { performanceReviews, employees } from '../../db/schema/index.js'
import { eq, and, desc, gte, lte, isNull, sql, ilike, or } from 'drizzle-orm'
import { parseFilterString, buildDrizzleFilters } from '../../lib/filters.js'

const PERF_FIELD_MAP = {
    status: performanceReviews.status,
    reviewDate: performanceReviews.reviewDate,
    overallRating: performanceReviews.overallRating,
}
const PERF_ALLOWED = new Set(Object.keys(PERF_FIELD_MAP))

export async function getReviews(tenantId: string, params: { employeeId?: string; status?: string; from?: string; to?: string; search?: string; filter?: string; limit?: number; offset?: number }) {
    const { employeeId, status, from, to, search, filter, limit = 20, offset = 0 } = params
    const conditions = [eq(performanceReviews.tenantId, tenantId), isNull(performanceReviews.deletedAt)]
    if (employeeId) conditions.push(eq(performanceReviews.employeeId, employeeId))
    if (status) conditions.push(eq(performanceReviews.status, status as never))
    if (from) conditions.push(gte(performanceReviews.reviewDate, from))
    if (to) conditions.push(lte(performanceReviews.reviewDate, to))
    if (search) {
        const q = `%${search.trim()}%`
        conditions.push(or(
            ilike(sql`${employees.firstName} || ' ' || ${employees.lastName}`, q),
            ilike(employees.firstName, q),
            ilike(employees.lastName, q),
        )!)
    }
    if (filter) {
        buildDrizzleFilters(parseFilterString(filter), PERF_FIELD_MAP, PERF_ALLOWED).forEach(c => conditions.push(c))
    }

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
        .leftJoin(employees, eq(employees.id, performanceReviews.employeeId))
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
