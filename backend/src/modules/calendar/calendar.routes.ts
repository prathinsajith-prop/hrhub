import { listVisas } from '../visa/visa.service.js'
import { listDocuments } from '../documents/documents.service.js'
import { listLeaveRequests } from '../leave/leave.service.js'
import { getReviews } from '../performance/performance.service.js'
import { db } from '../../db/index.js'
import { publicHolidays } from '../../db/schema/index.js'
import { eq, and, inArray, asc } from 'drizzle-orm'

export default async function calendarRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }

    // GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
    // Returns all calendar event types in a single round trip.
    fastify.get('/calendar', { ...auth, schema: { tags: ['Calendar'] } }, async (request: any, reply: any) => {
        const { from, to } = request.query as Record<string, string>
        const tenantId: string = request.user.tenantId

        // Derive years covered by the visible range so holiday queries are correct
        // when the range straddles a year boundary (e.g. Dec → Jan).
        const startYear = from ? new Date(from).getFullYear() : new Date().getFullYear()
        const endYear = to ? new Date(to).getFullYear() : startYear
        const years = startYear === endYear ? [startYear] : [startYear, endYear]

        const [visaResult, docResult, leaveResult, reviews, holidayRows] = await Promise.all([
            listVisas(tenantId, { from, to, limit: 500, offset: 0 }),
            listDocuments(tenantId, { from, to, limit: 500, offset: 0 }),
            listLeaveRequests(tenantId, { status: 'approved', from, to, limit: 500, offset: 0 }),
            getReviews(tenantId, { from, to, limit: 500, offset: 0 }),
            db
                .select()
                .from(publicHolidays)
                .where(and(
                    eq(publicHolidays.tenantId, tenantId),
                    inArray(publicHolidays.year, years),
                ))
                .orderBy(asc(publicHolidays.date)),
        ])

        return reply.send({
            visas: visaResult.data,
            documents: docResult.data,
            leaves: leaveResult.data,
            reviews,
            holidays: holidayRows,
        })
    })
}
