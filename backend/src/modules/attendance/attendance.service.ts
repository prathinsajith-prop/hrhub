import { db } from '../../db/index.js'
import { attendanceRecords, attendancePunches, employees } from '../../db/schema/index.js'
import { eq, and, asc, gte, lte, sql } from 'drizzle-orm'
import { encodeCursor, decodeCursor } from '../../lib/db-helpers.js'
import { Conditions } from '../../lib/filters.js'
import { resolveAvatarUrls } from '../../plugins/s3.js'
import { reverseGeocode } from '../../lib/geocoding.js'

// ─── Punch log helpers ─────────────────────────────────────────────────────
//
// Every clock-in / clock-out inserts a row in attendance_punches and then
// rebuilds the daily rollup in attendance_records (first check-in, last
// check-out, total paired hours). This keeps the rollup eventually consistent
// with the canonical event log without forcing every consumer of the daily
// row to JOIN punches.

export interface PunchInput {
    /** ISO timestamp; defaults to "now" when omitted. */
    recordedAt?: Date | string
    locationName?: string | null
    latitude?: number | string | null
    longitude?: number | string | null
    source?: 'web' | 'mobile' | 'biometric' | 'manual'
    deviceId?: string | null
    notes?: string | null
}

function toDateISO(d: Date): string {
    return d.toISOString().split('T')[0] as string
}

/** Pair sequential punches in→out→in→out and sum the paired durations.
 *  Punches must already be sorted by recordedAt ascending. */
function totalHours(punches: Array<{ punchType: 'in' | 'out'; recordedAt: Date }>): number {
    let total = 0
    let openIn: Date | null = null
    for (const p of punches) {
        if (p.punchType === 'in') {
            // A second 'in' without an intervening 'out' discards the previous
            // 'in' — first occurrence wins on the punch trail, last wins on
            // the rollup. Keeping the later one lets HR fix obvious double-
            // clicks by deleting the bogus one.
            openIn = p.recordedAt
        } else if (openIn) {
            total += (p.recordedAt.getTime() - openIn.getTime()) / 3_600_000
            openIn = null
        }
    }
    return total
}

/** Recompute the daily attendance_records row from the day's punches.
 *  Idempotent — safe to call after any punch insert/delete. */
async function rebuildDayRollup(tenantId: string, employeeId: string, day: string) {
    const punches = await db
        .select({
            punchType: attendancePunches.punchType,
            recordedAt: attendancePunches.recordedAt,
        })
        .from(attendancePunches)
        .where(and(
            eq(attendancePunches.tenantId, tenantId),
            eq(attendancePunches.employeeId, employeeId),
            eq(attendancePunches.date, day),
        ))
        .orderBy(asc(attendancePunches.recordedAt))

    // No punches → ensure no auto-rollup row exists. (HR may still have
    // manually inserted an 'on_leave' or 'absent' row; only clear the
    // check-in / out / hours fields, leave the row.)
    const ins = punches.filter((p) => p.punchType === 'in')
    const outs = punches.filter((p) => p.punchType === 'out')
    const firstIn = ins.length > 0 ? ins[0]!.recordedAt : null
    const lastOut = outs.length > 0 ? outs[outs.length - 1]!.recordedAt : null
    const hours = totalHours(punches)
    const standardHours = 8
    const overtime = Math.max(0, hours - standardHours)

    const [existing] = await db.select({ id: attendanceRecords.id })
        .from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.tenantId, tenantId),
            eq(attendanceRecords.employeeId, employeeId),
            eq(attendanceRecords.date, day),
        ))
        .limit(1)

    if (existing) {
        await db.update(attendanceRecords)
            .set({
                checkIn: firstIn,
                checkOut: lastOut,
                hoursWorked: punches.length > 0 ? String(Math.round(hours * 100) / 100) : null,
                overtimeHours: punches.length > 0 ? String(Math.round(overtime * 100) / 100) : '0',
                // Only flip status when there are punches; leave 'on_leave'
                // / 'absent' / 'wfh' alone otherwise.
                ...(punches.length > 0 ? { status: 'present' as const } : {}),
                updatedAt: new Date(),
            })
            .where(eq(attendanceRecords.id, existing.id))
    } else if (punches.length > 0) {
        await db.insert(attendanceRecords).values({
            tenantId,
            employeeId,
            date: day,
            checkIn: firstIn,
            checkOut: lastOut,
            hoursWorked: String(Math.round(hours * 100) / 100),
            overtimeHours: String(Math.round(overtime * 100) / 100),
            status: 'present',
        })
    }
}

