import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, format: 'short' | 'long' | 'relative' = 'short'): string {
  const d = new Date(date)
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

export function formatCurrency(amount: number, currency = 'AED'): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
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

export function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0])
    .join('')
    .toUpperCase()
}

export function generateId(): string {
  return Math.random().toString(36).substr(2, 9).toUpperCase()
}
