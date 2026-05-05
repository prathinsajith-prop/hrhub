import {
    eq, ne, ilike, not, gte, lte, gt, lt,
    inArray, notInArray, isNull, isNotNull,
    and, or, between as drizzleBetween,
    sql, type SQL,
} from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'
import { decodeCursor } from './db-helpers.js'

// ─── Wire-format parser ────────────────────────────────────────────────────────

export interface ParsedFilter {
    field: string
    operator: string
    rawValue: string
    value: string | string[] | number | number[] | null
}

// Compiled once at module load — avoids recreating the regex on every segment parse.
const SEGMENT_RE = /^([^:]+):([A-Z_]+)\(([^)]*)\)$/

// Tiny FIFO-eviction cache for parsed filter strings.
// Pagination re-sends the same filter string on every page flip — avoid re-parsing.
const PARSE_CACHE_MAX = 256
const parseCache = new Map<string, ParsedFilter[]>()

export function parseFilterString(filterStr: string): ParsedFilter[] {
    if (!filterStr) return []
    const cached = parseCache.get(filterStr)
    if (cached) return cached
    const result = filterStr
        .split(';')
        .map(seg => parseSegment(seg.trim()))
        .filter((f): f is ParsedFilter => f !== null)
    if (parseCache.size >= PARSE_CACHE_MAX) parseCache.delete(parseCache.keys().next().value!)
    parseCache.set(filterStr, result)
    return result
}

function parseSegment(segment: string): ParsedFilter | null {
    const match = segment.match(SEGMENT_RE)
    if (!match) return null
    const [, field, operator, rawValue] = match
    return { field: field!, operator: operator!, rawValue: rawValue!, value: coerceValue(operator!, rawValue!) }
}

function coerceValue(operator: string, raw: string): ParsedFilter['value'] {
    if (operator === 'IS_NULL' || operator === 'IS_NOT_NULL') return null
    if (operator === 'IN' || operator === 'NOT_IN') return raw.split(',').map(v => v.trim())
    if (operator === 'BETWEEN') {
        const parts = raw.split(',').map(v => v.trim())
        const nums = parts.map(Number)
        return nums.every(n => !isNaN(n)) ? nums : parts
    }
    const trimmed = raw.trim()
    const num = Number(trimmed)
    if (!isNaN(num) && trimmed !== '') return num
    return trimmed
}

// ─── DSL → Drizzle SQL ─────────────────────────────────────────────────────────

export type FieldMap = Record<string, AnyColumn>

/**
 * Parses `filter` string in a single pass, handling the `employeeName` virtual
 * field (ilike against full-name concat) and delegating all other fields to
 * buildDrizzleFilters.
 */
export function buildFiltersWithEmployeeName(
    filter: string,
    fieldMap: FieldMap,
    allowed: Set<string>,
    firstName: AnyColumn,
    lastName: AnyColumn,
): SQL[] {
    const parsed = parseFilterString(filter)
    const conditions: SQL[] = []
    const rest: ParsedFilter[] = []

    for (const f of parsed) {
        if (f.field === 'employeeName' && typeof f.value === 'string' && f.value) {
            conditions.push(ilike(sql`${firstName} || ' ' || ${lastName}`, `%${f.value}%`))
        } else {
            rest.push(f)
        }
    }

    for (const c of buildDrizzleFilters(rest, fieldMap, allowed)) {
        conditions.push(c)
    }
    return conditions
}

export function buildDrizzleFilters(
    parsed: ParsedFilter[],
    fieldMap: FieldMap,
    allowedFields: Set<string>,
): SQL[] {
    const conditions: SQL[] = []
    for (const f of parsed) {
        if (!allowedFields.has(f.field)) continue
        const col = fieldMap[f.field]
        if (!col) continue
        const cond = toSQL(f.operator, col, f.value)
        if (cond) conditions.push(cond)
    }
    return conditions
}

