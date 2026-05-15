import { and, asc, eq, gte, lte } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { db } from '../../db/client.js'
import { publicHolidays } from '../../db/schema/index.js'

export default async function holidaysRoutes(fastify: FastifyInstance) {
    const auth = { preHandler: [(fastify as any).authenticate] }

    // Holidays barely change — let the browser/CDN cache them for 5 minutes.
    const HOLIDAYS_CACHE_HEADER = 'private, max-age=300'

    // GET /api/v1/holidays?year=2026  (defaults to current year if omitted)
    fastify.get('/', { ...auth }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const q = request.query as { year?: string; from?: string; to?: string }
        const conds: any[] = [eq(publicHolidays.tenantId, tenantId)]

        if (q?.from) conds.push(gte(publicHolidays.date, q.from))
        if (q?.to) conds.push(lte(publicHolidays.date, q.to))
        if (!q?.from && !q?.to) {
            const year = Number(q?.year ?? new Date().getFullYear())
            conds.push(eq(publicHolidays.year, year))
        }

        const rows = await db.select().from(publicHolidays).where(and(...conds)).orderBy(asc(publicHolidays.date))
        reply.header('Cache-Control', HOLIDAYS_CACHE_HEADER)
        return reply.send({ data: rows })
    })

    // GET /api/v1/holidays/upcoming?days=60 — next holidays from today, capped by days window
    fastify.get('/upcoming', { ...auth }, async (request: any, reply: any) => {
        const tenantId = request.user.tenantId
        const q = request.query as { days?: string; limit?: string }
        const today = new Date().toISOString().slice(0, 10)
        const days = Math.min(365, Math.max(1, Number(q?.days ?? 90)))
        const until = new Date()
        until.setDate(until.getDate() + days)
        const untilISO = until.toISOString().slice(0, 10)
        const limit = Math.min(20, Math.max(1, Number(q?.limit ?? 5)))

        const rows = await db
            .select()
            .from(publicHolidays)
            .where(and(eq(publicHolidays.tenantId, tenantId), gte(publicHolidays.date, today), lte(publicHolidays.date, untilISO)))
            .orderBy(asc(publicHolidays.date))
            .limit(limit)

        reply.header('Cache-Control', HOLIDAYS_CACHE_HEADER)
        return reply.send({ data: rows })
    })
}
