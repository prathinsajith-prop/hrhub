/**
 * Query builder — serialises AppliedFilter map into the
 *   "field:OPERATOR(value);…"
 * compact format documented in FilterSystem.md, OR into a normalised
 * JSON payload for POST /search.
 */
import type {
    AppliedFilter,
    AppliedFiltersMap,
    FilterConfig,
    FilterOperator,
    SearchPagination,
} from './types'

/** Frontend operator → backend token. */
export const OPERATOR_TOKENS: Record<FilterOperator, string> = {
    contains: 'LIKE',
    not_contains: 'NOT_LIKE',
    equals: 'EQ',
    is: 'EQ',
    is_not: 'NEQ',
    starts_with: 'STARTS_WITH',
    ends_with: 'ENDS_WITH',
    greater_than: 'GT',
    less_than: 'LT',
    gte: 'GTE',
    lte: 'LTE',
    in: 'IN',
    not_in: 'NOT_IN',
    between: 'BETWEEN',
    before: 'DATE_LT',
    after: 'DATE_GT',
    on: 'DATE_EQ',
    is_null: 'IS_NULL',
    is_not_null: 'IS_NOT_NULL',
}

function isEmpty(v: unknown): boolean {
    if (v === null || v === undefined || v === '') return true
    if (Array.isArray(v) && v.length === 0) return true
    if (typeof v === 'object') {
        const obj = v as Record<string, unknown>
        const vals = Object.values(obj)
        if (vals.length === 0) return true
        return vals.every((x) => x === '' || x === null || x === undefined)
    }
    return false
}

function serialiseValue(v: unknown): string {
    if (v === true) return '1'
    if (v === false) return '0'
    if (Array.isArray(v)) return v.map((x) => String(x)).join(',')
    if (v && typeof v === 'object') {
        const obj = v as Record<string, unknown>
        if ('from' in obj || 'to' in obj) return [obj.from ?? '', obj.to ?? ''].join(',')
        if ('min' in obj || 'max' in obj) return [obj.min ?? '', obj.max ?? ''].join(',')
    }
    return String(v ?? '')
}

/** Build "field:OP(value);field:OP(value)" string. */
export function buildFilterQueryString(filters: AppliedFiltersMap | null | undefined): string {
    if (!filters) return ''
    const parts: string[] = []
    for (const [name, applied] of Object.entries(filters)) {
        if (!applied) continue
        const op = applied.operator ?? 'equals'
        if (op === 'is_null' || op === 'is_not_null') {
            parts.push(`${name}:${OPERATOR_TOKENS[op]}()`)
            continue
        }
        if (isEmpty(applied.value)) continue
        const token = OPERATOR_TOKENS[op] ?? 'EQ'
        parts.push(`${name}:${token}(${serialiseValue(applied.value)})`)
    }
    return parts.join(';')
}

/** Build a complete search query string for GET. */
export function buildSearchQuery(
    q: string | undefined,
    filters: AppliedFiltersMap | null | undefined,
    pagination?: SearchPagination,
): string {
    const params = new URLSearchParams()
    if (q && q.trim()) params.set('q', q.trim())
    const f = buildFilterQueryString(filters)
    if (f) params.set('filter', f)
    if (pagination?.page !== undefined) params.set('page', String(pagination.page))
    if (pagination?.pageSize !== undefined) params.set('pageSize', String(pagination.pageSize))
    if (pagination?.sortBy) params.set('sortBy', pagination.sortBy)
    if (pagination?.sortDir) params.set('sortDir', pagination.sortDir)
    return params.toString()
}

/** Human-readable chip label for a filter (for chips & history). */
export function formatFilterValue(
    config: FilterConfig | undefined,
    applied: AppliedFilter,
): string {
    const v = applied.value
    if (v === null || v === undefined) return '—'
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'
    if (Array.isArray(v)) {
        if (config?.options) {
            const labels = config.options.filter((o) => v.includes(o.value as never)).map((o) => o.label)
            return labels.join(', ') || v.join(', ')
        }
        return v.join(', ')
    }
    if (typeof v === 'object') {
        const obj = v as Record<string, unknown>
        if ('from' in obj || 'to' in obj) {
            return `${obj.from ?? '…'} – ${obj.to ?? '…'}`
        }
        if ('min' in obj || 'max' in obj) {
            const fmt = (x: unknown) => (x === undefined || x === '' ? '…' : `${config?.prefix ?? ''}${x}${config?.suffix ?? ''}`)
            return `${fmt(obj.min)} – ${fmt(obj.max)}`
        }
        return JSON.stringify(v)
    }
    if (config?.options) {
        const opt = config.options.find((o) => String(o.value) === String(v))
        if (opt) return opt.label
    }
    return String(v)
}

/** Count of meaningful (non-empty) applied filters. */
export function countAppliedFilters(filters: AppliedFiltersMap | null | undefined): number {
    if (!filters) return 0
    let n = 0
    for (const applied of Object.values(filters)) {
        if (!applied) continue
        if (applied.operator === 'is_null' || applied.operator === 'is_not_null') { n += 1; continue }
        if (!isEmpty(applied.value)) n += 1
    }
    return n
}
