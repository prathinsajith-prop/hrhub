/**
 * URL-contract tests for `useEmployees`.
 *
 * These pin the wire format that EmployeeSelect depends on: the project-wide
 * employee picker always calls this hook with `limit: 25` and a debounced
 * `search` string. If `useEmployees` ever stops sending `search=` or `limit=`,
 * every typeahead in the app silently breaks back to "show first 20 with no
 * filter" — this test fails before that ships.
 *
 * We mock `@/lib/api` and `@/store/authStore` so no real fetch / Zustand store
 * is touched; we only assert on the URL that's passed to `api.get`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

const apiMock = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
}
vi.mock('@/lib/api', () => ({ api: apiMock }))
vi.mock('@/store/authStore', () => ({
    useAuthStore: (selector: (s: { tenant?: { id: string } }) => unknown) =>
        selector({ tenant: { id: 'tenant-test' } }),
}))

const { useEmployees } = await import('@/hooks/useEmployees')

const EMPTY_PAGE = { data: [], total: 0, limit: 25, offset: 0, hasMore: false }

function makeWrapper() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    })
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
    Object.values(apiMock).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset())
    apiMock.get.mockResolvedValue(EMPTY_PAGE)
})

describe('useEmployees — EmployeeSelect contract', () => {
    it('uses limit=25 when EmployeeSelect calls it with the default initialLimit', async () => {
        const { result } = renderHook(() => useEmployees({ status: 'active', limit: 25 }), {
            wrapper: makeWrapper(),
        })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toContain('limit=25')
        expect(url).toContain('status=active')
        expect(url).toContain('offset=0')
    })

    it('forwards the debounced search string to the server', async () => {
        const { result } = renderHook(
            () => useEmployees({ status: 'active', limit: 25, search: 'fatima' }),
            { wrapper: makeWrapper() },
        )
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toContain('search=fatima')
        expect(url).toContain('limit=25')
    })

    it('omits the search param when no debounced query has been entered yet', async () => {
        const { result } = renderHook(() => useEmployees({ status: 'active', limit: 25 }), {
            wrapper: makeWrapper(),
        })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).not.toContain('search=')
    })

    it('refetches with a new URL when the search string changes (typeahead re-runs server query)', async () => {
        const { rerender, result } = renderHook(
            ({ search }: { search?: string }) => useEmployees({ status: 'active', limit: 25, search }),
            { wrapper: makeWrapper(), initialProps: { search: undefined as string | undefined } },
        )
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        rerender({ search: 'omar' })
        await waitFor(() => expect(apiMock.get.mock.calls.length).toBeGreaterThan(1))
        const lastCall = apiMock.get.mock.calls.at(-1)![0] as string
        expect(lastCall).toContain('search=omar')
        expect(lastCall).toContain('limit=25')
    })

    it('encodes special characters in the search string', async () => {
        const { result } = renderHook(
            () => useEmployees({ status: 'active', limit: 25, search: 'al ali' }),
            { wrapper: makeWrapper() },
        )
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        const url = apiMock.get.mock.calls[0][0] as string
        // URLSearchParams encodes space as `+`
        expect(url).toMatch(/search=al(\+|%20)ali/)
    })
})