/** Insert a punch and rebuild the day's rollup atomically. */
/**
 * Result of `recordPunch`. The `created` flag distinguishes a fresh insert
 * from a duplicate-suppressed call — letting bulk-import callers count
 * "skipped" rows separately without N round-trips.
 */
export interface RecordPunchResult {
    row: typeof attendancePunches.$inferSelect
    /** `true` when the row was inserted; `false` when an identical punch
     *  already existed at the same `(employeeId, recordedAt, punchType)`
     *  triple and the existing row was returned instead. */
    created: boolean
}

export async function recordPunch(
    tenantId: string,
    employeeId: string,
    punchType: 'in' | 'out',
    input: PunchInput = {},
    createdBy: string | null = null,
): Promise<RecordPunchResult> {
    const recordedAt = input.recordedAt
        ? (typeof input.recordedAt === 'string' ? new Date(input.recordedAt) : input.recordedAt)
        : new Date()
    if (Number.isNaN(recordedAt.getTime())) {
        throw Object.assign(new Error('Invalid recordedAt timestamp'), { statusCode: 400 })
    }
    const day = toDateISO(recordedAt)

    // Idempotency guard. If a punch already exists at the EXACT
    // `(employee, recordedAt, punchType)` triple — regardless of source —
    // return it instead of inserting a second one. This is what makes
    // bulk-imports safe to re-run: a CSV uploaded twice produces the same
    // DB state, not duplicate punches.
    //
    // We compare on `recordedAt` (full timestamp, not just the date) so HR
    // can still log multiple sessions per day at different minutes. Two
    // rows that just happen to land in the same second on the same day
    // for the same person are virtually always operator error.
    const [existingSameTriple] = await db
        .select()
        .from(attendancePunches)
        .where(and(
            eq(attendancePunches.tenantId, tenantId),
            eq(attendancePunches.employeeId, employeeId),
            eq(attendancePunches.punchType, punchType),
            eq(attendancePunches.recordedAt, recordedAt),
        ))
        .limit(1)
    if (existingSameTriple) {
        // Same triple already on disk — return it. Rollup stays consistent
        // because no new row joined the day.
        return { row: existingSameTriple, created: false }
    }

    // Enforce alternation against the last punch of the day. Two 'in' in a
    // row or two 'out' in a row are almost always operator error, so we
    // reject them with a clear message — UNLESS the call originated from
    // HR's manual entry / bulk-import path, where back-filling a forgotten
    // out-punch sandwiched between two in-punches is a legitimate workflow.
    if (input.source !== 'manual') {
        const [last] = await db
            .select({ punchType: attendancePunches.punchType })
            .from(attendancePunches)
            .where(and(
                eq(attendancePunches.tenantId, tenantId),
                eq(attendancePunches.employeeId, employeeId),
                eq(attendancePunches.date, day),
            ))
            .orderBy(sql`recorded_at DESC`)
            .limit(1)
        if (last && last.punchType === punchType) {
            throw Object.assign(
                new Error(punchType === 'in'
                    ? 'Already checked in. Check out first before a new check-in.'
                    : 'Not checked in. Cannot check out without an active check-in.'),
                { statusCode: 409 },
            )
        }
    }

    // Resolve a place name from the coordinates when we have them.
    // Client-supplied `locationName` (e.g. from a fixed kiosk or biometric
    // device that knows its address) always wins. Otherwise the helper
    // calls Nominatim with a 3-second budget + in-memory cache, so back-
    // to-back punches from the same office are essentially free and a
    // dead network never freezes the punch write.
    let resolvedLocationName: string | null = input.locationName ?? null
    const numericLat = typeof input.latitude === 'number'
        ? input.latitude
        : (typeof input.latitude === 'string' && input.latitude !== '' ? Number(input.latitude) : null)
    const numericLng = typeof input.longitude === 'number'
        ? input.longitude
        : (typeof input.longitude === 'string' && input.longitude !== '' ? Number(input.longitude) : null)
    if (
        !resolvedLocationName
        && numericLat !== null && Number.isFinite(numericLat)
        && numericLng !== null && Number.isFinite(numericLng)
    ) {
        try {
            resolvedLocationName = await reverseGeocode(numericLat, numericLng)
        } catch {
            resolvedLocationName = null
        }
    }

    try {
        const [row] = await db.insert(attendancePunches).values({
            tenantId,
            employeeId,
            date: day,
            punchType,
            recordedAt,
            locationName: resolvedLocationName,
            latitude: input.latitude != null ? String(input.latitude) : null,
            longitude: input.longitude != null ? String(input.longitude) : null,
            source: input.source ?? 'web',
            deviceId: input.deviceId ?? null,
            notes: input.notes ?? null,
            createdBy,
        }).returning()
        await rebuildDayRollup(tenantId, employeeId, day)
        return { row: row!, created: true }
    } catch (err) {
        // Race guard. Two concurrent imports of the same row pass the
        // pre-check together, then both try to INSERT. The first wins;
        // the second hits the unique index (uq_attendance_punches_triple)
        // and Postgres throws 23505. We treat that the same as the
        // pre-check duplicate path: fetch the existing row, return it.
        const pgErr = err as { code?: string }
        if (pgErr.code === '23505') {
            const [existing] = await db
                .select()
                .from(attendancePunches)
                .where(and(
                    eq(attendancePunches.tenantId, tenantId),
                    eq(attendancePunches.employeeId, employeeId),
                    eq(attendancePunches.punchType, punchType),
                    eq(attendancePunches.recordedAt, recordedAt),
                ))
                .limit(1)
            if (existing) return { row: existing, created: false }
        }
        throw err
    }
}

