// ─── Shared date / time formatting ──────────────────────────────────────
//
// Single source of truth for the small string-format helpers that used to
// live as private copies inside every page that displayed times or dates.
// Six copies (each subtly different — some returned `null`, some used
// `en-GB`, some used the default locale, some included seconds) led to a
// visibly inconsistent UI. Centralising forces every surface to render
// the same `09:00 AM`-style label.
//
// All helpers are pure: same input → same output, no side effects, safe
// inside `useMemo` / render bodies. Each one tolerates `null` /
// `undefined` / malformed input by returning an empty string so call
// sites can render `{formatTime(x)}` without a fallback ternary.

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Render an ISO timestamp as a `HH:MM AM/PM` clock time.
 * Empty string for nullish / unparseable input — never `null` so call
 * sites can drop the `?? ''` fallback.
 */
export function formatTime(iso: string | null | undefined): string {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
}

/** Render a Date as `DD-Mon-YYYY` (e.g. `25-May-2026`). */
export function formatDayLabel(d: Date): string {
    return `${String(d.getDate()).padStart(2, '0')}-${MONTHS_SHORT[d.getMonth()]}-${d.getFullYear()}`
}

/** Local-time `YYYY-MM-DD` — preferred over `toISOString().slice(0,10)`
 *  which serialises in UTC and silently shifts dates near midnight. */
export function toISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Local-time `YYYY-MM` for month-level queries (calendar fetches, etc.). */
export function toISOMonth(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Sunday-anchored start-of-week (UAE convention). Returns a fresh Date
 *  so callers can mutate it without affecting the original. */
export function startOfWeek(d: Date): Date {
    const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    out.setDate(out.getDate() - out.getDay())
    return out
}

/** Add `n` days to a date and return a fresh Date. */
export function addDays(d: Date, n: number): Date {
    const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    out.setDate(out.getDate() + n)
    return out
}

/**
 * Render an attendance day's worked time as `H:MM:SS`.
 *
 * Prefers the exact second-level delta between `checkIn` and `checkOut`
 * when both are present — the backend's `hoursWorked` field is stored as
 * decimal hours rounded to 2dp, which loses ~36 seconds of precision per
 * 1.0 hour and reads awkwardly to employees ("1.79 hrs" → "1:47:24").
 * Falls back to converting the decimal when only the rollup is available.
 *
 * Returns `'0:00:00'` for nullish / unparseable input so call sites can
 * render the value directly.
 */
export function formatHoursWorked(
    hoursDecimal: string | null | undefined,
    checkIn?: string | null,
    checkOut?: string | null,
): string {
    // Prefer direct calc when we have both ends of the punch — gives
    // second-level precision that the decimal field can't carry.
    if (checkIn && checkOut) {
        const startMs = Date.parse(checkIn)
        const endMs = Date.parse(checkOut)
        if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs) {
            return formatSeconds(Math.floor((endMs - startMs) / 1000))
        }
    }
    if (hoursDecimal) {
        // Backend may already use `H:MM` / `H:MM:SS` — keep it untouched.
        if (/^\d+:\d{2}(:\d{2})?$/.test(hoursDecimal)) {
            return hoursDecimal.includes(':') && hoursDecimal.split(':').length === 3
                ? hoursDecimal
                : `${hoursDecimal}:00`
        }
        // Decimal hours → seconds → H:MM:SS.
        const decimal = parseFloat(hoursDecimal)
        if (Number.isFinite(decimal) && decimal > 0) {
            return formatSeconds(Math.round(decimal * 3600))
        }
    }
    return '0:00:00'
}

function formatSeconds(totalSec: number): string {
    const safe = Math.max(0, totalSec)
    const h = Math.floor(safe / 3600)
    const m = Math.floor((safe % 3600) / 60)
    const s = safe % 60
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
