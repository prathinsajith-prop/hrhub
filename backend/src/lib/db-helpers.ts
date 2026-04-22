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