export async function getPunchesForDay(tenantId: string, employeeId: string, day: string) {
    return db
        .select()
        .from(attendancePunches)
        .where(and(
            eq(attendancePunches.tenantId, tenantId),
            eq(attendancePunches.employeeId, employeeId),
            eq(attendancePunches.date, day),
        ))
        .orderBy(asc(attendancePunches.recordedAt))
}

/**
 * Fetch every punch for a single day across an arbitrary scope.
 *
 * Used by the HR-facing Punch History view: instead of querying punches
 * employee-by-employee (N+1 round-trips), HR hits this once and the
 * client buckets by `employeeId` to enrich each rollup row with its
 * first check-in's source + location.
 *
 *   • `employeeIds` undefined → tenant-wide (HR / super_admin)
 *   • `employeeIds` provided   → scoped to those employees (dept_head)
 */
export async function getPunchesForDayScoped(
    tenantId: string,
    day: string,
    employeeIds?: string[],
) {
    const conds = [
        eq(attendancePunches.tenantId, tenantId),
        eq(attendancePunches.date, day),
    ]
    if (employeeIds !== undefined) {
        if (employeeIds.length === 0) return [] // empty scope → empty result
        // Drizzle's `inArray` would be ideal here but importing it costs
        // a wider refactor; use ANY() via sql template instead.
        conds.push(sql`${attendancePunches.employeeId} = ANY(${employeeIds})`)
    }
    return db
        .select()
        .from(attendancePunches)
        .where(and(...conds))
        .orderBy(asc(attendancePunches.recordedAt))
}

