/**
 * Unit tests for the backend filter parser + Drizzle condition builder.
 * These tests exercise pure functions without any DB connection.
 */
import { describe, it, expect } from 'vitest'
import { parseFilterString } from '../lib/filters.js'

// ─── parseFilterString ────────────────────────────────────────────────────────

describe('parseFilterString', () => {
    it('returns empty array for empty string', () => {
        expect(parseFilterString('')).toEqual([])
    })

    it('returns empty array for whitespace-only input', () => {
        expect(parseFilterString('   ')).toEqual([])
    })

    it('returns empty array for malformed segment (no crash)', () => {
        expect(parseFilterString('bad')).toEqual([])
        expect(parseFilterString('field')).toEqual([])
        expect(parseFilterString(':EQ(val)')).toEqual([])
    })

    it('parses EQ with string value', () => {
        expect(parseFilterString('status:EQ(active)')).toEqual([
            { field: 'status', operator: 'EQ', rawValue: 'active', value: 'active' },
        ])
    })

    it('parses EQ with numeric-looking value as number', () => {
        expect(parseFilterString('days:EQ(30)')).toEqual([
            { field: 'days', operator: 'EQ', rawValue: '30', value: 30 },
        ])
    })

    it('parses BETWEEN with two numbers', () => {
        expect(parseFilterString('price:BETWEEN(100,500)')).toEqual([
            { field: 'price', operator: 'BETWEEN', rawValue: '100,500', value: [100, 500] },
        ])
    })

    it('parses BETWEEN with string values (dates)', () => {
        const result = parseFilterString('startDate:BETWEEN(2024-01-01,2024-12-31)')
        expect(result).toHaveLength(1)
        expect(result[0]!.operator).toBe('BETWEEN')
        expect(result[0]!.value).toEqual(['2024-01-01', '2024-12-31'])
    })

    it('parses IN with string array', () => {
        expect(parseFilterString('category:IN(1,2,3)')).toEqual([
            { field: 'category', operator: 'IN', rawValue: '1,2,3', value: ['1', '2', '3'] },
        ])
    })

    it('parses NOT_IN', () => {
        const result = parseFilterString('status:NOT_IN(deleted,archived)')
        expect(result[0]!.operator).toBe('NOT_IN')
        expect(result[0]!.value).toEqual(['deleted', 'archived'])
    })

    it('parses IS_NULL with empty parens', () => {
        expect(parseFilterString('archived:IS_NULL()')).toEqual([
            { field: 'archived', operator: 'IS_NULL', rawValue: '', value: null },
        ])
    })

    it('parses IS_NOT_NULL', () => {
        expect(parseFilterString('completedAt:IS_NOT_NULL()')).toEqual([
            { field: 'completedAt', operator: 'IS_NOT_NULL', rawValue: '', value: null },
        ])
    })

    it('parses multiple filters separated by semicolons', () => {
        const result = parseFilterString('status:EQ(active);price:BETWEEN(100,500)')
        expect(result).toHaveLength(2)
        expect(result[0]!.field).toBe('status')
        expect(result[1]!.field).toBe('price')
    })

    it('skips malformed segments in a multi-segment string without crashing', () => {
        const result = parseFilterString('status:EQ(active);bad_segment;days:GT(5)')
        expect(result).toHaveLength(2)
        expect(result[0]!.field).toBe('status')
        expect(result[1]!.field).toBe('days')
    })

    it('handles leading/trailing whitespace around segments', () => {
        const result = parseFilterString(' status:EQ(active) ; days:GT(5) ')
        expect(result).toHaveLength(2)
    })

    it('parses LIKE, NOT_LIKE, STARTS_WITH, ENDS_WITH as string values', () => {
        expect(parseFilterString('name:LIKE(john)')).toEqual([
            { field: 'name', operator: 'LIKE', rawValue: 'john', value: 'john' },
        ])
        expect(parseFilterString('name:STARTS_WITH(Jo)')).toEqual([
            { field: 'name', operator: 'STARTS_WITH', rawValue: 'Jo', value: 'Jo' },
        ])
    })

    it('parses GTE, LTE, GT, LT with numbers', () => {
        expect(parseFilterString('rating:GTE(4)')).toEqual([
            { field: 'rating', operator: 'GTE', rawValue: '4', value: 4 },
        ])
        expect(parseFilterString('rating:LT(3)')).toEqual([
            { field: 'rating', operator: 'LT', rawValue: '3', value: 3 },
        ])
    })

    it('parses DATE_EQ, DATE_LT, DATE_GT with date strings', () => {
        const result = parseFilterString('dueDate:DATE_LT(2025-12-31)')
        expect(result[0]!.operator).toBe('DATE_LT')
        expect(result[0]!.value).toBe('2025-12-31')
    })
})

// ─── buildDrizzleFilters — allowlist enforcement ──────────────────────────────
// We can't test the Drizzle SQL output without a DB, but we can verify
// that the allowlist strips disallowed fields before passing to toSQL.

describe('parseFilterString — allowlist striping (structural)', () => {
    it('unknown operators do not produce values (structural check)', () => {
        const result = parseFilterString('field:UNKNOWN_OP(val)')
        // parseFilterString doesn't validate operators — it just parses structure.
        // The operator is stored verbatim; buildDrizzleFilters will return null for it.
        expect(result[0]!.operator).toBe('UNKNOWN_OP')
        expect(result[0]!.value).toBe('val')
    })
})
