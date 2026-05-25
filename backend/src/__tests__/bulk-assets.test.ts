/**
 * Unit tests for the bulk-asset row validator (assets.service.ts).
 *
 * The DB-touching wrapper `validateBulkAssetRows` loads tenant-scoped
 * categories and existing asset codes via Drizzle, then hands off to
 * `validateBulkAssetRowsSync` — the pure function we test here.
 *
 * Each test exercises one rule. We use hand-built `BulkAssetLookups`
 * maps so the matcher's branches are exercised without spinning up a
 * database, mirroring the pattern in bulk-adjustments.test.ts.
 */
import { describe, it, expect } from 'vitest'
import {
    validateBulkAssetRowsSync,
    type BulkAssetInputRow,
    type BulkAssetLookups,
} from '../modules/assets/assets.service.js'

function lookups(overrides: Partial<BulkAssetLookups> = {}): BulkAssetLookups {
    return {
        categoryByName: overrides.categoryByName ?? new Map([['laptops', 'cat-laptops'], ['phones', 'cat-phones']]),
        existingCodes: overrides.existingCodes ?? new Set(['org-ast-00001']),
    }
}

function row(overrides: Partial<BulkAssetInputRow> = {}): BulkAssetInputRow {
    return {
        rowNumber: 2,
        name: 'MacBook Pro',
        categoryName: 'Laptops',
        ...overrides,
    }
}

// ─── name (required) ────────────────────────────────────────────────────────

describe('validateBulkAssetRowsSync — name required', () => {
    it('rejects a row with no name', () => {
        const { rows: out } = validateBulkAssetRowsSync([row({ name: null })], lookups())
        expect(out[0].ok).toBe(false)
        expect(out[0].errors).toContain('name is required')
    })

    it('rejects a row with whitespace-only name', () => {
        const { rows: out } = validateBulkAssetRowsSync([row({ name: '   ' })], lookups())
        expect(out[0].ok).toBe(false)
        expect(out[0].errors).toContain('name is required')
    })

    it('accepts a row with a trimmed name', () => {
        const { rows: out } = validateBulkAssetRowsSync([row({ name: '  MacBook  ' })], lookups())
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.name).toBe('MacBook')
    })
})

// ─── category lookup ───────────────────────────────────────────────────────

describe('validateBulkAssetRowsSync — category lookup', () => {
    it('resolves a known category case-insensitively', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ categoryName: 'LaPtOpS' })],
            lookups(),
        )
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.categoryId).toBe('cat-laptops')
        expect(out[0].resolved?.categoryName).toBe('LaPtOpS')
    })

    it('flags an unknown category with a specific message', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ categoryName: 'Servers' })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('Servers')
        expect(out[0].errors[0]).toContain('not found')
    })

    it('allows a blank category (optional column)', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ categoryName: '' })],
            lookups(),
        )
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.categoryId).toBeNull()
    })
})

// ─── asset code duplicate detection ────────────────────────────────────────

describe('validateBulkAssetRowsSync — duplicate asset codes', () => {
    it('flags a code that already exists in the DB', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ assetCode: 'ORG-AST-00001' })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].duplicateCode).toBe(true)
        expect(out[0].errors[0]).toContain('already exists')
    })

    it('flags codes duplicated within the same upload (both rows)', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [
                row({ rowNumber: 2, assetCode: 'NEW-AST-1', name: 'A' }),
                row({ rowNumber: 3, assetCode: 'NEW-AST-1', name: 'B' }),
            ],
            lookups(),
        )
        expect(out[0].duplicateCode).toBe(true)
        expect(out[1].duplicateCode).toBe(true)
        expect(out[0].errors[0]).toContain('duplicated in this file')
    })

    it('treats blank asset codes as auto-generate (no duplicate check)', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [
                row({ rowNumber: 2, assetCode: '', name: 'A' }),
                row({ rowNumber: 3, assetCode: null, name: 'B' }),
            ],
            lookups(),
        )
        expect(out[0].ok).toBe(true)
        expect(out[1].ok).toBe(true)
        expect(out[0].resolved?.assetCode).toBeNull()
    })
})

// ─── status / condition enum coercion ──────────────────────────────────────

describe('validateBulkAssetRowsSync — enum coercion', () => {
    it('defaults missing status to "available" and condition to "good"', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ status: null, condition: null })],
            lookups(),
        )
        expect(out[0].resolved?.status).toBe('available')
        expect(out[0].resolved?.condition).toBe('good')
    })

    it('accepts mixed-case enum values and lowercases them', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ status: 'MAINTENANCE', condition: 'Damaged' })],
            lookups(),
        )
        expect(out[0].resolved?.status).toBe('maintenance')
        expect(out[0].resolved?.condition).toBe('damaged')
    })

    it('rejects an unknown status with the allowed list in the error', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ status: 'broken' })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('available')
        expect(out[0].errors[0]).toContain('retired')
    })
})

// ─── purchase_cost numeric parsing ─────────────────────────────────────────

describe('validateBulkAssetRowsSync — purchase_cost', () => {
    it('accepts a numeric value and stores it as a 2-decimal string', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ purchaseCost: 1234.5 })],
            lookups(),
        )
        expect(out[0].resolved?.purchaseCost).toBe('1234.50')
    })

    it('accepts a string number ("1500")', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ purchaseCost: '1500' })],
            lookups(),
        )
        expect(out[0].resolved?.purchaseCost).toBe('1500.00')
    })

    it('rejects negative cost', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ purchaseCost: -100 })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('non-negative')
    })

    it('rejects non-numeric cost', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ purchaseCost: 'abc' })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('non-negative')
    })

    it('allows missing cost (column is optional)', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ purchaseCost: null })],
            lookups(),
        )
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.purchaseCost).toBeNull()
    })
})

// ─── purchase_date parsing ─────────────────────────────────────────────────

describe('validateBulkAssetRowsSync — purchase_date', () => {
    it('passes through a YYYY-MM-DD value untouched', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ purchaseDate: '2024-01-15' })],
            lookups(),
        )
        expect(out[0].resolved?.purchaseDate).toBe('2024-01-15')
    })

    it('rejects a garbage date string', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ purchaseDate: 'not-a-date' })],
            lookups(),
        )
        expect(out[0].ok).toBe(false)
        expect(out[0].errors[0]).toContain('valid date')
    })

    it('allows missing date', () => {
        const { rows: out } = validateBulkAssetRowsSync(
            [row({ purchaseDate: null })],
            lookups(),
        )
        expect(out[0].ok).toBe(true)
        expect(out[0].resolved?.purchaseDate).toBeNull()
    })
})

// ─── summary counts ────────────────────────────────────────────────────────

describe('validateBulkAssetRowsSync — summary', () => {
    it('reports correct valid / invalid counts across a mixed batch', () => {
        const result = validateBulkAssetRowsSync(
            [
                row({ rowNumber: 2, name: 'OK 1' }),
                row({ rowNumber: 3, name: null }),
                row({ rowNumber: 4, categoryName: 'Servers' }),
                row({ rowNumber: 5, name: 'OK 2' }),
            ],
            lookups(),
        )
        expect(result.summary.total).toBe(4)
        expect(result.summary.valid).toBe(2)
        expect(result.summary.invalid).toBe(2)
    })
})
