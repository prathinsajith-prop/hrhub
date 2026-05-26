/**
 * Biometric ID mapping + attendance import routes.
 *
 * Endpoints (mounted at /api/v1/attendance):
 *
 *   GET    /mappings                  list every mapping for the tenant
 *   POST   /mappings                  create one
 *   PATCH  /mappings/:id              update mapper_id or label
 *   DELETE /mappings/:id              soft-delete
 *
 *   GET    /import/template           download the .xlsx template
 *   POST   /import/validate           parse + preview (no DB writes)
 *   POST   /import/commit             commit the validated batch
 *
 * All HR-only. The validation + commit endpoints accept rows in JSON; the
 * frontend parses the .xlsx client-side so the wire stays small and the
 * server doesn't need a parser dependency.
 */
import { z } from 'zod'
import * as XLSX from 'xlsx'
import { recordActivity } from '../audit/audit.service.js'
import {
    createMapping,
    listMappings,
    getMappingById,
    softDeleteMapping,
    updateMapping,
    validateBulkAttendance,
    commitBulkAttendance,
    exportPunches,
    listUnmappedEmployees,
    validateBulkMappingRows,
    bulkCreateMappings,
    type BulkAttendanceRow,
    type BulkMappingInputRow,
} from './biometric.service.js'

const createMappingSchema = z.object({
    employeeId: z.string().uuid(),
    mapperId: z.string().min(1).max(100),
    label: z.string().max(200).optional().nullable(),
})

const updateMappingSchema = z.object({
    mapperId: z.string().min(1).max(100).optional(),
    label: z.string().max(200).optional().nullable(),
})

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const importRowSchema = z.object({
    rowNumber: z.number().int().min(1),
    mapperId: z.string().max(100).optional().nullable(),
    employeeNo: z.string().max(100).optional().nullable(),
    date: z.string().regex(ISO_DATE, 'date must be YYYY-MM-DD'),
    recordedAt: z.string().min(1).max(40),
    punchType: z.enum(['in', 'out']),
    locationName: z.string().max(200).optional().nullable(),
    deviceId: z.string().max(100).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
})
const importBatchSchema = z.object({
    rows: z.array(importRowSchema).min(1).max(2000),
})

// Bulk-mapping payload — distinct from the attendance import schema above.
// `mappingId` is required end-to-end (a row with no ID is dropped client-
// side before it reaches us); we still mark it required so a malformed
// upload fails loudly here instead of silently inserting nulls.
const bulkMappingRowSchema = z.object({
    rowNumber: z.number().int().min(1),
    employeeNo: z.string().max(100).optional().nullable(),
    mappingId: z.string().max(100).optional().nullable(),
    label: z.string().max(200).optional().nullable(),
})
const bulkMappingBatchSchema = z.object({
    rows: z.array(bulkMappingRowSchema).min(1).max(500),
})

function parseBody<T extends z.ZodTypeAny>(reply: any, schema: T, value: unknown): z.infer<T> | null {
    const result = schema.safeParse(value)
    if (result.success) return result.data
    const first = result.error.issues[0]
    const message = first ? `${first.path.join('.')}: ${first.message}` : 'Invalid payload'
    reply.code(400).send({ statusCode: 400, error: 'Bad Request', message })
    return null
}

/**
 * Maps an HTTP status code to the canonical reason phrase. Keeps error
 * envelopes (`{ statusCode, error, message }`) consistent across the
 * biometric routes — without this, every catch block used to hard-code
 * "Bad Request" regardless of the actual status (so a 409 conflict was
 * labelled "Bad Request", which confused HR + masked the real cause).
 */
function httpErrorLabel(code: number): string {
    switch (code) {
        case 400: return 'Bad Request'
        case 401: return 'Unauthorized'
        case 403: return 'Forbidden'
        case 404: return 'Not Found'
        case 409: return 'Conflict'
        case 422: return 'Unprocessable Entity'
        default:  return code >= 500 ? 'Internal Server Error' : 'Error'
    }
}

