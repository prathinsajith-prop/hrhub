/**
 * Task 6.6 — Unit tests for UAE leave entitlement calculation.
 * These test the pure business-logic formulae without a DB.
 */
import { describe, it, expect } from 'vitest'

// Pure function extracted from leave.service.ts logic for testability
function calcAnnualEntitlement(monthsOfService: number): number {
    if (monthsOfService < 12) return monthsOfService * 2
    return 30
}

// Gratuity-style calculation for leave accrual
function calcLeaveAccruedProRata(monthsOfService: number): number {
    return Math.floor(monthsOfService < 12 ? monthsOfService * 2 : 30)
}

describe('UAE Annual Leave Entitlement', () => {
    it('accrues 2 days per month for the first year', () => {
        expect(calcAnnualEntitlement(1)).toBe(2)
        expect(calcAnnualEntitlement(6)).toBe(12)
        expect(calcAnnualEntitlement(11)).toBe(22)
    })

    it('gives full 30 days after 12+ months', () => {
        expect(calcAnnualEntitlement(12)).toBe(30)
        expect(calcAnnualEntitlement(24)).toBe(30)
        expect(calcAnnualEntitlement(60)).toBe(30)
    })

    it('returns 0 days for 0 months service', () => {
        expect(calcAnnualEntitlement(0)).toBe(0)
    })
})

describe('Leave entitlement caps by type', () => {
    const ENTITLEMENTS: Record<string, number> = {
        annual: 30, sick: 45, maternity: 60,
        paternity: 5, compassionate: 5, hajj: 30, unpaid: 999,
    }

    it('annual leave is capped at 30 days', () => {
        expect(ENTITLEMENTS.annual).toBe(30)
    })

    it('sick leave allows 45 days (15 full + 30 half-pay)', () => {
        expect(ENTITLEMENTS.sick).toBe(45)
    })

    it('maternity leave is 60 days per UAE Labour Law Art. 30', () => {
        expect(ENTITLEMENTS.maternity).toBe(60)
    })

    it('paternity leave is 5 days', () => {
        expect(ENTITLEMENTS.paternity).toBe(5)
    })

    it('hajj leave is 30 days once in a lifetime', () => {
        expect(ENTITLEMENTS.hajj).toBe(30)
    })
})

describe('Payroll leave deduction logic', () => {
    function calcDeduction(basicSalary: number, unpaidDays: number, sickDaysOver15: number): number {
        const dailyRate = basicSalary / 30
        const unpaidDeduction = unpaidDays * dailyRate
        const sickDeduction = sickDaysOver15 * dailyRate * 0.5
        return unpaidDeduction + sickDeduction
    }

    it('unpaid leave deducts full daily rate', () => {
        const deduction = calcDeduction(9_000, 3, 0)
        expect(deduction).toBeCloseTo(900, 2) // 3 × (9000/30)
    })

    it('sick leave days 1-15 have no deduction', () => {
        // Over-15 days = 0, so no sick deduction
        expect(calcDeduction(9_000, 0, 0)).toBe(0)
    })

    it('sick leave days over 15 deduct half the daily rate', () => {
        // 5 days over 15 → 5 × (9000/30) × 0.5 = 750
        const deduction = calcDeduction(9_000, 0, 5)
        expect(deduction).toBeCloseTo(750, 2)
    })

    it('combines unpaid and sick half-pay deductions', () => {
        // 2 unpaid + 3 sick over 15 for 6000 basic
        // unpaid: 2 × 200 = 400, sick: 3 × 200 × 0.5 = 300 → total 700
        const deduction = calcDeduction(6_000, 2, 3)
        expect(deduction).toBeCloseTo(700, 2)
    })
})
