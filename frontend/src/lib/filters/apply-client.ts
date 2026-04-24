/**
 * applyClientFilters — generic client-side application of `useSearchFilters` state
 * to a row array. Use when the data is already loaded in memory and you don't need
 * to round-trip to the backend. For server-side, use `runSearch()` from transport.ts.
 */
import type { AppliedFilter } from './types'

type Row = Record<string, unknown>

export interface ApplyOptions<T extends Row> {
    /** Free-text search input (matched against `searchFields`). */
    searchInput?: string
    /** Map of applied filters keyed by filter `name`. */
    appliedFilters: Record<string, AppliedFilter>
    /**
     * Map of filter `name` to row property accessor. If omitted, the filter's
     * `field` (= name) is used as the row key.
     */
    fieldAccessors?: Partial<Record<string, (row: T) => unknown>>
    /** Row keys that the free-text search should match against (case-insensitive). */
    searchFields?: (keyof T | string)[]
}

function toLower(value: unknown): string {
    if (value == null) return ''
    return String(value).toLowerCase()
}

function getValue<T extends Row>(row: T, name: string, accessor?: (row: T) => unknown): unknown {
    if (accessor) return accessor(row)
    return row[name]
}

function matchText(value: unknown, query: string): boolean {
    return toLower(value).includes(query)
}

function matchOperator(rowValue: unknown, applied: AppliedFilter): boolean {
    const { operator, value } = applied
    switch (operator) {
        case 'is_null':
            return rowValue == null || rowValue === ''
        case 'is_not_null':
            return rowValue != null && rowValue !== ''
        case 'equals':
        case 'is':
            return String(rowValue ?? '') === String(value ?? '')
        case 'is_not':
            return String(rowValue ?? '') !== String(value ?? '')
        case 'not_contains':
            return !matchText(rowValue, toLower(value))
        case 'starts_with':
            return toLower(rowValue).startsWith(toLower(value))
        case 'ends_with':
            return toLower(rowValue).endsWith(toLower(value))
        case 'in': {
            const arr = Array.isArray(value) ? value : [value]
            return arr.map(String).includes(String(rowValue))
        }
        case 'not_in': {
            const arr = Array.isArray(value) ? value : [value]
            return !arr.map(String).includes(String(rowValue))
        }
        case 'greater_than':
            return Number(rowValue ?? 0) > Number(value ?? 0)
        case 'less_than':
            return Number(rowValue ?? 0) < Number(value ?? 0)
        case 'gte':
            return Number(rowValue ?? 0) >= Number(value ?? 0)
        case 'lte':
            return Number(rowValue ?? 0) <= Number(value ?? 0)
        case 'between': {
            const [a, b] = Array.isArray(value) ? value : [null, null]
            const n = Number(rowValue)
            if (a != null && !Number.isNaN(Number(a)) && n < Number(a)) return false
            if (b != null && !Number.isNaN(Number(b)) && n > Number(b)) return false
            return true
        }
        case 'before':
            if (rowValue == null || value == null) return false
            return new Date(String(rowValue)).getTime() < new Date(String(value)).getTime()
        case 'after':
            if (rowValue == null || value == null) return false
            return new Date(String(rowValue)).getTime() > new Date(String(value)).getTime()
        case 'on':
            if (rowValue == null || value == null) return false
            return String(rowValue).slice(0, 10) === String(value).slice(0, 10)
        case 'contains':
        default:
            return matchText(rowValue, toLower(value))
    }
}

export function applyClientFilters<T extends Row>(
    rows: T[],
    options: ApplyOptions<T>,
): T[] {
    const { appliedFilters, fieldAccessors = {}, searchFields = [] } = options
    const query = (options.searchInput ?? '').trim().toLowerCase()
    const filterEntries = Object.entries(appliedFilters)

    if (!query && filterEntries.length === 0) return rows

    return rows.filter((row) => {
        if (query && searchFields.length > 0) {
            const haystack = searchFields.map((f) => toLower(row[f as keyof T])).join(' ')
            if (!haystack.includes(query)) return false
        }

        for (const [name, applied] of filterEntries) {
            // Date range stored as { from?, to? } object (from DateRangeFilter component).
            if (
                applied.value !== null &&
                typeof applied.value === 'object' &&
                !Array.isArray(applied.value) &&
                ('from' in (applied.value as object) || 'to' in (applied.value as object))
            ) {
                const dv = applied.value as { from?: string; to?: string }
                const rowRaw = getValue(row, name, fieldAccessors[name])
                const rowDate = rowRaw != null ? String(rowRaw).slice(0, 10) : null
                const from = dv.from ?? null
                const to = dv.to ?? null
                const op = applied.operator
                if (rowDate == null) { if (from || to) return false; continue }
                if (op === 'before') { if (from && rowDate >= from) return false }
                else if (op === 'after') { if (from && rowDate <= from) return false }
                else if (op === 'on') { if (from && rowDate !== from) return false }
                else if (op === 'between') {
                    if (from && rowDate < from) return false
                    if (to && rowDate > to) return false
                }
                continue
            }

            // Date range as a paired tuple.
            if (Array.isArray(applied.value) && applied.value.length === 2) {
                const [a, b] = applied.value as [unknown, unknown]
                const isDate =
                    typeof a === 'string' && /\d{4}-\d{2}-\d{2}/.test(a)
                if (isDate || typeof b === 'string') {
                    const rowDate = getValue(row, name, fieldAccessors[name])
                    if (rowDate == null) {
                        if (a != null || b != null) return false
                    } else {
                        const t = new Date(String(rowDate)).getTime()
                        if (a && t < new Date(String(a)).getTime()) return false
                        if (b && t > new Date(String(b)).getTime()) return false
                    }
                    continue
                }
            }

            // Toggle: value=true means "only rows where field is truthy".
            if (applied.operator === 'is' && typeof applied.value === 'boolean') {
                const rowValue = getValue(row, name, fieldAccessors[name])
                if (applied.value && !rowValue) return false
                if (!applied.value && rowValue) return false
                continue
            }

            const rowValue = getValue(row, name, fieldAccessors[name])
            if (!matchOperator(rowValue, applied)) return false
        }
        return true
    })
}
