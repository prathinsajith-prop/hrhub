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

// ── Bulk invalidation helpers ────────────────────────────────────────────────

/**
 * Invalidate every cache entry that depends on the employees table for the
 * given tenant. Call this from create/update/delete employee paths.
 */
export async function invalidateEmployeeCaches(tenantId: string, employeeId?: string): Promise<void> {
    await Promise.all([
        dashboardCache.invalidate(tenantId),
        // We don't know the list-key suffix here, so we rely on TTL expiry for
        // list caches. Future: switch to a tag-based invalidation scheme.
        employeeId ? employeeDetailCache.invalidate(tenantId, employeeId) : Promise.resolve(),
    ])
}

/**
 * Invalidate every cache entry that depends on leave for the given tenant.
 */
export async function invalidateLeaveCaches(tenantId: string): Promise<void> {
    await Promise.all([
        dashboardCache.invalidate(tenantId),
        leavePoliciesCache.invalidate(tenantId),
    ])
}
