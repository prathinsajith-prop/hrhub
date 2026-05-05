/**
 * Typed helpers for Drizzle ORM update operations.
 * Avoids the pervasive `.set({...} as any)` pattern that defeats type checking.
 */

/**
 * Merges an updatedAt timestamp into any update payload.
 * Usage: db.update(table).set(withTimestamp({ status: 'active' }))
 */
export function withTimestamp<T extends Record<string, unknown>>(data: T): T & { updatedAt: Date } {
    return { ...data, updatedAt: new Date() }
}

/**
 * Safely extracts rows from a db.execute() result.
 *
 * Drizzle's execute() return type varies by driver:
 *   - postgres-js  → returns rows directly as T[]
 *   - Neon HTTP    → returns { rows: T[], rowCount: number, ... }
 *
 * Use this instead of [...result] or (result as T[]) to avoid
 * "rows is not iterable" TypeErrors at runtime.
 */
export function extractRows<T = Record<string, unknown>>(result: unknown): T[] {
    if (Array.isArray(result)) return result as T[]
    if (result && typeof result === 'object' && Array.isArray((result as any).rows)) {
        return (result as any).rows as T[]
    }
    return []
}

/** Keyset cursor = {c: createdAt ISO string, i: uuid} encoded as base64url */
export interface CursorPayload { c: string; i: string }

export function encodeCursor(createdAt: Date | string, id: string): string {
    const payload: CursorPayload = { c: new Date(createdAt).toISOString(), i: id }
    return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

export function decodeCursor(cursor: string): CursorPayload | null {
    try {
        const raw = Buffer.from(cursor, 'base64url').toString('utf-8')
        const parsed = JSON.parse(raw) as CursorPayload
        if (typeof parsed.c !== 'string' || typeof parsed.i !== 'string') return null
        return parsed
    } catch {
        return null
    }
}
