/**
 * Unit tests for the recruitment tag catalog (skills / qualifications).
 *
 * The DB-touching CRUD (create / rename / soft delete, partial unique index,
 * tenant scoping) is enforced at the SQL layer; what's testable without a DB —
 * and what these tests cover — is the pure validation surface:
 *
 *   • `recruitmentTagBodySchema` — the POST/PATCH body contract (trim, 1–80)
 *   • `escapeLikePattern` — ILIKE metacharacter escaping for the `q` search
 *
 * Mirrors the pure-function pattern in bulk-jobs.test.ts.
 */
import { describe, it, expect } from 'vitest'
import { recruitmentTagBodySchema } from '../lib/validation.js'
import { escapeLikePattern } from '../modules/recruitment/recruitment.service.js'

// ─── recruitmentTagBodySchema ───────────────────────────────────────────────

describe('recruitmentTagBodySchema', () => {
    it('accepts a plain name and returns it unchanged', () => {
        const out = recruitmentTagBodySchema.parse({ name: 'TypeScript' })
        expect(out.name).toBe('TypeScript')
    })

    it('trims surrounding whitespace', () => {
        const out = recruitmentTagBodySchema.parse({ name: '  React  ' })
        expect(out.name).toBe('React')
    })

    it('rejects a missing name', () => {
        const res = recruitmentTagBodySchema.safeParse({})
        expect(res.success).toBe(false)
        if (!res.success) expect(res.error.issues[0]?.message).toBe('Name is required')
    })

    it('rejects a non-string name', () => {
        const res = recruitmentTagBodySchema.safeParse({ name: 42 })
        expect(res.success).toBe(false)
        if (!res.success) expect(res.error.issues[0]?.message).toBe('Name is required')
    })

    it('rejects an empty name', () => {
        const res = recruitmentTagBodySchema.safeParse({ name: '' })
        expect(res.success).toBe(false)
        if (!res.success) expect(res.error.issues[0]?.message).toBe('Name is required')
    })

    it('rejects a whitespace-only name (trimmed to empty)', () => {
        const res = recruitmentTagBodySchema.safeParse({ name: '   ' })
        expect(res.success).toBe(false)
        if (!res.success) expect(res.error.issues[0]?.message).toBe('Name is required')
    })

    it('accepts a name of exactly 80 characters', () => {
        const res = recruitmentTagBodySchema.safeParse({ name: 'a'.repeat(80) })
        expect(res.success).toBe(true)
    })

    it('rejects a name longer than 80 characters', () => {
        const res = recruitmentTagBodySchema.safeParse({ name: 'a'.repeat(81) })
        expect(res.success).toBe(false)
        if (!res.success) expect(res.error.issues[0]?.message).toBe('Name is too long (max 80 characters)')
    })
})

// ─── escapeLikePattern ──────────────────────────────────────────────────────

describe('escapeLikePattern', () => {
    it('leaves plain text untouched', () => {
        expect(escapeLikePattern('TypeScript')).toBe('TypeScript')
    })

    it('escapes % so it matches literally', () => {
        expect(escapeLikePattern('100%')).toBe('100\\%')
    })

    it('escapes _ so it matches literally', () => {
        expect(escapeLikePattern('snake_case')).toBe('snake\\_case')
    })

    it('escapes backslash itself', () => {
        expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
    })

    it('escapes every occurrence, not just the first', () => {
        expect(escapeLikePattern('%_%')).toBe('\\%\\_\\%')
    })

    it('handles the empty string', () => {
        expect(escapeLikePattern('')).toBe('')
    })
})
