/**
 * Coercion for free-text numeric applicant fields (public careers apply, etc.).
 *
 * The careers form sends these as raw multipart strings, so a candidate can type
 * "0", "negotiable", or leave them blank. Naive `Number(x) || null` collapses a
 * genuine 0 to null and turns non-numeric text into 0 — both wrong. These helpers
 * distinguish "empty" (→ null) from a real value, and reject invalid input.
 */

/** Whole, non-negative count (e.g. years of experience). '0' → 0, '' → null, 'abc' → null. */
export function parseOptionalCount(raw?: string | null): number | null {
    const s = raw?.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : null
}

/** Non-negative money amount as a fixed-2 string for a numeric column. '' / 'negotiable' → null. */
export function parseOptionalAmount(raw?: string | null): string | null {
    const s = raw?.trim()
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null
}
