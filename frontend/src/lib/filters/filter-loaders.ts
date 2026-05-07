/**
 * Async option loaders for autocomplete filters.
 * All functions are stable module-level references — safe to use in FilterConfig.onSearch
 * without triggering hook-dependency churn.
 */
import { ISO2_CODES, getCountryByISO2, searchCountry, type ISO2 } from 'country-atlas'
import { api } from '@/lib/api'
import type { FilterOption } from './types'

// ─── In-memory session cache ───────────────────────────────────────────────────

interface OrgUnitRaw { id: string; name: string; type: string; parentId: string | null; isActive: boolean }
interface DesignationRaw { id: string; name: string; isActive: boolean }

let _orgUnits: OrgUnitRaw[] | null = null
let _designations: DesignationRaw[] | null = null

async function getOrgUnits(): Promise<OrgUnitRaw[]> {
    if (_orgUnits) return _orgUnits
    const res = await api.get<{ data: OrgUnitRaw[] }>('/org-units')
    _orgUnits = res.data ?? []
    return _orgUnits
}

async function getDesignations(): Promise<DesignationRaw[]> {
    if (_designations) return _designations
    const res = await api.get<{ data: DesignationRaw[] }>('/designations')
    _designations = res.data ?? []
    return _designations
}

/** Invalidate the session cache (call after org-unit or designation mutations). */
export function invalidateFilterLoaderCache() {
    _orgUnits = null
    _designations = null
}

// ─── Department loader ─────────────────────────────────────────────────────────

/**
 * Returns active departments formatted as "Branch › Division › Department".
 * The stored value is the department name string (what the backend filters on).
 */
export async function searchDepartments(q: string): Promise<FilterOption[]> {
    const units = await getOrgUnits()
    const byId = new Map(units.map(u => [u.id, u]))

    const departments = units.filter(u => u.type === 'department' && u.isActive)

    const options: FilterOption[] = departments.map(dept => {
        const crumbs: string[] = [dept.name]
        let cur: OrgUnitRaw = dept
        while (cur.parentId) {
            const parent = byId.get(cur.parentId)
            if (!parent) break
            crumbs.unshift(parent.name)
            cur = parent
        }
        return { value: dept.name, label: crumbs.join(' › ') }
    })

    // Sort alphabetically by full label
    options.sort((a, b) => a.label.localeCompare(b.label))

    if (!q.trim()) return options
    const lower = q.trim().toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(lower))
}

// ─── Designation loader ────────────────────────────────────────────────────────

/** Returns active designations, filtered by q. Value = name string. */
export async function searchDesignations(q: string): Promise<FilterOption[]> {
    const desigs = await getDesignations()
    const options: FilterOption[] = desigs
        .filter(d => d.isActive)
        .map(d => ({ value: d.name, label: d.name }))
        .sort((a, b) => a.label.localeCompare(b.label))

    if (!q.trim()) return options
    const lower = q.trim().toLowerCase()
    return options.filter(o => o.label.toLowerCase().includes(lower))
}

// ─── Nationality loader (country-atlas) ───────────────────────────────────────

/**
 * Build the canonical country list from country-atlas once at module load.
 * Each entry stores the country name as value (what the backend filters on)
 * and a flag-emoji + name label for display.
 * UAE is pinned first; remaining entries are alphabetical.
 */
interface CountryEntry { iso2: string; name: string; emoji: string }

const COUNTRY_LIST: CountryEntry[] = (ISO2_CODES as readonly string[])
    .map((code) => {
        const c = getCountryByISO2(code as ISO2)
        if (!c) return null
        return { iso2: code, name: c.name, emoji: c.flag?.emoji ?? '🏳️' }
    })
    .filter((c): c is CountryEntry => !!c)
    .sort((a, b) => {
        if (a.iso2 === 'AE') return -1
        if (b.iso2 === 'AE') return 1
        return a.name.localeCompare(b.name)
    })

const ALL_NATIONALITY_OPTIONS: FilterOption[] = COUNTRY_LIST.map(c => ({
    value: c.name,
    label: `${c.emoji} ${c.name}`,
}))

/**
 * Returns country options from country-atlas, filtered by q.
 * Uses country-atlas `searchCountry` when a query is provided for fuzzy matching;
 * falls back to string includes for safety. Value = canonical country name.
 */
export async function searchNationalities(q: string): Promise<FilterOption[]> {
    if (!q.trim()) return ALL_NATIONALITY_OPTIONS
    try {
        const hits = searchCountry(q.trim())
        const matchedCodes = new Set(hits.map((c) => c.iso.alpha2))
        const matched = COUNTRY_LIST.filter(c => matchedCodes.has(c.iso2))
        if (matched.length > 0) {
            return matched.map(c => ({ value: c.name, label: `${c.emoji} ${c.name}` }))
        }
    } catch {
        // fall through to simple filter
    }
    const lower = q.trim().toLowerCase()
    return COUNTRY_LIST
        .filter(c => c.name.toLowerCase().includes(lower))
        .map(c => ({ value: c.name, label: `${c.emoji} ${c.name}` }))
}
