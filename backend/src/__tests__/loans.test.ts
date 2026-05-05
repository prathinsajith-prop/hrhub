/**
 * Unit tests for employee loan calculation logic.
 * Tests the pure arithmetic used in loans.service.ts for installment
 * scheduling and payment recording without requiring a database.
 */
import { describe, it, expect } from 'vitest'

// ─── Pure helpers (mirrors loans.service.ts logic) ────────────────────────────

function calcTotalInstallments(amount: number, monthlyDeduction: number): number | null {
    return monthlyDeduction > 0 ? Math.ceil(amount / monthlyDeduction) : null
}

function recordPayment(
    current: number,
    monthly: number,
    paidInstallments: number,
): { newBalance: number; newPaid: number; newStatus: 'active' | 'completed' } {
    const newBalance = Math.max(0, current - monthly)
    const newPaid = paidInstallments + 1
    const newStatus = newBalance === 0 ? 'completed' : 'active'
    return { newBalance, newPaid, newStatus }
}

// ─── Installment calculation ──────────────────────────────────────────────────

describe('calcTotalInstallments', () => {
    it('divides evenly when amount is a multiple of monthly deduction', () => {
        expect(calcTotalInstallments(12_000, 1_000)).toBe(12)
    })

    it('rounds up when amount does not divide evenly', () => {
        expect(calcTotalInstallments(10_000, 3_000)).toBe(4)
    })

    it('returns 1 when deduction exceeds the principal', () => {
        expect(calcTotalInstallments(5_000, 6_000)).toBe(1)
    })

    it('returns null when monthly deduction is zero', () => {
        expect(calcTotalInstallments(10_000, 0)).toBeNull()
    })

    it('handles fractional amounts correctly', () => {
        expect(calcTotalInstallments(10_500, 1_000)).toBe(11)
        expect(calcTotalInstallments(10_001, 1_000)).toBe(11)
        expect(calcTotalInstallments(10_000, 1_000)).toBe(10)
    })
})

// ─── Payment recording ────────────────────────────────────────────────────────

describe('recordPayment — balance reduction', () => {
    it('reduces balance by monthly deduction', () => {
        const { newBalance } = recordPayment(10_000, 1_000, 0)
        expect(newBalance).toBeCloseTo(9_000, 2)
    })

    it('balance never goes below zero (final payment with rounding remainder)', () => {
        const { newBalance } = recordPayment(500, 1_000, 9)
        expect(newBalance).toBe(0)
    })

    it('balance floors at zero even with large deduction', () => {
        const { newBalance } = recordPayment(100, 5_000, 0)
        expect(newBalance).toBe(0)
    })
})

describe('recordPayment — status transitions', () => {
    it('stays active while balance remains', () => {
        const { newStatus } = recordPayment(10_000, 1_000, 5)
        expect(newStatus).toBe('active')
    })

    it('transitions to completed when balance reaches zero', () => {
        const { newStatus } = recordPayment(1_000, 1_000, 11)
        expect(newStatus).toBe('completed')
    })

    it('transitions to completed when overpaid (floored to zero)', () => {
        const { newStatus } = recordPayment(500, 1_000, 11)
        expect(newStatus).toBe('completed')
    })
})

describe('recordPayment — installment counter', () => {
    it('increments paidInstallments by 1 each time', () => {
        expect(recordPayment(10_000, 1_000, 0).newPaid).toBe(1)
        expect(recordPayment(9_000, 1_000, 1).newPaid).toBe(2)
        expect(recordPayment(1_000, 1_000, 11).newPaid).toBe(12)
    })
})

// ─── Full repayment schedule simulation ──────────────────────────────────────

describe('Full repayment schedule', () => {
    it('12-month loan fully repays in exactly 12 installments', () => {
        let balance = 12_000
        let paid = 0
        let status: 'active' | 'completed' = 'active'
        for (let i = 0; i < 12; i++) {
            const result = recordPayment(balance, 1_000, paid)
            balance = result.newBalance
            paid = result.newPaid
            status = result.newStatus
        }
        expect(balance).toBe(0)
        expect(paid).toBe(12)
        expect(status).toBe('completed')
    })

    it('non-divisible loan completes in ceil(amount/monthly) steps', () => {
        const amount = 10_500
        const monthly = 1_000
        const expectedInstallments = Math.ceil(amount / monthly) // 11
        let balance = amount
        let paid = 0
        let status: 'active' | 'completed' = 'active'
        for (let i = 0; i < expectedInstallments; i++) {
            const result = recordPayment(balance, monthly, paid)
            balance = result.newBalance
            paid = result.newPaid
            status = result.newStatus
        }
        expect(balance).toBe(0)
        expect(paid).toBe(expectedInstallments)
        expect(status).toBe('completed')
    })
})
