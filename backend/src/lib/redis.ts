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
        if (!env.REDIS_URL) {
            _disabled = true
            return null
        }
        const url = new URL(env.REDIS_URL)
        const isTls = url.protocol === 'rediss:'
        _client = new Redis({
            host: url.hostname,
            port: Number(url.port ?? 6379),
            username: url.username || undefined,
            password: url.password || undefined,
            // rediss:// → enable TLS. Required for Upstash, Redis Cloud, and any
            // managed Redis exposed over the public internet.
            tls: isTls ? {} : undefined,
            // Timeouts: a cloud TLS Redis (Upstash) needs ~500ms for the first
            // handshake from a fresh process. Local docker is sub-10ms. We bump
            // to 5s connect / 2s per-command so the cache stays useful over WAN
            // while still failing fast enough that requests don't hang.
            connectTimeout: isTls ? 5000 : 1500,
            commandTimeout: isTls ? 2000 : 1000,
            maxRetriesPerRequest: 1,
            // Queue commands while the initial TLS handshake is in flight —
            // otherwise the first cache call after process start is rejected
            // synchronously and always returns null. The per-call withTimeout
            // wrapper still caps wait time so requests don't hang.
            enableOfflineQueue: true,
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

// Per-call cap. 2.5s gives a TLS handshake + round-trip room to land while
// still bounding a cache call so a slow Redis can't hang a request.
const CACHE_CALL_MS = 2500

/** Get a cached JSON value. Returns null on miss, error, or timeout. */
export async function cacheGet<T>(key: string): Promise<T | null> {
    const client = getRedisClient()
    if (!client) return null
    const raw = await withTimeout(client.get(key), CACHE_CALL_MS)
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
    await withTimeout(client.setex(key, ttlSeconds, JSON.stringify(value)), CACHE_CALL_MS)
}

/** Delete cache keys (call on mutations that invalidate data). */
export async function cacheDel(...keys: string[]): Promise<void> {
    const client = getRedisClient()
    if (!client || keys.length === 0) return
    await withTimeout(client.del(...keys), CACHE_CALL_MS)
}
