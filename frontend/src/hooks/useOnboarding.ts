import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

export type OnboardingStepStatus = 'pending' | 'in_progress' | 'completed' | 'overdue'

export interface OnboardingStep {
    id: string
    checklistId: string
    stepOrder: number
    title: string
    owner: string | null
    slaDays: number | null
    status: OnboardingStepStatus
    dueDate: string | null
    completedDate: string | null
    notes: string | null
    createdAt: string
}

export interface OnboardingChecklist {
    id: string | null
    employeeId: string
    employeeName: string
    employeeNo: string | null
    designation: string | null
    department: string | null
    avatarUrl: string | null
    email?: string | null
    phone?: string | null
    joinDate?: string | null
    employeeStatus?: string | null
    progress: number
    startDate: string | null
    dueDate: string | null
    createdAt: string
    updatedAt: string
    completedCount: number
    totalCount: number
    steps: OnboardingStep[]
}

export function useOnboardingChecklists() {
    return useQuery({
        queryKey: ['onboarding'],
        queryFn: () => api.get<{ data: OnboardingChecklist[] }>('/onboarding').then(r => r.data),
    })
}

export function useEmployeeChecklist(employeeId: string) {
    return useQuery({
        queryKey: ['onboarding', employeeId],
        queryFn: () => api.get<{ data: OnboardingChecklist }>(`/onboarding/employee/${employeeId}`).then(r => r.data),
        enabled: !!employeeId,
    })
}

export function useUpdateOnboardingStep() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ checklistId, stepId, data }: { checklistId: string; stepId: string; data: Partial<{ status: OnboardingStepStatus; notes: string; completedDate: string }> }) =>
            api.patch(`/onboarding/${checklistId}/steps/${stepId}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
    })
}

export function useAddOnboardingStep() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ checklistId, data }: { checklistId: string; data: { title: string; owner?: string; dueDate?: string; slaDays?: number } }) =>
            api.post(`/onboarding/${checklistId}/steps`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
    })
}

export function useDeleteOnboardingStep() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ checklistId, stepId }: { checklistId: string; stepId: string }) =>
            api.delete(`/onboarding/${checklistId}/steps/${stepId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
    })
}

export function useCreateOnboardingChecklist() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { employeeId: string; startDate?: string; dueDate?: string; useTemplate?: boolean }) =>
            api.post('/onboarding', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
    })
}

export interface OnboardingAnalytics {
    total: number
    completed: number
    inProgress: number
    notStarted: number
    avgProgress: number
    completionRate: number
    overdueSteps: number
}

export function useOnboardingAnalytics() {
    return useQuery({
        queryKey: ['onboarding', 'analytics'],
        queryFn: () => api.get<{ data: OnboardingAnalytics }>('/onboarding/analytics').then(r => r.data),
    })
}

export interface UploadTokenResult {
    sent: boolean
    error?: string
    email: string
    uploadUrl: string
    expiresInDays: number
    tokenId: string
}

export function useSendOnboardingUploadLink() {
    return useMutation({
        mutationFn: (input: { checklistId: string; expiresInDays?: number; seedRequiredDocs?: boolean }) =>
            api.post<{ data: UploadTokenResult }>(`/onboarding/${input.checklistId}/upload-token`, {
                expiresInDays: input.expiresInDays,
                seedRequiredDocs: input.seedRequiredDocs ?? true,
            }).then(r => r.data),
    })
}

export interface OnboardingUploadToken {
    id: string
    issuedToEmail: string
    issuedBy: string | null
    expiresAt: string
    revokedAt: string | null
    viewCount: number
    uploadCount: number
    lastUsedAt: string | null
    createdAt: string
}

export function useOnboardingUploadTokens(checklistId: string | null | undefined) {
    return useQuery({
        queryKey: ['onboarding-upload-tokens', checklistId],
        queryFn: () => api.get<{ data: OnboardingUploadToken[] }>(`/onboarding/${checklistId}/upload-tokens`).then(r => r.data),
        enabled: !!checklistId,
    })
}

export function useRevokeOnboardingToken() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (tokenId: string) =>
            api.post<{ data: OnboardingUploadToken }>(`/onboarding/upload-tokens/${tokenId}/revoke`, {}).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding-upload-tokens'] }),
    })
}

export interface StepRequiredDoc {
    id: string
    category: string
    docType: string
    expiryRequired: boolean
    isMandatory: boolean
    hint: string | null
    fulfilled?: boolean
}

export function useStepRequiredDocs(stepId: string | null | undefined) {
    return useQuery({
        queryKey: ['onboarding-required-docs', stepId],
        queryFn: () => api.get<{ data: StepRequiredDoc[] }>(`/onboarding/steps/${stepId}/required-docs`).then(r => r.data),
        enabled: !!stepId,
    })
}

export function useAddStepRequiredDoc() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: { stepId: string; category: string; docType: string; expiryRequired?: boolean; isMandatory?: boolean; hint?: string }) =>
            api.post<{ data: StepRequiredDoc }>(`/onboarding/steps/${input.stepId}/required-docs`, input).then(r => r.data),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ['onboarding-required-docs', vars.stepId] })
            qc.invalidateQueries({ queryKey: ['onboarding-doc-summary'] })
        },
    })
}

export function useDeleteStepRequiredDoc() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (requiredDocId: string) =>
            api.delete<{ data: StepRequiredDoc }>(`/onboarding/required-docs/${requiredDocId}`).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['onboarding-required-docs'] })
            qc.invalidateQueries({ queryKey: ['onboarding-doc-summary'] })
        },
    })
}

// ─── Template-level required-docs (Organization Settings) ───────────────────
// Same wire format as the instance-level hooks above; just point at the
// /template-steps/... routes so admins curate the defaults once.

