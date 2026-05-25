// ─── Offboarding Flow hooks ────────────────────────────────────────────────
// One file owns all 5 config concerns + the per-exit clearance/interview
// surfaces. Backend endpoints live under /api/v1/offboarding-flow/* (config)
// and /api/v1/exit/:exitId/* (per-exit instances).

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

// ─── Types ──────────────────────────────────────────────────────────────────

export type OwnerType = 'hr_partner' | 'reporting_manager' | 'specific_user'
export type ClearanceStatus = 'pending' | 'in_progress' | 'completed' | 'waived'
export type QuestionType = 'short_text' | 'long_text' | 'rating' | 'single_choice' | 'multi_choice' | 'yes_no'
export type WorkflowTrigger =
    | 'on_request_added'
    | 'on_approved'
    | 'on_rejected'
    | 'on_clearance_complete'
    | 'on_settlement_paid'
    | 'on_relieving_date'
// `custom_function` is kept in the union for backwards compatibility with
// legacy workflow rows. The Workflow editor UI only exposes email_alert and
// notification — custom_function is read-only for existing rows.
export type WorkflowActionType = 'email_alert' | 'notification' | 'custom_function'
export type Recipient = 'employee' | 'reporting_manager' | 'hr_partner' | 'custom'

export interface OffboardingFlowSettings {
    id: string
    tenantId: string
    noticePeriodEnabled: boolean
    noticePeriodValue: number
    noticePeriodUnit: 'days' | 'months'
    hrPartnerUserIds: string[]
    approvalReportingLevels: number
    approvalRequireHrPartner: boolean
    interviewIntroMessage: string | null
    interviewThankYouMessage: string | null
    workflowTrigger: 'on_request_added' | 'on_approved' | 'on_relieving_date'
    createdAt: string
    updatedAt: string
}

export interface ClearanceTemplate {
    id: string
    tenantId: string
    name: string
    description: string | null
    ownerType: OwnerType
    ownerUserId: string | null
    startOffsetDays: number
    endOffsetDays: number
    position: number
    isActive: boolean
    createdAt: string
    updatedAt: string
}

export interface InterviewQuestion {
    id: string
    tenantId: string
    questionText: string
    questionType: QuestionType
    options: string[] | null
    required: boolean
    position: number
    isActive: boolean
}

export interface ExitDocumentItem {
    id: string
    tenantId: string
    name: string
    bodyTemplate: string | null
    documentTemplateId: string | null
    autoGenerate: boolean
    required: boolean
    position: number
    isActive: boolean
}

export interface OffboardingWorkflow {
    id: string
    tenantId: string
    name: string
    trigger: WorkflowTrigger
    /** Multi-select set of actions fired when the trigger hits. Replaces the
     *  legacy single `actionType`; `actionType` is still returned by the
     *  backend (mirrors `actions[0]`) for backwards compat. */
    actions: WorkflowActionType[]
    actionType?: WorkflowActionType
    config: {
        recipients?: Recipient[]
        customEmails?: string[]
        subject?: string
        body?: string
        message?: string
        actionUrl?: string
    }
    enabled: boolean
    position: number
}

export interface ExitClearanceItem {
    id: string
    tenantId: string
    exitRequestId: string
    templateId: string | null
    name: string
    description: string | null
    ownerUserId: string | null
    startDate: string | null
    dueDate: string | null
    status: ClearanceStatus
    completedAt: string | null
    completedBy: string | null
    notes: string | null
    position: number
}

export interface ExitInterviewResponse {
    id: string
    exitRequestId: string
    questionId: string | null
    questionSnapshot: string
    answerText: string | null
    answerValue: unknown
    submittedAt: string
}

// ─── Settings ───────────────────────────────────────────────────────────────

const KEY = ['offboarding-flow'] as const

export function useOffboardingSettings() {
    return useQuery({
        queryKey: [...KEY, 'settings'],
        queryFn: () => api.get<{ data: OffboardingFlowSettings }>('/offboarding-flow/settings').then(r => r.data),
    })
}

export function useUpdateOffboardingSettings() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (patch: Partial<OffboardingFlowSettings>) =>
            api.patch<{ data: OffboardingFlowSettings }>('/offboarding-flow/settings', patch).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'settings'] }),
    })
}

// ─── Clearance templates ────────────────────────────────────────────────────

export function useClearanceTemplates() {
    return useQuery({
        queryKey: [...KEY, 'clearances'],
        queryFn: () => api.get<{ data: ClearanceTemplate[] }>('/offboarding-flow/clearances').then(r => r.data),
    })
}

export function useCreateClearance() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: Omit<ClearanceTemplate, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>) =>
            api.post<{ data: ClearanceTemplate }>('/offboarding-flow/clearances', body).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'clearances'] }),
    })
}

export function useUpdateClearance() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...patch }: { id: string } & Partial<ClearanceTemplate>) =>
            api.patch<{ data: ClearanceTemplate }>(`/offboarding-flow/clearances/${id}`, patch).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'clearances'] }),
    })
}

export function useDeleteClearance() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/offboarding-flow/clearances/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'clearances'] }),
    })
}

// ─── Interview questions ────────────────────────────────────────────────────

export function useInterviewQuestions() {
    return useQuery({
        queryKey: [...KEY, 'questions'],
        queryFn: () => api.get<{ data: InterviewQuestion[] }>('/offboarding-flow/interview-questions').then(r => r.data),
    })
}

export function useCreateInterviewQuestion() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: Omit<InterviewQuestion, 'id' | 'tenantId'>) =>
            api.post<{ data: InterviewQuestion }>('/offboarding-flow/interview-questions', body).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'questions'] }),
    })
}