export async function deletePunch(tenantId: string, employeeId: string, punchId: string) {
    const [row] = await db
        .delete(attendancePunches)
        .where(and(
            eq(attendancePunches.tenantId, tenantId),
            eq(attendancePunches.employeeId, employeeId),
            eq(attendancePunches.id, punchId),
        ))
        .returning({ id: attendancePunches.id, date: attendancePunches.date })
    if (row) await rebuildDayRollup(tenantId, employeeId, row.date)
    return row ?? null
}

const ATTENDANCE_FIELD_MAP = {
    status: attendanceRecords.status,
    employeeId: attendanceRecords.employeeId,
    date: attendanceRecords.date,
    hoursWorked: attendanceRecords.hoursWorked,
}
const ATTENDANCE_ALLOWED = new Set(Object.keys(ATTENDANCE_FIELD_MAP))

/** Punch IN — inserts a punch row, rebuilds the daily rollup. Multiple
 *  check-ins per day are allowed; alternation is enforced (must be 'out'
 *  before another 'in'). */
export async function checkIn(tenantId: string, employeeId: string, input: PunchInput = {}, createdBy: string | null = null) {
    await recordPunch(tenantId, employeeId, 'in', input, createdBy)
    // Return the freshly-rebuilt rollup so existing callers don't need to
    // change shape.
    const today = toDateISO(new Date())
    const [rec] = await db.select().from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.tenantId, tenantId),
            eq(attendanceRecords.employeeId, employeeId),
            eq(attendanceRecords.date, today),
        ))
        .limit(1)
    return rec
}

export async function checkOut(tenantId: string, employeeId: string, input: PunchInput = {}, createdBy: string | null = null) {
    await recordPunch(tenantId, employeeId, 'out', input, createdBy)
    const today = toDateISO(new Date())
    const [rec] = await db.select().from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.tenantId, tenantId),
            eq(attendanceRecords.employeeId, employeeId),
            eq(attendanceRecords.date, today),
        ))
        .limit(1)
    return rec
}

export interface GetAttendanceParams {
    employeeId?: string
    department?: string
    startDate?: string
    endDate?: string
    status?: string
    filter?: string
    /** 1-based page number; ignored when cursor is provided. */
    page?: number
    /** Page size (default 50, max 200). */
    limit?: number
    /** Opaque keyset cursor encoded by db-helpers.encodeCursor. */
    cursor?: string
}

export interface GetAttendanceResult {
    items: Array<Record<string, unknown>>
    /** Cursor for the next page, or null if there are no more rows. */
    nextCursor: string | null
    /** Total matching rows (only computed when page-mode requested). */
    total?: number
}

const MAX_ATTENDANCE_PAGE = 10000
const DEFAULT_ATTENDANCE_PAGE = 50

