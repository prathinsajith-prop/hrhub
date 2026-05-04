import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface EmployeeWarning {
    id: string
    employeeId: string
    issueDate: string
    expiryDate: string | null
    reason: string | null
    documentS3Key: string | null
    documentFileName: string | null
    createdByName: string | null
    createdAt: string
}

export function useEmployeeWarnings(employeeId: string) {
    return useQuery({
        queryKey: ['employee-warnings', employeeId],
        queryFn: () => api.get<{ data: EmployeeWarning[] }>(`/employees/${employeeId}/warnings`).then(r => r.data),
        enabled: !!employeeId,
        staleTime: 30_000,
    })
}

export function useCreateEmployeeWarning(employeeId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (formData: FormData) =>
            api.upload<{ data: EmployeeWarning }>(`/employees/${employeeId}/warnings`, formData).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-warnings', employeeId] }),
    })
}

export function useDeleteEmployeeWarning(employeeId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (warningId: string) => api.delete(`/employees/${employeeId}/warnings/${warningId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['employee-warnings', employeeId] }),
    })
}

export function useWarningDocumentUrl(employeeId: string) {
    return useMutation({
        mutationFn: (warningId: string) =>
            api.get<{ url: string; fileName: string }>(`/employees/${employeeId}/warnings/${warningId}/download`),
    })
}
