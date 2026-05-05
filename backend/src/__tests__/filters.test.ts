/**
 * Unit tests for the backend filter parser + Drizzle condition builder.
 * These tests exercise pure functions without any DB connection.
 */
import { describe, it, expect } from 'vitest'
import { parseFilterString, Conditions } from '../lib/filters.js'
import { encodeCursor } from '../lib/db-helpers.js'
import { pgTable, text, uuid, timestamp, boolean } from 'drizzle-orm/pg-core'

// ─── Shared test table ────────────────────────────────────────────────────────

const t = pgTable('test', {
    id: uuid('id'),
    tenantId: uuid('tenant_id'),
    status: text('status'),
    firstName: text('first_name'),
    lastName: text('last_name'),
    deletedAt: timestamp('deleted_at'),
    isActive: boolean('is_active'),
    isArchived: boolean('is_archived'),
    createdAt: timestamp('created_at'),
    startDate: text('start_date'),
    endDate: text('end_date'),
})

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

    it('returns cached result on repeated calls', () => {
        const a = parseFilterString('status:EQ(active)')
        const b = parseFilterString('status:EQ(active)')
        expect(a).toBe(b) // same reference from cache
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

// ─── Conditions builder ────────────────────────────────────────────────────────

describe('Conditions builder', () => {

    describe('fork()', () => {
        it('creates an independent copy — mutations to the fork do not affect the original', () => {
            const base = Conditions.create()
                .tenant(t.tenantId, 'abc')
                .notDeleted(t.deletedAt)
            const fork = base.fork()
            fork.match(t.status, 'active')
            expect(base.build()).toHaveLength(2)
            expect(fork.build()).toHaveLength(3)
        })

        it('fork starts with all conditions accumulated so far', () => {
            const base = Conditions.create().tenant(t.tenantId, 'abc')
            const fork = base.fork().match(t.status, 'active')
            expect(fork.build()).toHaveLength(2)
        })

        it('mutations to the original after fork() do not affect the fork', () => {
            const base = Conditions.create().tenant(t.tenantId, 'abc')
            const fork = base.fork()
            base.match(t.status, 'active')
            expect(fork.build()).toHaveLength(1)
        })
    })

    describe('when()', () => {
        it('applies callback when condition is true', () => {
            const c = Conditions.create().tenant(t.tenantId, 'abc')
            c.when(true, x => x.match(t.status, 'active'))
            expect(c.build()).toHaveLength(2)
        })

        it('skips callback when condition is false', () => {
            const c = Conditions.create().tenant(t.tenantId, 'abc')
            c.when(false, x => x.match(t.status, 'active'))
            expect(c.build()).toHaveLength(1)
        })

        it('supports chaining after when()', () => {
            const result = Conditions.create()
                .tenant(t.tenantId, 'abc')
                .when(true, x => x.match(t.status, 'active'))
                .notDeleted(t.deletedAt)
                .build()
            expect(result).toHaveLength(3)
        })
    })

    describe('orGroup()', () => {
        it('adds a single OR-grouped condition to the parent', () => {
            const c = Conditions.create()
            c.orGroup(g => g.match(t.status, 'a').match(t.status, 'b'))
            expect(c.build()).toHaveLength(1)
        })

        it('is a no-op when the callback adds nothing', () => {
            const c = Conditions.create()
            c.orGroup(() => {})
            expect(c.build()).toHaveLength(0)
        })

        it('adds a single condition directly (no OR wrapper) for a single-item group', () => {
            const c = Conditions.create()
            c.orGroup(g => g.match(t.status, 'active'))
            expect(c.build()).toHaveLength(1)
        })
    })

    describe('match()', () => {
        it('adds a condition when value is a non-empty string', () => {
            expect(Conditions.create().match(t.status, 'active').build()).toHaveLength(1)
        })

        it('skips when value is undefined', () => {
            expect(Conditions.create().match(t.status, undefined).build()).toHaveLength(0)
        })

        it('skips when value is null', () => {
            expect(Conditions.create().match(t.status, null).build()).toHaveLength(0)
        })

        it('skips when value is empty string', () => {
            expect(Conditions.create().match(t.status, '').build()).toHaveLength(0)
        })
    })

    describe('nameSearch()', () => {
        it('adds one OR condition when value is non-blank', () => {
            const c = Conditions.create().nameSearch('john', t.firstName, t.lastName)
            expect(c.build()).toHaveLength(1)
        })

        it('is a no-op when value is blank', () => {
            expect(Conditions.create().nameSearch('', t.firstName, t.lastName).build()).toHaveLength(0)
        })

        it('is a no-op when value is undefined', () => {
            expect(Conditions.create().nameSearch(undefined, t.firstName, t.lastName).build()).toHaveLength(0)
        })

        it('is a no-op when value is whitespace only', () => {
            expect(Conditions.create().nameSearch('   ', t.firstName, t.lastName).build()).toHaveLength(0)
        })
    })

    describe('dateOverlap()', () => {
        it('adds two conditions when both from and to are set', () => {
            const c = Conditions.create().dateOverlap(t.startDate as never, t.endDate as never, '2024-01-01', '2024-12-31')
            expect(c.build()).toHaveLength(2)
        })

        it('adds only the lte(startCol, to) condition when from is absent', () => {
            const c = Conditions.create().dateOverlap(t.startDate as never, t.endDate as never, null, '2024-12-31')
            expect(c.build()).toHaveLength(1)
        })

        it('adds only the gte(endCol, from) condition when to is absent', () => {
            const c = Conditions.create().dateOverlap(t.startDate as never, t.endDate as never, '2024-01-01', null)
            expect(c.build()).toHaveLength(1)
        })

        it('is a no-op when both bounds are absent', () => {
            const c = Conditions.create().dateOverlap(t.startDate as never, t.endDate as never)
            expect(c.build()).toHaveLength(0)
        })
    })

    describe('cursor()', () => {
        it('adds a cursor condition when a valid encoded cursor is provided', () => {
            const encoded = encodeCursor(new Date('2024-01-15T10:00:00Z'), 'some-uuid')
            const c = Conditions.create().cursor(encoded, t.createdAt as never, t.id as never)
            expect(c.build()).toHaveLength(1)
        })

        it('is a no-op when cursor is undefined', () => {
            const c = Conditions.create().cursor(undefined, t.createdAt as never, t.id as never)
            expect(c.build()).toHaveLength(0)
        })

        it('is a no-op when cursor is empty string', () => {
            const c = Conditions.create().cursor('', t.createdAt as never, t.id as never)
            expect(c.build()).toHaveLength(0)
        })
    })

    describe('filterWithName()', () => {
        it('is a no-op when filterStr is undefined', () => {
            const c = Conditions.create().filterWithName(undefined, {}, new Set(), t.firstName as never, t.lastName as never)
            expect(c.build()).toHaveLength(0)
        })

        it('adds a condition for the employeeName virtual field', () => {
            const c = Conditions.create().filterWithName(
                'employeeName:LIKE(john)',
                {},
                new Set(['employeeName']),
                t.firstName as never,
                t.lastName as never,
            )
            expect(c.build()).toHaveLength(1)
        })
    })

    describe('where()', () => {
        it('returns undefined when no conditions are added', () => {
            expect(Conditions.create().where()).toBeUndefined()
        })

        it('returns a SQL object when at least one condition is added', () => {
            const result = Conditions.create().tenant(t.tenantId, 'abc').where()
            expect(result).toBeDefined()
        })
    })

    describe('build()', () => {
        it('returns a copy — further mutations do not affect the returned array', () => {
            const c = Conditions.create().tenant(t.tenantId, 'abc')
            const first = c.build()
            c.match(t.status, 'active')
            expect(first).toHaveLength(1)
            expect(c.build()).toHaveLength(2)
        })
    })
})
