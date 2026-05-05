/**
 * Unit tests for UAE exit settlement calculations.
 * Tests the pure calculateGratuity function from exit.service.ts against
 * Federal Decree-Law No. 33 of 2021 (Art. 51).
 */
import { describe, it, expect } from 'vitest'
import { calculateGratuity } from '../modules/exit/exit.service.js'

// ─── UAE Gratuity Rules (Art. 51, Federal Decree-Law No. 33 of 2021) ─────────
// - < 1 year: zero
// - Years 1–5: 21 working days × basic salary / 30 × years
// - Years 5+:  (21 days × 5 years) + (30 days × (years - 5)), same daily rate
// - Cap: 2 years (24 months) basic salary

describe('calculateGratuity — below minimum service threshold', () => {
    it('returns 0 for less than 1 year of service', () => {
        expect(calculateGratuity(10_000, 0.5)).toBe(0)
        expect(calculateGratuity(10_000, 0)).toBe(0)
        expect(calculateGratuity(10_000, 0.99)).toBe(0)
    })
})

describe('calculateGratuity — first 5 years (21 working days/year)', () => {
    it('calculates correctly at exactly 1 year', () => {
        // daily = 10000/30 = 333.33, gratuity = 333.33 × 21 × 1 = 7000
        expect(calculateGratuity(10_000, 1)).toBeCloseTo(7_000, 2)
    })

    it('calculates correctly at 2 years', () => {
        // daily = 10000/30 = 333.33, gratuity = 333.33 × 21 × 2 = 14000
        expect(calculateGratuity(10_000, 2)).toBeCloseTo(14_000, 2)
    })

    it('calculates correctly at exactly 5 years', () => {
        // daily = 10000/30 = 333.33, gratuity = 333.33 × 21 × 5 = 35000
        expect(calculateGratuity(10_000, 5)).toBeCloseTo(35_000, 2)
    })

    it('scales linearly with salary', () => {
        const low = calculateGratuity(5_000, 3)
        const high = calculateGratuity(10_000, 3)
        expect(high).toBeCloseTo(low * 2, 1)
    })
})

describe('calculateGratuity — beyond 5 years (30 working days/year for excess)', () => {
    it('calculates correctly at 6 years', () => {
        // daily = 10000/30 = 333.33
        // first 5: 333.33 × 21 × 5 = 35000
        // year 6:  333.33 × 30 × 1 = 10000
        // total = 45000
        expect(calculateGratuity(10_000, 6)).toBeCloseTo(45_000, 2)
    })

    it('calculates correctly at 10 years', () => {
        // first 5: 35000
        // years 6–10: 333.33 × 30 × 5 = 50000
        // total = 85000
        expect(calculateGratuity(10_000, 10)).toBeCloseTo(85_000, 2)
    })

    it('uses 30-day rate only for years beyond 5, not the entire tenure', () => {
        const fiveYears = calculateGratuity(10_000, 5)
        const sixYears = calculateGratuity(10_000, 6)
        const increment = sixYears - fiveYears
        // Increment for year 6 = 30 days × (10000/30) = 10000
        expect(increment).toBeCloseTo(10_000, 2)
    })
})

describe('calculateGratuity — 24-month cap', () => {
    it('caps at 24 months (2 × basic salary) for very long tenure', () => {
        // 40 years would give: 35000 + 333.33 × 30 × 35 = 385000, cap = 240000
        expect(calculateGratuity(10_000, 40)).toBe(10_000 * 24)
    })

    it('cap is exactly 24x monthly basic, not 24x daily × 30', () => {
        const cap = calculateGratuity(15_000, 50)
        expect(cap).toBe(15_000 * 24)
    })

    it('is not capped when tenure is short enough', () => {
        // 10 years: 85000 < cap of 240000
        expect(calculateGratuity(10_000, 10)).toBeLessThan(10_000 * 24)
    })
})

// ─── Derived settlement components (mirrors calculateSettlement inline logic) ─

describe('Leave encashment calculation', () => {
    function calcLeaveEncashment(basicSalary: number, unusedDays: number): number {
        return unusedDays * (basicSalary / 30)
    }

    it('zero unused days → zero encashment', () => {
        expect(calcLeaveEncashment(10_000, 0)).toBe(0)
    })

    it('30 unused days = one month basic salary', () => {
        expect(calcLeaveEncashment(10_000, 30)).toBeCloseTo(10_000, 2)
    })

    it('fractional unused days are supported', () => {
        expect(calcLeaveEncashment(9_000, 5.5)).toBeCloseTo(1_650, 2)
    })
})

describe('Unpaid salary pro-ration', () => {
    function calcUnpaidSalary(totalSalary: number, daysWorked: number, daysInMonth: number): number {
        return (totalSalary / daysInMonth) * daysWorked
    }

    it('full month (28 days worked in Feb) = full salary', () => {
        expect(calcUnpaidSalary(14_000, 28, 28)).toBeCloseTo(14_000, 2)
    })

    it('half month = half salary', () => {
        expect(calcUnpaidSalary(14_000, 15, 30)).toBeCloseTo(7_000, 2)
    })

    it('first day of month = 1/daysInMonth of salary', () => {
        expect(calcUnpaidSalary(30_000, 1, 30)).toBeCloseTo(1_000, 2)
    })
})

describe('Total settlement', () => {
    it('sums all three components minus deductions, floor at zero', () => {
        function totalSettlement(gratuity: number, encashment: number, unpaid: number, deductions: number): number {
            return Math.max(0, gratuity + encashment + unpaid - deductions)
        }
        expect(totalSettlement(35_000, 5_000, 7_000, 2_000)).toBeCloseTo(45_000, 2)
        expect(totalSettlement(1_000, 0, 0, 5_000)).toBe(0)
    })
})
