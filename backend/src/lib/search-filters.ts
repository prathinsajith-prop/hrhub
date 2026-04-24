/**
 * Search filters — server-side parser & Drizzle SQL builder.
 *
 * Accepts EITHER:
 *   - GET query string  : `?filter=field:OPERATOR(value);field:OPERATOR(value)`
 *   - POST JSON body    : `{ q?, filters?: { [name]: { value, operator? } }, pagination? }`
 *
 * Only fields explicitly allow-listed by the caller are translated into SQL.
 * Anything else is silently dropped to prevent injection / mass assignment.
 */
import { sql, and, or, eq, ne, gt, lt, gte, lte, like, ilike, isNull, isNotNull, inArray, notInArray, between, type SQL, type AnyColumn } from 'drizzle-orm'

// Frontend → backend operator tokens (mirrors frontend/lib/filters/query-builder.ts).
const TOKEN_BY_NAME: Record<string, string> = {
    contains: 'LIKE', not_contains: 'NOT_LIKE',
    equals: 'EQ', is: 'EQ', is_not: 'NEQ',
    starts_with: 'STARTS_WITH', ends_with: 'ENDS_WITH',
    greater_than: 'GT', less_than: 'LT', gte: 'GTE', lte: 'LTE',
    in: 'IN', not_in: 'NOT_IN',
    between: 'BETWEEN',
    before: 'DATE_LT', after: 'DATE_GT', on: 'DATE_EQ',
    is_null: 'IS_NULL', is_not_null: 'IS_NOT_NULL',
}

export type AppliedOperator =
    | 'LIKE' | 'NOT_LIKE' | 'EQ' | 'NEQ' | 'STARTS_WITH' | 'ENDS_WITH'
    | 'GT' | 'LT' | 'GTE' | 'LTE' | 'IN' | 'NOT_IN' | 'BETWEEN'
    | 'DATE_LT' | 'DATE_GT' | 'DATE_EQ' | 'IS_NULL' | 'IS_NOT_NULL'

export interface ParsedFilter {
    field: string
    operator: AppliedOperator
    value: string | string[] | { from: string; to: string } | { min: string; max: string } | null
}

export interface ParsedSearch {
    q: string | null
    filters: ParsedFilter[]
    pagination: { page: number; pageSize: number; sortBy?: string; sortDir?: 'asc' | 'desc' }
}

interface RawAppliedFilter {
    value: unknown
    operator?: string
}

const SAFE_OPERATORS = new Set<string>(Object.values(TOKEN_BY_NAME))

function normaliseOperator(raw: string | undefined): AppliedOperator {
    if (!raw) return 'EQ'
    const upper = raw.toUpperCase()
    if (SAFE_OPERATORS.has(upper)) return upper as AppliedOperator
    const mapped = TOKEN_BY_NAME[raw.toLowerCase()]
    return (mapped as AppliedOperator) ?? 'EQ'
}

function parseValue(operator: AppliedOperator, raw: unknown): ParsedFilter['value'] {
    if (operator === 'IS_NULL' || operator === 'IS_NOT_NULL') return null
    if (raw === null || raw === undefined) return null
    if (operator === 'BETWEEN') {
        if (Array.isArray(raw)) return { from: String(raw[0] ?? ''), to: String(raw[1] ?? '') }
        if (typeof raw === 'object') {
            const o = raw as Record<string, unknown>
            if ('from' in o || 'to' in o) return { from: String(o.from ?? ''), to: String(o.to ?? '') }
            if ('min' in o || 'max' in o) return { from: String(o.min ?? ''), to: String(o.max ?? '') }
        }
        if (typeof raw === 'string') {
            const [a, b] = raw.split(',')
            return { from: a ?? '', to: b ?? '' }
        }
    }
    if (operator === 'IN' || operator === 'NOT_IN') {
        if (Array.isArray(raw)) return raw.map((x) => String(x))
        return String(raw).split(',').map((s) => s.trim()).filter(Boolean)
    }
    return String(raw)
}

/** Parse a "field:OP(value)" compact string into ParsedFilter[]. */
export function parseFilterString(input: string | undefined | null): ParsedFilter[] {
    if (!input) return []
    const out: ParsedFilter[] = []
    for (const expr of input.split(';').map((s) => s.trim()).filter(Boolean)) {
        const m = /^([\w.]+):([A-Z_]+)\((.*)\)$/.exec(expr)
        if (!m) continue
        const [, field, opRaw, valueRaw] = m
        const operator = normaliseOperator(opRaw)
        const value = parseValue(operator, valueRaw)
        out.push({ field, operator, value })
    }
    return out
}

/** Parse JSON body filters map into ParsedFilter[]. */
export function parseFilterMap(map: Record<string, RawAppliedFilter> | undefined | null): ParsedFilter[] {
    if (!map) return []
    const out: ParsedFilter[] = []
    for (const [field, applied] of Object.entries(map)) {
        if (!applied) continue
        const operator = normaliseOperator(applied.operator)
        const value = parseValue(operator, applied.value)
        out.push({ field, operator, value })
    }
    return out
}

