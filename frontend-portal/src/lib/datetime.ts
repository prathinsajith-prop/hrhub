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
