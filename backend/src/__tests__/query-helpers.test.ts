/**
 * Unit tests for lib/query-helpers.ts — pure utility functions used across
 * every module to build paginated, keyset-cursor Drizzle queries.
 *
 * conjunction, buildKeysetResult, and pageOffset are free of DB calls.
 * applyKeyset depends on decodeCursor for the cursor path (tested via
 * roundtripping through encodeCursor).
 */
import { describe, it, expect } from 'vitest'
import { conjunction, buildKeysetResult, pageOffset } from '../lib/query-helpers.js'
import { encodeCursor } from '../lib/db-helpers.js'

// ─── conjunction ─────────────────────────────────────────────────────────────

describe('conjunction', () => {
    it('returns undefined when the array is empty', () => {
        expect(conjunction([])).toBeUndefined()
    })

    it('returns undefined when all predicates are falsy', () => {
        expect(conjunction([null, undefined, false])).toBeUndefined()
    })

    it('returns the single truthy predicate directly (no AND wrapper for 1 item)', () => {
        const p = { sql: 'dummy predicate' } as unknown as import('drizzle-orm').SQL
        const result = conjunction([p])
        expect(result).toBe(p)
    })

    it('drops falsy predicates and returns the remaining truthy one', () => {
        const p = { sql: 'dummy' } as unknown as import('drizzle-orm').SQL
        const result = conjunction([null, undefined, false, p])
        expect(result).toBe(p)
    })

    it('returns an AND-wrapped SQL object when multiple predicates are truthy', () => {
        const p1 = { sql: 'a' } as unknown as import('drizzle-orm').SQL
        const p2 = { sql: 'b' } as unknown as import('drizzle-orm').SQL
        const result = conjunction([p1, p2])
        // The returned value should be a SQL object (not undefined, not p1 directly)
        expect(result).toBeDefined()
        expect(result).not.toBe(p1)
        expect(result).not.toBe(p2)
    })
})

// ─── buildKeysetResult ───────────────────────────────────────────────────────

interface Row { id: string; date: string; name: string }

function makeRows(n: number, prefix = 'row'): Row[] {
    return Array.from({ length: n }, (_, i) => ({
        id: `id-${i + 1}`,
        date: `2026-01-${String(i + 1).padStart(2, '0')}`,
        name: `${prefix}-${i + 1}`,
    }))
}

const extract = (r: Row): [string, string] => [r.date, r.id]

describe('buildKeysetResult', () => {
    it('returns all items and null nextCursor when rows ≤ limit', () => {
        const rows = makeRows(10)
        const { items, nextCursor } = buildKeysetResult(rows, 10, extract)
        expect(items).toHaveLength(10)
        expect(nextCursor).toBeNull()
    })

    it('returns limit items and a non-null nextCursor when rows > limit', () => {
        const rows = makeRows(11) // limit + 1
        const { items, nextCursor } = buildKeysetResult(rows, 10, extract)
        expect(items).toHaveLength(10)
        expect(nextCursor).not.toBeNull()
        expect(typeof nextCursor).toBe('string')
    })

    it('nextCursor is base64url (no + / =)', () => {
        const rows = makeRows(6)
        const { nextCursor } = buildKeysetResult(rows, 5, extract)
        expect(nextCursor).toMatch(/^[A-Za-z0-9_-]+$/)
    })

    it('returns empty items and null cursor for an empty result set', () => {
        const { items, nextCursor } = buildKeysetResult([], 10, extract)
        expect(items).toHaveLength(0)
        expect(nextCursor).toBeNull()
    })

    it('returned items are a slice — the extra probe row is not included', () => {
        const rows = makeRows(6)
        const { items } = buildKeysetResult(rows, 5, extract)
        // The 6th row (id-6) should NOT appear in items
        expect(items.map(r => r.id)).not.toContain('id-6')
        expect(items.map(r => r.id)).toContain('id-5')
    })

    it('cursor encodes the last visible item', () => {
        const rows = makeRows(6)
        const { items, nextCursor } = buildKeysetResult(rows, 5, extract)
        const lastItem = items[items.length - 1]
        const expectedCursor = encodeCursor(lastItem.date, lastItem.id)
        expect(nextCursor).toBe(expectedCursor)
    })
})

// ─── pageOffset ──────────────────────────────────────────────────────────────

describe('pageOffset', () => {
    it('defaults to page 1, limit 50', () => {
        const { limit, offset } = pageOffset({})
        expect(limit).toBe(50)
        expect(offset).toBe(0)
    })

    it('page 2 with limit 20 gives offset 20', () => {
        const { limit, offset } = pageOffset({ page: 2, limit: 20 })
        expect(limit).toBe(20)
        expect(offset).toBe(20)
    })

    it('page 3 with limit 10 gives offset 20', () => {
        const { offset } = pageOffset({ page: 3, limit: 10 })
        expect(offset).toBe(20)
    })

    it('clamps limit to maxLimit', () => {
        const { limit } = pageOffset({ limit: 9999 }, { maxLimit: 100 })
        expect(limit).toBe(100)
    })

    it('uses custom defaultLimit when limit is omitted', () => {
        const { limit } = pageOffset({}, { defaultLimit: 25 })
        expect(limit).toBe(25)
    })

    it('page 0 is treated as page 1 (no negative offset)', () => {
        const { offset } = pageOffset({ page: 0, limit: 10 })
        expect(offset).toBe(0)
    })

    it('page -5 is treated as page 1', () => {
        const { offset } = pageOffset({ page: -5, limit: 10 })
        expect(offset).toBe(0)
    })

    it('limit of 0 is clamped to 1', () => {
        const { limit } = pageOffset({ limit: 0 })
        expect(limit).toBeGreaterThanOrEqual(1)
    })
})
