/**
 * Unit tests for lib/search-filters.ts — server-side filter parser.
 *
 * Only the pure parse functions are tested here:
 *   - parseFilterString  (GET ?filter= compact syntax)
 *   - parseFilterMap     (POST body { filters: {} } syntax)
 *   - parseSearchInput   (full request parser combining both)
 *
 * buildCondition / buildWhere depend on Drizzle AnyColumn objects and are
 * exercised through integration testing.
 */
import { describe, it, expect } from 'vitest'
import {
    parseFilterString,
    parseFilterMap,
    parseSearchInput,
} from '../lib/search-filters.js'

// ─── parseFilterString ───────────────────────────────────────────────────────

describe('parseFilterString', () => {
    it('returns [] for null / undefined / empty input', () => {
        expect(parseFilterString(null)).toEqual([])
        expect(parseFilterString(undefined)).toEqual([])
        expect(parseFilterString('')).toEqual([])
    })

    it('parses a single EQ filter', () => {
        const result = parseFilterString('status:EQ(active)')
        expect(result).toHaveLength(1)
        expect(result[0]).toMatchObject({ field: 'status', operator: 'EQ', value: 'active' })
    })

    it('parses multiple filters separated by ;', () => {
        const result = parseFilterString('status:EQ(active);department:EQ(HR)')
        expect(result).toHaveLength(2)
        expect(result[0].field).toBe('status')
        expect(result[1].field).toBe('department')
    })

    it('parses LIKE operator', () => {
        const r = parseFilterString('name:LIKE(john)')
        expect(r[0]).toMatchObject({ operator: 'LIKE', value: 'john' })
    })

    it('parses IN operator as an array', () => {
        const r = parseFilterString('status:IN(active,onboarding)')
        expect(r[0].operator).toBe('IN')
        expect(r[0].value).toEqual(['active', 'onboarding'])
    })

    it('supports uppercase operator tokens (compact filter string format)', () => {
        // The compact filter string format requires uppercase: EQ, LIKE, GT, LT, etc.
        // Lowercase frontend aliases (contains, equals) are only supported in the JSON body path.
        expect(parseFilterString('x:LIKE(foo)')[0]?.operator).toBe('LIKE')
        expect(parseFilterString('x:EQ(bar)')[0]?.operator).toBe('EQ')
        expect(parseFilterString('x:GT(10)')[0]?.operator).toBe('GT')
        expect(parseFilterString('x:LT(10)')[0]?.operator).toBe('LT')
    })

    it('parses BETWEEN operator into { from, to }', () => {
        const r = parseFilterString('salary:BETWEEN(5000,10000)')
        expect(r[0].operator).toBe('BETWEEN')
        expect(r[0].value).toMatchObject({ from: '5000', to: '10000' })
    })

    it('parses IS_NULL with null value', () => {
        const r = parseFilterString('deletedAt:IS_NULL()')
        expect(r[0].operator).toBe('IS_NULL')
        expect(r[0].value).toBeNull()
    })

    it('parses IS_NOT_NULL with null value', () => {
        const r = parseFilterString('completedAt:IS_NOT_NULL()')
        expect(r[0].operator).toBe('IS_NOT_NULL')
        expect(r[0].value).toBeNull()
    })

    it('silently drops malformed expressions', () => {
        const r = parseFilterString('invalid_without_operator;status:EQ(active)')
        expect(r).toHaveLength(1)
        expect(r[0].field).toBe('status')
    })

    it('trims whitespace between expressions', () => {
        const r = parseFilterString(' status:EQ(active) ; department:EQ(IT) ')
        expect(r).toHaveLength(2)
    })
})

// ─── parseFilterMap ──────────────────────────────────────────────────────────

