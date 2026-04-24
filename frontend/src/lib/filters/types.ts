/**
 * Filter system — types shared between frontend components and backend
 * search endpoints. Mirrors FilterSystem.md semantics, adapted to our stack.
 */

export type FilterType =
    | 'text'
    | 'select'
    | 'multi_select'
    | 'tags'
    | 'date_range'
    | 'number_range'
    | 'toggle'
    | 'autocomplete'

/** Frontend-friendly operator names. Translated to backend tokens server-side. */
export type FilterOperator =
    | 'contains' | 'not_contains'
    | 'equals' | 'is' | 'is_not'
    | 'starts_with' | 'ends_with'
    | 'greater_than' | 'less_than' | 'gte' | 'lte'
    | 'in' | 'not_in'
    | 'between'
    | 'before' | 'after' | 'on'
    | 'is_null' | 'is_not_null'

export type FilterPrimitiveValue =
    | string
    | number
    | boolean
    | string[]
    | number[]
    | { from?: string; to?: string }
    | { min?: number; max?: number }
    | null

export interface AppliedFilter {
    value: FilterPrimitiveValue
    operator?: FilterOperator
}

export type AppliedFiltersMap = Record<string, AppliedFilter>

export interface FilterOption {
    value: string | number
    label: string
}

export interface FilterConfig {
    name: string
    label: string
    type: FilterType
    /** Field used in the SQL query — defaults to `name`. */
    field?: string
    /** Default operator when none chosen. */
    defaultOperator?: FilterOperator
    /** Available operators in order. */
    operators?: { value: FilterOperator; label: string }[]
    /** Options for select/multi-select. */
    options?: FilterOption[]
    /** Suggestions for tag input. */
    suggestions?: string[]
    /** Async loader for autocomplete. */
    onSearch?: (q: string) => Promise<FilterOption[]>
    /** UI hints. */
    placeholder?: string
    min?: number
    max?: number
    step?: number
    prefix?: string
    suffix?: string
    /** Group label for grouping in the popover. */
    group?: string
    /** Icon (lucide). */
    icon?: React.ComponentType<{ className?: string }>
}

export interface QuickFilter {
    name: string
    label: string
    icon?: React.ComponentType<{ className?: string }>
    filter: AppliedFiltersMap
}

export interface SearchHistoryEntry {
    id: string
    searchText: string | null
    filters: AppliedFiltersMap | null
    label: string
    timestamp: number
}

export interface SearchPagination {
    page?: number
    pageSize?: number
    sortBy?: string
    sortDir?: 'asc' | 'desc'
}

export interface SearchPayload {
    q?: string
    filters?: AppliedFiltersMap
    pagination?: SearchPagination
}
