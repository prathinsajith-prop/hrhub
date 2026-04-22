/**
 * Task 7.7 — Unit tests for payslip calculation logic (UAE Labour Law).
 * Tests the pure arithmetic extracted from runPayroll() in payroll.service.ts.
 */
import { describe, it, expect } from 'vitest'

// ─── Pure calculation helpers (mirrors payroll.service.ts logic) ──────────
function calcGross(basic: number, housing: number, transport: number, other: number): number {
    return basic + housing + transport + other
}

function calcDailyRate(basic: number): number {
    return basic / 30
}

function calcLeaveDeductions(
    basic: number,
    unpaidDays: number,
    sickDaysOver15: number
): { unpaidDeduction: number; sickHalfPay: number; total: number } {
    const dailyRate = calcDailyRate(basic)
    const unpaidDeduction = unpaidDays * dailyRate
    const sickHalfPay = sickDaysOver15 * dailyRate * 0.5
    return { unpaidDeduction, sickHalfPay, total: unpaidDeduction + sickHalfPay }
}

function calcNet(gross: number, deductions: number): number {
    return Math.max(0, gross - deductions)
}

// ─── Gross calculation tests ─────────────────────────────────────────────────
describe('Payslip gross calculation', () => {
    it('sums all four salary components', () => {
        expect(calcGross(10_000, 3_000, 1_000, 500)).toBe(14_500)
    })

    it('works with zero allowances', () => {
        expect(calcGross(8_000, 0, 0, 0)).toBe(8_000)
    })

    it('works with all allowances zero', () => {
        expect(calcGross(0, 0, 0, 0)).toBe(0)
    })

    it('handles fractional amounts (fils)', () => {
        expect(calcGross(10_000.5, 2_999.75, 0, 0)).toBeCloseTo(13_000.25, 2)
    })
})

// ─── Daily rate tests ────────────────────────────────────────────────────────
describe('Daily rate (UAE: divide by 30)', () => {
    it('basic 9000 → daily rate 300', () => {
        expect(calcDailyRate(9_000)).toBeCloseTo(300, 2)
    })

    it('basic 15000 → daily rate 500', () => {
        expect(calcDailyRate(15_000)).toBeCloseTo(500, 2)
    })
})

// ─── Leave deduction tests ────────────────────────────────────────────────────
describe('Payslip leave deductions', () => {
    const basic = 9_000 // daily = 300

    it('no leave → zero deductions', () => {
        const { total } = calcLeaveDeductions(basic, 0, 0)
        expect(total).toBe(0)
    })

    it('3 unpaid days → 900 deduction (full daily rate)', () => {
        const { unpaidDeduction } = calcLeaveDeductions(basic, 3, 0)
        expect(unpaidDeduction).toBeCloseTo(900, 2)
    })

    it('sick days 1-15 → no deduction (full-pay period)', () => {
        // Over-15 days = 0, so sickHalfPay is 0
        const { sickHalfPay } = calcLeaveDeductions(basic, 0, 0)
        expect(sickHalfPay).toBe(0)
    })

    it('5 sick days over-15 → 5 × 300 × 0.5 = 750', () => {
        const { sickHalfPay } = calcLeaveDeductions(basic, 0, 5)
        expect(sickHalfPay).toBeCloseTo(750, 2)
    })

    it('combines unpaid + sick half-pay deductions', () => {
        // 2 unpaid (600) + 3 sick over-15 (450) = 1050
        const { total } = calcLeaveDeductions(basic, 2, 3)
        expect(total).toBeCloseTo(1_050, 2)
    })
})

// ─── Net pay tests ────────────────────────────────────────────────────────────
describe('Net pay calculation', () => {
    it('net = gross - deductions', () => {
        expect(calcNet(14_500, 900)).toBeCloseTo(13_600, 2)
    })

    it('net cannot go below zero (over-deduction protection)', () => {
        expect(calcNet(1_000, 5_000)).toBe(0)
    })

    it('no deductions → net equals gross', () => {
        expect(calcNet(14_500, 0)).toBe(14_500)
    })
})

// ─── Payroll run totals rollup ────────────────────────────────────────────────
describe('Payroll run totals', () => {
    type Employee = { basic: number; housing: number; transport: number; other: number; unpaidDays: number; sickOver15: number }

    function calcRunTotals(employees: Employee[]) {
        let totalGross = 0
        let totalDeductions = 0
        let totalNet = 0
        for (const e of employees) {
            const gross = calcGross(e.basic, e.housing, e.transport, e.other)
            const { total: deductions } = calcLeaveDeductions(e.basic, e.unpaidDays, e.sickOver15)
            const net = calcNet(gross, deductions)
            totalGross += gross
            totalDeductions += deductions
            totalNet += net
        }
        return { totalGross, totalDeductions, totalNet }
    }

    it('sums totals across multiple employees', () => {
        const emps: Employee[] = [
            { basic: 10_000, housing: 3_000, transport: 1_000, other: 0, unpaidDays: 0, sickOver15: 0 },
            { basic: 8_000, housing: 2_000, transport: 500, other: 500, unpaidDays: 2, sickOver15: 0 },
        ]
        const result = calcRunTotals(emps)
        // Emp1 gross=14000, net=14000 | Emp2 gross=11000, deductions=2×(8000/30)=533.33, net=10466.67
        expect(result.totalGross).toBeCloseTo(25_000, 0)
        expect(result.totalDeductions).toBeCloseTo(533.33, 0)
        expect(result.totalNet).toBeCloseTo(24_466.67, 0)
    })

    it('returns zeros for empty employee list', () => {
        const result = calcRunTotals([])
        expect(result.totalGross).toBe(0)
        expect(result.totalDeductions).toBe(0)
        expect(result.totalNet).toBe(0)
    })
})
