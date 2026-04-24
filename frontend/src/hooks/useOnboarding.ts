import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

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
    id: string
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
