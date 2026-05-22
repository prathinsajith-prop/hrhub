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
    type BulkAttendanceRow,
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

function parseBody<T extends z.ZodTypeAny>(reply: any, schema: T, value: unknown): z.infer<T> | null {
    const result = schema.safeParse(value)
    if (result.success) return result.data
    const first = result.error.issues[0]
    const message = first ? `${first.path.join('.')}: ${first.message}` : 'Invalid payload'
    reply.code(400).send({ statusCode: 400, error: 'Bad Request', message })
    return null
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
                error: code === 409 ? 'Conflict' : code === 400 ? 'Bad Request' : 'Internal Server Error',
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
            const code = err?.statusCode ?? 500
            return reply.code(code).send({ statusCode: code, error: 'Bad Request', message: err?.message })
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
