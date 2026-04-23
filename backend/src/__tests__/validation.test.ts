/**
 * Unit tests for shared validation schemas.
 * These guard the public API contract — any breaking change here changes
 * the wire format clients see.
 */
import { describe, it, expect } from 'vitest'
import {
    loginSchema,
    registerSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    changePasswordSchema,
    paginationSchema,
    uuidSchema,
} from '../lib/validation.js'

describe('loginSchema', () => {
    it('accepts a well-formed email + password', () => {
        const r = loginSchema.safeParse({ email: 'user@example.com', password: 'secret123' })
        expect(r.success).toBe(true)
    })

    it('rejects an invalid email', () => {
        const r = loginSchema.safeParse({ email: 'not-an-email', password: 'secret123' })
        expect(r.success).toBe(false)
    })

    it('rejects a password shorter than 8 characters', () => {
        const r = loginSchema.safeParse({ email: 'user@example.com', password: 'short' })
        expect(r.success).toBe(false)
    })

    it('rejects missing fields', () => {
        expect(loginSchema.safeParse({}).success).toBe(false)
        expect(loginSchema.safeParse({ email: 'a@b.co' }).success).toBe(false)
    })
})

describe('registerSchema', () => {
    it('accepts a minimal valid payload', () => {
        const r = registerSchema.safeParse({
            email: 'new@user.com',
            password: 'Secret!234',
            firstName: 'Ada',
            lastName: 'Lovelace',
        })
        expect(r.success).toBe(true)
    })

    it('enforces the 128-character password cap', () => {
        const r = registerSchema.safeParse({
            email: 'new@user.com',
            password: 'x'.repeat(129),
            firstName: 'Ada',
            lastName: 'Lovelace',
        })
        expect(r.success).toBe(false)
    })
})

describe('forgotPasswordSchema / resetPasswordSchema / changePasswordSchema', () => {
    it('requires a valid email for forgot-password', () => {
        expect(forgotPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true)
        expect(forgotPasswordSchema.safeParse({ email: 'x' }).success).toBe(false)
    })

    it('requires a non-empty token for reset-password', () => {
        expect(resetPasswordSchema.safeParse({ token: '', password: 'aaaaaaaa' }).success).toBe(false)
        expect(resetPasswordSchema.safeParse({ token: 't', password: 'aaaaaaaa' }).success).toBe(true)
    })

    it('requires current + new password for change-password', () => {
        const r = changePasswordSchema.safeParse({ currentPassword: 'old', newPassword: 'newpass123' })
        expect(r.success).toBe(true)
    })
})

describe('paginationSchema', () => {
    it('applies defaults when empty', () => {
        const r = paginationSchema.parse({})
        expect(r.limit).toBe(20)
        expect(r.offset).toBe(0)
    })

    it('coerces numeric strings', () => {
        const r = paginationSchema.parse({ limit: '50', offset: '10' })
        expect(r.limit).toBe(50)
        expect(r.offset).toBe(10)
    })

    it('caps limit at 100', () => {
        expect(paginationSchema.safeParse({ limit: 101 }).success).toBe(false)
    })

    it('rejects negative offset', () => {
        expect(paginationSchema.safeParse({ offset: -1 }).success).toBe(false)
    })
})

describe('uuidSchema', () => {
    it('accepts a valid UUID', () => {
        expect(uuidSchema.safeParse('550e8400-e29b-41d4-a716-446655440000').success).toBe(true)
    })

    it('rejects a non-UUID string', () => {
        expect(uuidSchema.safeParse('not-a-uuid').success).toBe(false)
    })
})
