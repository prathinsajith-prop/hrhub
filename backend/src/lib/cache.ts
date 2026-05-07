/**
 * Cache facade — central place for all Redis cache namespaces, TTLs, and
 * invalidation rules. Service code should never call cacheGet/cacheSet
 * directly: it should depend on a typed namespace declared here so:
 *   - keys are consistent across the codebase
 *   - invalidation is a single function call (not scattered string literals)
 *   - TTLs are reviewed in one file
 *
 * Each namespace exposes:
 *   - key(scope...)  → the cache key string
 *   - get<T>(scope)  → cached value or null
 *   - set(scope, v)  → write with the namespace TTL
 *   - invalidate(...) → delete one or many keys in this namespace
 */
import { cacheGet, cacheSet, cacheDel } from './redis.js'

// ── L1 in-process cache ───────────────────────────────────────────────────────
// A tiny Map-based cache that sits in front of Redis for hot, read-mostly data
// (tenant config, leave policies) so the Redis round-trip is only paid on a
// cache miss. Entries expire based on wall-clock time and are evicted LRU-style
// when the map grows beyond L1_MAX.

const L1_MAX = 500
const l1Map = new Map<string, { value: unknown; exp: number }>()

function l1Get<T>(key: string): T | null {
    const entry = l1Map.get(key)
    if (!entry) return null
    if (entry.exp < Date.now()) { l1Map.delete(key); return null }
    return entry.value as T
}

function l1Set(key: string, value: unknown, ttlMs: number): void {
    if (l1Map.size >= L1_MAX) {
        // Evict the oldest entry (insertion-order first)
        const first = l1Map.keys().next().value
        if (first) l1Map.delete(first)
    }
    l1Map.set(key, { value, exp: Date.now() + ttlMs })
}

function l1Del(key: string): void {
    l1Map.delete(key)
}

/**
 * Two-level cache wrapper: L1 in-process → L2 Redis → fetch.
 * Use for high-read, low-write data like tenant config and leave policies.
 *
 * @param key      Unique cache key (usually from a namespace `.key()` call).
 * @param l1TtlMs  L1 (in-process) TTL in milliseconds. Should be ≤ Redis TTL.
 * @param fetch    Async function that loads the value from the DB on a full miss.
 */
export async function withL1Cache<T>(
    key: string,
    l1TtlMs: number,
    fetch: () => Promise<T>,
): Promise<T> {
    const hit = l1Get<T>(key)
    if (hit !== null) return hit
    const value = await fetch()
    l1Set(key, value, l1TtlMs)
    return value
}

/** Invalidate a key from both L1 and L2 caches. */
export async function invalidateL1AndL2(key: string): Promise<void> {
    l1Del(key)
    await cacheDel(key)
}

interface NamespaceConfig {
    /** Short, unique prefix used in Redis. */
    prefix: string
    /** Time-to-live in seconds. */
    ttl: number
}

function makeNamespace<Args extends string[]>(cfg: NamespaceConfig) {
    const buildKey = (...parts: Args) => `${cfg.prefix}:${parts.join(':')}`
    return {
        key: buildKey,
        async get<T>(...parts: Args): Promise<T | null> {
            return cacheGet<T>(buildKey(...parts))
        },
        async set(parts: Args, value: unknown): Promise<void> {
            return cacheSet(buildKey(...parts), value, cfg.ttl)
        },
        async invalidate(...parts: Args): Promise<void> {
            return cacheDel(buildKey(...parts))
        },
        prefix: cfg.prefix,
        ttl: cfg.ttl,
    }
}

// ── Namespaces ───────────────────────────────────────────────────────────────
// Add new entries here so the catalogue stays discoverable.

/** Dashboard KPI block, scoped by tenant. */
export const dashboardCache = makeNamespace<[tenantId: string]>({
    prefix: 'dashboard:kpis',
    ttl: 120, // 2 minutes
})

/** Full dashboard summary (BFF aggregator), scoped by tenant. */
export const dashboardSummaryCache = makeNamespace<[tenantId: string]>({
    prefix: 'dashboard:summary',
    ttl: 120,
})

/** List of employees for a tenant — invalidated on any employee mutation. */
export const employeeListCache = makeNamespace<[tenantId: string, key: string]>({
    prefix: 'employees:list',
    ttl: 60,
})

/** Single employee detail — invalidated on update/delete. */
export const employeeDetailCache = makeNamespace<[tenantId: string, employeeId: string]>({
    prefix: 'employees:detail',
    ttl: 300,
})

/** Active leave policies for a tenant. Rarely change. */
export const leavePoliciesCache = makeNamespace<[tenantId: string]>({
    prefix: 'leave:policies',
    ttl: 600, // 10 minutes
})

/** Notifications unread count for a user — short TTL because UI polls. */
export const unreadNotificationsCache = makeNamespace<[userId: string]>({
    prefix: 'notifications:unread',
    ttl: 15,
})

/** Tenant configuration / branding. Loaded on every request. */
export const tenantConfigCache = makeNamespace<[tenantId: string]>({
    prefix: 'tenant:config',
    ttl: 600,
})

/** Leave balances per employee per year — invalidated on approve/cancel/adjust. */
export const leaveBalancesCache = makeNamespace<[tenantId: string, employeeId: string, year: string]>({
    prefix: 'leave:balances',
    ttl: 120, // 2 minutes — short because approvals change balances
})

// ── Bulk invalidation helpers ────────────────────────────────────────────────

/**
 * Invalidate every cache entry that depends on the employees table for the
 * given tenant. Call this from create/update/delete employee paths.
 */
export async function invalidateEmployeeCaches(tenantId: string, employeeId?: string): Promise<void> {
    await Promise.all([
        invalidateL1AndL2(dashboardCache.key(tenantId)),
        invalidateL1AndL2(dashboardSummaryCache.key(tenantId)),
        employeeId ? invalidateL1AndL2(employeeDetailCache.key(tenantId, employeeId)) : Promise.resolve(),
    ])
}

/**
 * Invalidate every cache entry that depends on leave for the given tenant.
 * Clears both the L1 in-process layer and L2 Redis.
 */
export async function invalidateLeaveCaches(tenantId: string): Promise<void> {
    await Promise.all([
        invalidateL1AndL2(dashboardCache.key(tenantId)),
        invalidateL1AndL2(dashboardSummaryCache.key(tenantId)),
        invalidateL1AndL2(leavePoliciesCache.key(tenantId)),
    ])
}
