/**
 * Biometric ID mappings + attendance bulk-import.
 *
 * Two related concerns live here because they share the same domain (resolving
 * external/device IDs to HRHub employees) and the same lookup map:
 *
 *   • Mapping CRUD — list / add / update / remove rows in biometric_id_mappings.
 *   • Bulk import — accept a parsed punch sheet, resolve each row's identifier
 *     (mapper_id first, employee_no fallback) to an employee, then optionally
 *     commit the rows into attendance_punches in one transaction.
 *
 * Resolution priority on import:
 *   1. mapper_id → biometric_id_mappings table (the device ID the row carries).
 *   2. employee_no → employees.employee_no (the HRHub code, for manual imports).
 *   3. nothing matched → row tagged invalid; commit aborts.
 *
 * Soft-deleted mappings (deletedAt IS NOT NULL) are excluded from the lookup
 * — once retired they no longer resolve, so HR can't accidentally back-fill
 * punches against a stale mapping.
 */
import { and, eq, gte, isNull, inArray, lte, desc, sql, asc } from 'drizzle-orm'
import { db } from '../../db/index.js'
import {
    biometricIdMappings,
    attendancePunches,
    employees,
    users,
} from '../../db/schema/index.js'

export type PunchType = 'in' | 'out'

// ─── Mapping CRUD ───────────────────────────────────────────────────────────

export interface CreateMappingInput {
    employeeId: string
    mapperId: string
    label?: string | null
}

export interface UpdateMappingInput {
    mapperId?: string
    label?: string | null
}

export async function listMappings(tenantId: string) {
    return db
        .select({
            id: biometricIdMappings.id,
            employeeId: biometricIdMappings.employeeId,
            employeeNo: employees.employeeNo,
            employeeName: sql<string>`${employees.firstName} || ' ' || ${employees.lastName}`,
            department: employees.department,
            mapperId: biometricIdMappings.mapperId,
            label: biometricIdMappings.label,
            createdAt: biometricIdMappings.createdAt,
            createdByName: users.name,
        })
        .from(biometricIdMappings)
        .innerJoin(employees, eq(biometricIdMappings.employeeId, employees.id))
        .leftJoin(users, eq(biometricIdMappings.createdBy, users.id))
        .where(and(
            eq(biometricIdMappings.tenantId, tenantId),
            isNull(biometricIdMappings.deletedAt),
        ))
        .orderBy(desc(biometricIdMappings.createdAt))
}

export async function getMappingById(tenantId: string, id: string) {
    const [row] = await db
        .select()
        .from(biometricIdMappings)
        .where(and(
            eq(biometricIdMappings.tenantId, tenantId),
            eq(biometricIdMappings.id, id),
            isNull(biometricIdMappings.deletedAt),
        ))
        .limit(1)
    return row ?? null
}

export async function createMapping(
    tenantId: string,
    input: CreateMappingInput,
    createdBy: string | null,
) {
    const trimmedMapperId = input.mapperId.trim()
    if (!trimmedMapperId) {
        throw Object.assign(new Error('mapperId is required'), { statusCode: 400 })
    }
    // Pre-check for duplicate to give a friendlier error than the DB
    // 23505. The unique index is still the source of truth (race-safe).
    const [existing] = await db
        .select({ id: biometricIdMappings.id })
        .from(biometricIdMappings)
        .where(and(
            eq(biometricIdMappings.tenantId, tenantId),
            eq(biometricIdMappings.mapperId, trimmedMapperId),
            isNull(biometricIdMappings.deletedAt),
        ))
        .limit(1)
    if (existing) {
        throw Object.assign(
            new Error(`Mapper ID '${trimmedMapperId}' is already mapped to another employee`),
            { statusCode: 409 },
        )
    }

    const [row] = await db
        .insert(biometricIdMappings)
        .values({
            tenantId,
            employeeId: input.employeeId,
            mapperId: trimmedMapperId,
            label: input.label ?? null,
            createdBy,
        })
        .returning()
    return row!
}

