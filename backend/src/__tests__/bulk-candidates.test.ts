/**
 * Unit tests for the bulk-candidate row validator
 * (`validateBulkCandidateRowsSync` in recruitment.service.ts).
 *
 * The DB-touching wrapper loads the target job's live email set via
 * Drizzle, then hands off to the pure function tested here — same
 * pattern as bulk-assets, bulk-jobs and bulk-mappings.
 *
 * Rules under test:
 *   • name is required (or both firstName + lastName)
 *   • email is required, must match RFC-style format
 *   • email is unique inside the upload (duplicate flag)
 *   • email is unique against the job's live pipeline (duplicate flag)
 *   • experience is a non-negative integer when present
 *   • expectedSalary is a non-negative number, stored 2-decimal
 *   • duplicates count separately from invalid rows in the summary
 */
import { describe, it, expect } from 'vitest'
import {
    validateBulkCandidateRowsSync,
    type BulkCandidateInputRow,
    type BulkCandidateLookups,
} from '../modules/recruitment/recruitment.service.js'

function lookups(overrides: Partial<BulkCandidateLookups> = {}): BulkCandidateLookups {
    return {
        existingEmailsInJob: overrides.existingEmailsInJob ?? new Set<string>(['taken@example.com']),
    }
}

function row(overrides: Partial<BulkCandidateInputRow> = {}): BulkCandidateInputRow {
    return {
        rowNumber: 2,
        firstName: 'Fatima',
        lastName: 'Al Mansoori',
        email: 'fatima@example.com',
        ...overrides,
    }
}

// ─── name (required) ───────────────────────────────────────────────────────

describe('validateBulkCandidateRowsSync — name', () => {
    it('combines firstName + lastName into the canonical name', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ firstName: 'Omar', lastName: 'Khan', name: null })],
            lookups(),
        )
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.name).toBe('Omar Khan')
    })

    it('uses the single `name` column when both firstName + lastName are blank', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ firstName: null, lastName: null, name: 'Aisha Rashid' })],
            lookups(),
        )
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.name).toBe('Aisha Rashid')
    })

    it('prefers the explicit `name` column over a synthesized first+last', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ firstName: 'Wrong', lastName: 'Name', name: 'Correct Name' })],
            lookups(),
        )
        expect(out[0].resolved?.name).toBe('Correct Name')
    })

    it('rejects a row with no name at all', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ firstName: null, lastName: null, name: null })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toMatch(/name is required/)
    })

    it('treats whitespace-only firstName + lastName as missing', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ firstName: '   ', lastName: '  ', name: null })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
    })
})

// ─── email (required + format) ─────────────────────────────────────────────

describe('validateBulkCandidateRowsSync — email format', () => {
    it('rejects a row with no email', () => {
        const { rows: out } = validateBulkCandidateRowsSync([row({ email: null })], lookups())
        expect(out[0].ok).toBe(false)
        expect(out[0].errors).toContain('email is required')
    })

    it('rejects an email missing the @ sign', () => {
        const { rows: out } = validateBulkCandidateRowsSync([row({ email: 'fatimaexample.com' })], lookups())
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toMatch(/valid email/)
    })

    it('rejects an email missing the domain TLD', () => {
        const { rows: out } = validateBulkCandidateRowsSync([row({ email: 'fatima@example' })], lookups())
        expect(out[0].ok).toBe(false)
    })

    it('accepts a valid email and stores it un-lowercased', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ email: 'Fatima.AlMansoori@Example.com' })],
            lookups(),
        )
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.email).toBe('Fatima.AlMansoori@Example.com')
    })
})

// ─── email uniqueness ──────────────────────────────────────────────────────

