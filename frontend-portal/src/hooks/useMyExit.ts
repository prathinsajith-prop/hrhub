// ─── My Exit (portal-side) ──────────────────────────────────────────────────
// Hooks the employee portal uses to:
//   • discover whether the signed-in employee has an open exit request, and
//   • read / write the exit-interview questionnaire on their own behalf.
//
// All endpoints are tenant + identity scoped on the server — we never pass
// the employee id from the client.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ─── Types (kept locally so the portal doesn't depend on admin types) ──────

export interface MyExit {
    id: string
    tenantId: string
    employeeId: string
    exitType: 'resignation' | 'termination' | 'contract_end' | 'retirement'
    exitDate: string
    lastWorkingDay: string
    reason?: string | null
    noticePeriodDays: string
    status: 'pending' | 'approved' | 'rejected' | 'completed'
    createdAt: string
    updatedAt: string
    interviewSubmitted: boolean
}

export type QuestionType = 'short_text' | 'long_text' | 'rating' | 'single_choice' | 'multi_choice' | 'yes_no'

export interface InterviewQuestion {
    id: string
    questionText: string
    questionType: QuestionType
    options: string[] | null
    required: boolean
    position: number
    isActive: boolean
}

export interface InterviewResponse {
    id: string
    exitRequestId: string
    questionId: string | null
    questionSnapshot: string
    answerText: string | null
    answerValue: unknown
    submittedAt: string
}

// ─── My open exit ──────────────────────────────────────────────────────────

export function useMyOpenExit() {
    return useQuery({
        queryKey: ['portal', 'my-exit'],
        queryFn: () => api.get<{ data: MyExit | null }>('/my-exit').then(r => r.data),
        // Refresh every 60s — the employee may have an exit initiated by HR
        // while their portal session is already open.
        staleTime: 60_000,
    })
}

// ─── Interview bundle (exit + questions + responses) ──────────────────────
// Single round trip — the portal page renders against this combined shape.
// The questions endpoint at /offboarding-flow/interview-questions is
// HR-only on the server; this bundle is the employee-safe equivalent.

export interface InterviewBundle {
    exit: MyExit
    questions: InterviewQuestion[]
    responses: InterviewResponse[]
}

export function useMyInterviewBundle() {
    return useQuery({
        queryKey: ['portal', 'my-exit', 'interview'],
        queryFn: () => api.get<{ data: InterviewBundle }>('/my-exit/interview').then(r => r.data),
        retry: false, // 404 when no exit is initiated — don't spam
    })
}

// ─── Public (token-validated) bundle + submit ──────────────────────────────
// Used by the standalone /exit-interview/by-token/:token page that the
// employee opens from the email link — no portal login required.

export interface PublicExitContext {
    id: string
    exitType: 'resignation' | 'termination' | 'contract_end' | 'retirement'
    exitDate: string
    lastWorkingDay: string
    employeeName: string | null
    status: 'pending' | 'approved' | 'rejected' | 'completed'
}

export interface PublicInterviewBundle {
    exit: PublicExitContext
    questions: InterviewQuestion[]
    responses: InterviewResponse[]
}

export function useTokenInterviewBundle(token: string | null) {
    return useQuery({
        queryKey: ['public-exit-interview', token],
        queryFn: () => api.get<{ data: PublicInterviewBundle }>(`/exit-interview/by-token/${token}`)
            .then(r => r.data),
        enabled: !!token,
        retry: false,
    })
}

export function useSubmitTokenInterviewResponses(token: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (answers: Array<{ questionId: string; questionSnapshot: string; answerText?: string; answerValue?: unknown }>) =>
            api.post<{ data: InterviewResponse[] }>(`/exit-interview/by-token/${token}`, { answers })
                .then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['public-exit-interview', token] })
        },
    })
}

export function useSubmitMyInterviewResponses(exitId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (answers: Array<{ questionId: string; questionSnapshot: string; answerText?: string; answerValue?: unknown }>) =>
            api.post<{ data: InterviewResponse[] }>(`/exit/${exitId}/interview-responses`, { answers })
                .then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'my-exit', 'interview'] })
            qc.invalidateQueries({ queryKey: ['portal', 'my-exit'] })
        },
    })
}
