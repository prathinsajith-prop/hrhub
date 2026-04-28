/**
 * Task 6.9 — Frontend utility function tests.
 * Tests for formatDate, formatCurrency, getInitials, getExpiryStatus.
 */
import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, getInitials, getExpiryStatus, getDaysUntilExpiry } from '@/lib/utils'

describe('formatCurrency', () => {
    it('formats AED with no decimals', () => {
        const result = formatCurrency(10000)
        expect(result).toContain('10,000')
        expect(result).toContain('AED')
    })

    it('rounds to nearest integer', () => {
        const result = formatCurrency(9999.99)
        expect(result).toContain('10,000')
    })

    it('formats zero correctly', () => {
        const result = formatCurrency(0)
        expect(result).toContain('0')
    })
})

describe('getInitials', () => {
    it('returns first two initials from a full name', () => {
        expect(getInitials('John Smith')).toBe('JS')
    })

    it('handles single name', () => {
        expect(getInitials('Admin')).toBe('A')
    })

    it('uppercases initials', () => {
        expect(getInitials('ahmed ali')).toBe('AA')
    })

    it('ignores more than two words', () => {
        expect(getInitials('John Michael Smith')).toBe('JM')
    })
})

describe('getExpiryStatus', () => {
    const future = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() + days)
        return d.toISOString().split('T')[0]
    }
    const past = (days: number) => {
        const d = new Date()
        d.setDate(d.getDate() - days)
        return d.toISOString().split('T')[0]
    }

    it('returns "expired" for past dates', () => {
        expect(getExpiryStatus(past(1))).toBe('expired')
    })

    it('returns "critical" for ≤30 days', () => {
        expect(getExpiryStatus(future(15))).toBe('critical')
        expect(getExpiryStatus(future(30))).toBe('critical')
    })

    it('returns "warning" for 31-90 days', () => {
        expect(getExpiryStatus(future(60))).toBe('warning')
    })

    it('returns "good" for >90 days', () => {
        expect(getExpiryStatus(future(120))).toBe('good')
    })
})

describe('getDaysUntilExpiry', () => {
    it('returns positive days for future date', () => {
        const d = new Date()
        d.setDate(d.getDate() + 30)
        expect(getDaysUntilExpiry(d.toISOString())).toBe(30)
    })

    it('returns negative days for past date', () => {
        const d = new Date()
        d.setDate(d.getDate() - 5)
        expect(getDaysUntilExpiry(d.toISOString())).toBeLessThan(0)
    })
})

describe('formatDate', () => {
    const knownDate = '2024-03-15'

    it('short format includes day, month abbreviation, and year', () => {
        const result = formatDate(knownDate, 'short')
        expect(result).toContain('2024')
        expect(result).toMatch(/Mar|15/)
    })

    it('long format includes full month name and year', () => {
        const result = formatDate(knownDate, 'long')
        expect(result).toContain('March')
        expect(result).toContain('2024')
    })

    it('relative format returns "Today" for today', () => {
        const today = new Date().toISOString()
        expect(formatDate(today, 'relative')).toBe('Today')
    })

    it('relative format returns "Yesterday" for 1 day ago', () => {
        const d = new Date()
        d.setDate(d.getDate() - 1)
        expect(formatDate(d.toISOString(), 'relative')).toBe('Yesterday')
    })

    it('relative format returns "N days ago" for recent past', () => {
        const d = new Date()
        d.setDate(d.getDate() - 5)
        expect(formatDate(d.toISOString(), 'relative')).toBe('5 days ago')
    })

    it('relative format returns weeks for 7-29 day old dates', () => {
        const d = new Date()
        d.setDate(d.getDate() - 14)
        expect(formatDate(d.toISOString(), 'relative')).toBe('2 weeks ago')
    })

    it('defaults to short format when no format is specified', () => {
        const short = formatDate(knownDate, 'short')
        const defaultResult = formatDate(knownDate)
        expect(defaultResult).toBe(short)
    })

    it('accepts a Date object as input', () => {
        const d = new Date('2024-06-01')
        const result = formatDate(d, 'long')
        expect(result).toContain('2024')
        expect(result).toContain('June')
    })
})
