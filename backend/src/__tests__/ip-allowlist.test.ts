/**
 * Unit tests for the shared IPv4 allowlist matcher (lib/ip-allowlist.ts) —
 * the engine behind the tenant-level IP allowlist enforced in
 * plugins/authenticate.ts and the per-app allowlist in
 * modules/attendance/external-auth.ts.
 *
 * Key contracts:
 *   • empty list = no restriction (ipInAllowlist allows)
 *   • arbitrary CIDR prefixes /0–/32, not just /16 + /24
 *   • IPv4-mapped IPv6 (`::ffff:1.2.3.4`) normalises to its IPv4 form
 *   • malformed entries / unparsable caller IPs FAIL CLOSED (never match)
 */
import { describe, it, expect } from 'vitest'
import { ipv4ToInt, normalizeIp, ipMatchesEntry, ipInAllowlist } from '../lib/ip-allowlist.js'

// ── ipv4ToInt ───────────────────────────────────────────────────────────────

describe('ipv4ToInt', () => {
    it('parses dotted quads', () => {
        expect(ipv4ToInt('0.0.0.0')).toBe(0)
        expect(ipv4ToInt('255.255.255.255')).toBe(0xffffffff)
        expect(ipv4ToInt('10.0.0.1')).toBe((10 << 24 | 1) >>> 0)
    })

    it('rejects malformed input', () => {
        expect(ipv4ToInt('1.2.3')).toBeNull()
        expect(ipv4ToInt('1.2.3.4.5')).toBeNull()
        expect(ipv4ToInt('1.2.3.999')).toBeNull()
        expect(ipv4ToInt('a.b.c.d')).toBeNull()
        expect(ipv4ToInt('::1')).toBeNull()
        expect(ipv4ToInt('')).toBeNull()
    })
})

// ── normalizeIp ─────────────────────────────────────────────────────────────

describe('normalizeIp', () => {
    it('strips the IPv4-mapped IPv6 prefix', () => {
        expect(normalizeIp('::ffff:192.168.1.10')).toBe('192.168.1.10')
        expect(normalizeIp('::FFFF:192.168.1.10')).toBe('192.168.1.10')
    })

    it('leaves plain IPv4 and pure IPv6 untouched', () => {
        expect(normalizeIp('10.0.0.1')).toBe('10.0.0.1')
        expect(normalizeIp('::1')).toBe('::1')
    })
})

// ── ipMatchesEntry ──────────────────────────────────────────────────────────

describe('ipMatchesEntry', () => {
    it('matches exact IPs', () => {
        expect(ipMatchesEntry('1.2.3.4', '1.2.3.4')).toBe(true)
        expect(ipMatchesEntry('1.2.3.4', '9.9.9.9')).toBe(false)
    })

    it('matches /24 and /16 (legacy-supported prefixes)', () => {
        expect(ipMatchesEntry('10.0.5.99', '10.0.5.0/24')).toBe(true)
        expect(ipMatchesEntry('10.0.6.99', '10.0.5.0/24')).toBe(false)
        expect(ipMatchesEntry('10.0.99.5', '10.0.0.0/16')).toBe(true)
        expect(ipMatchesEntry('10.1.99.5', '10.0.0.0/16')).toBe(false)
    })

    it('matches arbitrary prefixes (/8, /20, /30, /32)', () => {
        expect(ipMatchesEntry('10.200.1.1', '10.0.0.0/8')).toBe(true)
        expect(ipMatchesEntry('11.0.0.1', '10.0.0.0/8')).toBe(false)
        expect(ipMatchesEntry('192.168.15.255', '192.168.0.0/20')).toBe(true)
        expect(ipMatchesEntry('192.168.16.0', '192.168.0.0/20')).toBe(false)
        expect(ipMatchesEntry('10.0.0.2', '10.0.0.0/30')).toBe(true)
        expect(ipMatchesEntry('10.0.0.4', '10.0.0.0/30')).toBe(false)
        expect(ipMatchesEntry('10.0.0.1', '10.0.0.1/32')).toBe(true)
        expect(ipMatchesEntry('10.0.0.2', '10.0.0.1/32')).toBe(false)
    })

    it('/0 matches everything', () => {
        expect(ipMatchesEntry('203.0.113.7', '0.0.0.0/0')).toBe(true)
    })

    it('fails closed on malformed entries or IPs', () => {
        expect(ipMatchesEntry('1.2.3.4', '1.2.3/24')).toBe(false)
        expect(ipMatchesEntry('1.2.3.4', '1.2.3.4/33')).toBe(false)
        expect(ipMatchesEntry('1.2.3.4', 'banana')).toBe(false)
        expect(ipMatchesEntry('::1', '0.0.0.0/0')).toBe(false) // pure IPv6 caller never matches IPv4 rules
    })
})

// ── ipInAllowlist ───────────────────────────────────────────────────────────

describe('ipInAllowlist', () => {
    it('empty list = no restriction', () => {
        expect(ipInAllowlist('1.2.3.4', [])).toBe(true)
    })

    it('allows listed IPs and rejects others', () => {
        const list = ['203.0.113.7', '10.0.0.0/8']
        expect(ipInAllowlist('203.0.113.7', list)).toBe(true)
        expect(ipInAllowlist('10.42.42.42', list)).toBe(true)
        expect(ipInAllowlist('8.8.8.8', list)).toBe(false)
    })

    it('normalises IPv4-mapped IPv6 callers', () => {
        expect(ipInAllowlist('::ffff:10.0.0.5', ['10.0.0.0/24'])).toBe(true)
    })

    it('rejects pure IPv6 callers when a list is set (fail closed)', () => {
        expect(ipInAllowlist('::1', ['10.0.0.0/8'])).toBe(false)
    })
})