describe('parseFilterMap', () => {
    it('returns [] for null / undefined', () => {
        expect(parseFilterMap(null)).toEqual([])
        expect(parseFilterMap(undefined)).toEqual([])
    })

    it('parses a simple equals filter', () => {
        const result = parseFilterMap({ status: { value: 'active', operator: 'equals' } })
        expect(result[0]).toMatchObject({ field: 'status', operator: 'EQ', value: 'active' })
    })

    it('defaults to EQ when operator is omitted', () => {
        const result = parseFilterMap({ status: { value: 'active' } })
        expect(result[0].operator).toBe('EQ')
    })

    it('handles IN operator with array value', () => {
        const result = parseFilterMap({
            status: { value: ['active', 'onboarding'], operator: 'in' },
        })
        expect(result[0].operator).toBe('IN')
        expect(result[0].value).toEqual(['active', 'onboarding'])
    })

    it('handles IS_NULL operator', () => {
        const result = parseFilterMap({ deletedAt: { value: null, operator: 'is_null' } })
        expect(result[0].operator).toBe('IS_NULL')
        expect(result[0].value).toBeNull()
    })

    it('handles BETWEEN operator with { from, to } shape', () => {
        const result = parseFilterMap({
            salary: { value: { from: '5000', to: '10000' }, operator: 'between' },
        })
        expect(result[0].operator).toBe('BETWEEN')
        expect(result[0].value).toMatchObject({ from: '5000', to: '10000' })
    })

    it('skips null/undefined entries in the map', () => {
        const result = parseFilterMap({ status: null as never })
        expect(result).toHaveLength(0)
    })

    it('handles multiple filters in a single call', () => {
        const result = parseFilterMap({
            status: { value: 'active', operator: 'equals' },
            department: { value: 'HR', operator: 'equals' },
        })
        expect(result).toHaveLength(2)
    })
})

// ─── parseSearchInput ────────────────────────────────────────────────────────

describe('parseSearchInput', () => {
    it('returns null q and empty filters for an empty request', () => {
        const r = parseSearchInput({})
        expect(r.q).toBeNull()
        expect(r.filters).toHaveLength(0)
    })

    it('extracts q from query string', () => {
        const r = parseSearchInput({ query: { q: 'john' } })
        expect(r.q).toBe('john')
    })

    it('extracts q from body (POST)', () => {
        const r = parseSearchInput({ body: { q: 'prathin' } })
        expect(r.q).toBe('prathin')
    })

    it('body q takes precedence when both are present', () => {
        const r = parseSearchInput({ query: { q: 'from-qs' }, body: { q: 'from-body' } })
        expect(r.q).toBe('from-body')
    })

    it('trims the search term and returns null for whitespace-only q', () => {
        expect(parseSearchInput({ query: { q: '   ' } }).q).toBeNull()
    })

    it('parses GET filter param into filters array', () => {
        const r = parseSearchInput({ query: { filter: 'status:EQ(active)' } })
        expect(r.filters).toHaveLength(1)
        expect(r.filters[0].field).toBe('status')
    })

    it('parses POST body filters map into filters array', () => {
        const r = parseSearchInput({
            body: { filters: { status: { value: 'active', operator: 'equals' } } },
        })
        expect(r.filters).toHaveLength(1)
        expect(r.filters[0].field).toBe('status')
    })

    it('merges GET filter and POST body filters', () => {
        const r = parseSearchInput({
            query: { filter: 'status:EQ(active)' },
            body: { filters: { department: { value: 'HR', operator: 'equals' } } },
        })
        expect(r.filters).toHaveLength(2)
    })

    it('parses pagination from body', () => {
        const r = parseSearchInput({ body: { pagination: { page: 2, pageSize: 50 } } })
        expect(r.pagination.page).toBe(2)
        expect(r.pagination.pageSize).toBe(50)
    })

    it('caps pageSize at 200', () => {
        const r = parseSearchInput({ body: { pagination: { pageSize: 9999 } } })
        expect(r.pagination.pageSize).toBe(200)
    })

    it('defaults pageSize to 20 when not provided', () => {
        expect(parseSearchInput({}).pagination.pageSize).toBe(20)
    })

    it('normalises sortDir to lowercase asc/desc', () => {
        const r = parseSearchInput({ query: { sortDir: 'DESC' } })
        expect(r.pagination.sortDir).toBe('desc')
    })

    it('defaults sortDir to asc for unknown values', () => {
        const r = parseSearchInput({ query: { sortDir: 'random' } })
        expect(r.pagination.sortDir).toBe('asc')
    })
})
