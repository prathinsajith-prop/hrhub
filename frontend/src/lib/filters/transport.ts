/**
 * Hybrid transport — picks GET (compact query string) or POST (JSON body) for
 * search/list endpoints. Switches to POST automatically when the URL would
 * exceed the safe length threshold (default 2000 chars), avoiding 414 errors
 * on long filter expressions.
 */
import { api } from '@/lib/api'
import type {
    AppliedFiltersMap,
    SearchPagination,
    SearchPayload,
} from './types'
import { buildSearchQuery } from './query-builder'

const MAX_GET_URL_LENGTH = 2000

export interface RunSearchOptions<T> {
    /** Module path, e.g. "/employees" — `/search` is appended for POST. */
    path: string
    /** Search text. */
    q?: string
    /** Applied filters map. */
    filters?: AppliedFiltersMap | null
    /** Pagination + sort. */
    pagination?: SearchPagination
    /** Force a transport (otherwise auto). */
    transport?: 'get' | 'post' | 'auto'
    /** Path used for POST (defaults to `${path}/search`). */
    postPath?: string
    /** Map of GET param name → existing extra params (e.g. legacy filter shims). */
    extraQuery?: Record<string, string | number | undefined>
    /** Optional request signal. */
    signal?: AbortSignal
    /** Type guard / response shape — pass-through. */
    select?: (raw: unknown) => T
}

/** Build the candidate GET URL (without leading slash modification). */
export function buildSearchGetUrl(opts: RunSearchOptions<unknown>): string {
    const qs = buildSearchQuery(opts.q, opts.filters, opts.pagination)
    const extras = new URLSearchParams()
    if (opts.extraQuery) {
        for (const [k, v] of Object.entries(opts.extraQuery)) {
            if (v !== undefined && v !== null && v !== '') extras.set(k, String(v))
        }
    }
    const merged = [qs, extras.toString()].filter(Boolean).join('&')
    return merged ? `${opts.path}?${merged}` : opts.path
}

/** Decide whether to use POST based on URL length. */
export function shouldUsePost(url: string, transport: 'get' | 'post' | 'auto' = 'auto'): boolean {
    if (transport === 'post') return true
    if (transport === 'get') return false
    return url.length > MAX_GET_URL_LENGTH
}

/** Execute a hybrid GET/POST search request. */
export async function runSearch<T = unknown>(opts: RunSearchOptions<T>): Promise<T> {
    const url = buildSearchGetUrl(opts as RunSearchOptions<unknown>)
    const usePost = shouldUsePost(url, opts.transport)
    let raw: unknown
    if (usePost) {
        const postPath = opts.postPath ?? `${opts.path}/search`
        const body: SearchPayload = {
            q: opts.q,
            filters: opts.filters ?? undefined,
            pagination: opts.pagination,
        }
        raw = await api.post(postPath, { ...body, ...(opts.extraQuery ?? {}) })
    } else {
        raw = await api.get(url)
    }
    return opts.select ? opts.select(raw) : (raw as T)
}