/** Parse a Fastify request that may carry GET ?filter or POST body filters. */
export function parseSearchInput(input: {
    query?: Record<string, unknown>
    body?: Record<string, unknown>
}): ParsedSearch {
    const q = (input.body?.q as string | undefined) ?? (input.query?.q as string | undefined) ?? null
    const fromQuery = parseFilterString(input.query?.filter as string | undefined)
    const fromBody = parseFilterMap(input.body?.filters as Record<string, RawAppliedFilter> | undefined)
    const filters = [...fromQuery, ...fromBody]

    const pageRaw = (input.body?.pagination as { page?: unknown })?.page ?? input.query?.page
    const sizeRaw = (input.body?.pagination as { pageSize?: unknown })?.pageSize ?? input.query?.pageSize ?? input.query?.limit
    const sortBy = ((input.body?.pagination as { sortBy?: string })?.sortBy ?? (input.query?.sortBy as string)) || undefined
    const sortDir = ((input.body?.pagination as { sortDir?: string })?.sortDir ?? (input.query?.sortDir as string))?.toLowerCase() === 'desc' ? 'desc' : 'asc'

    const page = Number.isFinite(Number(pageRaw)) ? Number(pageRaw) : 0
    const pageSize = Math.min(200, Math.max(1, Number.isFinite(Number(sizeRaw)) ? Number(sizeRaw) : 20))

    return {
        q: q && q.trim() ? q.trim() : null,
        filters,
        pagination: { page, pageSize, sortBy, sortDir: sortDir as 'asc' | 'desc' },
    }
}

/**
 * Build a Drizzle SQL condition from a single parsed filter using a column map.
 * Columns not present in the map are dropped (returns null).
 */
export function buildCondition(
    parsed: ParsedFilter,
    columnMap: Record<string, AnyColumn>,
): SQL | null {
    const col = columnMap[parsed.field]
    if (!col) return null

    switch (parsed.operator) {
        case 'EQ': return parsed.value === null ? null : eq(col, parsed.value as never)
        case 'NEQ': return parsed.value === null ? null : ne(col, parsed.value as never)
        case 'LIKE': return ilike(col, `%${String(parsed.value)}%`)
        case 'NOT_LIKE': return sql`${col} NOT ILIKE ${`%${String(parsed.value)}%`}`
        case 'STARTS_WITH': return ilike(col, `${String(parsed.value)}%`)
        case 'ENDS_WITH': return ilike(col, `%${String(parsed.value)}`)
        case 'GT': return parsed.value === null ? null : gt(col, parsed.value as never)
        case 'LT': return parsed.value === null ? null : lt(col, parsed.value as never)
        case 'GTE': return parsed.value === null ? null : gte(col, parsed.value as never)
        case 'LTE': return parsed.value === null ? null : lte(col, parsed.value as never)
        case 'IN': {
            const arr = Array.isArray(parsed.value) ? parsed.value : []
            return arr.length ? inArray(col, arr as never[]) : null
        }
        case 'NOT_IN': {
            const arr = Array.isArray(parsed.value) ? parsed.value : []
            return arr.length ? notInArray(col, arr as never[]) : null
        }
        case 'BETWEEN': {
            const v = parsed.value as { from?: string; to?: string } | null
            if (!v) return null
            if (v.from && v.to) return between(col, v.from as never, v.to as never)
            if (v.from) return gte(col, v.from as never)
            if (v.to) return lte(col, v.to as never)
            return null
        }
        case 'DATE_EQ': return parsed.value === null ? null : eq(col, parsed.value as never)
        case 'DATE_LT': return parsed.value === null ? null : lt(col, parsed.value as never)
        case 'DATE_GT': return parsed.value === null ? null : gt(col, parsed.value as never)
        case 'IS_NULL': return isNull(col)
        case 'IS_NOT_NULL': return isNotNull(col)
        default: return null
    }
}

/** Build a single AND-joined WHERE clause from the parsed filters. */
export function buildWhere(
    filters: ParsedFilter[],
    columnMap: Record<string, AnyColumn>,
    extra?: SQL,
): SQL | undefined {
    const conds: SQL[] = []
    for (const f of filters) {
        const c = buildCondition(f, columnMap)
        if (c) conds.push(c)
    }
    if (extra) conds.unshift(extra)
    if (!conds.length) return undefined
    return and(...conds)
}

/** Build a free-text search clause (ILIKE OR across the supplied columns). */
export function buildTextSearch(
    q: string | null,
    columns: AnyColumn[],
): SQL | undefined {
    if (!q || !columns.length) return undefined
    const term = `%${q}%`
    const clauses = columns.map((c) => ilike(c, term))
    return or(...clauses)
}
