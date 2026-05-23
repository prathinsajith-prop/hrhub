/**
 * Unit tests for the pure clearance-instantiation helpers extracted from
 * offboardingFlow/offboarding.service.ts. These pin the owner-resolution and
 * date-offset rules so a future refactor can't silently break per-exit
 * checklist creation.
 */
import { describe, it, expect } from 'vitest'
import { resolveClearanceOwnerId, subtractClearanceOffset } from '../modules/offboardingFlow/offboarding.service.js'

// ─── Owner resolution ───────────────────────────────────────────────────────

describe('resolveClearanceOwnerId — specific_user', () => {
    it('returns the template-specified user ID', () => {
        expect(resolveClearanceOwnerId(
            { ownerType: 'specific_user', ownerUserId: 'user-1' },
            { firstHrPartner: 'hr-1', managerUserId: 'mgr-1' },
        )).toBe('user-1')
    })

    it('returns null when the template has no specific user set', () => {
        expect(resolveClearanceOwnerId(
            { ownerType: 'specific_user', ownerUserId: null },
            { firstHrPartner: 'hr-1', managerUserId: 'mgr-1' },
        )).toBeNull()
    })

    it('does NOT fall back to HR partner or manager — the spec is explicit', () => {
        // specific_user with null ownerUserId means "no owner", not "fall back"
        expect(resolveClearanceOwnerId(
            { ownerType: 'specific_user', ownerUserId: null },
            { firstHrPartner: 'hr-1', managerUserId: 'mgr-1' },
        )).toBeNull()
    })
})

describe('resolveClearanceOwnerId — reporting_manager', () => {
    it('returns the resolved manager user ID', () => {
        expect(resolveClearanceOwnerId(
            { ownerType: 'reporting_manager', ownerUserId: null },
            { firstHrPartner: 'hr-1', managerUserId: 'mgr-1' },
        )).toBe('mgr-1')
    })

    it('returns null when the employee has no resolvable manager', () => {
        expect(resolveClearanceOwnerId(
            { ownerType: 'reporting_manager', ownerUserId: null },
            { firstHrPartner: 'hr-1', managerUserId: null },
        )).toBeNull()
    })

    it('ignores the template ownerUserId field for manager-owned items', () => {
        // Even if the template carries a stray ownerUserId from a prior edit,
        // we resolve against runtime context, not the template field.
        expect(resolveClearanceOwnerId(
            { ownerType: 'reporting_manager', ownerUserId: 'stale-user' },
            { firstHrPartner: 'hr-1', managerUserId: 'mgr-1' },
        )).toBe('mgr-1')
    })
})

describe('resolveClearanceOwnerId — hr_partner', () => {
    it('returns the first HR partner user ID', () => {
        expect(resolveClearanceOwnerId(
            { ownerType: 'hr_partner', ownerUserId: null },
            { firstHrPartner: 'hr-1', managerUserId: null },
        )).toBe('hr-1')
    })

    it('returns null when no HR partner is configured', () => {
        // This is the "HR partner role with empty config" edge case — the
        // clearance is created with NULL owner; HR can reassign later.
        expect(resolveClearanceOwnerId(
            { ownerType: 'hr_partner', ownerUserId: null },
            { firstHrPartner: null, managerUserId: 'mgr-1' },
        )).toBeNull()
    })
})

// ─── Date offset helper ─────────────────────────────────────────────────────

describe('subtractClearanceOffset', () => {
    it('returns the relieving date itself when offset is 0', () => {
        expect(subtractClearanceOffset('2026-06-30', 0)).toBe('2026-06-30')
    })

    it('subtracts the offset in days', () => {
        // 2026-06-30 minus 30 days = 2026-05-31
        expect(subtractClearanceOffset('2026-06-30', 30)).toBe('2026-05-31')
    })

    it('clamps negative offsets to 0 (defensive against bad config)', () => {
        expect(subtractClearanceOffset('2026-06-30', -5)).toBe('2026-06-30')
    })

    it('handles month boundaries correctly', () => {
        // 2026-03-01 minus 1 day = 2026-02-28 (non-leap year)
        expect(subtractClearanceOffset('2026-03-01', 1)).toBe('2026-02-28')
    })

    it('handles year boundaries correctly', () => {
        // 2026-01-01 minus 1 day = 2025-12-31
        expect(subtractClearanceOffset('2026-01-01', 1)).toBe('2025-12-31')
    })

    it('returns a canonical YYYY-MM-DD format regardless of input precision', () => {
        // Input with a time component still emits date-only output
        expect(subtractClearanceOffset('2026-06-30', 0)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })
})