export async function getAttendance(tenantId: string, params: GetAttendanceParams): Promise<GetAttendanceResult> {
    const limit = Math.min(Math.max(1, params.limit ?? DEFAULT_ATTENDANCE_PAGE), MAX_ATTENDANCE_PAGE)

    // Cursor: { c: ISO date, i: row id } — keyset on (date DESC, id DESC).
    // Uses raw SQL tuple comparison (not the standard createdAt cursor) — no .cursor() helper.
    const decodedCursor = params.cursor ? decodeCursor(params.cursor) : null

    const conds = Conditions.create()
        .tenant(attendanceRecords.tenantId, tenantId)
        .match(attendanceRecords.employeeId, params.employeeId)
        .match(employees.department, params.department)
        .match(attendanceRecords.status, params.status)
        .dateRange(attendanceRecords.date, params.startDate, params.endDate)
        .filterWithName(params.filter, ATTENDANCE_FIELD_MAP, ATTENDANCE_ALLOWED, employees.firstName, employees.lastName)
        .when(!!decodedCursor, c => c.add(
            sql`(${attendanceRecords.date}, ${attendanceRecords.id}) < (${decodedCursor!.c}, ${decodedCursor!.i})`
        ))

    const baseQuery = db.select({
        id: attendanceRecords.id,
        tenantId: attendanceRecords.tenantId,
        employeeId: attendanceRecords.employeeId,
        date: attendanceRecords.date,
        checkIn: attendanceRecords.checkIn,
        checkOut: attendanceRecords.checkOut,
        hoursWorked: attendanceRecords.hoursWorked,
        overtimeHours: attendanceRecords.overtimeHours,
        status: attendanceRecords.status,
        notes: attendanceRecords.notes,
        createdAt: attendanceRecords.createdAt,
        updatedAt: attendanceRecords.updatedAt,
        employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '—')`,
        employeeNo: employees.employeeNo,
        employeeDepartment: employees.department,
        employeeAvatarUrl: employees.avatarUrl,
    })
        .from(attendanceRecords)
        .leftJoin(employees, eq(employees.id, attendanceRecords.employeeId))
        .where(conds.where())
        .orderBy(sql`${attendanceRecords.date} DESC, ${attendanceRecords.id} DESC`)
        .limit(limit + 1) // fetch one extra to detect "has more"

    // Page-mode (offset) — used by traditional table UIs.
    if (!params.cursor && params.page && params.page > 0) {
        const offset = (params.page - 1) * limit
        const [items, totalRow] = await Promise.all([
            db.select({
                id: attendanceRecords.id,
                tenantId: attendanceRecords.tenantId,
                employeeId: attendanceRecords.employeeId,
                date: attendanceRecords.date,
                checkIn: attendanceRecords.checkIn,
                checkOut: attendanceRecords.checkOut,
                hoursWorked: attendanceRecords.hoursWorked,
                overtimeHours: attendanceRecords.overtimeHours,
                status: attendanceRecords.status,
                notes: attendanceRecords.notes,
                createdAt: attendanceRecords.createdAt,
                updatedAt: attendanceRecords.updatedAt,
                employeeName: sql<string>`COALESCE(${employees.firstName} || ' ' || ${employees.lastName}, '—')`,
                employeeNo: employees.employeeNo,
                employeeDepartment: employees.department,
                employeeAvatarUrl: employees.avatarUrl,
            })
                .from(attendanceRecords)
                .leftJoin(employees, eq(employees.id, attendanceRecords.employeeId))
                .where(conds.where())
                .orderBy(sql`${attendanceRecords.date} DESC, ${attendanceRecords.id} DESC`)
                .limit(limit)
                .offset(offset),
            db.select({ count: sql<number>`count(*)::int` })
                .from(attendanceRecords)
                .where(conds.where()),
        ])
        const avatarUrls = await resolveAvatarUrls(items.map(r => r.employeeAvatarUrl))
        const resolvedItems = items.map((r, i) => ({ ...r, employeeAvatarUrl: avatarUrls[i] }))
        return { items: resolvedItems, nextCursor: null, total: totalRow[0]?.count ?? 0 }
    }

    const rows = await baseQuery
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const last = items[items.length - 1]
    const nextCursor = hasMore && last
        ? encodeCursor(String((last as { date: string }).date), String((last as { id: string }).id))
        : null
    const avatarUrls = await resolveAvatarUrls(items.map(r => r.employeeAvatarUrl))
        const resolvedItems = items.map((r, i) => ({ ...r, employeeAvatarUrl: avatarUrls[i] }))
    return { items: resolvedItems, nextCursor }
}

export async function upsertAttendance(tenantId: string, data: {
    employeeId: string
    date: string
    status: 'present' | 'absent' | 'half_day' | 'late' | 'wfh' | 'on_leave'
    checkIn?: string
    checkOut?: string
    notes?: string
}) {
    const { checkIn: ci, checkOut: co, ...rest } = data
    const mapped = {
        ...rest,
        checkIn: ci ? new Date(ci) : undefined,
        checkOut: co ? new Date(co) : undefined,
    }
    const existing = await db.select().from(attendanceRecords)
        .where(and(eq(attendanceRecords.tenantId, tenantId), eq(attendanceRecords.employeeId, data.employeeId), eq(attendanceRecords.date, data.date)))

    if (existing.length > 0) {
        const [rec] = await db.update(attendanceRecords)
            .set({ ...mapped, updatedAt: new Date() })
            .where(eq(attendanceRecords.id, existing[0].id))
            .returning()
        return rec
    }

    const [rec] = await db.insert(attendanceRecords).values({ tenantId, ...mapped }).returning()
    return rec
}

export async function getAttendanceSummary(tenantId: string, month: number, year: number) {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    const records = await db.select({
        employeeId: attendanceRecords.employeeId,
        status: attendanceRecords.status,
        count: sql<number>`count(*)::int`,
    }).from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.tenantId, tenantId),
            gte(attendanceRecords.date, startDate),
            lte(attendanceRecords.date, endDate)
        ))
        .groupBy(attendanceRecords.employeeId, attendanceRecords.status)

    return records
}

/**
 * External-punch entry point (Connected-App / mobile-app integration).
 *
 * Previously this bypassed `attendance_punches` and wrote a row straight
 * into the daily rollup — which meant biometric and mobile-device punches
 * lost their event-level audit trail (no row per press, no latitude /
 * longitude / locationName / deviceId columns). That was fine for a
 * "punch in once, punch out once" flow but the moment a single employee
 * had multiple sessions in a day (lunch out, lunch back, leave for the
 * day) the rollup got clobbered.
 *
 * We now route through `recordPunch` like every other punch path. That
 * gives us:
 *   • One row per press in `attendance_punches` (full audit trail).
 *   • `latitude`, `longitude`, `locationName` columns populated when the
 *     device supplies them (mobile apps with GPS, geofenced kiosks).
 *   • `deviceId` stored as a real column instead of stuffed into `notes`.
 *   • Daily rollup rebuilt deterministically from the canonical event log.
 *   • Reverse-geocoding into `locationName` when the device only sends
 *     coords — same Nominatim path as web punches.
 *
 * `deviceName` is folded into `notes` for visibility on HR's punch log
 * (the rollup column is still device-agnostic).
 */
export async function externalPunch(tenantId: string, params: {
    employeeId: string
    timestamp?: string
    deviceId?: string
    deviceName?: string
    punchType: 'in' | 'out'
    source?: 'biometric' | 'api' | 'mobile'
    latitude?: number | null
    longitude?: number | null
    locationName?: string | null
    notes?: string | null
}) {
    // The route's Zod enum already restricts `source` to one of three
    // values; we narrow further to what the punch row accepts (`api`
    // collapses to `biometric` since the schema column doesn't carry it).
    const punchSource: PunchInput['source'] =
        params.source === 'mobile' ? 'mobile'
            : params.source === 'biometric' ? 'biometric'
                : 'biometric' // 'api' or unset → biometric (the audit-trail bucket vendor integrations land in)

    // Compose a useful notes string when the device supplied a name.
    // HR sees "Punched via Suprema BioStation A2 — wing-3-door" in the
    // punch log, which is more actionable than a bare UUID.
    const notes = params.notes
        ?? (params.deviceName ? `Punched via ${params.deviceName}` : null)

    const { row } = await recordPunch(
        tenantId,
        params.employeeId,
        params.punchType,
        {
            recordedAt: params.timestamp,
            latitude: params.latitude ?? null,
            longitude: params.longitude ?? null,
            locationName: params.locationName ?? null,
            source: punchSource,
            deviceId: params.deviceId ?? null,
            notes,
        },
        null, // No user account behind a device punch; createdBy stays null.
    )

    // Return the freshly-rebuilt rollup so existing callers keep their
    // response shape (`{ data: AttendanceRecord }`).
    const day = row.date
    const [rec] = await db.select().from(attendanceRecords)
        .where(and(
            eq(attendanceRecords.tenantId, tenantId),
            eq(attendanceRecords.employeeId, params.employeeId),
            eq(attendanceRecords.date, day),
        ))
        .limit(1)
    return rec
}
