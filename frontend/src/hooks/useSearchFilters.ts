/**
 * useSearchFilters — page-level state hook that holds the search text +
 * applied filter map and persists a small history into localStorage.
 *
 * Compatible with `runSearch()` from `@/lib/filters/transport` so the same
 * state can be sent over GET or POST automatically.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    type AppliedFilter,
    type AppliedFiltersMap,
    type FilterConfig,
    type SearchHistoryEntry,
    formatFilterValue,
    countAppliedFilters,
} from '@/lib/filters'

export interface UseSearchFiltersOptions {
    storageKey?: string
    maxHistoryItems?: number
    availableFilters?: FilterConfig[]
    initialSearch?: string
    initialFilters?: AppliedFiltersMap
}

export interface UseSearchFiltersReturn {
    searchInput: string
    appliedFilters: AppliedFiltersMap
    appliedCount: number
    setSearchInput: (v: string) => void
    setAppliedFilters: (v: AppliedFiltersMap) => void
    setOneFilter: (name: string, value: AppliedFilter | null) => void
    clearAll: () => void
    history: SearchHistoryEntry[]
    saveCurrent: () => void
    restore: (entry: SearchHistoryEntry) => void
    deleteHistoryItem: (id: string) => void
    clearHistory: () => void
    /** Stable ref into latest values (use inside async callbacks). */
    refs: { search: React.MutableRefObject<string>; filters: React.MutableRefObject<AppliedFiltersMap> }
}

function safeParse<T>(raw: string | null, fallback: T): T {
    if (!raw) return fallback
    try { return JSON.parse(raw) as T } catch { return fallback }
}

function buildHistoryLabel(
    search: string,
    filters: AppliedFiltersMap,
    available: FilterConfig[] | undefined,
): string {
    if (search && search.trim()) return search.trim()
    const map = new Map(available?.map((f) => [f.name, f]))
    const parts: string[] = []
    for (const [name, applied] of Object.entries(filters)) {
        if (!applied) continue
        const cfg = map.get(name)
        const label = cfg?.label ?? name
        const value = formatFilterValue(cfg, applied)
        parts.push(`${label}: ${value}`)
    }
    return parts.join(', ') || 'Empty search'
}

function isEqualEntry(a: { searchText: string | null; filters: AppliedFiltersMap | null }, b: { searchText: string | null; filters: AppliedFiltersMap | null }): boolean {
    return a.searchText === b.searchText && JSON.stringify(a.filters ?? {}) === JSON.stringify(b.filters ?? {})
}

export function useSearchFilters(opts: UseSearchFiltersOptions = {}): UseSearchFiltersReturn {
    const { storageKey = 'searchHistory.default', maxHistoryItems = 10, availableFilters, initialSearch = '', initialFilters = {} } = opts

    const [searchInput, setSearchInput] = useState(initialSearch)
    const [appliedFilters, setAppliedFilters] = useState<AppliedFiltersMap>(initialFilters)
    const [history, setHistory] = useState<SearchHistoryEntry[]>(() =>
        safeParse<SearchHistoryEntry[]>(typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null, []),
    )

    const searchRef = useRef(searchInput)
    const filtersRef = useRef(appliedFilters)
    useEffect(() => { searchRef.current = searchInput }, [searchInput])
    useEffect(() => { filtersRef.current = appliedFilters }, [appliedFilters])

    useEffect(() => {
        if (typeof window === 'undefined') return
        try { localStorage.setItem(storageKey, JSON.stringify(history)) } catch { /* quota */ }
    }, [history, storageKey])

    const setOneFilter = useCallback((name: string, value: AppliedFilter | null) => {
        setAppliedFilters((prev) => {
            const next = { ...prev }
            if (value === null) delete next[name]
            else next[name] = value
            return next
        })
    }, [])

    const clearAll = useCallback(() => {
        setSearchInput('')
        setAppliedFilters({})
    }, [])

    const saveCurrent = useCallback(() => {
        const s = searchRef.current
        const f = filtersRef.current
        const empty = !s.trim() && countAppliedFilters(f) === 0
        if (empty) return
        const entry: SearchHistoryEntry = {
            id: (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
            searchText: s || null,
            filters: countAppliedFilters(f) > 0 ? f : null,
            label: buildHistoryLabel(s, f, availableFilters),
            timestamp: Date.now(),
        }
        setHistory((prev) => {
            if (prev[0] && isEqualEntry(prev[0], entry)) return prev
            return [entry, ...prev].slice(0, maxHistoryItems)
        })
    }, [availableFilters, maxHistoryItems])

    const restore = useCallback((entry: SearchHistoryEntry) => {
        setSearchInput(entry.searchText ?? '')
        setAppliedFilters(entry.filters ?? {})
    }, [])

    const deleteHistoryItem = useCallback((id: string) => {
        setHistory((prev) => prev.filter((h) => h.id !== id))
    }, [])

    const clearHistory = useCallback(() => setHistory([]), [])

    const appliedCount = useMemo(() => countAppliedFilters(appliedFilters), [appliedFilters])

    return {
        searchInput,
        appliedFilters,
        appliedCount,
        setSearchInput,
        setAppliedFilters,
        setOneFilter,
        clearAll,
        history,
        saveCurrent,
        restore,
        deleteHistoryItem,
        clearHistory,
        refs: { search: searchRef, filters: filtersRef },
    }
}