function toSQL(op: string, col: AnyColumn, value: ParsedFilter['value']): SQL | null {
    switch (op) {
        case 'EQ':          return value === null ? isNull(col) : eq(col, value as never)
        case 'NEQ':         return value === null ? isNotNull(col) : ne(col, value as never)
        case 'LIKE':        return ilike(col, `%${value}%`)
        case 'NOT_LIKE':    return not(ilike(col, `%${value}%`))
        case 'STARTS_WITH': return ilike(col, `${value}%`)
        case 'ENDS_WITH':   return ilike(col, `%${value}`)
        case 'GT':          return gt(col, value as never)
        case 'LT':          return lt(col, value as never)
        case 'GTE':         return gte(col, value as never)
        case 'LTE':         return lte(col, value as never)
        case 'IN':          return inArray(col, value as string[])
        case 'NOT_IN':      return notInArray(col, value as string[])
        case 'BETWEEN': {
            const arr = value as (string | number)[]
            if (!arr || arr.length < 2) return null
            return drizzleBetween(col, arr[0] as never, arr[1] as never)
        }
        case 'DATE_EQ':     return eq(col, value as never)
        case 'DATE_LT':     return lt(col, value as never)
        case 'DATE_GT':     return gt(col, value as never)
        case 'IS_NULL':     return isNull(col)
        case 'IS_NOT_NULL': return isNotNull(col)
        default:            return null
    }
}

// ─── Conditions fluent builder ─────────────────────────────────────────────────

/**
 * Fluent builder for assembling Drizzle WHERE conditions.
 *
 * - Chain methods in any order; all conditions are AND-ed together.
 * - Use `.orGroup()` to bundle a sub-set with OR.
 * - Use `.fork()` to branch a base into two independent chains (e.g. main + KPI query).
 * - Use `.when()` to apply conditions only when a runtime flag is true.
 * - Call `.where()` to get the final `and(...)` SQL, or `.build()` for the raw array.
 *
 * Example:
 *   const base = Conditions.create()
 *       .tenant(table.tenantId, tenantId)
 *       .notDeleted(table.deletedAt)
 *       .match(table.employeeId, employeeId)
 *
 *   const main = base.fork()
 *       .match(table.status, status)
 *       .nameSearch(search, employees.firstName, employees.lastName)
 *       .filterWithName(filter, FIELD_MAP, ALLOWED, employees.firstName, employees.lastName)
 *       .cursor(after, table.createdAt, table.id)
 *
 *   // base.where() → tenant + notDeleted + employeeId  (KPI/count query)
 *   // main.where() → all of the above + status + search + filter + cursor
 */
export class Conditions {
    private conds: SQL[]

    private constructor(initial: SQL[] = []) {
        this.conds = initial
    }

    /** Create a new empty Conditions builder. */
    static create(): Conditions { return new Conditions() }

    /**
     * Return a new independent builder pre-loaded with all conditions accumulated
     * so far. Mutations to either instance do not affect the other.
     */
    fork(): Conditions { return new Conditions([...this.conds]) }

    // ── Identity guards ────────────────────────────────────────────────────────

    /** Restrict to a single tenant. */
    tenant(col: AnyColumn, tenantId: string): this {
        this.conds.push(eq(col, tenantId))
        return this
    }

    /** Soft-delete guard: deletedAt IS NULL. */
    notDeleted(col: AnyColumn): this {
        this.conds.push(isNull(col))
        return this
    }

    /** Active-only guard: col = true (e.g. isActive). */
    notArchived(col: AnyColumn): this {
        this.conds.push(eq(col, true as never))
        return this
    }

    // ── Equality / membership ──────────────────────────────────────────────────

    /** Equality — skipped when value is undefined, null, or empty string. */
    match(col: AnyColumn, value: unknown): this {
        if (value !== undefined && value !== null && value !== '') {
            this.conds.push(eq(col, value as never))
        }
        return this
    }

    /** Not-equals — skipped when value is undefined or null. */
    ne(col: AnyColumn, value: unknown): this {
        if (value !== undefined && value !== null) {
            this.conds.push(ne(col, value as never))
        }
        return this
    }

