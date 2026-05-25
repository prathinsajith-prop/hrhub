/**
 * Hook URL contract tests for the offboarding-flow module.
 *
 * These tests pin the URL + payload shape each hook talks to, so a back-end
 * route rename or shape change shows up here long before it explodes in
 * production. We mock `@/lib/api` so no real fetch happens.
 */
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

const {
    useOffboardingSettings,
    useUpdateOffboardingSettings,
    useClearanceTemplates,
    useCreateClearance,
    useUpdateClearance,
    useDeleteClearance,
    useInterviewQuestions,
    useCreateInterviewQuestion,
    useReorderInterviewQuestions,
    useExitDocuments,
    useCreateExitDocument,
    useOffboardingWorkflows,
    useCreateWorkflow,
    useExitClearances,
    useUpdateClearanceItem,
    useExitInterviewResponses,
    useSubmitInterviewResponses,
} = await import('@/hooks/useOffboardingFlow')

const { useExitApprovalReadiness, useApproveExit } = await import('@/hooks/useExit')

function makeWrapper() {
    const client = new QueryClient({
        defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    })
    return ({ children }: { children: React.ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children)
}

beforeEach(() => {
    Object.values(apiMock).forEach((fn) => (fn as ReturnType<typeof vi.fn>).mockReset())
})

// ─── Settings singleton ────────────────────────────────────────────────────

describe('useOffboardingSettings', () => {
    it('GETs /offboarding-flow/settings', async () => {
        apiMock.get.mockResolvedValue({ data: { id: 's1', tenantId: 't1', noticePeriodEnabled: true, noticePeriodValue: 30, noticePeriodUnit: 'days', hrPartnerUserIds: [], approvalReportingLevels: 1, approvalRequireHrPartner: true } })
        const { result } = renderHook(() => useOffboardingSettings(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/offboarding-flow/settings')
    })
})

describe('useUpdateOffboardingSettings', () => {
    it('PATCHes /offboarding-flow/settings with the partial payload', async () => {
        apiMock.patch.mockResolvedValue({ data: {} })
        const { result } = renderHook(() => useUpdateOffboardingSettings(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync({ noticePeriodValue: 60 }) })
        expect(apiMock.patch).toHaveBeenCalledWith('/offboarding-flow/settings', { noticePeriodValue: 60 })
    })
})

// ─── Clearance templates ───────────────────────────────────────────────────

describe('useClearanceTemplates', () => {
    it('GETs /offboarding-flow/clearances', async () => {
        apiMock.get.mockResolvedValue({ data: [] })
        const { result } = renderHook(() => useClearanceTemplates(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/offboarding-flow/clearances')
    })
})

describe('useCreateClearance', () => {
    it('POSTs /offboarding-flow/clearances with the body', async () => {
        apiMock.post.mockResolvedValue({ data: { id: 'c1' } })
        const { result } = renderHook(() => useCreateClearance(), { wrapper: makeWrapper() })
        await act(async () => {
            await result.current.mutateAsync({
                name: 'IT clearance',
                description: null,
                ownerType: 'hr_partner',
                ownerUserId: null,
                startOffsetDays: 30,
                endOffsetDays: 0,
                position: 0,
                isActive: true,
            })
        })
        expect(apiMock.post).toHaveBeenCalledWith('/offboarding-flow/clearances', expect.objectContaining({ name: 'IT clearance', ownerType: 'hr_partner' }))
    })
})

describe('useUpdateClearance', () => {
    it('PATCHes /offboarding-flow/clearances/:id with the patch body (excluding id)', async () => {
        apiMock.patch.mockResolvedValue({ data: {} })
        const { result } = renderHook(() => useUpdateClearance(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync({ id: 'c1', name: 'renamed' }) })
        expect(apiMock.patch).toHaveBeenCalledWith('/offboarding-flow/clearances/c1', { name: 'renamed' })
    })
})

describe('useDeleteClearance', () => {
    it('DELETEs /offboarding-flow/clearances/:id', async () => {
        apiMock.delete.mockResolvedValue(undefined)
        const { result } = renderHook(() => useDeleteClearance(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync('c1') })
        expect(apiMock.delete).toHaveBeenCalledWith('/offboarding-flow/clearances/c1')
    })
})

// ─── Interview questions ────────────────────────────────────────────────────

describe('useInterviewQuestions', () => {
    it('GETs /offboarding-flow/interview-questions', async () => {
        apiMock.get.mockResolvedValue({ data: [] })
        const { result } = renderHook(() => useInterviewQuestions(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/offboarding-flow/interview-questions')
    })
})

describe('useCreateInterviewQuestion', () => {
    it('POSTs /offboarding-flow/interview-questions', async () => {
        apiMock.post.mockResolvedValue({ data: {} })
        const { result } = renderHook(() => useCreateInterviewQuestion(), { wrapper: makeWrapper() })
        await act(async () => {
            await result.current.mutateAsync({
                questionText: 'How was your day?',
                questionType: 'long_text',
                options: null,
                required: false,
                position: 0,
                isActive: true,
            })
        })
        expect(apiMock.post).toHaveBeenCalledWith('/offboarding-flow/interview-questions', expect.objectContaining({ questionText: 'How was your day?' }))
    })
})

describe('useReorderInterviewQuestions', () => {
    it('POSTs /offboarding-flow/interview-questions/reorder with { orderedIds }', async () => {
        apiMock.post.mockResolvedValue({ data: [] })
        const { result } = renderHook(() => useReorderInterviewQuestions(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync(['q1', 'q2', 'q3']) })
        expect(apiMock.post).toHaveBeenCalledWith('/offboarding-flow/interview-questions/reorder', { orderedIds: ['q1', 'q2', 'q3'] })
    })
})

// ─── Documents ─────────────────────────────────────────────────────────────

describe('useExitDocuments', () => {
    it('GETs /offboarding-flow/documents', async () => {
        apiMock.get.mockResolvedValue({ data: [] })
        const { result } = renderHook(() => useExitDocuments(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/offboarding-flow/documents')
    })
})

describe('useCreateExitDocument', () => {
    it('POSTs /offboarding-flow/documents with a body that includes bodyTemplate', async () => {
        apiMock.post.mockResolvedValue({ data: {} })
        const { result } = renderHook(() => useCreateExitDocument(), { wrapper: makeWrapper() })
        await act(async () => {
            await result.current.mutateAsync({
                name: 'NOC Letter',
                bodyTemplate: '<p>{{employeeName}}</p>',
                documentTemplateId: null,
                autoGenerate: false,
                required: false,
                position: 0,
                isActive: true,
            })
        })
        expect(apiMock.post).toHaveBeenCalledWith('/offboarding-flow/documents', expect.objectContaining({ name: 'NOC Letter', bodyTemplate: '<p>{{employeeName}}</p>' }))
    })
})

// ─── Workflows ─────────────────────────────────────────────────────────────

describe('useOffboardingWorkflows', () => {
    it('GETs /offboarding-flow/workflows', async () => {
        apiMock.get.mockResolvedValue({ data: [] })
        const { result } = renderHook(() => useOffboardingWorkflows(), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/offboarding-flow/workflows')
    })
})

describe('useCreateWorkflow', () => {
    it('POSTs /offboarding-flow/workflows', async () => {
        apiMock.post.mockResolvedValue({ data: {} })
        const { result } = renderHook(() => useCreateWorkflow(), { wrapper: makeWrapper() })
        await act(async () => {
            await result.current.mutateAsync({
                name: 'Notify manager',
                trigger: 'on_request_added',
                actionType: 'email_alert',
                config: { recipients: ['reporting_manager'], subject: 'Hello', body: 'Body' },
                enabled: true,
                position: 0,
            })
        })
        expect(apiMock.post).toHaveBeenCalledWith('/offboarding-flow/workflows', expect.objectContaining({ trigger: 'on_request_added', actionType: 'email_alert' }))
    })
})

// ─── Per-exit clearance items ──────────────────────────────────────────────

describe('useExitClearances', () => {
    it('GETs /exit/:id/clearances', async () => {
        apiMock.get.mockResolvedValue({ data: [] })
        const { result } = renderHook(() => useExitClearances('e-42'), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/exit/e-42/clearances')
    })

    it('does not fetch when exitId is null', () => {
        const { result } = renderHook(() => useExitClearances(null), { wrapper: makeWrapper() })
        expect(result.current.isPending).toBe(true)
        expect(apiMock.get).not.toHaveBeenCalled()
    })
})

describe('useUpdateClearanceItem', () => {
    it('PATCHes /exit/:exitId/clearances/:itemId with the patch (excluding itemId)', async () => {
        apiMock.patch.mockResolvedValue({ data: {} })
        const { result } = renderHook(() => useUpdateClearanceItem('e-42'), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync({ itemId: 'c-1', status: 'completed' }) })
        expect(apiMock.patch).toHaveBeenCalledWith('/exit/e-42/clearances/c-1', { status: 'completed' })
    })
})

// ─── Per-exit interview responses ──────────────────────────────────────────

describe('useExitInterviewResponses', () => {
    it('GETs /exit/:id/interview-responses', async () => {
        apiMock.get.mockResolvedValue({ data: [] })
        const { result } = renderHook(() => useExitInterviewResponses('e-42'), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/exit/e-42/interview-responses')
    })
})

describe('useSubmitInterviewResponses', () => {
    it('POSTs /exit/:id/interview-responses with { answers }', async () => {
        apiMock.post.mockResolvedValue({ data: [] })
        const { result } = renderHook(() => useSubmitInterviewResponses('e-42'), { wrapper: makeWrapper() })
        await act(async () => {
            await result.current.mutateAsync([
                { questionId: 'q1', questionSnapshot: 'Why?', answerText: 'Because' },
            ])
        })
        expect(apiMock.post).toHaveBeenCalledWith('/exit/e-42/interview-responses', { answers: [{ questionId: 'q1', questionSnapshot: 'Why?', answerText: 'Because' }] })
    })
})

// ─── Exit approval readiness + override ────────────────────────────────────

describe('useExitApprovalReadiness', () => {
    it('GETs /exit/:id/readiness when an id is passed', async () => {
        apiMock.get.mockResolvedValue({ data: { canApprove: true, totalClearances: 0, completedClearances: 0, pendingClearances: [], interviewSubmitted: false, documentsConfigured: 0 } })
        const { result } = renderHook(() => useExitApprovalReadiness('e-42'), { wrapper: makeWrapper() })
        await waitFor(() => expect(result.current.isSuccess).toBe(true))
        expect(apiMock.get).toHaveBeenCalledWith('/exit/e-42/readiness')
    })

    it('skips the fetch when exitId is null', () => {
        renderHook(() => useExitApprovalReadiness(null), { wrapper: makeWrapper() })
        expect(apiMock.get).not.toHaveBeenCalled()
    })
})

describe('useApproveExit', () => {
    it('PATCHes /exit/:id/approve with { override: false } when passed a bare id', async () => {
        apiMock.patch.mockResolvedValue({})
        const { result } = renderHook(() => useApproveExit(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync('e-42') })
        expect(apiMock.patch).toHaveBeenCalledWith('/exit/e-42/approve', { override: false })
    })

    it('PATCHes /exit/:id/approve with { override: true } when override is requested', async () => {
        apiMock.patch.mockResolvedValue({})
        const { result } = renderHook(() => useApproveExit(), { wrapper: makeWrapper() })
        await act(async () => { await result.current.mutateAsync({ id: 'e-42', override: true }) })
        expect(apiMock.patch).toHaveBeenCalledWith('/exit/e-42/approve', { override: true })
    })
})