export function useUpdateInterviewQuestion() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...patch }: { id: string } & Partial<InterviewQuestion>) =>
            api.patch<{ data: InterviewQuestion }>(`/offboarding-flow/interview-questions/${id}`, patch).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'questions'] }),
    })
}

export function useDeleteInterviewQuestion() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/offboarding-flow/interview-questions/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'questions'] }),
    })
}

/**
 * Persist a new question order. The mutation does an optimistic update so the
 * dragged item snaps into place immediately even before the server responds.
 */
export function useReorderInterviewQuestions() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (orderedIds: string[]) =>
            api.post<{ data: InterviewQuestion[] }>('/offboarding-flow/interview-questions/reorder', { orderedIds }).then(r => r.data),
        onMutate: async (orderedIds) => {
            await qc.cancelQueries({ queryKey: [...KEY, 'questions'] })
            const previous = qc.getQueryData<InterviewQuestion[]>([...KEY, 'questions'])
            if (previous) {
                const byId = new Map(previous.map(q => [q.id, q]))
                const next = orderedIds
                    .map((id, i) => {
                        const q = byId.get(id)
                        return q ? { ...q, position: i } : null
                    })
                    .filter((q): q is InterviewQuestion => q !== null)
                qc.setQueryData([...KEY, 'questions'], next)
            }
            return { previous }
        },
        onError: (_err, _vars, ctx) => {
            if (ctx?.previous) qc.setQueryData([...KEY, 'questions'], ctx.previous)
        },
        onSettled: () => qc.invalidateQueries({ queryKey: [...KEY, 'questions'] }),
    })
}

// ─── Documents ──────────────────────────────────────────────────────────────

export function useExitDocuments() {
    return useQuery({
        queryKey: [...KEY, 'documents'],
        queryFn: () => api.get<{ data: ExitDocumentItem[] }>('/offboarding-flow/documents').then(r => r.data),
    })
}

export function useCreateExitDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: Omit<ExitDocumentItem, 'id' | 'tenantId'>) =>
            api.post<{ data: ExitDocumentItem }>('/offboarding-flow/documents', body).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'documents'] }),
    })
}

export function useUpdateExitDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...patch }: { id: string } & Partial<ExitDocumentItem>) =>
            api.patch<{ data: ExitDocumentItem }>(`/offboarding-flow/documents/${id}`, patch).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'documents'] }),
    })
}

export function useDeleteExitDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/offboarding-flow/documents/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'documents'] }),
    })
}

// ─── Workflows ──────────────────────────────────────────────────────────────

export function useOffboardingWorkflows() {
    return useQuery({
        queryKey: [...KEY, 'workflows'],
        queryFn: () => api.get<{ data: OffboardingWorkflow[] }>('/offboarding-flow/workflows').then(r => r.data),
    })
}

export function useCreateWorkflow() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: Omit<OffboardingWorkflow, 'id' | 'tenantId'>) =>
            api.post<{ data: OffboardingWorkflow }>('/offboarding-flow/workflows', body).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'workflows'] }),
    })
}

export function useUpdateWorkflow() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...patch }: { id: string } & Partial<OffboardingWorkflow>) =>
            api.patch<{ data: OffboardingWorkflow }>(`/offboarding-flow/workflows/${id}`, patch).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'workflows'] }),
    })
}

export function useDeleteWorkflow() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/offboarding-flow/workflows/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'workflows'] }),
    })
}

// ─── Per-exit clearance items ───────────────────────────────────────────────

export function useExitClearances(exitId: string | null | undefined) {
    return useQuery({
        queryKey: ['exit', exitId, 'clearances'],
        queryFn: () => api.get<{ data: ExitClearanceItem[] }>(`/exit/${exitId}/clearances`).then(r => r.data),
        enabled: !!exitId,
    })
}

export function useUpdateClearanceItem(exitId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ itemId, ...patch }: { itemId: string; status?: ClearanceStatus; notes?: string }) =>
            api.patch<{ data: ExitClearanceItem }>(`/exit/${exitId}/clearances/${itemId}`, patch).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['exit', exitId, 'clearances'] }),
    })
}

/**
 * Add an ad-hoc clearance item to an in-flight exit. HR-only on the server
 * (admin auth) — surfaced as the "Add item" affordance in the Clearance panel.
 */
export function useAddClearanceItem(exitId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: { name: string; description?: string | null; ownerUserId?: string | null; startDate?: string | null; dueDate?: string | null }) =>
            api.post<{ data: ExitClearanceItem }>(`/exit/${exitId}/clearances`, body).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['exit', exitId, 'clearances'] })
            // Also invalidate the list view so the progress badge updates.
            qc.invalidateQueries({ queryKey: ['exit'] })
        },
    })
}

// ─── Per-exit interview responses ───────────────────────────────────────────

export function useExitInterviewResponses(exitId: string | null | undefined) {
    return useQuery({
        queryKey: ['exit', exitId, 'interview-responses'],
        queryFn: () => api.get<{ data: ExitInterviewResponse[] }>(`/exit/${exitId}/interview-responses`).then(r => r.data),
        enabled: !!exitId,
    })
}

export function useSubmitInterviewResponses(exitId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (answers: Array<{ questionId: string; questionSnapshot: string; answerText?: string; answerValue?: unknown }>) =>
            api.post<{ data: ExitInterviewResponse[] }>(`/exit/${exitId}/interview-responses`, { answers }).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['exit', exitId, 'interview-responses'] }),
    })
}
