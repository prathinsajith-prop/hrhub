import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useOnboardingChecklists() {
    return useQuery({
        queryKey: ['onboarding'],
        queryFn: () => api.get<{ data: unknown[] }>('/onboarding').then(r => r.data),
    })
}

export function useEmployeeChecklist(employeeId: string) {
    return useQuery({
        queryKey: ['onboarding', employeeId],
        queryFn: () => api.get<{ data: unknown }>(`/onboarding/employee/${employeeId}`).then(r => r.data),
        enabled: !!employeeId,
    })
}

export function useUpdateOnboardingStep() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ checklistId, stepId, data }: { checklistId: string; stepId: string; data: unknown }) =>
            api.patch(`/onboarding/${checklistId}/steps/${stepId}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
    })
}
