/**
 * Unit tests for the frontend filter utilities.
 * Covers buildFilterQueryString (serialisation) and applyClientFilters (client-side matching).
 */
import { describe, it, expect } from 'vitest'
import { buildFilterQueryString, countAppliedFilters } from '@/lib/filters/query-builder'
import { applyClientFilters } from '@/lib/filters/apply-client'

// ─── buildFilterQueryString ───────────────────────────────────────────────────

describe('buildFilterQueryString', () => {
    it('returns empty string for null/undefined', () => {
        expect(buildFilterQueryString(null)).toBe('')
        expect(buildFilterQueryString(undefined)).toBe('')
    })

    it('returns empty string for empty object', () => {
        expect(buildFilterQueryString({})).toBe('')
    })

    it('serialises a simple equals filter', () => {
        expect(buildFilterQueryString({ status: { value: 'active', operator: 'is' } }))
            .toBe('status:EQ(active)')
    })

    it('serialises equals operator alias', () => {
        expect(buildFilterQueryString({ status: { value: 'active', operator: 'equals' } }))
            .toBe('status:EQ(active)')
    })

    it('serialises LIKE (contains)', () => {
        expect(buildFilterQueryString({ name: { value: 'john', operator: 'contains' } }))
            .toBe('name:LIKE(john)')
    })

    it('serialises BETWEEN with number range object', () => {
        expect(buildFilterQueryString({ price: { value: { min: 100, max: 500 }, operator: 'between' } }))
            .toBe('price:BETWEEN(100,500)')
    })

    it('serialises BETWEEN with date range object', () => {
        expect(buildFilterQueryString({
            startDate: { value: { from: '2024-01-01', to: '2024-12-31' }, operator: 'between' },
        })).toBe('startDate:BETWEEN(2024-01-01,2024-12-31)')
    })

    it('serialises IN with array value', () => {
        expect(buildFilterQueryString({ tags: { value: ['a', 'b'], operator: 'in' } }))
            .toBe('tags:IN(a,b)')
    })

    it('serialises boolean true as 1', () => {
        expect(buildFilterQueryString({ active: { value: true, operator: 'equals' } }))
            .toBe('active:EQ(1)')
    })

    it('serialises boolean false as 0', () => {
        expect(buildFilterQueryString({ active: { value: false, operator: 'equals' } }))
            .toBe('active:EQ(0)')
    })

    it('skips empty string value', () => {
        expect(buildFilterQueryString({ status: { value: '', operator: 'is' } })).toBe('')
    })

    it('skips empty array value', () => {
        expect(buildFilterQueryString({ tags: { value: [], operator: 'in' } })).toBe('')
    })

    it('serialises IS_NULL with empty parens', () => {
        expect(buildFilterQueryString({ deletedAt: { value: null, operator: 'is_null' } }))
            .toBe('deletedAt:IS_NULL()')
    })

    it('serialises IS_NOT_NULL', () => {
        expect(buildFilterQueryString({ completedAt: { value: null, operator: 'is_not_null' } }))
            .toBe('completedAt:IS_NOT_NULL()')
    })

    it('serialises multiple filters joined by semicolons', () => {
        const result = buildFilterQueryString({
            status: { value: 'active', operator: 'is' },
            department: { value: 'Engineering', operator: 'equals' },
        })
        expect(result).toContain('status:EQ(active)')
        expect(result).toContain('department:EQ(Engineering)')
        expect(result).toContain(';')
    })

    it('uses default EQ token when operator is omitted', () => {
        expect(buildFilterQueryString({ status: { value: 'active' } }))
            .toBe('status:EQ(active)')
    })
})

// ─── countAppliedFilters ──────────────────────────────────────────────────────

describe('countAppliedFilters', () => {
    it('returns 0 for null/undefined', () => {
        expect(countAppliedFilters(null)).toBe(0)
        expect(countAppliedFilters(undefined)).toBe(0)
    })

    it('returns 0 for empty object', () => {
        expect(countAppliedFilters({})).toBe(0)
    })

    it('counts non-empty filters', () => {
        expect(countAppliedFilters({
            status: { value: 'active', operator: 'is' },
            name: { value: 'john', operator: 'contains' },
        })).toBe(2)
    })

    it('does not count empty-value filters', () => {
        expect(countAppliedFilters({ status: { value: '', operator: 'is' } })).toBe(0)
    })

    it('counts is_null/is_not_null as active (no value needed)', () => {
        expect(countAppliedFilters({ deletedAt: { value: null, operator: 'is_null' } })).toBe(1)
    })
})

