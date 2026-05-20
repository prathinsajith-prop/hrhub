/**
 * Unit tests for buildPayslipsAndTotals — the pure math behind catalog vs
 * legacy earnings resolution. The catalog (employee_salary_components +
 * salary_components) is the new source of truth; the legacy static columns
 * on `employees` are a fallback for employees who haven't been migrated.
 *
 * The most important invariant verified here: a partial set of assignments
 * (no `basic` row) MUST fall back to legacy fields — otherwise payroll
 * silently zeroes out basic / housing / transport.
 */
import { describe, it, expect } from 'vitest'
import {
    __buildPayslipsAndTotals_forTests as buildPayslipsAndTotals,
    type PayslipResolvedEarnings,
} from '../modules/payroll/payroll.service.js'

// Minimal stand-in for PayableEmployee (the type is private to the module).
// Only the fields the math touches are typed; the rest are loose.
type EmpInput = {
    id: string
    basicSalary: string | null
    housingAllowance: string | null
    transportAllowance: string | null
    otherAllowances: string | null
    joinDate: string | null
    contractEndDate: string | null
}

const emp = (overrides: Partial<EmpInput> = {}): EmpInput => ({
    id: 'emp-1',
    basicSalary: '10000',
    housingAllowance: '3000',
    transportAllowance: '500',
    otherAllowances: '0',
    joinDate: '2020-01-01',
    contractEndDate: null,
    ...overrides,
})

const noAdjustments = new Map()

describe('buildPayslipsAndTotals', () => {
    describe('legacy fallback path', () => {
        it('uses static employee fields when no resolved earnings exist', () => {
            const result = buildPayslipsAndTotals(
                'tenant-1', 'run-1', 2026, 5,
                [emp() as any],
                noAdjustments,
                new Map(),
            )
            expect(result.totalGross).toBeCloseTo(13_500, 2) // 10000 + 3000 + 500
            expect(result.payslipValues[0]?.basicSalary).toBe('10000.00')
            expect(result.payslipValues[0]?.housingAllowance).toBe('3000.00')
        })

        it('falls back when resolved earnings exist but have no basic row', () => {
            // Critical regression guard: a stray "Other Allowance" assignment
            // left over from a half-finished migration must NOT trigger the
            // catalog path. Without this check, basic/housing/transport would
            // all silently become 0.
            const partial: PayslipResolvedEarnings = {
                basic: 0,
                hasBasic: false,
                earnings: [{ componentId: 'c-other', category: 'custom_allowance', name: 'Other Allowance', amount: 500 }],
            }
            const result = buildPayslipsAndTotals(
                'tenant-1', 'run-1', 2026, 5,
                [emp() as any],
                noAdjustments,
                new Map([['emp-1', partial]]),
            )
            // Should still hit legacy — total gross = 10000 + 3000 + 500 = 13500
            expect(result.totalGross).toBeCloseTo(13_500, 2)
            expect(result.payslipValues[0]?.basicSalary).toBe('10000.00')
        })
    })

    describe('catalog path', () => {
        it('uses resolved earnings when a basic assignment exists', () => {
            const resolved: PayslipResolvedEarnings = {
                basic: 12_000,
                hasBasic: true,
                earnings: [
                    { componentId: 'c-basic',   category: 'basic',   name: 'Basic',   amount: 12_000 },
                    { componentId: 'c-housing', category: 'housing', name: 'Housing', amount: 4_000 },
                    { componentId: 'c-transport', category: 'transport', name: 'Transport', amount: 700 },
                ],
            }
            const result = buildPayslipsAndTotals(
                'tenant-1', 'run-1', 2026, 5,
                [emp() as any],
                noAdjustments,
                new Map([['emp-1', resolved]]),
            )
            // Catalog values win over the static fields
            expect(result.totalGross).toBeCloseTo(16_700, 2) // 12000 + 4000 + 700
            expect(result.payslipValues[0]?.basicSalary).toBe('12000.00')
            expect(result.payslipValues[0]?.housingAllowance).toBe('4000.00')
            expect(result.payslipValues[0]?.transportAllowance).toBe('700.00')
        })

        it('sums multiple basic-category components into the persisted basic + breakdown', () => {
            // Regression: a tenant with two catalog rows in the `basic`
            // category (e.g. "Basic" + a custom "Probation Basic") used to
            // see one of them silently dropped from gross — the breakdown
            // showed both lines but the persisted basic column held only
            // the last one, so the numbers didn't tie out.
            const resolved: PayslipResolvedEarnings = {
                basic: 13_000,
                hasBasic: true,
                earnings: [
                    { componentId: 'c-basic', category: 'basic', name: 'Basic', amount: 6_500 },
                    { componentId: 'c-test',  category: 'basic', name: 'test',  amount: 6_500 },
                    { componentId: 'c-housing', category: 'housing', name: 'Housing', amount: 2_000 },
                ],
            }
            const result = buildPayslipsAndTotals(
                'tenant-1', 'run-1', 2026, 5,
                [emp() as any],
                noAdjustments,
                new Map([['emp-1', resolved]]),
            )
            expect(result.payslipValues[0]?.basicSalary).toBe('13000.00')
            expect(result.payslipValues[0]?.housingAllowance).toBe('2000.00')
            expect(result.totalGross).toBeCloseTo(15_000, 2) // 6500 + 6500 + 2000
            // Breakdown sum must equal the persisted gross — no orphaned earnings.
            const breakdownSum = (result.payslipValues[0]?.earningsBreakdown ?? [])
                .reduce((s, e) => s + Number(e.amount), 0)
            expect(breakdownSum).toBeCloseTo(15_000, 2)
        })

        it('rolls non-housing / non-transport earnings into "other"', () => {
            const resolved: PayslipResolvedEarnings = {
                basic: 10_000,
                hasBasic: true,
                earnings: [
                    { componentId: 'c-basic',  category: 'basic',          name: 'Basic', amount: 10_000 },
                    { componentId: 'c-col',    category: 'cost_of_living', name: 'Cost of Living', amount: 800 },
                    { componentId: 'c-custom', category: 'custom_allowance', name: 'Custom Allowance', amount: 250 },
                ],
            }
            const result = buildPayslipsAndTotals(
                'tenant-1', 'run-1', 2026, 5,
                [emp() as any],
                noAdjustments,
                new Map([['emp-1', resolved]]),
            )
            expect(result.payslipValues[0]?.otherAllowances).toBe('1050.00') // 800 + 250
        })
    })

    describe('proration', () => {
        it('prorates a mid-month joiner', () => {
            // 31-day month, joined 16th → 16 days worked
            const resolved: PayslipResolvedEarnings = {
                basic: 31_000,
                hasBasic: true,
                earnings: [{ componentId: 'c-basic', category: 'basic', name: 'Basic', amount: 31_000 }],
            }
            const result = buildPayslipsAndTotals(
                'tenant-1', 'run-1', 2026, 5, // May 2026 (31 days)
                [emp({ joinDate: '2026-05-16' }) as any],
                noAdjustments,
                new Map([['emp-1', resolved]]),
            )
            // 16 days / 31 days × 31000 = 16000
            expect(result.totalGross).toBeCloseTo(16_000, 2)
        })
    })
})
