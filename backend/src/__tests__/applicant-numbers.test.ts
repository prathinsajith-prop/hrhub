import { describe, it, expect } from 'vitest'
import { parseOptionalCount, parseOptionalAmount } from '../lib/applicant-numbers.js'

describe('parseOptionalCount', () => {
    it('keeps a genuine 0 (regression: fresh graduate must not be lost to null)', () => {
        expect(parseOptionalCount('0')).toBe(0)
    })
    it('parses whole non-negative counts', () => {
        expect(parseOptionalCount('6')).toBe(6)
        expect(parseOptionalCount(' 12 ')).toBe(12)
    })
    it('returns null for empty / missing input', () => {
        expect(parseOptionalCount('')).toBeNull()
        expect(parseOptionalCount('   ')).toBeNull()
        expect(parseOptionalCount(undefined)).toBeNull()
        expect(parseOptionalCount(null)).toBeNull()
    })
    it('rejects non-integer, negative, and non-numeric input', () => {
        expect(parseOptionalCount('5.5')).toBeNull()
        expect(parseOptionalCount('-3')).toBeNull()
        expect(parseOptionalCount('negotiable')).toBeNull()
        expect(parseOptionalCount('abc')).toBeNull()
    })
})

describe('parseOptionalAmount', () => {
    it('keeps a genuine 0 as "0.00"', () => {
        expect(parseOptionalAmount('0')).toBe('0.00')
    })
    it('formats valid amounts to fixed-2 strings', () => {
        expect(parseOptionalAmount('15000')).toBe('15000.00')
        expect(parseOptionalAmount('12500.5')).toBe('12500.50')
    })
    it('returns null for empty input', () => {
        expect(parseOptionalAmount('')).toBeNull()
        expect(parseOptionalAmount(undefined)).toBeNull()
    })
    it('nulls non-numeric free text rather than storing 0 (regression: "negotiable")', () => {
        expect(parseOptionalAmount('negotiable')).toBeNull()
        expect(parseOptionalAmount('TBD')).toBeNull()
        expect(parseOptionalAmount('-100')).toBeNull()
    })
})
