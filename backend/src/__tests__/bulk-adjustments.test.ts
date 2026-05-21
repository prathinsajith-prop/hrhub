/**
 * Unit tests for the bulk-import resolution logic in
 * payroll/adjustments.service.ts.
 *
 * The DB-touching parts (resolveBulkRows, bulkCreateAdjustments) build an
 * employee lookup table from a single tenant-scoped SELECT and then hand
 * each row to a pure matcher. These tests exercise the pure matcher with
 * hand-built lookups so we can validate every branch of the resolution
 * priority + amount + notes rules without spinning up a database.
 */
import { describe, it, expect } from 'vitest'
import {
    kindForCategory,
    matchBulkRow,
    normalizePhone,
    type BulkAdjustmentRow,
    type EmployeeLookups,
} from '../modules/payroll/adjustments.service.js'

const emp = {
    alice: { id: 'emp-alice', employeeNo: 'EMP-0001', firstName: 'Alice', lastName: 'Adams' },
    bob:   { id: 'emp-bob',   employeeNo: 'EMP-0002', firstName: 'Bob',   lastName: 'Brown' },
    carol: { id: 'emp-carol', employeeNo: null,        firstName: 'Carol', lastName: 'Carter' },
}

function buildLookups(): EmployeeLookups {
    const byEmployeeNo = new Map<string, typeof emp.alice>()
    const byEmail = new Map<string, typeof emp.alice>()
    const byPhone = new Map<string, typeof emp.alice>()
    byEmployeeNo.set('EMP-0001', emp.alice)
    byEmployeeNo.set('EMP-0002', emp.bob)
    byEmail.set('alice@example.com', emp.alice)
    byEmail.set('bob.brown@example.com', emp.bob)
    byEmail.set('carol@example.com', emp.carol)
    // Alice's phone stored after normalize (no '+' or spaces)
    byPhone.set('971501234567', emp.alice)
    byPhone.set('971555998877', emp.bob)
    return { byEmployeeNo, byEmail, byPhone }
}

const baseRow: BulkAdjustmentRow = {
    rowNumber: 2,
    amount: 500,
    notes: null,
}

// ─── normalizePhone ─────────────────────────────────────────────────────────

describe('normalizePhone', () => {
    it('returns null for empty or nullish input', () => {
        expect(normalizePhone(null)).toBeNull()
        expect(normalizePhone(undefined)).toBeNull()
        expect(normalizePhone('')).toBeNull()
        expect(normalizePhone('   ')).toBeNull()
    })

    it('strips every non-digit character', () => {
        expect(normalizePhone('+971 50 123 4567')).toBe('971501234567')
        expect(normalizePhone('+971-50-123-4567')).toBe('971501234567')
        expect(normalizePhone('(971) 50 123 4567')).toBe('971501234567')
        expect(normalizePhone('+971501234567')).toBe('971501234567')
    })

    it('returns null when the input has no digits at all', () => {
        expect(normalizePhone('phone')).toBeNull()
        expect(normalizePhone('+++')).toBeNull()
    })

    it('preserves leading zeros — needed for landline numbers', () => {
        expect(normalizePhone('042334455')).toBe('042334455')
    })
})

// ─── kindForCategory ───────────────────────────────────────────────────────

describe('kindForCategory', () => {
    it('classifies the three addition categories as additions', () => {
        expect(kindForCategory('overtime')).toBe('addition')
        expect(kindForCategory('commission')).toBe('addition')
        expect(kindForCategory('bonus')).toBe('addition')
    })

    it('classifies all other categories as deductions', () => {
        expect(kindForCategory('loan_repayment')).toBe('deduction')
        expect(kindForCategory('salary_advance')).toBe('deduction')
        expect(kindForCategory('unpaid_leave')).toBe('deduction')
        expect(kindForCategory('sick_half_pay')).toBe('deduction')
        expect(kindForCategory('manual')).toBe('deduction')
    })
})

// ─── matchBulkRow ──────────────────────────────────────────────────────────