export async function updateMapping(
    tenantId: string,
    id: string,
    patch: UpdateMappingInput,
) {
    const set: Record<string, unknown> = { updatedAt: new Date() }
    let nextMapperId: string | null = null
    if (patch.mapperId !== undefined) {
        const trimmed = patch.mapperId.trim()
        if (!trimmed) throw Object.assign(new Error('Mapper ID cannot be empty.'), { statusCode: 400 })
        nextMapperId = trimmed
        set.mapperId = trimmed
    }
    if (patch.label !== undefined) set.label = patch.label ?? null

    // Friendly pre-check (mirrors createMapping). The partial UNIQUE index on
    // (tenant_id, mapper_id) WHERE deleted_at IS NULL is the source of truth —
    // it stops races — but we always lose a 23505 error message readability
    // contest. Catch the common case here so HR sees the employee they're
    // colliding with, not a Postgres constraint name.
    if (nextMapperId !== null) {
        const [existing] = await db
            .select({
                id: biometricIdMappings.id,
                employeeNo: employees.employeeNo,
                firstName: employees.firstName,
                lastName: employees.lastName,
            })
            .from(biometricIdMappings)
            .innerJoin(employees, eq(employees.id, biometricIdMappings.employeeId))
            .where(and(
                eq(biometricIdMappings.tenantId, tenantId),
                eq(biometricIdMappings.mapperId, nextMapperId),
                isNull(biometricIdMappings.deletedAt),
            ))
            .limit(1)
        if (existing && existing.id !== id) {
            const owner = `${existing.firstName} ${existing.lastName}`.trim()
            const owned = owner || existing.employeeNo || 'another employee'
            throw Object.assign(
                new Error(`Mapper ID "${nextMapperId}" is already assigned to ${owned}. Each mapping ID can only be used once.`),
                { statusCode: 409 },
            )
        }
    }

    try {
        const [row] = await db
            .update(biometricIdMappings)
            .set(set as Partial<typeof biometricIdMappings.$inferInsert>)
            .where(and(
                eq(biometricIdMappings.tenantId, tenantId),
                eq(biometricIdMappings.id, id),
                isNull(biometricIdMappings.deletedAt),
            ))
            .returning()
        return row ?? null
    } catch (err: unknown) {
        // Concurrent update beat our pre-check to the unique index. Surface
        // a friendly message instead of leaking the Postgres error string.
        const code = (err as { code?: string } | null)?.code
        if (code === '23505' && nextMapperId !== null) {
            throw Object.assign(
                new Error(`Mapper ID "${nextMapperId}" is already assigned to another employee. Each mapping ID can only be used once.`),
                { statusCode: 409 },
            )
        }
        throw err
    }
}

export async function softDeleteMapping(tenantId: string, id: string) {
    const [row] = await db
        .update(biometricIdMappings)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(
            eq(biometricIdMappings.tenantId, tenantId),
            eq(biometricIdMappings.id, id),
            isNull(biometricIdMappings.deletedAt),
        ))
        .returning()
    return row ?? null
}

// ─── Attendance bulk-import ────────────────────────────────────────────────

export interface BulkAttendanceRow {
    /** 1-based row number from the source spreadsheet (used for per-row error reporting). */
    rowNumber: number
    /** Either mapper_id OR employee_no — at least one is required. */
    mapperId?: string | null
    employeeNo?: string | null
    /** ISO date 'YYYY-MM-DD'. */
    date: string
    /** ISO timestamp or 'HH:MM' / 'HH:MM:SS' (paired with `date` to form full ts). */
    recordedAt: string
    punchType: PunchType
    locationName?: string | null
    deviceId?: string | null
    notes?: string | null
}

export type BulkAttendanceAction = 'new' | 'duplicate' | 'invalid'

export interface BulkAttendanceRowResult {
    rowNumber: number
    action: BulkAttendanceAction
    error: string | null
    /** Server-resolved employee id (only when action is `new`). */
    employeeId: string | null
    /** Display name from the matched record — helps HR sanity-check before commit. */
    resolvedName: string | null
    resolvedEmployeeNo: string | null
    /** How the row was matched — surfaces "mapped via biometric device" vs "matched by employee_no". */
    resolvedVia: 'mapper_id' | 'employee_no' | null
    /** ISO timestamp the row will commit at — combined from date + recordedAt. */
    parsedAt: string | null
    punchType: PunchType
}

export interface BulkAttendanceValidateResult {
    total: number
    newCount: number
    duplicateCount: number
    invalidCount: number
    rows: BulkAttendanceRowResult[]
}

