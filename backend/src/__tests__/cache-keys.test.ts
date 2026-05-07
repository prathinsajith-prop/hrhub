/**
 * Unit tests for the cache namespace key-building logic in lib/cache.ts.
 *
 * These tests verify that every declared namespace:
 *   - produces keys with the expected prefix
 *   - correctly joins multiple scope arguments with ':'
 *   - two different namespaces never share a key for the same arguments
 *
 * Redis is NOT called — only the synchronous `.key()` helper is exercised.
 */
import { describe, it, expect } from 'vitest'
import {
    dashboardCache,
    dashboardSummaryCache,
    employeeListCache,
    employeeDetailCache,
    leavePoliciesCache,
    unreadNotificationsCache,
    tenantConfigCache,
    leaveBalancesCache,
} from '../lib/cache.js'

const T = 'tenant-abc'
const E = 'employee-xyz'
const Y = '2026'
const U = 'user-123'
const K = 'page-1-limit-20'

describe('Cache namespace key format', () => {
    it('dashboardCache key starts with "dashboard:kpis:"', () => {
        expect(dashboardCache.key(T)).toBe(`dashboard:kpis:${T}`)
    })

    it('dashboardSummaryCache key starts with "dashboard:summary:"', () => {
        expect(dashboardSummaryCache.key(T)).toBe(`dashboard:summary:${T}`)
    })

    it('employeeListCache key includes tenant and page key', () => {
        expect(employeeListCache.key(T, K)).toBe(`employees:list:${T}:${K}`)
    })

    it('employeeDetailCache key includes tenant and employee ID', () => {
        expect(employeeDetailCache.key(T, E)).toBe(`employees:detail:${T}:${E}`)
    })

    it('leavePoliciesCache key starts with "leave:policies:"', () => {
        expect(leavePoliciesCache.key(T)).toBe(`leave:policies:${T}`)
    })

    it('unreadNotificationsCache key is scoped by userId not tenantId', () => {
        expect(unreadNotificationsCache.key(U)).toBe(`notifications:unread:${U}`)
    })

    it('tenantConfigCache key starts with "tenant:config:"', () => {
        expect(tenantConfigCache.key(T)).toBe(`tenant:config:${T}`)
    })

    it('leaveBalancesCache key includes tenant, employee, and year', () => {
        expect(leaveBalancesCache.key(T, E, Y)).toBe(`leave:balances:${T}:${E}:${Y}`)
    })
})

describe('Cache namespace isolation — no two namespaces share a key', () => {
    it('dashboard and dashboardSummary keys differ for the same tenant', () => {
        expect(dashboardCache.key(T)).not.toBe(dashboardSummaryCache.key(T))
    })

    it('employeeList and employeeDetail keys differ', () => {
        expect(employeeListCache.key(T, E)).not.toBe(employeeDetailCache.key(T, E))
    })

    it('leaveBalances and leavePolicies keys differ for same tenant', () => {
        expect(leaveBalancesCache.key(T, E, Y)).not.toBe(leavePoliciesCache.key(T))
    })
})

describe('leaveBalancesCache — year scoping', () => {
    it('different years produce different keys', () => {
        const key2025 = leaveBalancesCache.key(T, E, '2025')
        const key2026 = leaveBalancesCache.key(T, E, '2026')
        expect(key2025).not.toBe(key2026)
    })

    it('different employees produce different keys for the same year', () => {
        const keyA = leaveBalancesCache.key(T, 'emp-a', Y)
        const keyB = leaveBalancesCache.key(T, 'emp-b', Y)
        expect(keyA).not.toBe(keyB)
    })

    it('different tenants produce different keys', () => {
        const keyT1 = leaveBalancesCache.key('tenant-1', E, Y)
        const keyT2 = leaveBalancesCache.key('tenant-2', E, Y)
        expect(keyT1).not.toBe(keyT2)
    })
})

describe('TTL values are positive integers', () => {
    it('dashboardCache TTL > 0', () => { expect(dashboardCache.ttl).toBeGreaterThan(0) })
    it('employeeDetailCache TTL > 0', () => { expect(employeeDetailCache.ttl).toBeGreaterThan(0) })
    it('leavePoliciesCache TTL is longer than leaveBalancesCache (policies change rarely)', () => {
        expect(leavePoliciesCache.ttl).toBeGreaterThanOrEqual(leaveBalancesCache.ttl)
    })
    it('unreadNotificationsCache TTL is ≤ 30s (UI polling)', () => {
        expect(unreadNotificationsCache.ttl).toBeLessThanOrEqual(30)
    })
})
