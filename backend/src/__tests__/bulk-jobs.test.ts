/**
 * Unit tests for the bulk-job row validator (recruitment.service.ts).
 *
 * The DB-touching wrapper (`bulkCreateJobs`) re-runs validation server-
 * side; the pure `validateBulkJobRowsSync` is what we test here so every
 * branch — required `title`, enum coercion (type/status), `openings` /
 * salary / closing_date parsing — gets exercised without hitting the DB.
 *
 * Mirrors the pattern in bulk-assets.test.ts.
 */
import { describe, it, expect } from 'vitest'
import {
    validateBulkJobRowsSync,
    type BulkJobInputRow,
} from '../modules/recruitment/recruitment.service.js'

function row(overrides: Partial<BulkJobInputRow> = {}): BulkJobInputRow {
    return {
        rowNumber: 2,
        title: 'Senior Backend Engineer',
        ...overrides,
    }
}

// ─── title (required) ──────────────────────────────────────────────────────

describe('validateBulkJobRowsSync — title required', () => {
    it('rejects a row with no title', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ title: null })])
        expect(out[0].ok).toBe(false)
        expect(out[0].errors).toContain('title is required')
    })

    it('rejects a row with whitespace-only title', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ title: '   ' })])
        expect(out[0].ok).toBe(false)
        expect(out[0].errors).toContain('title is required')
    })

    it('accepts a trimmed title', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ title: '  Engineer  ' })])
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.title).toBe('Engineer')
    })
})

// ─── type / status enum coercion ───────────────────────────────────────────

describe('validateBulkJobRowsSync — enum coercion', () => {
    it('defaults missing type to "full_time" and status to "draft"', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ type: null, status: null })])
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.type).toBe('full_time')
        expect(out[0].resolved?.status).toBe('draft')
    })

    it('lowercases and underscore-normalizes type values', () => {
        // HR types "Full Time" or "Full-Time" — both should resolve to "full_time".
        const { rows: out } = validateBulkJobRowsSync([
            row({ rowNumber: 2, type: 'Full Time' }),
            row({ rowNumber: 3, type: 'Part-Time' }),
            row({ rowNumber: 4, type: 'CONTRACT' }),
        ])
        expect(out[0].resolved?.type).toBe('full_time')
        expect(out[1].resolved?.type).toBe('part_time')
        expect(out[2].resolved?.type).toBe('contract')
    })

    it('lowercases and underscore-normalizes status values', () => {
        const { rows: out } = validateBulkJobRowsSync([
            row({ rowNumber: 2, status: 'OPEN' }),
            row({ rowNumber: 3, status: 'On Hold' }),
            row({ rowNumber: 4, status: 'On-hold' }),
        ])
        expect(out[0].resolved?.status).toBe('open')
        expect(out[1].resolved?.status).toBe('on_hold')
        expect(out[2].resolved?.status).toBe('on_hold')
    })

    it('rejects an unknown type with the allowed list in the error', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ type: 'freelance' })])
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('full_time')
        expect(out[0].errors[0]).toContain('contract')
    })

    it('rejects an unknown status with the allowed list in the error', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ status: 'archived' })])
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('open')
        expect(out[0].errors[0]).toContain('closed')
    })
})

// ─── openings parsing ──────────────────────────────────────────────────────

describe('validateBulkJobRowsSync — openings', () => {
    it('defaults missing openings to 1', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ openings: null })])
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.openings).toBe(1)
    })

    it('accepts a numeric openings count', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ openings: 5 })])
        expect(out[0].resolved?.openings).toBe(5)
    })

    it('accepts a string number ("3")', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ openings: '3' })])
        expect(out[0].resolved?.openings).toBe(3)
    })

    it('rejects zero openings', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ openings: 0 })])
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('positive whole number')
    })

    it('rejects a negative openings count', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ openings: -2 })])
        expect(out[0].ok).toBe(false)
    })

    it('rejects a fractional openings count (must be integer)', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ openings: 1.5 })])
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('positive whole number')
    })

    it('rejects a non-numeric openings cell', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ openings: 'many' })])
        expect(out[0].ok).toBe(false)
    })
})

// ─── salary parsing + range ────────────────────────────────────────────────

describe('validateBulkJobRowsSync — salary range', () => {
    it('stores valid min/max as 2-decimal strings', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ minSalary: 10000, maxSalary: 18000 })])
        expect(out[0].resolved?.minSalary).toBe('10000.00')
        expect(out[0].resolved?.maxSalary).toBe('18000.00')
    })

    it('accepts string numbers', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ minSalary: '8000.5', maxSalary: '10500' })])
        expect(out[0].resolved?.minSalary).toBe('8000.50')
        expect(out[0].resolved?.maxSalary).toBe('10500.00')
    })

    it('rejects negative salaries', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ minSalary: -100 })])
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('non-negative')
    })

    it('rejects max_salary < min_salary', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ minSalary: 20000, maxSalary: 15000 })])
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('greater than or equal')
    })

    it('allows min == max (single fixed offer)', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ minSalary: 12000, maxSalary: 12000 })])
        expect(out[0].ok).toBe(true)
    })

    it('allows only min set (no max — open-ended ceiling)', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ minSalary: 12000, maxSalary: null })])
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.maxSalary).toBeNull()
    })

    it('allows only max set (no min — exact ceiling, no floor)', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ minSalary: null, maxSalary: 20000 })])
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.minSalary).toBeNull()
    })
})

// ─── closing_date parsing ──────────────────────────────────────────────────

describe('validateBulkJobRowsSync — closing_date', () => {
    it('passes through a YYYY-MM-DD value untouched', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ closingDate: '2025-03-31' })])
        expect(out[0].resolved?.closingDate).toBe('2025-03-31')
    })

    it('rejects a garbage date string', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ closingDate: 'soon' })])
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('valid date')
    })

    it('allows a missing closing_date', () => {
        const { rows: out } = validateBulkJobRowsSync([row({ closingDate: null })])
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.closingDate).toBeNull()
    })
})

// ─── summary aggregation ───────────────────────────────────────────────────

describe('validateBulkJobRowsSync — summary', () => {
    it('reports correct valid / invalid counts across a mixed batch', () => {
        const result = validateBulkJobRowsSync([
            row({ rowNumber: 2, title: 'OK A' }),
            row({ rowNumber: 3, title: null }),
            row({ rowNumber: 4, type: 'freelance' }),
            row({ rowNumber: 5, title: 'OK B' }),
        ])
        expect(result.summary.total).toBe(4)
        expect(result.summary.valid).toBe(2)
        expect(result.summary.invalid).toBe(2)
    })

    it('preserves rowNumber on every result', () => {
        const result = validateBulkJobRowsSync([
            row({ rowNumber: 17, title: 'A' }),
            row({ rowNumber: 23, title: null }),
        ])
        expect(result.rows[0].rowNumber).toBe(17)
        expect(result.rows[1].rowNumber).toBe(23)
    })
})