export interface BulkAttendanceCommitResult {
    created: number
    duplicate: number
    failed: number
    errors: Array<{ row: number; error: string }>
}

/**
 * Resolve every row in one pass. Loads the union of referenced mapper_ids
 * and employee_nos in a single query each, builds a Map for O(1) lookup,
 * then iterates the rows to assign employeeId.
 *
 * Same pattern as resolveBulkRows in adjustments.service.ts — narrow the
 * DB read to only the identifiers referenced in this batch.
 */
async function resolveBulkAttendanceRows(
    tenantId: string,
    rows: BulkAttendanceRow[],
): Promise<BulkAttendanceRowResult[]> {
    const mapperIds = new Set<string>()
    const employeeNos = new Set<string>()
    for (const r of rows) {
        if (r.mapperId) mapperIds.add(r.mapperId.trim())
        if (r.employeeNo) employeeNos.add(r.employeeNo.trim())
    }

    // Two parallel lookups, scoped to the identifiers actually referenced.
    const [mappingRows, employeeRows] = await Promise.all([
        mapperIds.size === 0 ? Promise.resolve([]) : db
            .select({
                mapperId: biometricIdMappings.mapperId,
                employeeId: biometricIdMappings.employeeId,
                employeeNo: employees.employeeNo,
                firstName: employees.firstName,
                lastName: employees.lastName,
            })
            .from(biometricIdMappings)
            .innerJoin(employees, eq(biometricIdMappings.employeeId, employees.id))
            .where(and(
                eq(biometricIdMappings.tenantId, tenantId),
                isNull(biometricIdMappings.deletedAt),
                eq(employees.isArchived, false),
                inArray(biometricIdMappings.mapperId, [...mapperIds]),
            )),
        employeeNos.size === 0 ? Promise.resolve([]) : db
            .select({
                id: employees.id,
                employeeNo: employees.employeeNo,
                firstName: employees.firstName,
                lastName: employees.lastName,
            })
            .from(employees)
            .where(and(
                eq(employees.tenantId, tenantId),
                eq(employees.isArchived, false),
                inArray(employees.employeeNo, [...employeeNos]),
            )),
    ])

    const byMapperId = new Map(mappingRows.map((r) => [r.mapperId, r]))
    const byEmployeeNo = new Map(employeeRows.map((r) => [r.employeeNo ?? '', r]))

    return rows.map((r) => classifyAttendanceRow(r, byMapperId, byEmployeeNo))
}

/**
 * Per-row classifier — pure function, easy to unit-test. Returns the
 * resolved employee + parsed timestamp, or an invalid row with a
 * descriptive error.
 */
function classifyAttendanceRow(
    row: BulkAttendanceRow,
    byMapperId: Map<string, { employeeId: string; employeeNo: string | null; firstName: string; lastName: string }>,
    byEmployeeNo: Map<string, { id: string; employeeNo: string | null; firstName: string; lastName: string }>,
): BulkAttendanceRowResult {
    // 1. Validate the timestamp first so even rows with unresolvable
    //    employees still surface the timestamp issue (more useful error).
    const parsedAt = parseAttendanceTimestamp(row.date, row.recordedAt)
    if (!parsedAt) {
        return {
            rowNumber: row.rowNumber,
            action: 'invalid',
            error: `Invalid date / time: "${row.date} ${row.recordedAt}"`,
            employeeId: null,
            resolvedName: null,
            resolvedEmployeeNo: null,
            resolvedVia: null,
            parsedAt: null,
            punchType: row.punchType,
        }
    }
    if (row.punchType !== 'in' && row.punchType !== 'out') {
        return {
            rowNumber: row.rowNumber,
            action: 'invalid',
            error: `punch_type must be "in" or "out" (got "${row.punchType}")`,
            employeeId: null,
            resolvedName: null,
            resolvedEmployeeNo: null,
            resolvedVia: null,
            parsedAt,
            punchType: row.punchType,
        }
    }

    // 2. Resolve employee — mapper_id first because biometric exports use it.
    let employeeId: string | null = null
    let resolvedName: string | null = null
    let resolvedEmployeeNo: string | null = null
    let resolvedVia: 'mapper_id' | 'employee_no' | null = null
    const mapperKey = row.mapperId?.trim()
    if (mapperKey) {
        const match = byMapperId.get(mapperKey)
        if (match) {
            employeeId = match.employeeId
            resolvedName = `${match.firstName} ${match.lastName}`.trim()
            resolvedEmployeeNo = match.employeeNo
            resolvedVia = 'mapper_id'
        }
    }
    if (!employeeId && row.employeeNo) {
        const match = byEmployeeNo.get(row.employeeNo.trim())
        if (match) {
            employeeId = match.id
            resolvedName = `${match.firstName} ${match.lastName}`.trim()
            resolvedEmployeeNo = match.employeeNo
            resolvedVia = 'employee_no'
        }
    }
    if (!employeeId) {
        const hint = row.mapperId || row.employeeNo || '(blank)'
        const reason = mapperKey
            ? `No biometric mapping for "${mapperKey}". Add a mapping or supply employee_no.`
            : `Could not resolve "${hint}" to an employee.`
        return {
            rowNumber: row.rowNumber,
            action: 'invalid',
            error: reason,
            employeeId: null,
            resolvedName: null,
            resolvedEmployeeNo: null,
            resolvedVia: null,
            parsedAt,
            punchType: row.punchType,
        }
    }

    return {
        rowNumber: row.rowNumber,
        action: 'new',
        error: null,
        employeeId,
        resolvedName,
        resolvedEmployeeNo,
        resolvedVia,
        parsedAt,
        punchType: row.punchType,
    }
}