    /** IN list — skipped when the array is empty. */
    inList(col: AnyColumn, values: unknown[]): this {
        if (values.length > 0) this.conds.push(inArray(col, values as never[]))
        return this
    }

    /** NOT IN list — skipped when the array is empty. */
    notInList(col: AnyColumn, values: unknown[]): this {
        if (values.length > 0) this.conds.push(notInArray(col, values as never[]))
        return this
    }

    // ── Null checks ────────────────────────────────────────────────────────────

    /** IS NULL. */
    isNull(col: AnyColumn): this {
        this.conds.push(isNull(col))
        return this
    }

    /** IS NOT NULL. */
    notNull(col: AnyColumn): this {
        this.conds.push(isNotNull(col))
        return this
    }

    // ── Comparators ────────────────────────────────────────────────────────────

    /** Greater-than — skipped when value is undefined or null. */
    gt(col: AnyColumn, value: unknown): this {
        if (value !== undefined && value !== null) this.conds.push(gt(col, value as never))
        return this
    }

    /** Less-than — skipped when value is undefined or null. */
    lt(col: AnyColumn, value: unknown): this {
        if (value !== undefined && value !== null) this.conds.push(lt(col, value as never))
        return this
    }

    /** Greater-than-or-equal — skipped when value is undefined or null. */
    gte(col: AnyColumn, value: unknown): this {
        if (value !== undefined && value !== null) this.conds.push(gte(col, value as never))
        return this
    }

    /** Less-than-or-equal — skipped when value is undefined or null. */
    lte(col: AnyColumn, value: unknown): this {
        if (value !== undefined && value !== null) this.conds.push(lte(col, value as never))
        return this
    }

    /** Inclusive range: col BETWEEN min AND max. Skipped when both bounds are absent. */
    between(col: AnyColumn, min: unknown, max: unknown): this {
        if (min !== undefined && min !== null && max !== undefined && max !== null) {
            this.conds.push(drizzleBetween(col, min as never, max as never))
        } else {
            if (min !== undefined && min !== null) this.conds.push(gte(col, min as never))
            if (max !== undefined && max !== null) this.conds.push(lte(col, max as never))
        }
        return this
    }

    // ── Date helpers ───────────────────────────────────────────────────────────

    /**
     * Date/timestamp range: gte(from) and/or lte(to).
     * Accepts ISO strings or Date objects; each bound is skipped when absent.
     */
    dateRange(col: AnyColumn, from?: string | Date | null, to?: string | Date | null): this {
        if (from != null) this.conds.push(gte(col, from as never))
        if (to != null) this.conds.push(lte(col, to as never))
        return this
    }

    /**
     * Date overlap: any record whose [startCol, endCol] intersects [from, to].
     * Overlap condition: startCol <= to AND endCol >= from.
     */
    dateOverlap(startCol: AnyColumn, endCol: AnyColumn, from?: string | null, to?: string | null): this {
        if (to != null) this.conds.push(lte(startCol, to as never))
        if (from != null) this.conds.push(gte(endCol, from as never))
        return this
    }

    // ── Text search ────────────────────────────────────────────────────────────

    /**
     * ILIKE %value% on a single column — skipped when value is blank.
     * Use nameSearch() when you need the firstName+lastName concat pattern.
     */
    like(col: AnyColumn, value: string | undefined | null): this {
        if (value?.trim()) this.conds.push(ilike(col, `%${value.trim()}%`))
        return this
    }

    /** ILIKE value% — skipped when value is blank. */
    startsWith(col: AnyColumn, value: string | undefined | null): this {
        if (value?.trim()) this.conds.push(ilike(col, `${value.trim()}%`))
        return this
    }

