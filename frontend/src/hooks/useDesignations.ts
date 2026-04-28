import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

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

export function useCreateDesignation() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { name: string; sortOrder?: number }) =>
            api.post<{ data: Designation }>('/designations', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['designations'] }),
    })
}

export function useUpdateDesignation() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: { name?: string; isActive?: boolean; sortOrder?: number } }) =>
            api.patch<{ data: Designation }>(`/designations/${id}`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['designations'] }),
    })
}

export function useDeleteDesignation() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/designations/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['designations'] }),
    })
}
