import { and, desc, eq, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { employeeWarnings, performanceReviews, users } from '../../db/schema/index.js'
import { e403, e404 } from '../../lib/errors.js'
import { generateDownloadUrl } from '../../lib/s3.js'
import { parseUuidParam } from '../../lib/validation.js'
import { canAccessEmployee } from '../../lib/scoping.js'

const VISIBLE_STATUSES = ['submitted', 'acknowledged', 'completed'] as const

/**
 * Pull non-draft reviews for an employee, joined with the reviewer's name.
 * Drafts are deliberately excluded — they're work-in-progress on the admin
 * side and the employee shouldn't see them yet. Newest first.
 */
async function getReviewsForEmployee(tenantId: string, employeeId: string) {
    return db
        .select({
            id: performanceReviews.id,
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
            reviewerName: users.name,
        })
        .from(performanceReviews)
        .leftJoin(users, eq(users.id, performanceReviews.reviewerId))
        .where(
            and(
                eq(performanceReviews.tenantId, tenantId),
                eq(performanceReviews.employeeId, employeeId),
                isNull(performanceReviews.deletedAt),
            ),
        )
        .orderBy(desc(performanceReviews.createdAt))
        .then((rows) =>
            // Hide drafts on the read path — simpler than encoding the IN clause in Drizzle.
            rows.filter((r) => (VISIBLE_STATUSES as readonly string[]).includes(r.status)),
        )
}

async function getWarningsForEmployee(tenantId: string, employeeId: string) {
    return db
        .select({
            id: employeeWarnings.id,
            issueDate: employeeWarnings.issueDate,
            expiryDate: employeeWarnings.expiryDate,
            reason: employeeWarnings.reason,
            documentFileName: employeeWarnings.documentFileName,
            hasFile: employeeWarnings.documentS3Key,
            createdByName: employeeWarnings.createdByName,
            createdAt: employeeWarnings.createdAt,
        })
        .from(employeeWarnings)
        .where(
            and(
                eq(employeeWarnings.tenantId, tenantId),
                eq(employeeWarnings.employeeId, employeeId),
            ),
        )
        .orderBy(desc(employeeWarnings.issueDate))
        .then((rows) => rows.map(({ hasFile, ...rest }) => ({ ...rest, hasFile: !!hasFile })))
}

export default async function performanceRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // GET /api/v1/performance/my — current user's reviews
    fastify.get('/my', { ...auth }, async (request: any, reply: any) => {
        const { employeeId, tenantId } = request.user
        if (!employeeId) return reply.send({ data: [] })
        const data = await getReviewsForEmployee(tenantId, employeeId)
        return reply.send({ data })
    })

    // GET /api/v1/performance/employee/:employeeId — manager viewing a team member's reviews
    fastify.get('/employee/:employeeId', { ...auth }, async (request: any, reply: any) => {
        const employeeId = parseUuidParam(request.params, 'employeeId', reply)
        if (!employeeId) return
        const user = request.user
        if (!(await canAccessEmployee(user, employeeId, request))) {
            return reply.code(403).send(e403('Not authorized to view this employee'))
        }
        const data = await getReviewsForEmployee(user.tenantId, employeeId)
        return reply.send({ data })
    })

    // GET /api/v1/performance/warnings/my — current user's warning letters
    fastify.get('/warnings/my', { ...auth }, async (request: any, reply: any) => {
        const { employeeId, tenantId } = request.user
        if (!employeeId) return reply.send({ data: [] })
        const data = await getWarningsForEmployee(tenantId, employeeId)
        return reply.send({ data })
    })

    // GET /api/v1/performance/warnings/employee/:employeeId — manager view
    fastify.get('/warnings/employee/:employeeId', { ...auth }, async (request: any, reply: any) => {
        const employeeId = parseUuidParam(request.params, 'employeeId', reply)
        if (!employeeId) return
        const user = request.user
        if (!(await canAccessEmployee(user, employeeId, request))) {
            return reply.code(403).send(e403('Not authorized to view this employee'))
        }
        const data = await getWarningsForEmployee(user.tenantId, employeeId)
        return reply.send({ data })
    })

    // GET /api/v1/performance/warnings/:id/download — presigned download for the warning letter PDF
    fastify.get('/warnings/:id/download', { ...auth }, async (request: any, reply: any) => {
        const id = parseUuidParam(request.params, 'id', reply)
        if (!id) return
        const user = request.user
        const [w] = await db
            .select()
            .from(employeeWarnings)
            .where(and(eq(employeeWarnings.tenantId, user.tenantId), eq(employeeWarnings.id, id)))
            .limit(1)
        if (!w) return reply.code(404).send(e404('Warning not found'))
        if (!w.documentS3Key) return reply.code(404).send(e404('No file attached to this warning'))
        // Owner OR a manager who can access the employee may download.
        const isOwner = w.employeeId === user.employeeId
        const canManagerAccess = await canAccessEmployee(user, w.employeeId, request)
        if (!isOwner && !canManagerAccess) {
            return reply.code(403).send(e403('Not authorized to download this warning'))
        }
        const url = await generateDownloadUrl(w.documentS3Key, 3600, w.documentFileName ?? undefined)
        return reply.redirect(302, url)
    })
}