describe('matchBulkRow', () => {
    describe('amount validation', () => {
        it('rejects zero amount', () => {
            const out = matchBulkRow({ ...baseRow, amount: 0, employeeNo: 'EMP-0001' }, buildLookups())
            expect(out.error).toBe('amount must be a positive number')
            expect(out.employeeId).toBeNull()
        })

        it('rejects negative amount', () => {
            const out = matchBulkRow({ ...baseRow, amount: -100, employeeNo: 'EMP-0001' }, buildLookups())
            expect(out.error).toBe('amount must be a positive number')
        })

        it('rejects NaN amount', () => {
            const out = matchBulkRow({ ...baseRow, amount: Number.NaN, employeeNo: 'EMP-0001' }, buildLookups())
            expect(out.error).toBe('amount must be a positive number')
        })

        it('rejects non-numeric string amount', () => {
            const out = matchBulkRow({ ...baseRow, amount: 'abc', employeeNo: 'EMP-0001' }, buildLookups())
            expect(out.error).toBe('amount must be a positive number')
        })

        it('coerces numeric string amount correctly', () => {
            const out = matchBulkRow({ ...baseRow, amount: '250.50', employeeNo: 'EMP-0001' }, buildLookups())
            expect(out.error).toBeNull()
            expect(out.amount).toBeCloseTo(250.5)
        })

        it('rejects Infinity', () => {
            const out = matchBulkRow({ ...baseRow, amount: Number.POSITIVE_INFINITY, employeeNo: 'EMP-0001' }, buildLookups())
            expect(out.error).toBe('amount must be a positive number')
        })
    })

    describe('resolution priority', () => {
        it('matches by employee_no first', () => {
            const out = matchBulkRow({ ...baseRow, employeeNo: 'EMP-0001' }, buildLookups())
            expect(out.error).toBeNull()
            expect(out.employeeId).toBe('emp-alice')
            expect(out.resolvedName).toBe('Alice Adams')
            expect(out.resolvedEmployeeNo).toBe('EMP-0001')
        })

        it('falls back to email when employee_no is blank', () => {
            const out = matchBulkRow({ ...baseRow, employeeEmail: 'bob.brown@example.com' }, buildLookups())
            expect(out.error).toBeNull()
            expect(out.employeeId).toBe('emp-bob')
        })

        it('falls back to phone when employee_no and email are blank', () => {
            const out = matchBulkRow({ ...baseRow, employeePhone: '+971 50 123 4567' }, buildLookups())
            expect(out.error).toBeNull()
            expect(out.employeeId).toBe('emp-alice')
        })

        it('uses employee_no even if email points to a different employee', () => {
            // employee_no wins — important: spreadsheet rows may have stale
            // emails from copy-paste, but the employee_no column is authoritative.
            const out = matchBulkRow(
                { ...baseRow, employeeNo: 'EMP-0001', employeeEmail: 'bob.brown@example.com' },
                buildLookups(),
            )
            expect(out.employeeId).toBe('emp-alice')
        })

        it('handles whitespace and case-insensitive emails', () => {
            const out = matchBulkRow({ ...baseRow, employeeEmail: '  ALICE@example.com ' }, buildLookups())
            expect(out.employeeId).toBe('emp-alice')
        })

        it('handles whitespace-padded employee_no', () => {
            const out = matchBulkRow({ ...baseRow, employeeNo: '  EMP-0001 ' }, buildLookups())
            expect(out.employeeId).toBe('emp-alice')
        })

        it('matches by phone with different formatting', () => {
            const out = matchBulkRow({ ...baseRow, employeePhone: '(971) 555-998-877' }, buildLookups())
            expect(out.employeeId).toBe('emp-bob')
        })

        it('finds employees with no employee_no via email', () => {
            const out = matchBulkRow({ ...baseRow, employeeEmail: 'carol@example.com' }, buildLookups())
            expect(out.employeeId).toBe('emp-carol')
            expect(out.resolvedEmployeeNo).toBeNull()
        })

        it('returns row-level error when no identifier resolves', () => {
            const out = matchBulkRow(
                { ...baseRow, employeeNo: 'NONEXISTENT', employeeEmail: 'ghost@example.com' },
                buildLookups(),
            )
            expect(out.error).toContain('employee not found')
            expect(out.error).toContain('NONEXISTENT')
        })

        it('returns "(blank)" hint when all identifiers are missing', () => {
            const out = matchBulkRow(baseRow, buildLookups())
            expect(out.error).toContain('employee not found')
            expect(out.error).toContain('(blank)')
        })

        it('uses employeeName as last-resort hint in the error message', () => {
            const out = matchBulkRow(
                { ...baseRow, employeeName: 'Mystery Person' },
                buildLookups(),
            )
            expect(out.error).toContain('Mystery Person')
        })

        it('works without a byPhone map (older callers)', () => {
            const lookups = buildLookups()
            delete lookups.byPhone
            const out = matchBulkRow(
                { ...baseRow, employeePhone: '+971501234567' },
                lookups,
            )
            // No phone fallback when map absent → not found
            expect(out.error).toContain('employee not found')
        })
    })

    describe('notes handling', () => {
        it('trims whitespace from notes', () => {
            const out = matchBulkRow(
                { ...baseRow, employeeNo: 'EMP-0001', notes: '   Q2 bonus   ' },
                buildLookups(),
            )
            expect(out.notes).toBe('Q2 bonus')
        })

        it('normalizes empty/whitespace-only notes to null', () => {
            const out = matchBulkRow(
                { ...baseRow, employeeNo: 'EMP-0001', notes: '   ' },
                buildLookups(),
            )
            expect(out.notes).toBeNull()
        })

        it('preserves null notes as null', () => {
            const out = matchBulkRow(
                { ...baseRow, employeeNo: 'EMP-0001', notes: null },
                buildLookups(),
            )
            expect(out.notes).toBeNull()
        })

        it('preserves notes when amount is invalid (for error context in UI)', () => {
            const out = matchBulkRow(
                { ...baseRow, employeeNo: 'EMP-0001', amount: -100, notes: 'why this is wrong' },
                buildLookups(),
            )
            expect(out.error).not.toBeNull()
            expect(out.notes).toBe('why this is wrong')
        })
    })

    describe('return shape', () => {
        it('preserves rowNumber on valid rows for per-row UI feedback', () => {
            const out = matchBulkRow({ ...baseRow, rowNumber: 42, employeeNo: 'EMP-0001' }, buildLookups())
            expect(out.rowNumber).toBe(42)
        })

        it('preserves rowNumber on invalid rows', () => {
            const out = matchBulkRow({ ...baseRow, rowNumber: 13, employeeNo: 'NONEXISTENT' }, buildLookups())
            expect(out.rowNumber).toBe(13)
        })

        it('amount comes through as a number on valid rows', () => {
            const out = matchBulkRow({ ...baseRow, amount: 750.25, employeeNo: 'EMP-0001' }, buildLookups())
            expect(typeof out.amount).toBe('number')
            expect(out.amount).toBeCloseTo(750.25)
        })
    })
})
