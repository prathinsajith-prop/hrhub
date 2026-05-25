import { db } from '../../db/index.js'
import { publicHolidays } from '../../db/schema/index.js'
import { eq, and, asc, inArray, sql } from 'drizzle-orm'
import { asBool, asDate, asString, buildTemplateXlsx, validateRows, type RowResult } from '../../lib/bulk-import.js'

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

    // ─── Bulk Import: template + validate + commit ────────────────────────
    // Three-step UX: HR downloads the template, fills it in, validates
    // (server returns a preview with per-row errors), then commits the
    // valid subset. Mirrors the attendance/biometric pattern.

    const TEMPLATE_COLUMNS = [
        { key: 'date', width: 14 },
        { key: 'name', width: 32 },
        { key: 'country', width: 10 },
        { key: 'isRecurring', width: 12 },
        { key: 'notes', width: 30 },
    ]
    const SAMPLE_ROWS = [
        { date: '2026-01-01', name: "New Year's Day", country: 'UAE', isRecurring: true, notes: '' },
        { date: '2026-12-02', name: 'UAE National Day', country: 'UAE', isRecurring: true, notes: '' },
    ]

    interface ValidatedRow {
        date: string
        name: string
        country: string
        isRecurring: boolean
        notes: string | null
        year: number
    }

    function validateHolidayRow(row: Record<string, unknown>): { ok: true; value: ValidatedRow } | { ok: false; errors: string[] } {
        const errors: string[] = []
        const dateOut = asDate(row.date)
        if (dateOut.ok === false) errors.push(`date: ${dateOut.error}`)
        const name = asString(row.name)
        if (!name) errors.push('name is required')
        if (name && name.length > 200) errors.push('name must be ≤ 200 chars')
        if (errors.length > 0 || dateOut.ok === false || !name) {
            return { ok: false, errors }
        }
        return {
            ok: true,
            value: {
                date: dateOut.value,
                name,
                country: asString(row.country) ?? 'UAE',
                isRecurring: asBool(row.isRecurring),
                notes: asString(row.notes),
                year: Number(dateOut.value.slice(0, 4)),
            },
        }
    }

    // GET /hr/public-holidays/import/template — downloadable .xlsx
    fastify.get('/public-holidays/import/template', { ...hrAdmin, schema: { tags: ['HR'] } }, async (_request: any, reply: any) => {
        const buf = buildTemplateXlsx({
            sheetName: 'Public Holidays',
            columns: TEMPLATE_COLUMNS,
            sampleRows: SAMPLE_ROWS,
        })
        return reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', 'attachment; filename="public-holidays-template.xlsx"')
            .send(buf)
    })

    // POST /hr/public-holidays/import/validate
    // Body: { rows: Array<object> }
    // Returns: { rows: RowResult[], summary: { total, ok, invalid, duplicate } }
    fastify.post('/public-holidays/import/validate', { ...hrAdmin, schema: { tags: ['HR'] } }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as { rows?: Array<Record<string, unknown>> }
        if (!Array.isArray(body.rows)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must be an array' })
        }
        const validated = validateRows(body.rows, validateHolidayRow)

        // Also flag rows whose date already exists for this tenant (duplicate
        // → would conflict with the uq_public_holidays_tenant_date unique
        // index). Cheaper than per-row DB hits.
        const okDates = validated.filter((r) => r.ok && r.value).map((r) => (r.value as ValidatedRow).date)
        const existing = okDates.length > 0
            ? new Set(
                (await db.select({ date: publicHolidays.date })
                    .from(publicHolidays)
                    .where(and(
                        eq(publicHolidays.tenantId, request.user.tenantId),
                        inArray(publicHolidays.date, okDates),
                    ))
                ).map((r) => r.date),
            )
            : new Set<string>()
        // Also flag intra-batch dupes (same date appearing twice in the file).
        const seenInBatch = new Set<string>()
        const rowsWithDupes: Array<RowResult<ValidatedRow> & { duplicate?: boolean }> = validated.map((r) => {
            if (!r.ok || !r.value) return r
            const d = r.value.date
            const dupExisting = existing.has(d)
            const dupBatch = seenInBatch.has(d)
            seenInBatch.add(d)
            if (dupExisting || dupBatch) {
                return {
                    ...r,
                    ok: false,
                    duplicate: true,
                    errors: [...r.errors, dupExisting ? 'date already exists in your tenant' : 'duplicate date in this file'],
                }
            }
            return r
        })

        const summary = {
            total: rowsWithDupes.length,
            ok: rowsWithDupes.filter((r) => r.ok).length,
            invalid: rowsWithDupes.filter((r) => !r.ok && !r.duplicate).length,
            duplicate: rowsWithDupes.filter((r) => r.duplicate).length,
        }
        return reply.send({ data: { rows: rowsWithDupes, summary } })
    })

    // POST /hr/public-holidays/import/commit
    // Body: { rows: Array<{ date, name, country?, isRecurring?, notes? }> }
    // Writes valid rows in one transaction; skips duplicates idempotently.
    fastify.post('/public-holidays/import/commit', { ...hrAdmin, schema: { tags: ['HR'] } }, async (request: any, reply: any) => {
        const body = (request.body ?? {}) as { rows?: Array<Record<string, unknown>> }
        if (!Array.isArray(body.rows) || body.rows.length === 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must be a non-empty array' })
        }
        const validated = validateRows(body.rows, validateHolidayRow)
        const okRows = validated.filter((r) => r.ok && r.value) as Array<{ rowNumber: number; value: ValidatedRow }>
        if (okRows.length === 0) {
            return reply.send({ data: { inserted: 0, skipped: 0 } })
        }
        const values = okRows.map((r) => ({
            tenantId: request.user.tenantId,
            name: r.value.name,
            date: r.value.date,
            year: r.value.year,
            country: r.value.country,
            isRecurring: r.value.isRecurring,
            notes: r.value.notes,
        }))
        const inserted = await db
            .insert(publicHolidays)
            .values(values)
            // The unique index `uq_public_holidays_tenant_date` blocks duplicates
            // at the DB level — `onConflictDoNothing` makes the commit idempotent
            // so a re-run of the same file is a safe no-op.
            .onConflictDoNothing({ target: [publicHolidays.tenantId, publicHolidays.date] })
            .returning({ id: publicHolidays.id })
        return reply.code(201).send({
            data: { inserted: inserted.length, skipped: okRows.length - inserted.length },
        })
    })
}

// Suppress unused-import warning when the file's tsc strictness flags it —
// `sql` is exported for future use.
void sql
