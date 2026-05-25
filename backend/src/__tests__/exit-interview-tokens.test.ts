/**
 * Unit tests for the signed-token helper used by the "complete your exit
 * interview via link" email flow. Verifies round-trip + every failure mode
 * the route layer translates into 401.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { signExitInterviewToken, verifyExitInterviewToken } from '../lib/exit-interview-tokens.js'

beforeAll(() => {
    // Same env shape vitest uses elsewhere — the lib reads JWT_SECRET via
    // loadEnv() at call time.
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'ci-test-secret-at-least-32-characters-long'
})

describe('signExitInterviewToken / verifyExitInterviewToken', () => {
    it('round-trips the payload', () => {
        const token = signExitInterviewToken('t-1', 'exit-1', 'emp-1')
        const result = verifyExitInterviewToken(token)
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.payload.tenantId).toBe('t-1')
            expect(result.payload.exitRequestId).toBe('exit-1')
            expect(result.payload.employeeId).toBe('emp-1')
            expect(result.payload.purpose).toBe('exit-interview')
        }
    })

    it('rejects a token with a tampered payload', () => {
        const token = signExitInterviewToken('t-1', 'exit-1', 'emp-1')
        const [encoded, sig] = token.split('.')
        // Swap the payload but keep the original signature → bad-signature
        const tampered = signExitInterviewToken('t-2', 'exit-2', 'emp-2').split('.')[0] + '.' + sig
        const result = verifyExitInterviewToken(tampered)
        expect(result.ok).toBe(false)
        if (!result.ok) expect((result as { ok: false; reason: string }).reason).toBe('bad-signature')
        // sanity — original is still fine
        const original = verifyExitInterviewToken(`${encoded}.${sig}`)
        expect(original.ok).toBe(true)
    })

    it('rejects a token with a tampered signature', () => {
        const token = signExitInterviewToken('t-1', 'exit-1', 'emp-1')
        const tampered = token.slice(0, -2) + 'AA'
        const result = verifyExitInterviewToken(tampered)
        expect(result.ok).toBe(false)
        if (!result.ok) expect((result as { ok: false; reason: string }).reason).toBe('bad-signature')
    })

    it('rejects a malformed token (no dot separator)', () => {
        const result = verifyExitInterviewToken('garbage')
        expect(result.ok).toBe(false)
        if (!result.ok) expect((result as { ok: false; reason: string }).reason).toBe('malformed')
    })

    it('rejects an expired token', () => {
        // ttl = -1 second → already expired by the time verify runs
        const token = signExitInterviewToken('t-1', 'exit-1', 'emp-1', -1)
        const result = verifyExitInterviewToken(token)
        expect(result.ok).toBe(false)
        if (!result.ok) expect((result as { ok: false; reason: string }).reason).toBe('expired')
    })

    it('produces URL-safe tokens (no +, /, or =)', () => {
        const token = signExitInterviewToken('tenant-with-funny+chars', 'exit/slash', 'emp=eq')
        expect(token).not.toMatch(/[+/=]/)
    })
})