describe('validateBulkCandidateRowsSync — email uniqueness', () => {
    it('flags a row whose email already exists in the job pipeline (case-insensitive)', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ email: 'TAKEN@example.com' })],
            lookups(),
        )
        expect(out[0].duplicate).toBe(true)
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toMatch(/already has an active application/)
    })

    it('flags rows duplicated within the same upload (every offending row)', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [
                row({ rowNumber: 2, email: 'same@example.com', firstName: 'A', lastName: 'One' }),
                row({ rowNumber: 3, email: 'same@example.com', firstName: 'B', lastName: 'Two' }),
            ],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].duplicate).toBe(true)
        expect(out[1].duplicate).toBe(true)
        expect(out[0].errors[0]).toMatch(/more than once in this file/)
    })

    it('treats in-file duplicates case-insensitively', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [
                row({ rowNumber: 2, email: 'Same@Example.com', firstName: 'A', lastName: 'One' }),
                row({ rowNumber: 3, email: 'same@example.com', firstName: 'B', lastName: 'Two' }),
            ],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].duplicate).toBe(true)
        expect(out[1].duplicate).toBe(true)
    })

    it('accepts two different emails for two different candidates', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [
                row({ rowNumber: 2, email: 'a@example.com' }),
                row({ rowNumber: 3, email: 'b@example.com' }),
            ],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].ok).toBe(true)
        expect(out[1].ok).toBe(true)
    })
})

// ─── experience parsing ────────────────────────────────────────────────────

describe('validateBulkCandidateRowsSync — experience', () => {
    it('accepts a missing experience (column is optional)', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ experience: null })],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.experience).toBeNull()
    })

    it('accepts a numeric experience', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ experience: 7 })],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].resolved?.experience).toBe(7)
    })

    it('accepts a string-encoded experience', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ experience: '4' })],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].resolved?.experience).toBe(4)
    })

    it('rejects a fractional experience', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ experience: 2.5 })],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toMatch(/whole number/)
    })

    it('rejects a negative experience', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ experience: -1 })],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].ok).toBe(false)
    })

    it('rejects a non-numeric experience', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ experience: 'many' })],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].ok).toBe(false)
    })
})

// ─── expectedSalary parsing ────────────────────────────────────────────────

describe('validateBulkCandidateRowsSync — expectedSalary', () => {
    it('stores valid salary as 2-decimal string', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ expectedSalary: 22000 })],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].resolved?.expectedSalary).toBe('22000.00')
    })

    it('accepts a string-encoded salary', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ expectedSalary: '14500.5' })],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].resolved?.expectedSalary).toBe('14500.50')
    })

    it('rejects a negative salary', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ expectedSalary: -500 })],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toMatch(/non-negative/)
    })

    it('rejects a non-numeric salary', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ expectedSalary: 'tbd' })],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].ok).toBe(false)
    })

    it('allows a missing salary', () => {
        const { rows: out } = validateBulkCandidateRowsSync(
            [row({ expectedSalary: null })],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.expectedSalary).toBeNull()
    })
})

// ─── summary counts ────────────────────────────────────────────────────────

describe('validateBulkCandidateRowsSync — summary', () => {
    it('counts valid / invalid / duplicate separately', () => {
        const result = validateBulkCandidateRowsSync(
            [
                row({ rowNumber: 2, email: 'ok-a@example.com' }),                              // valid
                row({ rowNumber: 3, email: null }),                                            // invalid (no email)
                row({ rowNumber: 4, email: 'taken@example.com' }),                             // duplicate (DB)
                row({ rowNumber: 5, email: 'ok-b@example.com' }),                              // valid
                row({ rowNumber: 6, email: 'dup-file@example.com', firstName: 'A', lastName: 'X' }), // duplicate (file)
                row({ rowNumber: 7, email: 'dup-file@example.com', firstName: 'B', lastName: 'Y' }), // duplicate (file)
            ],
            lookups(),
        )
        expect(result.summary.total).toBe(6)
        expect(result.summary.valid).toBe(2)
        expect(result.summary.duplicate).toBe(3)
        // Only row 3 (no email) is a true validation error.
        expect(result.summary.invalid).toBe(1)
    })

    it('preserves rowNumber on every result', () => {
        const result = validateBulkCandidateRowsSync(
            [
                row({ rowNumber: 17, email: 'a@example.com' }),
                row({ rowNumber: 42, email: 'b@example.com' }),
            ],
            lookups({ existingEmailsInJob: new Set() }),
        )
        expect(result.rows[0].rowNumber).toBe(17)
        expect(result.rows[1].rowNumber).toBe(42)
    })
})