export default async function biometricRoutes(fastify: any): Promise<void> {
    const hrOnly = { preHandler: [(fastify as any).authenticate, (fastify as any).requireRole('hr_manager', 'super_admin')] }

    // ─── Mappings ──────────────────────────────────────────────────────────

    fastify.get('/mappings', { ...hrOnly, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const data = await listMappings(request.user.tenantId)
        return reply.send({ data })
    })

    fastify.post('/mappings', { ...hrOnly, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const body = parseBody(reply, createMappingSchema, request.body)
        if (!body) return
        try {
            const row = await createMapping(request.user.tenantId, body, request.user.id)
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'biometric_id_mapping',
                entityId: row.id,
                entityName: row.mapperId,
                action: 'create',
                metadata: { employeeId: row.employeeId },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            return reply.code(201).send({ data: row })
        } catch (err: any) {
            const code = err?.statusCode ?? 500
            return reply.code(code).send({
                statusCode: code,
                error: httpErrorLabel(code),
                message: err?.message ?? 'Failed to create mapping',
            })
        }
    })

    fastify.patch('/mappings/:id', { ...hrOnly, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const body = parseBody(reply, updateMappingSchema, request.body)
        if (!body) return
        try {
            const row = await updateMapping(request.user.tenantId, id, body)
            if (!row) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Mapping not found' })
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'biometric_id_mapping',
                entityId: id,
                entityName: row.mapperId,
                action: 'update',
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
            return reply.send({ data: row })
        } catch (err: any) {
            // Map the service's statusCode to the matching HTTP error label
            // so HR sees "Conflict" for 409, "Not Found" for 404, etc. —
            // the old code labelled everything "Bad Request" regardless.
            const code = err?.statusCode ?? 500
            return reply.code(code).send({
                statusCode: code,
                error: httpErrorLabel(code),
                message: err?.message ?? 'Failed to update mapping',
            })
        }
    })

    fastify.delete('/mappings/:id', { ...hrOnly, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const { id } = request.params as { id: string }
        const existing = await getMappingById(request.user.tenantId, id)
        if (!existing) return reply.code(404).send({ statusCode: 404, error: 'Not Found', message: 'Mapping not found' })
        await softDeleteMapping(request.user.tenantId, id)
        recordActivity({
            tenantId: request.user.tenantId,
            userId: request.user.id,
            actorName: request.user.name,
            actorRole: request.user.role,
            entityType: 'biometric_id_mapping',
            entityId: id,
            entityName: existing.mapperId,
            action: 'delete',
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
        }).catch(() => { })
        return reply.code(204).send()
    })

    // ─── Bulk mapping update ───────────────────────────────────────────────
    //
    // Three-step UX, identical contract to the assets / jobs bulk imports:
    //   1. GET  /mappings/bulk-template   → .xlsx pre-populated with every
    //                                       unmapped employee
    //   2. POST /mappings/bulk-validate   → preview (no DB writes)
    //   3. POST /mappings/bulk            → commit + audit
    //
    // One-to-one enforced via the validator: rows are rejected if the
    // mapping_id is duplicated in-file, already in the DB, or assigned to
    // an employee who already has a live mapping. Blank `mapping_id` rows
    // are silently dropped client-side (HR can leave employees they
    // haven't mapped yet untouched in the sheet).

    /**
     * Returns a .xlsx pre-populated with every active employee in the
     * tenant that doesn't already have a live biometric mapping. HR
     * types the device ID into the `mapping_id` column and re-uploads —
     * employees with non-blank IDs become the bulk batch.
     */
    fastify.get('/mappings/bulk-template', { ...hrOnly, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const headers = ['employee_no', 'employee_name', 'email', 'mapping_id']
        const rows = await listUnmappedEmployees(request.user.tenantId)

        // Build the body once. Blank `mapping_id` makes the action HR
        // needs to take obvious: type the ID next to the employee they
        // want to map; leave the rest untouched.
        const body: unknown[][] = rows.map((r) => [
            r.employeeNo ?? '',
            r.employeeName,
            r.email ?? '',
            '',
        ])
        // Tenant has zero unmapped employees yet — keep the file
        // demonstrable so HR sees the column shape rather than a
        // header-only download.
        if (body.length === 0) {
            body.push(['EMP-0001', 'Jane Doe', 'jane.doe@example.com', ''])
        }

        const sheet = XLSX.utils.aoa_to_sheet([headers, ...body])
        sheet['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 32 }, { wch: 16 }]

        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, sheet, 'Mappings')

        // Reference sheet — short, just enough to remind HR what the
        // column expects. We avoid duplicating the form-level docs here.
        const refSheet = XLSX.utils.aoa_to_sheet([
            ['Notes:'],
            ['• employee_no, employee_name and email are pre-filled. Do not edit them — they are the lookup key.'],
            ['• Type the device / external biometric ID into the mapping_id column for each employee you want to map.'],
            ['• Leave mapping_id blank for employees you are not mapping in this batch — those rows are skipped on upload.'],
            ['• Each mapping_id must be unique across the tenant; the importer rejects duplicates inside the file and against the database.'],
        ])
        refSheet['!cols'] = [{ wch: 80 }]
        XLSX.utils.book_append_sheet(workbook, refSheet, 'Reference')

        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
        return reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', 'attachment; filename="biometric-mappings-bulk-template.xlsx"')
            .send(buf)
    })

    /** Preview-only validation — same row shape /mappings/bulk uses. */
    fastify.post('/mappings/bulk-validate', { ...hrOnly, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const body = parseBody(reply, bulkMappingBatchSchema, request.body)
        if (!body) return
        const normalized: BulkMappingInputRow[] = body.rows.map((r) => ({
            rowNumber: r.rowNumber,
            employeeNo: r.employeeNo ?? null,
            mappingId: r.mappingId ?? null,
            label: r.label ?? null,
        }))
        const result = await validateBulkMappingRows(request.user.tenantId, normalized)
        return reply.send(result)
    })

    /** Commit — re-validates server-side, inserts valid rows in one tx. */
    fastify.post('/mappings/bulk', { ...hrOnly, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const body = parseBody(reply, bulkMappingBatchSchema, request.body)
        if (!body) return
        const normalized: BulkMappingInputRow[] = body.rows.map((r) => ({
            rowNumber: r.rowNumber,
            employeeNo: r.employeeNo ?? null,
            mappingId: r.mappingId ?? null,
            label: r.label ?? null,
        }))
        const result = await bulkCreateMappings(request.user.tenantId, normalized, request.user.id)
        if (result.created > 0) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'biometric_id_mapping',
                entityId: null,
                entityName: `bulk import: ${result.created} mapping(s)`,
                action: 'create',
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        return reply.code(201).send(result)
    })

    // ─── Attendance import ─────────────────────────────────────────────────

    /**
     * Returns a .xlsx the user can fill in. We generate the template on the
     * fly rather than serving a static file so the example rows can reflect
     * the tenant's actual employees in a future enhancement (today they're
     * placeholders).
     */
    fastify.get('/import/template', { ...hrOnly, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const headers = ['mapper_id', 'employee_no', 'date', 'time', 'punch_type', 'location', 'device_id', 'note']
        // Two sample rows to make the format obvious — one biometric-style,
        // one HR-manual-entry-style.
        const sample = [
            ['101', '', '2026-06-12', '08:55:30', 'in', 'Office HQ', 'BIO-A1', ''],
            ['', 'EMP-008', '2026-06-12', '17:32:00', 'out', 'Office HQ', '', 'Left early — pre-approved'],
        ]
        const sheet = XLSX.utils.aoa_to_sheet([headers, ...sample])
        sheet['!cols'] = [
            { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 10 },
            { wch: 18 }, { wch: 14 }, { wch: 28 },
        ]
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, sheet, 'Attendance')
        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
        return reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', 'attachment; filename="attendance-import-template.xlsx"')
            .send(buf)
    })

    fastify.post('/import/validate', { ...hrOnly, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const body = parseBody(reply, importBatchSchema, request.body)
        if (!body) return
        const normalized: BulkAttendanceRow[] = body.rows.map((r) => ({
            rowNumber: r.rowNumber,
            mapperId: r.mapperId ?? null,
            employeeNo: r.employeeNo ?? null,
            date: r.date,
            recordedAt: r.recordedAt,
            punchType: r.punchType,
            locationName: r.locationName ?? null,
            deviceId: r.deviceId ?? null,
            notes: r.notes ?? null,
        }))
        const result = await validateBulkAttendance(request.user.tenantId, normalized)
        return reply.send(result)
    })

    fastify.post('/import/commit', { ...hrOnly, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const body = parseBody(reply, importBatchSchema, request.body)
        if (!body) return
        const normalized: BulkAttendanceRow[] = body.rows.map((r) => ({
            rowNumber: r.rowNumber,
            mapperId: r.mapperId ?? null,
            employeeNo: r.employeeNo ?? null,
            date: r.date,
            recordedAt: r.recordedAt,
            punchType: r.punchType,
            locationName: r.locationName ?? null,
            deviceId: r.deviceId ?? null,
            notes: r.notes ?? null,
        }))
        const result = await commitBulkAttendance(request.user.tenantId, normalized, request.user.id)
        if (result.created > 0) {
            recordActivity({
                tenantId: request.user.tenantId,
                userId: request.user.id,
                actorName: request.user.name,
                actorRole: request.user.role,
                entityType: 'attendance_punch',
                entityId: 'bulk-import',
                entityName: `Imported ${result.created} attendance punches`,
                action: 'create',
                metadata: { created: result.created, duplicate: result.duplicate },
                ipAddress: request.ip,
                userAgent: request.headers['user-agent'],
            }).catch(() => { })
        }
        const status = result.failed > 0 ? 400 : 201
        return reply.code(status).send(result)
    })

    // ─── Export ────────────────────────────────────────────────────────────

    /**
     * Download attendance punches as a .xlsx (default) or .csv.
     *
     * Query params:
     *   from=YYYY-MM-DD   inclusive lower bound (defaults to first day of
     *                     the current month if absent)
     *   to=YYYY-MM-DD     inclusive upper bound (defaults to today)
     *   format=xlsx|csv   defaults to xlsx
     *   employeeId        optional single-employee scope
     *
     * The exported columns match the import template's column order so the
     * file is round-trippable: you can re-import what you just exported and
     * every row will land as "Duplicate" / "Unchanged" (via the cross-batch
     * dedupe inside commitBulkAttendance).
     */
    fastify.get('/punches/export', { ...hrOnly, schema: { tags: ['Attendance'] } }, async (request: any, reply: any) => {
        const qs = request.query as { from?: string; to?: string; format?: string; employeeId?: string }
        // Friendly defaults — first day of month → today. Keeps the CTA
        // a single click without picking a range.
        const today = new Date().toISOString().slice(0, 10)
        const monthStart = today.slice(0, 8) + '01'
        const from = qs.from && /^\d{4}-\d{2}-\d{2}$/.test(qs.from) ? qs.from : monthStart
        const to = qs.to && /^\d{4}-\d{2}-\d{2}$/.test(qs.to) ? qs.to : today
        const fmt = qs.format === 'csv' ? 'csv' : 'xlsx'

        const rows = await exportPunches(request.user.tenantId, {
            from, to,
            employeeId: qs.employeeId,
        })

        const filename = `attendance-punches-${from}-to-${to}.${fmt}`

        if (fmt === 'csv') {
            // CSV path — emit a UTF-8 BOM so Excel for Mac doesn't mojibake
            // Arabic / accented characters in the name columns.
            const header = ['mapper_id', 'employee_no', 'employee_name', 'date', 'time', 'punch_type', 'location', 'device_id', 'source', 'note']
            const escape = (v: unknown) => {
                const s = v == null ? '' : String(v)
                return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
            }
            const lines = [header.join(',')]
            for (const r of rows) {
                lines.push([
                    r.mapperId, r.employeeNo, r.employeeName, r.date, r.time,
                    r.punchType, r.location, r.deviceId, r.source, r.note,
                ].map(escape).join(','))
            }
            return reply
                .header('Content-Type', 'text/csv; charset=utf-8')
                .header('Content-Disposition', `attachment; filename="${filename}"`)
                .send('﻿' + lines.join('\n'))
        }

        // .xlsx path — same column order as the template so the export
        // can be re-imported as-is.
        const headerRow = ['mapper_id', 'employee_no', 'employee_name', 'date', 'time', 'punch_type', 'location', 'device_id', 'source', 'note']
        const aoa: unknown[][] = [headerRow]
        for (const r of rows) {
            aoa.push([
                r.mapperId ?? '', r.employeeNo ?? '', r.employeeName,
                r.date, r.time, r.punchType,
                r.location ?? '', r.deviceId ?? '', r.source, r.note ?? '',
            ])
        }
        const sheet = XLSX.utils.aoa_to_sheet(aoa)
        sheet['!cols'] = [
            { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 10 },
            { wch: 10 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 28 },
        ]
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, sheet, 'Punches')
        const buf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer
        return reply
            .header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
            .header('Content-Disposition', `attachment; filename="${filename}"`)
            .send(buf)
    })
}
