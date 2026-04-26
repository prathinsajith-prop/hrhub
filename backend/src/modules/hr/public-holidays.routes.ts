import { db } from '../../db/index.js'
import { publicHolidays } from '../../db/schema/index.js'
import { eq, and, asc } from 'drizzle-orm'

// UAE default public holidays (month-day format, applied per year)
const UAE_DEFAULT_HOLIDAYS = [
    { name: "New Year's Day", month: 1, day: 1 },
    { name: 'Isra Mi\'raj (approx)', month: 1, day: 27 },
    { name: 'Commemoration Day', month: 12, day: 1 },
    { name: 'National Day', month: 12, day: 2 },
    { name: 'National Day Holiday', month: 12, day: 3 },
]

export default async function publicHolidaysRoutes(fastify: any): Promise<void> {
    const auth = { preHandler: [fastify.authenticate] }
    const hrAdmin = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /hr/public-holidays?year=2026
    fastify.get('/public-holidays', { ...auth, schema: { tags: ['HR'] } }, async (request: any, reply: any) => {
        const year = Number(request.query?.year ?? new Date().getFullYear())
        const rows = await db
            .select()
            .from(publicHolidays)
            .where(and(
                eq(publicHolidays.tenantId, request.user.tenantId),
                eq(publicHolidays.year, year),
            ))
            .orderBy(asc(publicHolidays.date))
        return reply.send({ data: rows })
    })

    // POST /hr/public-holidays — add a holiday
    fastify.post('/public-holidays', { ...hrAdmin, schema: { tags: ['HR'] } }, async (request: any, reply: any) => {
        const { name, date, isRecurring, notes } = request.body as {
            name: string; date: string; isRecurring?: boolean; notes?: string
        }
        if (!name || !date) return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'name and date are required' })

        const year = new Date(date).getFullYear()
        const [row] = await db.insert(publicHolidays).values({
            tenantId: request.user.tenantId,
            name,
            date,
            year,
            isRecurring: isRecurring ?? false,
            notes: notes ?? null,
        }).returning()
        return reply.code(201).send({ data: row })
    })

    // DELETE /hr/public-holidays/:id
    fastify.delete('/public-holidays/:id', { ...hrAdmin, schema: { tags: ['HR'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        await db.delete(publicHolidays)
            .where(and(eq(publicHolidays.id, id), eq(publicHolidays.tenantId, request.user.tenantId)))
        return reply.code(204).send()
    })

    // POST /hr/public-holidays/seed-uae — seed UAE defaults for a given year
    fastify.post('/public-holidays/seed-uae', { ...hrAdmin, schema: { tags: ['HR'] } }, async (request: any, reply: any) => {
        const year = Number((request.body as any)?.year ?? new Date().getFullYear())
        let seeded = 0
        for (const h of UAE_DEFAULT_HOLIDAYS) {
            const dateStr = `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`
            try {
                await db.insert(publicHolidays).values({
                    tenantId: request.user.tenantId,
                    name: h.name,
                    date: dateStr,
                    year,
                    isRecurring: true,
                }).onConflictDoNothing()
                seeded++
            } catch { /* skip duplicates */ }
        }
        return reply.send({ data: { seeded, year } })
    })
}
