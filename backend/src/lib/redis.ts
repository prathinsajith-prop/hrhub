/**
 * Shared Redis client (ioredis).
 * Used for caching hot data — dashboard KPIs, etc.
 * Degrades gracefully: if Redis is unavailable, cache calls are no-ops.
 */
import Redis from 'ioredis'
import { loadEnv } from '../config/env.js'

let _client: Redis | null = null
let _disabled = false // set true after a confirmed connection failure

export function getRedisClient(): Redis | null {
    if (_disabled) return null
    if (_client) return _client
    try {
        const env = loadEnv()
        const url = new URL(env.REDIS_URL)
        _client = new Redis({
            host: url.hostname,
            port: Number(url.port ?? 6379),
            password: url.password || undefined,
            // Fail fast if Redis is unreachable so cache misses don't hang requests
            connectTimeout: 1000,
            commandTimeout: 1000,
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            enableReadyCheck: false,
            lazyConnect: true,
            retryStrategy: () => null, // do not auto-retry
        })
        _client.on('error', () => {
            // First error → disable so we stop attempting commands
            _disabled = true
        })
        return _client
    } catch {
        _disabled = true
        return null
    }
}

/** Wrap a promise with a hard timeout so callers never hang on cache calls. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
    return new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), ms)
        promise.then(
            (v) => { clearTimeout(t); resolve(v) },
            () => { clearTimeout(t); resolve(null) },
        )
    })
}

/** Get a cached JSON value. Returns null on miss, error, or timeout. */
export async function cacheGet<T>(key: string): Promise<T | null> {
    const client = getRedisClient()
    if (!client) return null
    const raw = await withTimeout(client.get(key), 1000)
    if (!raw) return null
    try {
        return JSON.parse(raw) as T
    } catch {
        return null
    }
}

/** Set a JSON value with TTL in seconds. Silently fails if Redis unavailable. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    const client = getRedisClient()
    if (!client) return
    await withTimeout(client.setex(key, ttlSeconds, JSON.stringify(value)), 1000)
}

/** Delete cache keys (call on mutations that invalidate data). */
export async function cacheDel(...keys: string[]): Promise<void> {
    const client = getRedisClient()
    if (!client || keys.length === 0) return
    await withTimeout(client.del(...keys), 1000)
}
