/**
 * Unit tests for the bulk-biometric-mapping row validator
 * (`validateBulkMappingRowsSync` in biometric.service.ts).
 *
 * The DB-touching wrapper loads the tenant's unmapped-employee map and
 * existing mapper IDs via Drizzle, then hands off to the pure function
 * tested here — same pattern as bulk-assets and bulk-jobs.
 *
 * Rules under test (matches the one-to-one requirement from the user):
 *   • employee_no is required
 *   • mapping_id is required (after trim), max 100 chars
 *   • mapping_id must be unique inside the upload
 *   • mapping_id must not already exist in the DB
 *   • employee_no must resolve to an *unmapped* employee in the tenant
 *     — employees who already have a live mapping are deliberately
 *     absent from the lookup map and therefore rejected
 *   • label optional (max 200 chars)
 */
import { describe, it, expect } from 'vitest'
import {
    validateBulkMappingRowsSync,
    type BulkMappingInputRow,
    type BulkMappingLookups,
} from '../modules/attendance/biometric.service.js'

function lookups(overrides: Partial<BulkMappingLookups> = {}): BulkMappingLookups {
    // Default fixture: two unmapped employees (EMP-001, EMP-002), one
    // existing mapper_id ("BIO-EXISTING") already taken.
    return {
        unmappedByNo:
            overrides.unmappedByNo ??
            new Map<string, { id: string; name: string }>([
                ['EMP-001', { id: 'emp-1', name: 'Alice Adams' }],
                ['EMP-002', { id: 'emp-2', name: 'Bob Brown' }],
            ]),
        existingMapperIds:
            overrides.existingMapperIds ?? new Set<string>(['bio-existing']),
    }
}

function row(overrides: Partial<BulkMappingInputRow> = {}): BulkMappingInputRow {
    return {
        rowNumber: 2,
        employeeNo: 'EMP-001',
        mappingId: 'BIO-NEW-1',
        ...overrides,
    }
}

// ─── employee_no required ──────────────────────────────────────────────────

describe('validateBulkMappingRowsSync — employee_no required', () => {
    it('rejects a row with no employee_no', () => {
        const { rows: out } = validateBulkMappingRowsSync([row({ employeeNo: null })], lookups())
        expect(out[0].ok).toBe(false)
        expect(out[0].errors).toContain('employee_no is required')
    })

    it('rejects a whitespace-only employee_no', () => {
        const { rows: out } = validateBulkMappingRowsSync([row({ employeeNo: '   ' })], lookups())
        expect(out[0].ok).toBe(false)
        expect(out[0].errors).toContain('employee_no is required')
    })
})

// ─── mapping_id required + max length ──────────────────────────────────────

describe('validateBulkMappingRowsSync — mapping_id required', () => {
    it('rejects a row with no mapping_id', () => {
        const { rows: out } = validateBulkMappingRowsSync([row({ mappingId: null })], lookups())
        expect(out[0].ok).toBe(false)
        expect(out[0].errors).toContain('mapping_id is required')
    })

    it('rejects a whitespace-only mapping_id', () => {
        const { rows: out } = validateBulkMappingRowsSync([row({ mappingId: '  ' })], lookups())
        expect(out[0].ok).toBe(false)
        expect(out[0].errors).toContain('mapping_id is required')
    })

    it('rejects mapping_id longer than 100 chars', () => {
        const longId = 'X'.repeat(101)
        const { rows: out } = validateBulkMappingRowsSync([row({ mappingId: longId })], lookups())
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toMatch(/100 characters/)
    })

    it('trims surrounding whitespace before validating + storing', () => {
        const { rows: out } = validateBulkMappingRowsSync(
            [row({ mappingId: '  BIO-NEW-1  ' })],
            lookups(),
        )
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.mapperId).toBe('BIO-NEW-1')
    })
})

// ─── employee resolution against unmapped set ─────────────────────────────