export function useTemplateStepRequiredDocs(templateStepId: string | null | undefined) {
    return useQuery({
        queryKey: ['onboarding-template-required-docs', templateStepId],
        queryFn: () =>
            api.get<{ data: StepRequiredDoc[] }>(`/onboarding/template-steps/${templateStepId}/required-docs`).then(r => r.data),
        enabled: !!templateStepId,
    })
}

export function useAddTemplateStepRequiredDoc() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: { templateStepId: string; category: string; docType: string; expiryRequired?: boolean; isMandatory?: boolean; hint?: string }) =>
            api.post<{ data: StepRequiredDoc }>(`/onboarding/template-steps/${input.templateStepId}/required-docs`, input).then(r => r.data),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ['onboarding-template-required-docs', vars.templateStepId] })
        },
    })
}

export function useDeleteTemplateStepRequiredDoc() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (requiredDocId: string) =>
            api.delete<{ data: StepRequiredDoc }>(`/onboarding/template-required-docs/${requiredDocId}`).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding-template-required-docs'] }),
    })
}

export interface ChecklistDocSummary {
    steps: Array<{
        stepId: string
        title: string
        required: number
        uploaded: number
        completion: number
        missingMandatory: string[]
    }>
}

export function useChecklistDocSummary(checklistId: string | null | undefined) {
    return useQuery({
        queryKey: ['onboarding-doc-summary', checklistId],
        queryFn: () => api.get<{ data: ChecklistDocSummary }>(`/onboarding/${checklistId}/doc-summary`).then(r => r.data),
        enabled: !!checklistId,
    })
}

export interface StepUploadDoc {
    id: string
    stepId: string | null
    category?: string
    docType: string
    fileName: string
    status: string
    expiryDate: string | null
    rejectionReason?: string | null
    createdAt?: string
}

export interface UploadInfoStep {
    id: string
    stepOrder: number
    title: string
    owner: string | null
    status: string
    dueDate: string | null
    requiredDocs: StepRequiredDoc[]
    suggestedDocs: Array<{ docType: string; category: string; expiryRequired: boolean }>
    uploadedDocs: StepUploadDoc[]
}

export interface OnboardingUploadInfo {
    checklistId: string
    employeeName: string
    companyName: string | null
    progress: number
    requiredDocsProgress: number | null
    mandatoryTotal: number
    mandatoryFulfilled: number
    steps: UploadInfoStep[]
}

export function useOnboardingUploadInfo(token: string) {
    return useQuery({
        queryKey: ['onboarding-upload', token],
        queryFn: () => api.get<{ data: OnboardingUploadInfo }>(`/onboarding/upload-info?t=${encodeURIComponent(token)}`).then(r => r.data),
        enabled: !!token,
        retry: false,
    })
}

/* ─── Onboarding Template Steps (per-tenant) ──────────────────────────────── */

export interface OnboardingTemplateStep {
    id: string
    tenantId: string
    stepOrder: number
    title: string
    owner: string | null
    slaDays: number | null
    createdAt: string
    updatedAt: string
}

export function useOnboardingTemplateSteps() {
    return useQuery({
        queryKey: ['onboarding-template-steps'],
        queryFn: () => api.get<{ data: OnboardingTemplateStep[] }>('/onboarding/template-steps').then(r => r.data),
        staleTime: 60_000,
    })
}

export function useCreateOnboardingTemplateStep() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { title: string; owner?: string; slaDays?: number }) =>
            api.post<{ data: OnboardingTemplateStep }>('/onboarding/template-steps', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding-template-steps'] }),
        onError: (err: Error) => toast.error('Failed to add step', err.message),
    })
}

export function useUpdateOnboardingTemplateStep() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ stepId, ...data }: { stepId: string; title?: string; owner?: string | null; slaDays?: number | null }) =>
            api.patch<{ data: OnboardingTemplateStep }>(`/onboarding/template-steps/${stepId}`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding-template-steps'] }),
        onError: (err: Error) => toast.error('Failed to update step', err.message),
    })
}

export function useDeleteOnboardingTemplateStep() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (stepId: string) => api.delete(`/onboarding/template-steps/${stepId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding-template-steps'] }),
        onError: (err: Error) => toast.error('Failed to delete step', err.message),
    })
}

export function useReorderOnboardingTemplateSteps() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (orderedIds: string[]) =>
            api.post<{ data: OnboardingTemplateStep[] }>('/onboarding/template-steps/reorder', { orderedIds }).then(r => r.data),
        onSuccess: (data) => qc.setQueryData(['onboarding-template-steps'], data),
        onError: (err: Error) => toast.error('Failed to reorder steps', err.message),
    })
}

export function useResetOnboardingTemplate() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () =>
            api.post<{ data: OnboardingTemplateStep[] }>('/onboarding/template-steps/reset').then(r => r.data),
        onSuccess: (data) => qc.setQueryData(['onboarding-template-steps'], data),
        onError: (err: Error) => toast.error('Failed to reset template', err.message),
    })
}

export function useOnboardingPublicUpload(token: string) {
    return useMutation({
        mutationFn: async (input: { file: File; stepId: string; category: string; docType: string; docNumber?: string; expiryDate?: string }) => {
            const fd = new FormData()
            fd.append('file', input.file)
            fd.append('stepId', input.stepId)
            fd.append('category', input.category)
            fd.append('docType', input.docType)
            if (input.docNumber) fd.append('docNumber', input.docNumber)
            if (input.expiryDate) fd.append('expiryDate', input.expiryDate)
            return api.upload<{ data: unknown }>(`/onboarding/upload?t=${encodeURIComponent(token)}`, fd)
        },
    })
}
