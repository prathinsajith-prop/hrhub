import { z } from 'zod'
import { and, eq, inArray } from 'drizzle-orm'
import { listDesignations, createDesignation, updateDesignation, deleteDesignation } from './designations.service.js'
import { recordActivity } from '../audit/audit.service.js'
import { db } from '../../db/index.js'
import { designations } from '../../db/schema/index.js'
import { asBool, asInt, asString, buildTemplateXlsx, validateRows, type RowResult } from '../../lib/bulk-import.js'

const createSchema = z.object({
    name: z.string().min(1).max(120),
    sortOrder: z.number().int().optional(),
})

const updateSchema = z.object({
    name: z.string().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
})

export async function designationsRoutes(fastify: any) {
    const auth = { preHandler: [fastify.authenticate] }
    const adminAuth = { preHandler: [fastify.authenticate, fastify.requireRole('hr_manager', 'super_admin')] }

    // GET /api/v1/designations
    fastify.get('/designations', { ...auth, schema: { tags: ['Designations'] } }, async (req: any, reply: any) => {
        const data = await listDesignations(req.user.tenantId)
        return reply.send({ data })
    })

    // POST /api/v1/designations
    fastify.post('/designations', { ...adminAuth, schema: { tags: ['Designations'] } }, async (req: any, reply: any) => {
        const parsed = createSchema.safeParse(req.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        const data = await createDesignation(req.user.tenantId, parsed.data)
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'designation', entityId: data.id, entityName: data.name, action: 'create', ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => { })
        return reply.code(201).send({ data })
    })

    // PATCH /api/v1/designations/:id
    fastify.patch('/designations/:id', { ...adminAuth, schema: { tags: ['Designations'] } }, async (req: any, reply: any) => {
        const parsed = updateSchema.safeParse(req.body)
        if (!parsed.success) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid input', validationErrors: parsed.error.issues })
        }
        const data = await updateDesignation(req.user.tenantId, req.params.id, parsed.data)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Designation not found' })
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'designation', entityId: data.id, entityName: data.name, action: 'update', metadata: parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : undefined, ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => { })
        return reply.send({ data })
    })

    // DELETE /api/v1/designations/:id
    fastify.delete('/designations/:id', { ...adminAuth, schema: { tags: ['Designations'] } }, async (req: any, reply: any) => {
        const data = await deleteDesignation(req.user.tenantId, req.params.id)
        if (!data) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Designation not found' })
        recordActivity({ tenantId: req.user.tenantId, userId: req.user.id, actorName: req.user.name, actorRole: req.user.role, entityType: 'designation', entityId: req.params.id, action: 'delete', ipAddress: req.ip, userAgent: req.headers['user-agent'] }).catch(() => { })
        return reply.code(204).send()
    })

    // ─── Bulk Import: template + validate + commit ────────────────────────
    // Three-step UX matching the rest of the app (public holidays,
    // performance reviews, biometric punches): HR downloads the template,
    // fills it in, validates (server returns a preview with per-row errors),
    // then commits the valid subset. Designations are a flat lookup table —
    // ~10 LoC of validation per row, ~50 LoC for the three endpoints.

    const TEMPLATE_COLUMNS = [
        { key: 'name', width: 32 },
        { key: 'sortOrder', width: 12 },
        { key: 'isActive', width: 10 },
    ]
    const SAMPLE_ROWS = [
        { name: 'Software Engineer', sortOrder: 10, isActive: true },
        { name: 'Senior Software Engineer', sortOrder: 20, isActive: true },
        { name: 'Engineering Manager', sortOrder: 30, isActive: true },
    ]

    interface ValidatedRow {
        name: string
        sortOrder: number
        isActive: boolean
    }

    function validateDesignationRow(row: Record<string, unknown>): { ok: true; value: ValidatedRow } | { ok: false; errors: string[] } {
        const errors: string[] = []
        const name = asString(row.name)
        if (!name) errors.push('name is required')
        if (name && name.length > 120) errors.push('name must be ≤ 120 chars')
        // sortOrder is optional — default 0. When provided it must be a
        // non-negative integer up to a sane upper bound.
        let sortOrder = 0
        if (row.sortOrder !== undefined && row.sortOrder !== null && row.sortOrder !== '') {
            const r = asInt(row.sortOrder, { min: 0, max: 100_000 })
            if (r.ok === false) errors.push(`sortOrder: ${r.error}`)
            else sortOrder = r.value
        }
        if (errors.length > 0 || !name) return { ok: false, errors }
        return {
            ok: true,
            value: {
                name,
                sortOrder,
                isActive: row.isActive === undefined || row.isActive === null || row.isActive === ''
                    ? true
                    : asBool(row.isActive),
            },
        }
    }

    // GET /api/v1/designations/import/template — downloadable .xlsx
    fastify.get('/designations/import/template', { ...adminAuth, schema: { tags: ['Designations'] } }, async (_req: any, reply: any) => {
        const buf = buildTemplateXlsx({
            sheetName: 'Designations',
            columns: TEMPLATE_COLUMNS,
            sampleRows: SAMPLE_ROWS,
        })
        return reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', 'attachment; filename="designations-template.xlsx"')
            .send(buf)
    })

    // POST /api/v1/designations/import/validate
    // Body: { rows: Array<object> }
    // Returns: { rows: RowResult[], summary: { total, ok, invalid, duplicate } }
    fastify.post('/designations/import/validate', { ...adminAuth, schema: { tags: ['Designations'] } }, async (req: any, reply: any) => {
        const body = (req.body ?? {}) as { rows?: Array<Record<string, unknown>> }
        if (!Array.isArray(body.rows)) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must be an array' })
        }
        const validated = validateRows(body.rows, validateDesignationRow)

        // Flag rows whose name already exists for this tenant (would conflict
        // with the uq_designations_tenant_name unique index). One round-trip
        // for the whole batch keeps this O(1) regardless of row count.
        const okNames = validated.filter((r) => r.ok && r.value).map((r) => (r.value as ValidatedRow).name)
        const existing = okNames.length > 0
            ? new Set(
                (await db.select({ name: designations.name })
                    .from(designations)
                    .where(and(
                        eq(designations.tenantId, req.user.tenantId),
                        inArray(designations.name, okNames),
                    ))
                ).map((r) => r.name.toLowerCase()),
            )
            : new Set<string>()
        const seenInBatch = new Set<string>()
        const rowsWithDupes: Array<RowResult<ValidatedRow> & { duplicate?: boolean }> = validated.map((r) => {
            if (!r.ok || !r.value) return r
            const key = r.value.name.toLowerCase()
            const dupExisting = existing.has(key)
            const dupBatch = seenInBatch.has(key)
            seenInBatch.add(key)
            if (dupExisting || dupBatch) {
                return {
                    ...r,
                    ok: false,
                    duplicate: true,
                    errors: [...r.errors, dupExisting ? 'name already exists in your tenant' : 'duplicate name in this file'],
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

    // POST /api/v1/designations/import/commit
    // Body: { rows: Array<{ name, sortOrder?, isActive? }> }
    // Writes valid rows in a single insert; the uq_designations_tenant_name
    // unique index back-stops the commit (onConflictDoNothing makes a re-run
    // a safe no-op).
    fastify.post('/designations/import/commit', { ...adminAuth, schema: { tags: ['Designations'] } }, async (req: any, reply: any) => {
        const body = (req.body ?? {}) as { rows?: Array<Record<string, unknown>> }
        if (!Array.isArray(body.rows) || body.rows.length === 0) {
            return reply.code(400).send({ statusCode: 400, error: 'Bad Request', message: 'rows must be a non-empty array' })
        }
        const validated = validateRows(body.rows, validateDesignationRow)
        const okRows = validated.filter((r) => r.ok && r.value) as Array<{ rowNumber: number; value: ValidatedRow }>
        if (okRows.length === 0) {
            return reply.send({ data: { inserted: 0, skipped: 0 } })
        }
        const values = okRows.map((r) => ({
            tenantId: req.user.tenantId,
            name: r.value.name,
            sortOrder: r.value.sortOrder,
            isActive: r.value.isActive,
        }))
        const inserted = await db
            .insert(designations)
            .values(values)
            .onConflictDoNothing({ target: [designations.tenantId, designations.name] })
            .returning({ id: designations.id, name: designations.name })

        // Single bulk audit entry — recording every row individually would
        // flood the activity log for a 200-row import.
        recordActivity({
            tenantId: req.user.tenantId, userId: req.user.id,
            actorName: req.user.name, actorRole: req.user.role,
            entityType: 'designation', entityId: 'bulk',
            entityName: `Bulk import (${inserted.length} designations)`,
            action: 'create',
            metadata: { inserted: inserted.length, skipped: okRows.length - inserted.length },
            ipAddress: req.ip, userAgent: req.headers['user-agent'],
        }).catch(() => { })

        return reply.code(201).send({
            data: { inserted: inserted.length, skipped: okRows.length - inserted.length },
        })
    })
}
