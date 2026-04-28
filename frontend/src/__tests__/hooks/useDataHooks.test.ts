import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'

// Mock api + overlays so the hooks don't drag in zustand-persist or toast UI.
const apiMock = {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    upload: vi.fn(),
}
vi.mock('@/lib/api', () => ({ api: apiMock }))
vi.mock('@/components/ui/overlays', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const { useLeaveRequests } = await import('@/hooks/useLeave')
const { useVisas } = await import('@/hooks/useVisa')
const { useDocuments } = await import('@/hooks/useDocuments')
const { usePerformanceReviews } = await import('@/hooks/usePerformance')

function makeWrapper() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    })
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
    Object.values(apiMock).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset())
    apiMock.get.mockResolvedValue({ data: [], total: 0 })
})

describe('useLeaveRequests', () => {
    it('calls /leave with default pagination when no params are given', async () => {
        renderHook(() => useLeaveRequests(), { wrapper: makeWrapper() })
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toMatch(/^\/leave\?/)
        expect(url).toContain('limit=20')
        expect(url).toContain('offset=0')
    })

    it('forwards employeeId, status, leaveType, from, to as query params', async () => {
        renderHook(
            () =>
                useLeaveRequests({
                    employeeId: 'emp-1',
                    status: 'pending',
                    leaveType: 'sick',
                    from: '2026-04-01',
                    to: '2026-04-30',
                    limit: 50,
                }),
            { wrapper: makeWrapper() },
        )
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toContain('employeeId=emp-1')
        expect(url).toContain('status=pending')
        expect(url).toContain('leaveType=sick')
        expect(url).toContain('from=2026-04-01')
        expect(url).toContain('to=2026-04-30')
        expect(url).toContain('limit=50')
    })

    it('omits undefined params from the query string', async () => {
        renderHook(() => useLeaveRequests({ status: 'approved' }), { wrapper: makeWrapper() })
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).not.toContain('employeeId=')
        expect(url).not.toContain('leaveType=')
        expect(url).not.toContain('from=')
        expect(url).not.toContain('to=')
    })
})

describe('useVisas', () => {
    it('forwards status, urgencyLevel, from, to params', async () => {
        renderHook(
            () =>
                useVisas({ status: 'in_progress', urgencyLevel: 'high', from: '2026-04-01', to: '2026-04-30', limit: 100 }),
            { wrapper: makeWrapper() },
        )
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toMatch(/^\/visa\?/)
        expect(url).toContain('status=in_progress')
        expect(url).toContain('urgencyLevel=high')
        expect(url).toContain('from=2026-04-01')
        expect(url).toContain('to=2026-04-30')
    })
})

describe('useDocuments', () => {
    it('forwards employeeId, category, status, from, to params', async () => {
        renderHook(
            () =>
                useDocuments({
                    employeeId: 'emp-1',
                    category: 'visa',
                    status: 'verified',
                    from: '2026-04-01',
                    to: '2026-04-30',
                }),
            { wrapper: makeWrapper() },
        )
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toMatch(/^\/documents\?/)
        expect(url).toContain('employeeId=emp-1')
        expect(url).toContain('category=visa')
        expect(url).toContain('status=verified')
        expect(url).toContain('from=2026-04-01')
        expect(url).toContain('to=2026-04-30')
    })
})

describe('usePerformanceReviews', () => {
    beforeEach(() => {
        // This hook unwraps to res.data — return that shape.
        apiMock.get.mockResolvedValue({ data: [] })
    })

    it('hits /performance with no query string when no params provided', async () => {
        renderHook(() => usePerformanceReviews(), { wrapper: makeWrapper() })
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        expect(apiMock.get.mock.calls[0][0]).toBe('/performance')
    })

    it('appends employeeId / from / to as query params when provided', async () => {
        renderHook(
            () => usePerformanceReviews({ employeeId: 'emp-1', from: '2026-04-01', to: '2026-04-30' }),
            { wrapper: makeWrapper() },
        )
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toMatch(/^\/performance\?/)
        expect(url).toContain('employeeId=emp-1')
        expect(url).toContain('from=2026-04-01')
        expect(url).toContain('to=2026-04-30')
    })
})
