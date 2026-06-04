import type { KeyboardEvent } from 'react'
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Keyboard handler that fires on Enter/Space — the activation keys for buttons.
 * Use on non-button elements (e.g. clickable `<div role="button">`) so they
 * behave like real buttons for keyboard users.
 */
export function onActivate(handler: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handler()
    }
  }
}

export function formatDate(date: string | Date | null | undefined, format: 'short' | 'long' | 'relative' = 'short'): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  if (format === 'relative') {
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    if (days < 365) return `${Math.floor(days / 30)} months ago`
    return `${Math.floor(days / 365)} years ago`
  }
  if (format === 'long') {
    return d.toLocaleDateString('en-AE', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  return d.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Date + time, e.g. "08 May 2026, 14:32". Useful for "last login" / audit fields. */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—'
  const d = new Date(date)
  if (isNaN(d.getTime())) return '—'
  const datePart = d.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
  const timePart = d.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${datePart}, ${timePart}`
}

// Cache one Intl.NumberFormat per currency code. Constructing these is
// surprisingly expensive - formatCurrency runs hundreds of times in
// tables, so memoising by currency saves dozens of allocations per render.
const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>()
function getCurrencyFormatter(currency: string): Intl.NumberFormat {
  let fmt = CURRENCY_FORMATTERS.get(currency)
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-AE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    CURRENCY_FORMATTERS.set(currency, fmt)
  }
  return fmt
}

export function formatCurrency(amount: number, currency = 'AED'): string {
  return getCurrencyFormatter(currency).format(amount)
}

export function getDaysUntilExpiry(expiryDate: string): number {
  const expiry = new Date(expiryDate)
  const now = new Date()
  const diff = expiry.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

export function getExpiryStatus(expiryDate: string): 'expired' | 'critical' | 'warning' | 'good' {
  const days = getDaysUntilExpiry(expiryDate)
  if (days < 0) return 'expired'
  if (days <= 30) return 'critical'
  if (days <= 90) return 'warning'
  return 'good'
}

export function getInitials(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

/**
 * Split a free-form full name into `{ firstName, lastName }`. The first token
 * is the first name; everything after is collapsed into the last name. Falls
 * back to using the first token for last name if only one is present.
 */
export function splitFullName(full: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = (full ?? '').trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const [firstName, ...rest] = trimmed.split(/\s+/)
  const lastName = rest.join(' ') || firstName
  return { firstName, lastName }
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9).toUpperCase()
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  return `${Math.round(bytes / 1024)} KB`
}

/** Strip characters that can't appear in a phone number. Keeps digits, +, spaces, -, (, ), . */
export function sanitizePhone(value: string): string {
  return value.replace(/[^\d+\s\-().]/g, '')
}
