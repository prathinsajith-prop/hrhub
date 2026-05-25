// ─── Exit-interview signed tokens ────────────────────────────────────────────
// Generates and verifies short tokens for the "open this link to complete
// your exit interview" email flow. Equivalent to a single-purpose JWT but
// implemented with Node's built-in crypto (no extra dep).
//
// Format:   base64url(payloadJson) "." base64url(hmacSha256)
// Payload: { tenantId, exitRequestId, employeeId, purpose, iat, exp }
//
// The token is keyed off `JWT_SECRET` mixed with a purpose tag so a leaked
// access-token-style payload can't be re-used here.

import crypto from 'node:crypto'
import { loadEnv } from '../config/env.js'

const PURPOSE = 'exit-interview' as const
/** 90 days — long enough that an offboarding workflow scheduled 60 days
 *  before LWD still has a usable link when the employee opens the email. */
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 90

export interface ExitInterviewTokenPayload {
    tenantId: string
    exitRequestId: string
    employeeId: string
    purpose: typeof PURPOSE
    iat: number
    exp: number
}

function base64UrlEncode(buf: Buffer | string): string {
    const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf, 'utf8')
    return b.toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlDecode(s: string): Buffer {
    const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
    return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

function purposeKey(): Buffer {
    // Derive a purpose-specific HMAC key so this token type can never
    // accidentally validate against (or be validated by) the access-token
    // signer.
    const env = loadEnv()
    return crypto.createHmac('sha256', env.JWT_SECRET).update(`hrhub:${PURPOSE}`).digest()
}

export function signExitInterviewToken(
    tenantId: string,
    exitRequestId: string,
    employeeId: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
    const now = Math.floor(Date.now() / 1000)
    const payload: ExitInterviewTokenPayload = {
        tenantId,
        exitRequestId,
        employeeId,
        purpose: PURPOSE,
        iat: now,
        exp: now + ttlSeconds,
    }
    const encoded = base64UrlEncode(JSON.stringify(payload))
    const sig = base64UrlEncode(crypto.createHmac('sha256', purposeKey()).update(encoded).digest())
    return `${encoded}.${sig}`
}

export type VerifyOutcome =
    | { ok: true; payload: ExitInterviewTokenPayload }
    | { ok: false; reason: 'malformed' | 'bad-signature' | 'expired' | 'wrong-purpose' }

export function verifyExitInterviewToken(token: string): VerifyOutcome {
    const parts = token.split('.')
    if (parts.length !== 2) return { ok: false, reason: 'malformed' }
    const [encoded, sig] = parts
    const expectedSig = base64UrlEncode(crypto.createHmac('sha256', purposeKey()).update(encoded).digest())
    // Constant-time comparison — guards against timing oracles even though
    // the surface area here is tiny.
    const a = Buffer.from(sig)
    const b = Buffer.from(expectedSig)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return { ok: false, reason: 'bad-signature' }
    }
    let payload: ExitInterviewTokenPayload
    try {
        payload = JSON.parse(base64UrlDecode(encoded).toString('utf8'))
    } catch {
        return { ok: false, reason: 'malformed' }
    }
    if (payload.purpose !== PURPOSE) return { ok: false, reason: 'wrong-purpose' }
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp < now) return { ok: false, reason: 'expired' }
    return { ok: true, payload }
}

/** Build the absolute URL the employee opens. PORTAL_URL is the public
 *  origin of the employee portal, kept here so workflow emails and any
 *  other caller share one source of truth. */
export function buildExitInterviewLink(token: string): string {
    const env = loadEnv()
    const origin = (env.PORTAL_URL ?? '').replace(/\/$/, '') || 'http://localhost:5173'
    return `${origin}/exit-interview/by-token/${token}`
}
