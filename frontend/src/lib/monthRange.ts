/**
 * Convert a month offset (0 = current month, negative = past months) into the
 * derived values shared by the team attendance page and the per-employee
 * attendance tab:
 *
 * - `month`: 'YYYY-MM' string consumed by `/attendance/calendar`
 * - `start` / `end`: 'YYYY-MM-DD' bounds consumed by `/attendance`
 * - `label`: human-readable display for headers
 *
 * Centralising this guarantees the page and the tab agree on the same window.
 */
export function resolveMonthFromOffset(offset: number): {
    month: string
    label: string
    start: string
    end: string
} {
    const d = new Date()
    d.setMonth(d.getMonth() + offset)
    const year = d.getFullYear()
    const monthIdx = d.getMonth()
    const month = `${year}-${String(monthIdx + 1).padStart(2, '0')}`
    const start = new Date(year, monthIdx, 1).toISOString().split('T')[0]
    const end = new Date(year, monthIdx + 1, 0).toISOString().split('T')[0]
    const label = d.toLocaleString('en-AE', { month: 'long', year: 'numeric' })
    return { month, label, start, end }
}
