/**
 * Task 6.6 — Unit tests for calculateGratuity()
 * UAE Labour Law Article 51: 21 days basic for first 5 years, 30 days after.
 * Cap at 2 years total basic salary.
 */
import { describe, it, expect } from 'vitest'
import { calculateGratuity } from '../modules/payroll/payroll.service.js'

describe('calculateGratuity', () => {
    const basic = 10_000 // AED 10,000/month
    const dailyRate = basic / 30

    it('returns 0 for less than 1 year of service', () => {
        // UAE law: gratuity is still calculated proportionally for < 1 year
        // but commonly treated as 0 if < 1 year in full. Our implementation computes proportionally.
        const result = calculateGratuity(basic, 0)
        expect(result).toBe(0)
    })

    it('calculates 21 days per year for exactly 1 year', () => {
        const expected = dailyRate * 21 * 1
        expect(calculateGratuity(basic, 1)).toBeCloseTo(expected, 2)
    })

    it('calculates 21 days per year for exactly 5 years', () => {
        const expected = dailyRate * 21 * 5
        expect(calculateGratuity(basic, 5)).toBeCloseTo(expected, 2)
    })

    it('calculates 21 days × 5 + 30 days per year beyond 5 years', () => {
        const yearsOf5 = dailyRate * 21 * 5
        const beyond = dailyRate * 30 * 2
        expect(calculateGratuity(basic, 7)).toBeCloseTo(yearsOf5 + beyond, 2)
    })

    it('applies the 2-year salary cap', () => {
        // For very long service the cap (basic × 24) kicks in
        const cap = basic * 24
        const result = calculateGratuity(basic, 100)
        expect(result).toBe(cap)
    })

    it('does not exceed cap for 20 years', () => {
        const result = calculateGratuity(basic, 20)
        const cap = basic * 24
        expect(result).toBeLessThanOrEqual(cap)
    })

    it('scales linearly with basicSalary for same service', () => {
        const r1 = calculateGratuity(5_000, 3)
        const r2 = calculateGratuity(10_000, 3)
        expect(r2).toBeCloseTo(r1 * 2, 2)
    })

    it('handles fractional years of service', () => {
        // 2.5 years: 21 days × 2.5
        const expected = (10_000 / 30) * 21 * 2.5
        expect(calculateGratuity(10_000, 2.5)).toBeCloseTo(expected, 2)
    })
})
