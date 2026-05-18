import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

// Hoisted formatter cache — Intl constructors allocate dozens of internal objects
// per locale lookup, so we keep one formatter per currency rather than allocating
// a fresh one on every call to formatCurrency().
const currencyFormatters = new Map<string, Intl.NumberFormat>()
function getCurrencyFormatter(currency: string): Intl.NumberFormat {
    let f = currencyFormatters.get(currency)
    if (!f) {
        f = new Intl.NumberFormat('en-AE', { style: 'currency', currency, maximumFractionDigits: 2 })
        currencyFormatters.set(currency, f)
    }
    return f
}

export function formatCurrency(value: number | string | null | undefined, currency = 'AED'): string {
    if (value == null || value === '') return '—'
    const n = typeof value === 'string' ? Number(value) : value
    if (Number.isNaN(n)) return '—'
    return getCurrencyFormatter(currency).format(n)
}

export function formatDate(
    value: string | null | undefined,
    opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' },
): string {
    if (!value) return '—'
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB', opts)
}

// Pre-computed long month names (Jan–Dec). monthName() used to allocate a fresh
// Date object on every render of the payslip list and chart axes.
const MONTHS_LONG = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]
export function monthName(month: number): string {
    return MONTHS_LONG[(month - 1 + 12) % 12] ?? ''
}

/**
 * Format an HH:MM 24-hour time string ("09:00") to the user's locale-friendly
 * 12-hour form ("9:00 AM"). Returns null for unset/invalid input so callers
 * can decide whether to fall back to a placeholder or hide the field entirely.
 */
function formatTime12(hhmm: string | null | undefined): string | null {
    if (!hhmm) return null
    const m = /^(\d{1,2}):(\d{2})/.exec(hhmm)
    if (!m) return null
    const h = Number(m[1])
    const mins = Number(m[2])
    if (!Number.isFinite(h) || !Number.isFinite(mins) || h < 0 || h > 23 || mins < 0 || mins > 59) return null
    const period = h >= 12 ? 'PM' : 'AM'
    const h12 = ((h + 11) % 12) + 1
    return `${h12}:${String(mins).padStart(2, '0')} ${period}`
}

/**
 * Return a "9:00 AM → 5:00 PM" range, or null if shift isn't configured.
 */
export function formatShiftRange(
    start: string | null | undefined,
    end: string | null | undefined,
): string | null {
    const s = formatTime12(start)
    const e = formatTime12(end)
    if (!s && !e) return null
    return `${s ?? '—'} → ${e ?? '—'}`
}

export function initialsOf(name: string | undefined | null): string {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
