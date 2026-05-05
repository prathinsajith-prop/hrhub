import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
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
vi.mock('@/components/ui/overlays', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))
vi.mock('@/store/authStore', () => ({
    useAuthStore: (selector: (s: { tenant?: { id: string } }) => unknown) =>
        selector({ tenant: { id: 'tenant-test' } }),
}))

const { useLoans, useCreateLoan, useApproveLoan, useRejectLoan, useRecordLoanPayment } =
    await import('@/hooks/useLoans')
const { useTraining, useCreateTraining, useUpdateTraining, useDeleteTraining } =
    await import('@/hooks/useTraining')

const LOAN_RESPONSE = {
    data: [],
    total: 0,
    limit: 25,
    offset: 0,
    hasMore: false,
    summary: { total: 0, pending: 0, active: 0, totalDisbursed: 0, totalOutstanding: 0 },
}

const TRAINING_RESPONSE = {
    data: [],
    total: 0,
    limit: 25,
    offset: 0,
    hasMore: false,
    summary: { total: 0, planned: 0, inProgress: 0, completed: 0, totalCost: 0 },
}

function makeWrapper() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    })
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
    Object.values(apiMock).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset())
    apiMock.get.mockResolvedValue(LOAN_RESPONSE)
    apiMock.post.mockResolvedValue({ data: {} })
    apiMock.delete.mockResolvedValue(undefined)
})

// ─── useLoans ─────────────────────────────────────────────────────────────────

describe('useLoans', () => {
    it('hits /loans with default pagination', async () => {
        renderHook(() => useLoans(), { wrapper: makeWrapper() })
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toMatch(/^\/loans\?/)
        expect(url).toContain('limit=25')
        expect(url).toContain('offset=0')
    })

    it('forwards employeeId and status as query params', async () => {
        renderHook(
            () => useLoans({ employeeId: 'emp-1', status: 'active', limit: 50 }),
            { wrapper: makeWrapper() },
        )
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toContain('employeeId=emp-1')
        expect(url).toContain('status=active')
        expect(url).toContain('limit=50')
    })

    it('omits undefined params from the query string', async () => {
        renderHook(() => useLoans({ status: 'pending' }), { wrapper: makeWrapper() })
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).not.toContain('employeeId=')
    })
})

describe('useApproveLoan', () => {
    it('POSTs to /loans/:id/approve and invalidates the loans cache', async () => {
        const invalidate = vi.fn()
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        client.invalidateQueries = invalidate
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(QueryClientProvider, { client }, children)

        const { result } = renderHook(() => useApproveLoan(), { wrapper })
        await act(() => result.current.mutateAsync({ id: 'loan-123' }))

        expect(apiMock.post).toHaveBeenCalledWith('/loans/loan-123/approve', { startDate: undefined })
        expect(invalidate).toHaveBeenCalledWith(expect.objectContaining({ queryKey: expect.arrayContaining(['loans']) }))
    })
})

describe('useRejectLoan', () => {
    it('POSTs to /loans/:id/reject with notes', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(QueryClientProvider, { client }, children)

        const { result } = renderHook(() => useRejectLoan(), { wrapper })
        await act(() => result.current.mutateAsync({ id: 'loan-456', notes: 'Insufficient tenure' }))

        expect(apiMock.post).toHaveBeenCalledWith('/loans/loan-456/reject', { notes: 'Insufficient tenure' })
    })
})

describe('useRecordLoanPayment', () => {
    it('POSTs to /loans/:id/payment', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(QueryClientProvider, { client }, children)

        const { result } = renderHook(() => useRecordLoanPayment(), { wrapper })
        await act(() => result.current.mutateAsync('loan-789'))

        expect(apiMock.post).toHaveBeenCalledWith('/loans/loan-789/payment')
    })
})

describe('useCreateLoan', () => {
    it('POSTs to /loans with the loan payload', async () => {
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(QueryClientProvider, { client }, children)

        const { result } = renderHook(() => useCreateLoan(), { wrapper })
        const payload = { employeeId: 'emp-1', amount: '10000', monthlyDeduction: '1000', reason: 'Emergency' }
        await act(() => result.current.mutateAsync(payload))

        expect(apiMock.post).toHaveBeenCalledWith('/loans', payload)
    })
})

// ─── useTraining ──────────────────────────────────────────────────────────────

describe('useTraining', () => {
    beforeEach(() => {
        apiMock.get.mockResolvedValue(TRAINING_RESPONSE)
    })

    it('hits /training with default pagination', async () => {
        renderHook(() => useTraining(), { wrapper: makeWrapper() })
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toMatch(/^\/training\?/)
        expect(url).toContain('limit=25')
        expect(url).toContain('offset=0')
    })

    it('forwards employeeId, status, type, and search params', async () => {
        renderHook(
            () => useTraining({ employeeId: 'emp-2', status: 'completed', type: 'online', search: 'excel' }),
            { wrapper: makeWrapper() },
        )
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toContain('employeeId=emp-2')
        expect(url).toContain('status=completed')
        expect(url).toContain('type=online')
        expect(url).toContain('search=excel')
    })

    it('omits undefined params from the query string', async () => {
        renderHook(() => useTraining({ type: 'internal' }), { wrapper: makeWrapper() })
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).not.toContain('employeeId=')
        expect(url).not.toContain('status=')
        expect(url).not.toContain('search=')
    })
})

describe('useCreateTraining', () => {
    it('POSTs to /training with the training payload', async () => {
        apiMock.post.mockResolvedValue({ data: { id: 'tr-1' } })
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(QueryClientProvider, { client }, children)

        const { result } = renderHook(() => useCreateTraining(), { wrapper })
        const payload = { employeeId: 'emp-3', title: 'Excel Workshop', startDate: '2026-05-01', type: 'external' as const }
        await act(() => result.current.mutateAsync(payload))

        expect(apiMock.post).toHaveBeenCalledWith('/training', payload)
    })
})

describe('useDeleteTraining', () => {
    it('DELETEs /training/:id', async () => {
        apiMock.delete.mockResolvedValue(undefined)
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(QueryClientProvider, { client }, children)

        const { result } = renderHook(() => useDeleteTraining(), { wrapper })
        await act(() => result.current.mutateAsync('tr-42'))

        expect(apiMock.delete).toHaveBeenCalledWith('/training/tr-42')
    })
})

describe('useUpdateTraining', () => {
    it('PATCHes /training/:id with updated fields', async () => {
        apiMock.patch.mockResolvedValue({ data: {} })
        const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
        const wrapper = ({ children }: { children: React.ReactNode }) =>
            React.createElement(QueryClientProvider, { client }, children)

        const { result } = renderHook(() => useUpdateTraining(), { wrapper })
        await act(() => result.current.mutateAsync({ id: 'tr-1', status: 'completed' }))

        expect(apiMock.patch).toHaveBeenCalledWith('/training/tr-1', { status: 'completed' })
    })
})
