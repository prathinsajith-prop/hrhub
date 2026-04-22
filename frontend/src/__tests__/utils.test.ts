/**
 * Task 6.9 — Frontend utility function tests.
 * Tests for formatDate, formatCurrency, getInitials, getExpiryStatus.
 */
import { describe, it, expect } from 'vitest'
import { formatCurrency, getInitials, getExpiryStatus, getDaysUntilExpiry } from '@/lib/utils'

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