describe('validateBulkMappingRowsSync — employee resolution', () => {
    it('resolves an unmapped employee by employee_no', () => {
        const { rows: out } = validateBulkMappingRowsSync(
            [row({ employeeNo: 'EMP-001' })],
            lookups(),
        )
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.employeeId).toBe('emp-1')
        expect(out[0].employeeName).toBe('Alice Adams')
    })

    it('rejects an unknown employee_no with a specific error', () => {
        const { rows: out } = validateBulkMappingRowsSync(
            [row({ employeeNo: 'EMP-999' })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('EMP-999')
        expect(out[0].errors[0]).toMatch(/not found|already has/)
    })

    it('rejects an employee who already has a live mapping (absent from the lookup)', () => {
        // EMP-003 doesn't exist in the unmapped map at all — that's how the
        // wrapper signals "this employee already has a mapping; skip them".
        const { rows: out } = validateBulkMappingRowsSync(
            [row({ employeeNo: 'EMP-003' })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toMatch(/already has a biometric mapping/)
    })
})

// ─── mapping_id uniqueness ─────────────────────────────────────────────────

describe('validateBulkMappingRowsSync — mapping_id uniqueness', () => {
    it('rejects a mapping_id that already exists in the DB', () => {
        const { rows: out } = validateBulkMappingRowsSync(
            [row({ mappingId: 'BIO-EXISTING' })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('already assigned')
    })

    it('rejects a mapping_id that exists in the DB case-insensitively', () => {
        // DB stores 'bio-existing' (lowercased); HR types it in mixed case.
        const { rows: out } = validateBulkMappingRowsSync(
            [row({ mappingId: 'Bio-Existing' })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('already assigned')
    })

    it('flags codes duplicated within the same upload (every row)', () => {
        const { rows: out } = validateBulkMappingRowsSync(
            [
                row({ rowNumber: 2, employeeNo: 'EMP-001', mappingId: 'SAME-ID' }),
                row({ rowNumber: 3, employeeNo: 'EMP-002', mappingId: 'SAME-ID' }),
            ],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[1].ok).toBe(false)
        expect(out[0].errors[0]).toContain('duplicated in this file')
        expect(out[1].errors[0]).toContain('duplicated in this file')
    })

    it('treats in-file duplicates case-insensitively', () => {
        const { rows: out } = validateBulkMappingRowsSync(
            [
                row({ rowNumber: 2, employeeNo: 'EMP-001', mappingId: 'BIO-1' }),
                row({ rowNumber: 3, employeeNo: 'EMP-002', mappingId: 'bio-1' }),
            ],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[1].ok).toBe(false)
    })

    it('accepts two different mapping_ids for two different employees', () => {
        const { rows: out } = validateBulkMappingRowsSync(
            [
                row({ rowNumber: 2, employeeNo: 'EMP-001', mappingId: 'BIO-A' }),
                row({ rowNumber: 3, employeeNo: 'EMP-002', mappingId: 'BIO-B' }),
            ],
            lookups(),
        )
        expect(out[0].ok).toBe(true)
        expect(out[1].ok).toBe(true)
    })
})

// ─── label validation ─────────────────────────────────────────────────────

describe('validateBulkMappingRowsSync — label', () => {
    it('accepts a missing label', () => {
        const { rows: out } = validateBulkMappingRowsSync([row({ label: null })], lookups())
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.label).toBeNull()
    })

    it('rejects a label longer than 200 characters', () => {
        const long = 'X'.repeat(201)
        const { rows: out } = validateBulkMappingRowsSync([row({ label: long })], lookups())
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toMatch(/200 characters/)
    })
})

// ─── summary aggregation ──────────────────────────────────────────────────

describe('validateBulkMappingRowsSync — summary', () => {
    it('reports correct valid / invalid counts across a mixed batch', () => {
        const result = validateBulkMappingRowsSync(
            [
                row({ rowNumber: 2, employeeNo: 'EMP-001', mappingId: 'OK-1' }),
                row({ rowNumber: 3, employeeNo: null, mappingId: 'OK-2' }), // missing emp
                row({ rowNumber: 4, employeeNo: 'EMP-002', mappingId: 'BIO-EXISTING' }), // dup against DB
                row({ rowNumber: 5, employeeNo: 'EMP-002', mappingId: 'OK-3' }), // valid
            ],
            lookups(),
        )
        expect(result.summary.total).toBe(4)
        expect(result.summary.valid).toBe(2)
        expect(result.summary.invalid).toBe(2)
    })

    it('preserves rowNumber on every result', () => {
        const result = validateBulkMappingRowsSync(
            [
                row({ rowNumber: 12, employeeNo: 'EMP-001', mappingId: 'A' }),
                row({ rowNumber: 47, employeeNo: 'EMP-002', mappingId: 'B' }),
            ],
            lookups(),
        )
        expect(result.rows[0].rowNumber).toBe(12)
        expect(result.rows[1].rowNumber).toBe(47)
    })
})
