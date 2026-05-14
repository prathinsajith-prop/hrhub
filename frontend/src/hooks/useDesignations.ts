import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

export interface Designation {
    id: string
    tenantId: string
    name: string
    isActive: boolean
    sortOrder: number
    createdAt: string
}

export function useDesignations() {
    return useQuery({
        queryKey: ['designations'],
        queryFn: () => api.get<{ data: Designation[] }>('/designations').then(r => r.data ?? []),
        staleTime: 5 * 60_000,
    })
}

/**
 * Active designations as `{ value, label }` pairs for the Combobox / Select
 * primitives. Used by the Add/Edit Employee dialogs, the Convert-to-Employee
 * flow, the Transfer dialog, etc. — collapses the duplicated filter+map idiom.
 */
export function useDesignationOptions() {
    const { data = [] } = useDesignations()
    const list = Array.isArray(data) ? data : []
    return list
        .filter((d) => d.isActive)
        .map((d) => ({ value: d.name, label: d.name }))
}

export function useCreateDesignation() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { name: string; sortOrder?: number }) =>
            api.post<{ data: Designation }>('/designations', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['designations'] }),
        onError: (err: Error) => toast.error('Failed to create designation', err.message),
    })
}

export function useUpdateDesignation() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: { name?: string; isActive?: boolean; sortOrder?: number } }) =>
            api.patch<{ data: Designation }>(`/designations/${id}`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['designations'] }),
        onError: (err: Error) => toast.error('Failed to update designation', err.message),
    })
}

export function useDeleteDesignation() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/designations/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['designations'] }),
        onError: (err: Error) => toast.error('Failed to delete designation', err.message),
    })
}