/**
 * Combine a `YYYY-MM-DD` date with a `HH:MM[:SS]` time (or accept a full
 * ISO timestamp) and return an ISO string in UTC. Returns null on garbage.
 *
 * We accept multiple time shapes because device exports vary:
 *   • "2026-06-12 09:30:00"  (full datetime, space separator)
 *   • "2026-06-12T09:30:00Z"  (ISO 8601)
 *   • "09:30" + date="2026-06-12"  (time-only column + date column)
 */
function parseAttendanceTimestamp(date: string, recordedAt: string): string | null {
    if (!date || !recordedAt) return null
    const dateStr = String(date).trim()
    const timeStr = String(recordedAt).trim()

    // Case 1 — recordedAt already contains a date.
    if (/\d{4}-\d{2}-\d{2}/.test(timeStr)) {
        const d = new Date(timeStr.replace(' ', 'T'))
        return Number.isNaN(d.getTime()) ? null : d.toISOString()
    }

    // Case 2 — recordedAt is just HH:MM or HH:MM:SS.
    const tm = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (!tm) return null
    const h = Number(tm[1]); const mn = Number(tm[2]); const s = Number(tm[3] ?? 0)
    if (h > 23 || mn > 59 || s > 59) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null
    const iso = `${dateStr}T${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}:${String(s).padStart(2, '0')}Z`
    const d = new Date(iso)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * Validate-only preview. Resolves every row, classifies each, returns the
 * full set so the frontend can render the preview table without committing.
 *
 * Within-batch duplicate detection: same employee + date + recordedAt fires
 * a duplicate action on the SECOND+ occurrence so the user sees what the
 * commit will collapse.
 */
export async function validateBulkAttendance(
    tenantId: string,
    rows: BulkAttendanceRow[],
): Promise<BulkAttendanceValidateResult> {
    const resolved = await resolveBulkAttendanceRows(tenantId, rows)

    // Mark duplicate-in-batch as second+ occurrences of the same
    // (employeeId, parsedAt, punchType) triple.
    const seen = new Set<string>()
    for (const r of resolved) {
        if (r.action !== 'new' || !r.employeeId || !r.parsedAt) continue
        const key = `${r.employeeId}|${r.parsedAt}|${r.punchType}`
        if (seen.has(key)) {
            r.action = 'duplicate'
            r.error = 'Duplicate of an earlier row in this upload'
        } else {
            seen.add(key)
        }
    }

    return {
        total: resolved.length,
        newCount: resolved.filter((r) => r.action === 'new').length,
        duplicateCount: resolved.filter((r) => r.action === 'duplicate').length,
        invalidCount: resolved.filter((r) => r.action === 'invalid').length,
        rows: resolved,
    }
}

/**
 * Commit a validated batch. Refuses if ANY row is invalid — the user must
 * fix the sheet and re-validate. Duplicate rows are silently skipped.
 *
 * All inserts happen inside a single transaction. The unique index on
 * (employee_id, recorded_at, punch_type) catches cross-batch duplicates
 * the validator couldn't see (someone else uploaded the same window).
 */
export async function commitBulkAttendance(
    tenantId: string,
    rows: BulkAttendanceRow[],
    createdBy: string | null,
): Promise<BulkAttendanceCommitResult> {
    const resolved = await resolveBulkAttendanceRows(tenantId, rows)

    const invalid = resolved.filter((r) => r.action === 'invalid')
    if (invalid.length > 0) {
        return {
            created: 0,
            duplicate: 0,
            failed: invalid.length,
            errors: invalid.map((r) => ({ row: r.rowNumber, error: r.error ?? 'Invalid' })),
        }
    }

    // Within-batch dedupe — same triple resolved twice = silently skip
    // the second one.
    const seen = new Set<string>()
    const candidates: Array<{ key: string; insert: typeof attendancePunches.$inferInsert }> = []
    let duplicate = 0
    // Index the original rows by row number for fetching extra fields
    // (locationName, deviceId, notes) that the classifier doesn't return.
    const byRowNo = new Map(rows.map((r) => [r.rowNumber, r]))
    for (const r of resolved) {
        if (!r.employeeId || !r.parsedAt) continue
        const key = `${r.employeeId}|${r.parsedAt}|${r.punchType}`
        if (seen.has(key)) { duplicate++; continue }
        seen.add(key)
        const src = byRowNo.get(r.rowNumber)
        candidates.push({
            key,
            insert: {
                tenantId,
                employeeId: r.employeeId,
                date: r.parsedAt.slice(0, 10),
                punchType: r.punchType,
                recordedAt: new Date(r.parsedAt),
                locationName: src?.locationName ?? null,
                deviceId: src?.deviceId ?? null,
                notes: src?.notes ?? null,
                source: 'biometric',
                createdBy,
            },
        })
    }

    if (candidates.length === 0) {
        return { created: 0, duplicate, failed: 0, errors: [] }
    }

    // Cross-batch dedupe — look up any existing punches that share the
    // exact (employee, recordedAt, punchType) triple. The DB doesn't have
    // a UNIQUE constraint there yet, so we pre-query and filter in JS to
    // avoid double-inserting punches that landed via a prior upload (or
    // the live punch endpoint).
    const empIds = [...new Set(candidates.map((c) => c.insert.employeeId))]
    const recordedAts = candidates.map((c) => c.insert.recordedAt as Date)
    const minRecordedAt = new Date(Math.min(...recordedAts.map((d) => d.getTime())))
    const maxRecordedAt = new Date(Math.max(...recordedAts.map((d) => d.getTime())))
    const existing = await db
        .select({
            employeeId: attendancePunches.employeeId,
            recordedAt: attendancePunches.recordedAt,
            punchType: attendancePunches.punchType,
        })
        .from(attendancePunches)
        .where(and(
            eq(attendancePunches.tenantId, tenantId),
            inArray(attendancePunches.employeeId, empIds),
            // Bound the SELECT to the timestamps we care about — keeps
            // the read narrow even when the table has years of history.
            // gte/lte handle the Date → timestamptz cast that the raw
            // sql template was botching.
            gte(attendancePunches.recordedAt, minRecordedAt),
            lte(attendancePunches.recordedAt, maxRecordedAt),
        ))
    const existingKeys = new Set(
        existing.map((e) => `${e.employeeId}|${(e.recordedAt as Date).toISOString()}|${e.punchType}`),
    )
    const fresh = candidates.filter((c) => !existingKeys.has(c.key))
    const crossBatchDupes = candidates.length - fresh.length

    if (fresh.length === 0) {
        return { created: 0, duplicate: duplicate + crossBatchDupes, failed: 0, errors: [] }
    }

    let created = 0
    await db.transaction(async (tx) => {
        const inserted = await tx
            .insert(attendancePunches)
            .values(fresh.map((c) => c.insert))
            .returning({ id: attendancePunches.id })
        created = inserted.length
    })

    return {
        created,
        duplicate: duplicate + crossBatchDupes,
        failed: 0,
        errors: [],
    }
}

// ─── Attendance export ──────────────────────────────────────────────────────

export interface ExportPunchesFilter {
    /** Inclusive `YYYY-MM-DD` lower bound. */
    from?: string
    /** Inclusive `YYYY-MM-DD` upper bound. */
    to?: string
    /** Optional single-employee filter (used by "my punches" exports). */
    employeeId?: string
}

export interface PunchExportRow {
    rowNumber: number
    mapperId: string | null
    employeeNo: string | null
    employeeName: string
    date: string
    time: string
    punchType: 'in' | 'out'
    location: string | null
    deviceId: string | null
    source: string
    note: string | null
}

/**
 * Returns every punch in the requested window as flat row objects ready for
 * .xlsx / .csv serialization. The shape MATCHES the import template's
 * column order so an exported file can be re-imported as a round-trip.
 *
 * Joins biometric_id_mappings so each row carries the device's mapper_id
 * when one exists — gives HR the data needed to verify their device exports
 * against the canonical HRHub punch log.
 */
export async function exportPunches(
    tenantId: string,
    filter: ExportPunchesFilter = {},
): Promise<PunchExportRow[]> {
    const conditions = [eq(attendancePunches.tenantId, tenantId)]
    if (filter.from) conditions.push(gte(attendancePunches.date, filter.from))
    if (filter.to) conditions.push(lte(attendancePunches.date, filter.to))
    if (filter.employeeId) conditions.push(eq(attendancePunches.employeeId, filter.employeeId))

    // Left-join the mappings so a punch without a registered device ID
    // still appears in the export (just with mapper_id blank). Use the
    // first live mapping per employee — if HR has multiple devices for
    // one person, we pick deterministically by createdAt.
    const rows = await db
        .select({
            id: attendancePunches.id,
            employeeId: attendancePunches.employeeId,
            employeeNo: employees.employeeNo,
            firstName: employees.firstName,
            lastName: employees.lastName,
            date: attendancePunches.date,
            recordedAt: attendancePunches.recordedAt,
            punchType: attendancePunches.punchType,
            locationName: attendancePunches.locationName,
            deviceId: attendancePunches.deviceId,
            source: attendancePunches.source,
            notes: attendancePunches.notes,
            // Subquery picks the oldest still-live mapping per employee.
            // Subquery in a SELECT projection keeps the read in one round-trip.
            mapperId: sql<string | null>`(
                SELECT m.mapper_id FROM biometric_id_mappings m
                WHERE m.tenant_id = ${tenantId}
                  AND m.employee_id = ${attendancePunches.employeeId}
                  AND m.deleted_at IS NULL
                ORDER BY m.created_at ASC
                LIMIT 1
            )`,
        })
        .from(attendancePunches)
        .innerJoin(employees, eq(attendancePunches.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(asc(attendancePunches.recordedAt))

    return rows.map((r, idx) => ({
        rowNumber: idx + 2, // +2 so the row number matches a spreadsheet line (header on row 1)
        mapperId: r.mapperId,
        employeeNo: r.employeeNo,
        employeeName: `${r.firstName} ${r.lastName}`.trim(),
        date: r.date,
        // recordedAt is timestamptz; format as ISO time-of-day for the
        // export (date column carries the calendar day separately).
        time: formatPunchTime(r.recordedAt as Date),
        punchType: r.punchType,
        location: r.locationName,
        deviceId: r.deviceId,
        source: r.source,
        note: r.notes,
    }))
}

/** Wall-clock HH:MM:SS in UTC, matching the format the import accepts. */
function formatPunchTime(d: Date): string {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return ''
    return d.toISOString().slice(11, 19)
}

// ─── Bulk update of biometric mappings ───────────────────────────────────────
//
// Three-stage flow mirroring the assets / jobs bulk import:
//   1. listUnmappedEmployees() — every active employee in the tenant that
//      doesn't yet have a live row in biometric_id_mappings. The template
//      ships pre-populated with this list so HR just types device IDs.
//   2. validateBulkMappingRowsSync() — pure shape + uniqueness check.
//      Tested in isolation.
//   3. bulkCreateMappings() — re-validates + inserts everything in one
//      transaction. Drops invalid rows; only the valid ones land.
//
// One-to-one enforcement: even though the schema allows multiple mappings
// per employee, *this bulk flow* enforces one-to-one as the user
// requested — a row is rejected if (a) the mapping_id is already in the
// DB, (b) the mapping_id appears twice in the upload, (c) the employee
// already has a live mapping (single-create still allows multi-mapping,
// but bulk-update doesn't).

export interface UnmappedEmployee {
    employeeId: string
    employeeNo: string | null
    employeeName: string
    email: string | null
}

/**
 * Returns every active, non-archived employee in the tenant who does NOT
 * already have a live biometric mapping. The template generator and the
 * bulk validator both build their employee lookup from this list — keeps
 * the "unmapped" definition in one place.
 */
export async function listUnmappedEmployees(tenantId: string): Promise<UnmappedEmployee[]> {
    // LEFT JOIN biometric_id_mappings (live rows only) and keep rows where
    // the join didn't find anything — that's the unmapped set. One query,
    // tenant-scoped, no per-employee fan-out.
    const rows = await db
        .select({
            employeeId: employees.id,
            employeeNo: employees.employeeNo,
            firstName: employees.firstName,
            lastName: employees.lastName,
            email: employees.email,
            workEmail: employees.workEmail,
            mappingId: biometricIdMappings.id,
        })
        .from(employees)
        .leftJoin(
            biometricIdMappings,
            and(
                eq(biometricIdMappings.employeeId, employees.id),
                eq(biometricIdMappings.tenantId, tenantId),
                isNull(biometricIdMappings.deletedAt),
            ),
        )
        .where(and(
            eq(employees.tenantId, tenantId),
            eq(employees.isArchived, false),
            eq(employees.status, 'active'),
            isNull(biometricIdMappings.id),
        ))
        .orderBy(employees.employeeNo)
    return rows.map((r) => ({
        employeeId: r.employeeId,
        employeeNo: r.employeeNo,
        employeeName: `${r.firstName} ${r.lastName}`.trim(),
        email: r.workEmail ?? r.email,
    }))
}

export interface BulkMappingInputRow {
    rowNumber: number
    employeeNo?: string | null
    mappingId?: string | null
    label?: string | null
}

export interface BulkMappingRowResult {
    rowNumber: number
    ok: boolean
    errors: string[]
    /** Echoed employee name when employee_no resolves — handy for preview. */
    employeeName?: string
    /** Echoed mapping_id (trimmed) so the preview can show the canonical form. */
    mappingId?: string
    /** Set when ok — payload ready for DB insert. */
    resolved?: {
        employeeId: string
        mapperId: string
        label: string | null
    }
}

export interface BulkMappingValidationResult {
    rows: BulkMappingRowResult[]
    summary: { total: number; valid: number; invalid: number }
}

export interface BulkMappingLookups {
    /** employee_no → { id, name } for unmapped employees only. Employees who
     *  already have a live mapping are intentionally absent from this map —
     *  bulk update refuses to re-assign. */
    unmappedByNo: Map<string, { id: string; name: string }>
    /** Lower-cased mapping IDs already present in this tenant's live rows. */
    existingMapperIds: Set<string>
}

/**
 * Pure row-validation core. Same testing pattern as the bulk-assets and
 * bulk-jobs validators. Rules:
 *   • employee_no required
 *   • mapping_id required (trimmed; max 100 chars)
 *   • employee_no must resolve to an *unmapped* employee in the tenant
 *   • mapping_id must be unique in the upload AND not exist in the DB
 *   • label optional (max 200 chars)
 */
export function validateBulkMappingRowsSync(
    rows: BulkMappingInputRow[],
    lookups: BulkMappingLookups,
): BulkMappingValidationResult {
    // Pre-pass: count how many times each mapping_id appears in the upload.
    // Anything > 1 is flagged on every row carrying that ID so HR fixes
    // the sheet rather than picking which row to drop.
    const mappingIdOccurrences = new Map<string, number>()
    for (const r of rows) {
        const mid = (r.mappingId ?? '').trim().toLowerCase()
        if (mid) mappingIdOccurrences.set(mid, (mappingIdOccurrences.get(mid) ?? 0) + 1)
    }

    const results: BulkMappingRowResult[] = rows.map((r) => {
        const errors: string[] = []
        const empNo = (r.employeeNo ?? '').trim()
        const mappingIdRaw = (r.mappingId ?? '').trim()
        const label = (r.label ?? '').trim() || null

        if (!empNo) errors.push('employee_no is required')
        if (!mappingIdRaw) errors.push('mapping_id is required')
        if (mappingIdRaw.length > 100) errors.push('mapping_id must be 100 characters or fewer')
        if (label && label.length > 200) errors.push('label must be 200 characters or fewer')

        // Resolve employee → unmapped only. Two distinct errors so HR
        // sees the right hint:
        //   • "employee not found" → wrong employee_no / typo
        //   • "employee already mapped" → row should be removed
        let employee: { id: string; name: string } | undefined
        if (empNo) {
            employee = lookups.unmappedByNo.get(empNo)
            if (!employee) {
                errors.push(`employee "${empNo}" not found or already has a biometric mapping`)
            }
        }

        // Uniqueness — file then DB.
        if (mappingIdRaw) {
            const lc = mappingIdRaw.toLowerCase()
            if ((mappingIdOccurrences.get(lc) ?? 0) > 1) {
                errors.push(`mapping_id "${mappingIdRaw}" is duplicated in this file`)
            } else if (lookups.existingMapperIds.has(lc)) {
                errors.push(`mapping_id "${mappingIdRaw}" is already assigned to another employee`)
            }
        }

        const ok = errors.length === 0
        return {
            rowNumber: r.rowNumber,
            ok,
            errors,
            employeeName: employee?.name,
            mappingId: mappingIdRaw || undefined,
            resolved: ok && employee
                ? {
                      employeeId: employee.id,
                      mapperId: mappingIdRaw,
                      label,
                  }
                : undefined,
        }
    })

    return {
        rows: results,
        summary: {
            total: results.length,
            valid: results.filter((r) => r.ok).length,
            invalid: results.filter((r) => !r.ok).length,
        },
    }
}

/**
 * Validate a batch of rows. Loads the tenant's unmapped-employee map +
 * existing mapper-ids in two read-only queries, then hands off to the
 * pure sync core. Returns per-row outcome for the UI preview.
 */
export async function validateBulkMappingRows(
    tenantId: string,
    rows: BulkMappingInputRow[],
): Promise<BulkMappingValidationResult> {
    const unmapped = await listUnmappedEmployees(tenantId)
    const unmappedByNo = new Map<string, { id: string; name: string }>()
    for (const e of unmapped) {
        if (e.employeeNo) {
            unmappedByNo.set(e.employeeNo, { id: e.employeeId, name: e.employeeName })
        }
    }

    const existingMapperIds = new Set<string>()
    const live = await db
        .select({ mapperId: biometricIdMappings.mapperId })
        .from(biometricIdMappings)
        .where(and(eq(biometricIdMappings.tenantId, tenantId), isNull(biometricIdMappings.deletedAt)))
    for (const r of live) existingMapperIds.add(r.mapperId.toLowerCase())

    return validateBulkMappingRowsSync(rows, { unmappedByNo, existingMapperIds })
}

/**
 * Insert all valid rows in one transaction. Re-runs validation server-
 * side and silently drops the invalid rows — the UI told HR which ones
 * those were at the preview step. One bulk INSERT regardless of count.
 */
export async function bulkCreateMappings(
    tenantId: string,
    rows: BulkMappingInputRow[],
    createdBy: string | null,
): Promise<BulkMappingValidationResult & { created: number; skipped: number }> {
    const validation = await validateBulkMappingRows(tenantId, rows)
    const insertable = validation.rows.filter((r) => r.ok && r.resolved)
    if (insertable.length === 0) {
        return { ...validation, created: 0, skipped: validation.summary.invalid }
    }
    await db.transaction(async (tx) => {
        const values = insertable.map((r) => ({
            tenantId,
            employeeId: r.resolved!.employeeId,
            mapperId: r.resolved!.mapperId,
            label: r.resolved!.label,
            createdBy,
        }))
        await tx.insert(biometricIdMappings).values(values)
    })
    return { ...validation, created: insertable.length, skipped: validation.summary.invalid }
}
