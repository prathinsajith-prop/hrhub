/**
 * Form-validation contract tests for the shared frontend schemas.
 * Ensures login / leave / employee forms reject bad input before submission.
 */
import { describe, it, expect } from 'vitest'
import {
    employeeStep1Schema,
    employeeStep2Schema,
    leaveRequestSchema,
    employeeSalaryRuleSchema,
    zodToFieldErrors,
} from '@/lib/schemas'

describe('employeeStep1Schema', () => {
    it('accepts a minimal valid record', () => {
        const r = employeeStep1Schema.safeParse({
            firstName: 'Ada',
            lastName: 'Lovelace',
            personalEmail: '',
            mobileNo: '',
            dateOfBirth: '',
        })
        expect(r.success).toBe(true)
    })

    it('rejects an empty first name', () => {
        const r = employeeStep1Schema.safeParse({ firstName: '', lastName: 'L' })
        expect(r.success).toBe(false)
    })

    it('rejects a malformed personal email', () => {
        const r = employeeStep1Schema.safeParse({
            firstName: 'A', lastName: 'B', personalEmail: 'not-email',
        })
        expect(r.success).toBe(false)
    })

    it('rejects a future date of birth', () => {
        const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
        const r = employeeStep1Schema.safeParse({
            firstName: 'A', lastName: 'B', dateOfBirth: future,
        })
        expect(r.success).toBe(false)
    })
})

describe('employeeStep2Schema', () => {
    it('requires a join date', () => {
        expect(employeeStep2Schema.safeParse({ joinDate: '' }).success).toBe(false)
        expect(employeeStep2Schema.safeParse({ joinDate: '2024-01-01' }).success).toBe(true)
    })
})

describe('leaveRequestSchema', () => {
    it('accepts end >= start', () => {
        const r = leaveRequestSchema.safeParse({
            employeeId: 'e1', startDate: '2024-01-01', endDate: '2024-01-05',
        })
        expect(r.success).toBe(true)
    })

    it('rejects end < start', () => {
        const r = leaveRequestSchema.safeParse({
            employeeId: 'e1', startDate: '2024-01-10', endDate: '2024-01-05',
        })
        expect(r.success).toBe(false)
    })
})

describe('employeeSalaryRuleSchema', () => {
    it('rejects totalSalary < basicSalary', () => {
        const r = employeeSalaryRuleSchema.safeParse({ basicSalary: 5000, totalSalary: 3000 })
        expect(r.success).toBe(false)
    })

    it('accepts totalSalary >= basicSalary', () => {
        expect(employeeSalaryRuleSchema.safeParse({ basicSalary: 5000, totalSalary: 5000 }).success).toBe(true)
        expect(employeeSalaryRuleSchema.safeParse({ basicSalary: 5000, totalSalary: 8000 }).success).toBe(true)
    })
})

describe('zodToFieldErrors helper', () => {
    it('returns ok=true on valid data', () => {
        const result = zodToFieldErrors(employeeStep2Schema, { joinDate: '2024-01-01' })
        expect(result.ok).toBe(true)
    })

    it('returns field-keyed errors on invalid data', () => {
        const result = zodToFieldErrors(employeeStep2Schema, { joinDate: '' })
        expect(result.ok).toBe(false)
        expect(result.errors?.joinDate).toBeTruthy()
    })
})
