/**
 * Generic Drizzle query helpers shared across modules.
 * Promotes consistent multi-tenant filtering, soft-delete handling, and
 * keyset pagination so every module page list looks the same.
 */
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import { encodeCursor, decodeCursor } from './db-helpers.js'

/** Return a tenant equality predicate for the given column. */
export function tenantFilter(column: AnyPgColumn, tenantId: string): SQL {
    return eq(column, tenantId)
}

/** Return a "not soft-deleted" predicate for tables that have deleted_at. */
export function notDeleted(column: AnyPgColumn): SQL {
    return isNull(column)
}

/**
 * Combine multiple optional predicates into a single AND, dropping
 * undefined / falsy values so callers can write
 *   conjunction([
 *     tenantFilter(table.tenantId, tenantId),
 *     status && eq(table.status, status),
 *   ])
 */
export function conjunction(predicates: Array<SQL | undefined | null | false>): SQL | undefined {
    const filtered = predicates.filter((p): p is SQL => Boolean(p))
    if (filtered.length === 0) return undefined
    if (filtered.length === 1) return filtered[0]
    return and(...filtered) as SQL
}

export interface KeysetPageOptions {
    /** Default page size, default 50. */
    defaultLimit?: number
    /** Hard cap, default 200. */
    maxLimit?: number
}

export interface KeysetParams {
    limit?: number
    cursor?: string
}

export interface KeysetResult<T> {
    items: T[]
    nextCursor: string | null
}

/**
 * Compute (limit, cursor predicate) for a keyset paginated query ordered by
 * (orderColumn DESC, idColumn DESC).
 *
 *   const { limit, cursorPredicate } = applyKeyset(params, attendance.date, attendance.id)
 *   const rows = await db.select()...where(and(tenantFilter, cursorPredicate)).limit(limit + 1)
 *   const result = buildKeysetResult(rows, limit, r => [r.date, r.id])
 */
export function applyKeyset(
    params: KeysetParams,
    orderColumn: AnyPgColumn,
    idColumn: AnyPgColumn,
    options: KeysetPageOptions = {}
): { limit: number; cursorPredicate: SQL | undefined } {
    const { defaultLimit = 50, maxLimit = 200 } = options
    const limit = Math.min(Math.max(1, params.limit ?? defaultLimit), maxLimit)
    if (!params.cursor) return { limit, cursorPredicate: undefined }
    const decoded = decodeCursor(params.cursor)
    if (!decoded) return { limit, cursorPredicate: undefined }
    const predicate = sql`(${orderColumn}, ${idColumn}) < (${decoded.c}, ${decoded.i})`
    return { limit, cursorPredicate: predicate }
}

/**
 * Wrap fetched rows (limit + 1) into a typed KeysetResult, computing the
 * nextCursor when the extra row was returned.
 */
export function buildKeysetResult<T>(
    rows: T[],
    limit: number,
    extract: (row: T) => [orderValue: Date | string, id: string]
): KeysetResult<T> {
    const hasMore = rows.length > limit
    const items = hasMore ? rows.slice(0, limit) : rows
    const last = items[items.length - 1]
    const nextCursor = hasMore && last ? encodeCursor(...extract(last)) : null
    return { items, nextCursor }
}

/** Convert a 1-based page number into (limit, offset) tuple, capped. */
export function pageOffset(
    params: { page?: number; limit?: number },
    options: KeysetPageOptions = {}
): { limit: number; offset: number } {
    const { defaultLimit = 50, maxLimit = 200 } = options
    const limit = Math.min(Math.max(1, params.limit ?? defaultLimit), maxLimit)
    const page = Math.max(1, params.page ?? 1)
    return { limit, offset: (page - 1) * limit }
}
