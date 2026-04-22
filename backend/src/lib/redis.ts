/**
 * Shared Redis client (ioredis via BullMQ).
 * Used for caching hot data — dashboard KPIs, etc.
 * Degrades gracefully: if Redis is unavailable, cache calls are no-ops.
 */
import Redis from 'ioredis'
import { loadEnv } from '../config/env.js'

let _client: Redis | null = null

export function getRedisClient(): Redis | null {
    if (_client) return _client
    try {
        const env = loadEnv()
        const url = new URL(env.REDIS_URL)
        _client = new Redis({
            host: url.hostname,
            port: Number(url.port ?? 6379),
            password: url.password || undefined,
            enableReadyCheck: false,
            maxRetriesPerRequest: null,
            lazyConnect: true,
        })
        _client.on('error', () => {
            // swallow — cache miss is acceptable
        })
        return _client
    } catch {
        return null
    }
}

/** Get a cached JSON value. Returns null on miss or Redis error. */
export async function cacheGet<T>(key: string): Promise<T | null> {
    try {
        const client = getRedisClient()
        if (!client) return null
        const raw = await client.get(key)
        return raw ? (JSON.parse(raw) as T) : null
    } catch {
        return null
    }
}

/** Set a JSON value with TTL in seconds. Silently fails if Redis unavailable. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
        const client = getRedisClient()
        if (!client) return
        await client.setex(key, ttlSeconds, JSON.stringify(value))
    } catch {
        // ignore
    }
}

/** Delete a cache key (call on mutations that invalidate data). */
export async function cacheDel(...keys: string[]): Promise<void> {
    try {
        const client = getRedisClient()
        if (!client) return
        await client.del(...keys)
    } catch {
        // ignore
    }
}
