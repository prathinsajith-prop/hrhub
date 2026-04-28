import { describe, it, expect } from 'vitest'
import { withTimestamp, encodeCursor, decodeCursor } from '../lib/db-helpers.js'

describe('withTimestamp', () => {
    it('adds an updatedAt Date to the payload', () => {
        const out = withTimestamp({ status: 'active' })
        expect(out.status).toBe('active')
        expect(out.updatedAt).toBeInstanceOf(Date)
    })

    it('preserves all original fields', () => {
        const input = { a: 1, b: 'two', c: null }
        const out = withTimestamp(input)
        expect(out.a).toBe(1)
        expect(out.b).toBe('two')
        expect(out.c).toBeNull()
    })

    it('overrides any prior updatedAt with a fresh one', () => {
        const old = new Date('2020-01-01T00:00:00.000Z')
        const out = withTimestamp({ updatedAt: old, x: 1 })
        expect(out.updatedAt).not.toEqual(old)
        expect(out.updatedAt.getTime()).toBeGreaterThan(old.getTime())
    })
})

describe('encodeCursor / decodeCursor', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    const date = new Date('2026-04-28T12:34:56.789Z')

    it('round-trips a Date input back to ISO + id', () => {
        const cursor = encodeCursor(date, id)
        const decoded = decodeCursor(cursor)
        expect(decoded).toEqual({ c: date.toISOString(), i: id })
    })

    it('round-trips an ISO string input', () => {
        const iso = date.toISOString()
        const decoded = decodeCursor(encodeCursor(iso, id))
        expect(decoded).toEqual({ c: iso, i: id })
    })

    it('produces a base64url string with no padding/illegal chars', () => {
        const cursor = encodeCursor(date, id)
        // base64url = A-Z a-z 0-9 - _
        expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/)
        expect(cursor).not.toContain('+')
        expect(cursor).not.toContain('/')
        expect(cursor).not.toContain('=')
    })

    it('returns null for malformed cursors', () => {
        expect(decodeCursor('not-a-cursor')).toBeNull()
        expect(decodeCursor('')).toBeNull()
        expect(decodeCursor('!!!')).toBeNull()
    })

    it('returns null when payload is missing required fields', () => {
        const bad = Buffer.from(JSON.stringify({ c: 'date-only' })).toString('base64url')
        expect(decodeCursor(bad)).toBeNull()
    })

    it('returns null when payload fields are wrong types', () => {
        const bad = Buffer.from(JSON.stringify({ c: 123, i: 'x' })).toString('base64url')
        expect(decodeCursor(bad)).toBeNull()
    })
})