// ─── applyClientFilters ───────────────────────────────────────────────────────

type Row = { id: string; name: string; status: string; amount: number; date: string; active: boolean }

const ROWS: Row[] = [
    { id: '1', name: 'Alice Smith',  status: 'active',    amount: 1000, date: '2024-03-15', active: true },
    { id: '2', name: 'Bob Jones',    status: 'inactive',  amount: 2500, date: '2024-06-20', active: false },
    { id: '3', name: 'Carol White',  status: 'active',    amount: 500,  date: '2024-01-10', active: true },
    { id: '4', name: 'Dave Brown',   status: 'suspended', amount: 750,  date: '2024-09-05', active: false },
]

describe('applyClientFilters', () => {
    it('returns all rows when no filters or search', () => {
        expect(applyClientFilters(ROWS, { appliedFilters: {} })).toHaveLength(4)
    })

    it('filters by free-text search across searchFields', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: {},
            searchInput: 'alice',
            searchFields: ['name'],
        })
        expect(result).toHaveLength(1)
        expect(result[0]!.id).toBe('1')
    })

    it('returns empty for search that matches nothing', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: {},
            searchInput: 'xyzzy',
            searchFields: ['name'],
        })
        expect(result).toHaveLength(0)
    })

    it('applies is/equals filter', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { status: { value: 'active', operator: 'is' } },
        })
        expect(result.map(r => r.id)).toEqual(['1', '3'])
    })

    it('applies is_not filter', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { status: { value: 'active', operator: 'is_not' } },
        })
        expect(result.map(r => r.id)).toEqual(['2', '4'])
    })

    it('applies contains filter (case-insensitive)', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { name: { value: 'smith', operator: 'contains' } },
        })
        expect(result).toHaveLength(1)
        expect(result[0]!.id).toBe('1')
    })

    it('applies starts_with filter', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { name: { value: 'Bob', operator: 'starts_with' } },
        })
        expect(result).toHaveLength(1)
        expect(result[0]!.id).toBe('2')
    })

    it('applies in filter with array', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { status: { value: ['active', 'suspended'], operator: 'in' } },
        })
        expect(result.map(r => r.id)).toEqual(['1', '3', '4'])
    })

    it('applies not_in filter', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { status: { value: ['active'], operator: 'not_in' } },
        })
        expect(result.map(r => r.id)).toEqual(['2', '4'])
    })

    it('applies greater_than filter on number', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { amount: { value: 1000, operator: 'greater_than' } },
        })
        expect(result.map(r => r.id)).toEqual(['2'])
    })

    it('applies between filter on number', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { amount: { value: { min: 500, max: 1000 }, operator: 'between' } },
        })
        expect(result.map(r => r.id)).toEqual(['1', '3', '4'])
    })

    it('applies before date filter', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { date: { value: '2024-03-15', operator: 'before' } },
        })
        expect(result.map(r => r.id)).toEqual(['3'])
    })

    it('applies after date filter', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { date: { value: '2024-06-20', operator: 'after' } },
        })
        expect(result.map(r => r.id)).toEqual(['4'])
    })

    it('applies on (exact date) filter', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { date: { value: '2024-06-20', operator: 'on' } },
        })
        expect(result.map(r => r.id)).toEqual(['2'])
    })

    it('applies date range object (between)', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: {
                date: { value: { from: '2024-03-01', to: '2024-07-01' }, operator: 'between' },
            },
        })
        expect(result.map(r => r.id)).toEqual(['1', '2'])
    })

    it('combines search and filter (AND logic)', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { status: { value: 'active', operator: 'is' } },
            searchInput: 'carol',
            searchFields: ['name'],
        })
        expect(result).toHaveLength(1)
        expect(result[0]!.id).toBe('3')
    })

    it('uses fieldAccessor when provided', () => {
        const result = applyClientFilters(ROWS, {
            appliedFilters: { fullName: { value: 'carol', operator: 'contains' } },
            fieldAccessors: { fullName: (r) => r.name },
        })
        expect(result[0]!.id).toBe('3')
    })
})
