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
vi.mock('@/components/ui/overlays', () => ({
    toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const { useCalendarEvents } = await import('@/hooks/useCalendar')
const { useDashboardSummary } = await import('@/hooks/useDashboard')
const { useReportsSummary } = await import('@/hooks/useReports')

function makeWrapper() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    })
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
    Object.values(apiMock).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset())
    apiMock.get.mockResolvedValue({})
})

// ─── useCalendarEvents ────────────────────────────────────────────────────────

describe('useCalendarEvents', () => {
    it('does not fetch when range is undefined', () => {
        renderHook(() => useCalendarEvents(undefined), { wrapper: makeWrapper() })
        expect(apiMock.get).not.toHaveBeenCalled()
    })

    it('calls /calendar with from and to when range is provided', async () => {
        renderHook(
            () => useCalendarEvents({ from: '2026-04-01', to: '2026-04-30' }),
            { wrapper: makeWrapper() },
        )
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toMatch(/^\/calendar\?/)
        expect(url).toContain('from=2026-04-01')
        expect(url).toContain('to=2026-04-30')
    })

    it('refetches when the range changes', async () => {
        const { rerender } = renderHook(
            ({ range }: { range: { from: string; to: string } }) => useCalendarEvents(range),
            {
                wrapper: makeWrapper(),
                initialProps: { range: { from: '2026-04-01', to: '2026-04-30' } },
            },
        )
        await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(1))
        rerender({ range: { from: '2026-05-01', to: '2026-05-31' } })
        await waitFor(() => expect(apiMock.get).toHaveBeenCalledTimes(2))
        const secondUrl = apiMock.get.mock.calls[1][0] as string
        expect(secondUrl).toContain('from=2026-05-01')
        expect(secondUrl).toContain('to=2026-05-31')
    })

    it('returns the response data directly', async () => {
        const mockData = {
            visas: [{ id: 'v1' }],
            documents: [],
            leaves: [],
            reviews: [],
            holidays: [{ id: 'h1', name: 'New Year', date: '2026-01-01' }],
        }
        apiMock.get.mockResolvedValue(mockData)
        const { result } = renderHook(
            () => useCalendarEvents({ from: '2026-01-01', to: '2026-01-31' }),
            { wrapper: makeWrapper() },
        )
        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(result.current.data).toEqual(mockData)
        expect(result.current.data?.visas).toHaveLength(1)
        expect(result.current.data?.holidays).toHaveLength(1)
    })
})

// ─── useDashboardSummary ──────────────────────────────────────────────────────

describe('useDashboardSummary', () => {
    it('calls /dashboard/summary', async () => {
        renderHook(() => useDashboardSummary(), { wrapper: makeWrapper() })
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        expect(apiMock.get.mock.calls[0][0]).toBe('/dashboard/summary')
    })

    it('returns all six dashboard sections in a single response', async () => {
        const mockSummary = {
            kpis: { totalEmployees: 42, openJobs: 3, activeVisas: 10, pendingLeave: 2, expiringVisas: 1 },
            payrollTrend: [{ month: 'Jan', amount: 100_000 }],
            nationalityBreakdown: [{ name: 'UAE', value: 20, color: '#000' }],
            deptHeadcount: [{ dept: 'Engineering', count: 15 }],
            emiratisation: { currentRatio: 0.05, targetRatio: 0.04, gap: 0, emiratis: 2, totalActive: 42, required: 1, progress: 100 },
            onboardingSummary: { active: 3, overdue: 1 },
        }
        apiMock.get.mockResolvedValue(mockSummary)
        const { result } = renderHook(() => useDashboardSummary(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(result.current.data?.kpis.totalEmployees).toBe(42)
        expect(result.current.data?.payrollTrend).toHaveLength(1)
        expect(result.current.data?.deptHeadcount[0].dept).toBe('Engineering')
        expect(result.current.data?.emiratisation.progress).toBe(100)
        expect(result.current.data?.onboardingSummary.overdue).toBe(1)
    })
})

// ─── useReportsSummary ────────────────────────────────────────────────────────

describe('useReportsSummary', () => {
    it('calls /reports/summary with default days=90', async () => {
        renderHook(() => useReportsSummary(), { wrapper: makeWrapper() })
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        const url = apiMock.get.mock.calls[0][0] as string
        expect(url).toBe('/reports/summary?days=90')
    })

    it('forwards custom days param', async () => {
        renderHook(() => useReportsSummary(30), { wrapper: makeWrapper() })
        await waitFor(() => expect(apiMock.get).toHaveBeenCalled())
        expect(apiMock.get.mock.calls[0][0]).toBe('/reports/summary?days=30')
    })

    it('returns all four report sections in a single response', async () => {
        const mockSummary = {
            headcount: { total: 50, byStatus: [], byDepartment: [], byNationality: [], employees: [] },
            payrollSummary: { trend: [], ytdGross: 500_000, ytdNet: 450_000, totalRuns: 4 },
            visaExpiry: { total: 5, expired: 1, critical: 2, urgent: 1, normal: 1, employees: [] },
            proCosts: { ytdTotal: 25_000, avgPerEmployee: 500, totalTransactions: 50, byCategory: [], byEmployee: [] },
        }
        apiMock.get.mockResolvedValue(mockSummary)
        const { result } = renderHook(() => useReportsSummary(90), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.data).toBeDefined())
        expect(result.current.data?.headcount.total).toBe(50)
        expect(result.current.data?.payrollSummary.ytdGross).toBe(500_000)
        expect(result.current.data?.visaExpiry.expired).toBe(1)
        expect(result.current.data?.proCosts.ytdTotal).toBe(25_000)
    })
})
