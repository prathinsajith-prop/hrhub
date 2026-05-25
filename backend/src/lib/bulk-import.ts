// ─── Shared bulk-import helpers ─────────────────────────────────────────────
//
// Two surfaces every bulk-import endpoint shares:
//
//   1. Template generation — `buildTemplateXlsx` produces a downloadable
//      `.xlsx` with a header row + 1-2 sample data rows so users can fill
//      it in instead of guessing the schema.
//
//   2. Row-level validation — `validateRows` takes an array of raw objects
//      and an inline per-row validator that returns either `{ ok, value }`
//      or `{ ok: false, errors }`. The output is a uniformly-shaped
//      `RowResult[]` that the FE can render in a preview table with red
//      rows for invalid entries and green for ready-to-commit.
//
// Validate-then-commit is the established pattern (see attendance bulk
// import + assets bulk import). The shared types here let any new module
// pick up the same UX with ~30 lines of glue.

import * as XLSX from 'xlsx'

/** Per-cell result after validation. */
export interface RowResult<T> {
    /** 1-based row number from the source spreadsheet (for HR error messages). */
    rowNumber: number
    /** Raw values as they came off the sheet (preserved for the preview). */
    raw: Record<string, unknown>
    /** Parsed + coerced value when validation passed. */
    value?: T
    /** Per-field error messages keyed by column name. Empty when ok. */
    errors: string[]
    /** Convenience flag — true when `errors.length === 0`. */
    ok: boolean
}

export interface TemplateColumn {
    /** Column header text (matches what the validator looks up). */
    key: string
    /** Width hint in characters. Optional. */
    width?: number
}

export interface TemplateSpec {
    sheetName: string
    columns: TemplateColumn[]
    /** Two sample rows so users see the expected format. */
    sampleRows: Array<Record<string, unknown>>
}

/**
 * Build an in-memory XLSX buffer from a template spec. Returns the bytes
 * ready to write to a Fastify reply.
 */
export function buildTemplateXlsx(spec: TemplateSpec): Buffer {
    const headers = spec.columns.map((c) => c.key)
    const aoa: unknown[][] = [headers, ...spec.sampleRows.map((r) => headers.map((h) => r[h] ?? ''))]
    const sheet = XLSX.utils.aoa_to_sheet(aoa)
    if (spec.columns.some((c) => c.width)) {
        sheet['!cols'] = spec.columns.map((c) => ({ wch: c.width ?? 18 }))
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, spec.sheetName)
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

/**
 * Validates a list of raw row objects using the provided row validator.
 * `validateRow` returns either `{ ok: true, value }` (parsed) or
 * `{ ok: false, errors }` (list of human messages).
 *
 * Returns one `RowResult` per input row — the FE renders them with
 * row-level errors highlighted. Caller decides whether to commit the OK
 * subset on a separate POST.
 */
export type RowValidation<T> =
    | { ok: true; value: T }
    | { ok: false; errors: string[] }

export function validateRows<T>(
    rows: Array<Record<string, unknown>>,
    validateRow: (row: Record<string, unknown>, rowNumber: number) => RowValidation<T>,
): RowResult<T>[] {
    return rows.map((raw, i) => {
        const rowNumber = i + 2 // header row is 1
        const out = validateRow(raw, rowNumber)
        if (out.ok === true) {
            return { rowNumber, raw, value: out.value, errors: [], ok: true }
        }
        return { rowNumber, raw, errors: out.errors, ok: false }
    })
}

// ── Field coercion helpers ──────────────────────────────────────────────
// These deliberately accept the raw cell value (`unknown`) and return
// either a typed value or an error message. Composable: a row validator
// just calls each one and accumulates errors.

export function asString(v: unknown): string | null {
    if (v == null) return null
    const s = String(v).trim()
    return s.length === 0 ? null : s
}

export function asDate(v: unknown): { ok: true; value: string } | { ok: false; error: string } {
    if (v == null || v === '') return { ok: false, error: 'date is required' }
    // Excel dates round-trip as numbers; the xlsx package normalises to Date
    // when `cellDates: true` is set on the read — but the FE-parsed payload
    // can be either an ISO string or a Date instance.
    if (v instanceof Date) {
        const iso = v.toISOString().slice(0, 10)
        return { ok: true, value: iso }
    }
    const s = String(v).trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return { ok: true, value: s }
    }
    // Try Date.parse for ISO-with-time or 'D/M/YYYY' shapes
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) {
        return { ok: true, value: d.toISOString().slice(0, 10) }
    }
    return { ok: false, error: `invalid date "${s}" (use YYYY-MM-DD)` }
}

export function asInt(v: unknown, opts?: { min?: number; max?: number }): { ok: true; value: number } | { ok: false; error: string } {
    if (v == null || v === '') return { ok: true, value: 0 } // permit empty → caller filters
    const n = typeof v === 'number' ? v : Number(String(v).trim())
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
        return { ok: false, error: `expected integer, got "${v}"` }
    }
    if (opts?.min != null && n < opts.min) return { ok: false, error: `must be ≥ ${opts.min}` }
    if (opts?.max != null && n > opts.max) return { ok: false, error: `must be ≤ ${opts.max}` }
    return { ok: true, value: n }
}

export function asBool(v: unknown): boolean {
    if (typeof v === 'boolean') return v
    if (v == null || v === '') return false
    const s = String(v).trim().toLowerCase()
    return s === 'true' || s === 'yes' || s === 'y' || s === '1'
}