    /**
     * Full-name search: OR across the firstName+lastName concat, first name,
     * last name, plus any extra columns. Skipped when value is blank.
     */
    nameSearch(value: string | undefined, firstName: AnyColumn, lastName: AnyColumn, ...extraCols: AnyColumn[]): this {
        if (!value?.trim()) return this
        const q = `%${value.trim()}%`
        const parts: SQL[] = [
            ilike(sql`${firstName} || ' ' || ${lastName}`, q),
            ilike(firstName, q),
            ilike(lastName, q),
            ...extraCols.map(c => ilike(c, q)),
        ]
        const cond = or(...parts)
        if (cond) this.conds.push(cond)
        return this
    }

    /** ILIKE search across one or more columns — skipped when value is blank. */
    search(value: string | undefined, ...cols: AnyColumn[]): this {
        if (!value?.trim() || cols.length === 0) return this
        const q = `%${value.trim()}%`
        const cond = or(...cols.map(c => ilike(c, q)))
        if (cond) this.conds.push(cond)
        return this
    }

    // ── DSL filter strings ─────────────────────────────────────────────────────

    /** Apply a parsed filter string (no virtual fields). */
    filter(filterStr: string | undefined, fieldMap: FieldMap, allowed: Set<string>): this {
        if (!filterStr) return this
        for (const c of buildDrizzleFilters(parseFilterString(filterStr), fieldMap, allowed)) {
            this.conds.push(c)
        }
        return this
    }

    /** Apply a parsed filter string, treating `employeeName` as a virtual full-name field. */
    filterWithName(filterStr: string | undefined, fieldMap: FieldMap, allowed: Set<string>, firstName: AnyColumn, lastName: AnyColumn): this {
        if (!filterStr) return this
        for (const c of buildFiltersWithEmployeeName(filterStr, fieldMap, allowed, firstName, lastName)) {
            this.conds.push(c)
        }
        return this
    }

    // ── Grouping and control flow ──────────────────────────────────────────────

    /**
     * OR sub-group: conditions added inside the callback are OR-ed together,
     * then the result is AND-ed into the parent. No-op if the callback adds nothing.
     *
     * @example
     *   .orGroup(g => g.match(t.status, 'active').match(t.status, 'pending'))
     *   // → WHERE (status = 'active' OR status = 'pending') AND ...
     */
    orGroup(fn: (c: Conditions) => void): this {
        const sub = new Conditions()
        fn(sub)
        const items = sub.conds
        if (items.length === 0) return this
        const cond = items.length === 1 ? items[0]! : or(...items)
        if (cond) this.conds.push(cond)
        return this
    }

    /**
     * Conditionally apply a builder callback — runs only when `condition` is true.
     * Keeps chains clean without breaking out into imperative if-blocks.
     *
     * @example
     *   .when(!!subtreeIds.length, c => c.inList(employees.id, subtreeIds))
     */
    when(condition: boolean, fn: (c: this) => void): this {
        if (condition) fn(this)
        return this
    }

    // ── Cursor pagination ──────────────────────────────────────────────────────

    /**
     * Keyset cursor: appends (createdAtCol, idCol) < (cursor.c, cursor.i).
     * Uses a SQL tuple comparison so ordering is correct regardless of id type.
     * No-op when encoded is falsy or fails to decode.
     */
    cursor(encoded: string | undefined, createdAtCol: AnyColumn, idCol: AnyColumn): this {
        if (!encoded) return this
        const decoded = decodeCursor(encoded)
        if (!decoded) return this
        const cursorDate = new Date(decoded.c)
        this.conds.push(sql`(${createdAtCol}, ${idCol}) < (${cursorDate}, ${decoded.i})`)
        return this
    }

    // ── Escape hatch ───────────────────────────────────────────────────────────

    /** Append a raw SQL condition — skipped when falsy. */
    add(cond: SQL | null | undefined): this {
        if (cond != null) this.conds.push(cond)
        return this
    }

    // ── Terminal methods ───────────────────────────────────────────────────────

    /** Return the accumulated conditions as SQL[] (copy — this instance is unaffected). */
    build(): SQL[] { return [...this.conds] }

    /** Return and(...conditions), or undefined if nothing has been added. */
    where(): SQL | undefined {
        return this.conds.length > 0 ? and(...this.conds) : undefined
    }
}
