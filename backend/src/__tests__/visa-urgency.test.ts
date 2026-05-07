/**
 * Unit tests for calcUrgencyLevel — the pure business-logic function that
 * determines visa urgency from an expiry date.
 *
 * Boundary rules (UAE HR platform):
 *   daysLeft <= 30  → 'critical'
 *   daysLeft <= 90  → 'urgent'
 *   otherwise       → 'normal'
 *   null/undefined  → 'normal'
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { calcUrgencyLevel } from '../modules/visa/visa.service.js'

const FROZEN_NOW = new Date('2026-06-01T00:00:00.000Z')

function daysFromNow(n: number): string {
    const d = new Date(FROZEN_NOW)
    d.setDate(d.getDate() + n)
    return d.toISOString().split('T')[0]
}

describe('calcUrgencyLevel', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(FROZEN_NOW)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    // ── Missing / null expiry ────────────────────────────────────────────────

    it('returns normal for null expiry', () => {
        expect(calcUrgencyLevel(null)).toBe('normal')
    })

    it('returns normal for undefined expiry', () => {
        expect(calcUrgencyLevel(undefined)).toBe('normal')
    })

    it('returns normal for empty string', () => {
        expect(calcUrgencyLevel('')).toBe('normal')
    })

    // ── Critical boundary (≤ 30 days) ────────────────────────────────────────

    it('returns critical when exactly 30 days remain', () => {
        expect(calcUrgencyLevel(daysFromNow(30))).toBe('critical')
    })

    it('returns critical when 15 days remain', () => {
        expect(calcUrgencyLevel(daysFromNow(15))).toBe('critical')
    })

    it('returns critical when 1 day remains', () => {
        expect(calcUrgencyLevel(daysFromNow(1))).toBe('critical')
    })

    it('returns critical for today (0 days left)', () => {
        // daysLeft = ceil(0 / msPerDay) = 0, which is ≤ 30
        expect(calcUrgencyLevel(daysFromNow(0))).toBe('critical')
    })

    it('returns critical for an already-expired visa', () => {
        expect(calcUrgencyLevel(daysFromNow(-10))).toBe('critical')
    })

    // ── Urgent boundary (31–90 days) ─────────────────────────────────────────

    it('returns urgent when exactly 31 days remain', () => {
        expect(calcUrgencyLevel(daysFromNow(31))).toBe('urgent')
    })

    it('returns urgent when exactly 90 days remain', () => {
        expect(calcUrgencyLevel(daysFromNow(90))).toBe('urgent')
    })

    it('returns urgent for a mid-range date (60 days)', () => {
        expect(calcUrgencyLevel(daysFromNow(60))).toBe('urgent')
    })

    // ── Normal (> 90 days) ───────────────────────────────────────────────────

    it('returns normal when exactly 91 days remain', () => {
        expect(calcUrgencyLevel(daysFromNow(91))).toBe('normal')
    })

    it('returns normal for a distant expiry (365 days)', () => {
        expect(calcUrgencyLevel(daysFromNow(365))).toBe('normal')
    })

    it('returns normal for a far-future expiry (5 years)', () => {
        expect(calcUrgencyLevel(daysFromNow(5 * 365))).toBe('normal')
    })
})
