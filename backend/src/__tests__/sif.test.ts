/**
 * Task 8.8 — Unit tests for WPS SIF file generation logic (MOHRE format).
 * Tests the pure formatting routines without DB calls.
 */
import { describe, it, expect } from 'vitest'

// ─── Pure SIF formatting helpers (mirrors payroll.service.ts) ─────────────
function buildSifFilename(year: number, month: number, tenantId: string): string {
    return `WPS_SIF_${year}_${String(month).padStart(2, '0')}_${tenantId.slice(0, 6)}.sif`
}

function buildPayDateStr(year: number, month: number): string {
    const lastDay = new Date(year, month, 0) // day=0 → last day of previous month
    return `${String(lastDay.getDate()).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

function buildEdrLine(tenantId: string, year: number, month: number, empCount: number, totalNet: string): string {
    const payDateStr = buildPayDateStr(year, month)
    return [
        'EDR',
        tenantId.slice(0, 8).toUpperCase(),
        '0000000000',
        String(year),
        String(month).padStart(2, '0'),
        String(empCount),
        totalNet,
        'AED',
        tenantId.slice(0, 8).toUpperCase(),
        payDateStr,
        'TRF',
    ].join('|')
}

function buildTrlLine(empCount: number, totalNet: string): string {
    return ['TRL', String(empCount), totalNet].join('|')
}

function buildEmpLine(params: {
    year: number; month: number; iban: string; name: string
    labourId: string; daysWorked: number; basicSalary: string
    grossSalary: string; netSalary: string
}): string {
    const payDateStr = buildPayDateStr(params.year, params.month)
    const startDateStr = `01/${String(params.month).padStart(2, '0')}/${params.year}`
    const allowances = (Number(params.grossSalary) - Number(params.basicSalary)).toFixed(2)
    return [
        'EMP',
        '000000',
        params.iban,
        '0000',
        params.name.toUpperCase().slice(0, 50),
        params.labourId,
        '',
        startDateStr,
        payDateStr,
        String(params.daysWorked),
        allowances,
        params.basicSalary,
        params.netSalary,
        'AED',
    ].join('|')
}

// ─── Filename tests ──────────────────────────────────────────────────────────
describe('SIF filename format', () => {
    it('pads single-digit months with zero', () => {
        const name = buildSifFilename(2024, 3, 'tenant-abc123')
        expect(name).toBe('WPS_SIF_2024_03_tenant.sif')
    })

    it('uses first 6 chars of tenantId', () => {
        const name = buildSifFilename(2024, 12, 'abc123xyz-extra-chars')
        expect(name).toContain('abc123')
        expect(name).not.toContain('xyz-extra-chars')
    })

    it('includes year and month in filename', () => {
        const name = buildSifFilename(2025, 1, 'test-id')
        expect(name).toContain('2025')
        expect(name).toContain('01')
    })
})

// ─── Payment date tests ──────────────────────────────────────────────────────
describe('SIF payment date (last day of month)', () => {
    it('January 2025 → 31/01/2025', () => {
        expect(buildPayDateStr(2025, 1)).toBe('31/01/2025')
    })

    it('February 2024 (leap year) → 29/02/2024', () => {
        expect(buildPayDateStr(2024, 2)).toBe('29/02/2024')
    })

    it('February 2025 (non-leap year) → 28/02/2025', () => {
        expect(buildPayDateStr(2025, 2)).toBe('28/02/2025')
    })

    it('April → 30/04/2025', () => {
        expect(buildPayDateStr(2025, 4)).toBe('30/04/2025')
    })
})

// ─── EDR record tests ────────────────────────────────────────────────────────
describe('EDR record (Employer Detail Record)', () => {
    const edr = buildEdrLine('abc12345-uuid', 2025, 3, 10, '150000.00')
    const parts = edr.split('|')

    it('starts with EDR', () => {
        expect(parts[0]).toBe('EDR')
    })

    it('uses uppercase tenant ID slice', () => {
        expect(parts[1]).toBe('ABC12345')
    })

    it('has 11 pipe-delimited fields', () => {
        expect(parts.length).toBe(11)
    })

    it('currency is AED', () => {
        expect(parts[7]).toBe('AED')
    })

    it('payment type is TRF', () => {
        expect(parts[10]).toBe('TRF')
    })

    it('employee count is correct', () => {
        expect(parts[5]).toBe('10')
    })
})

// ─── TRL record tests ─────────────────────────────────────────────────────────
describe('TRL record (Trailer)', () => {
    const trl = buildTrlLine(5, '75000.00')
    const parts = trl.split('|')

    it('starts with TRL', () => {
        expect(parts[0]).toBe('TRL')
    })

    it('has 3 fields', () => {
        expect(parts.length).toBe(3)
    })

    it('includes employee count and total', () => {
        expect(parts[1]).toBe('5')
        expect(parts[2]).toBe('75000.00')
    })
})

// ─── EMP record tests ─────────────────────────────────────────────────────────
describe('EMP record (Employee)', () => {
    const emp = buildEmpLine({
        year: 2025, month: 3,
        iban: 'AE070331234567890123456',
        name: 'John Smith',
        labourId: 'LC123456789',
        daysWorked: 28,
        basicSalary: '10000.00',
        grossSalary: '14000.00',
        netSalary: '13700.00',
    })
    const parts = emp.split('|')

    it('starts with EMP', () => {
        expect(parts[0]).toBe('EMP')
    })

    it('uppercases employee name', () => {
        expect(parts[3]).toBe('JOHN SMITH')
    })

    it('truncates name to 50 chars', () => {
        const longNameEmp = buildEmpLine({
            year: 2025, month: 1,
            iban: 'AE00', name: 'A'.repeat(100), labourId: 'LC1',
            daysWorked: 30, basicSalary: '5000.00', grossSalary: '5000.00', netSalary: '5000.00',
        })
        const namePart = longNameEmp.split('|')[3]
        expect(namePart.length).toBeLessThanOrEqual(50)
    })

    it('calculates allowances correctly (gross - basic)', () => {
        // 14000 - 10000 = 4000
        expect(parts[10]).toBe('4000.00')
    })

    it('currency is AED', () => {
        expect(parts[13]).toBe('AED')
    })

    it('includes days worked', () => {
        expect(parts[9]).toBe('28')
    })

    it('has 14 pipe-delimited fields', () => {
        expect(parts.length).toBe(14)
    })
})

// ─── Full SIF integrity ───────────────────────────────────────────────────────
describe('Full SIF structure integrity', () => {
    it('EDR count matches TRL count', () => {
        const empCount = 5
        const edr = buildEdrLine('test', 2025, 1, empCount, '100000.00')
        const trl = buildTrlLine(empCount, '100000.00')
        const edrCount = parseInt(edr.split('|')[5])
        const trlCount = parseInt(trl.split('|')[1])
        expect(edrCount).toBe(trlCount)
    })
})
