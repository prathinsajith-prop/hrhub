import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface GradeLevel {
    id: string
    tenantId: string
    name: string
    isActive: boolean
    sortOrder: number
    createdAt: string
}

export function useGradeLevels() {
    return useQuery({
        queryKey: ['grade-levels'],
        queryFn: () => api.get<{ data: GradeLevel[] }>('/grade-levels').then(r => r.data ?? []),
        staleTime: 60_000,
    })
}

export function useCreateGradeLevel() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { name: string; sortOrder?: number }) =>
            api.post<{ data: GradeLevel }>('/grade-levels', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['grade-levels'] }),
    })
}

export function useUpdateGradeLevel() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: { name?: string; isActive?: boolean; sortOrder?: number } }) =>
            api.patch<{ data: GradeLevel }>(`/grade-levels/${id}`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['grade-levels'] }),
    })
}

export function useDeleteGradeLevel() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/grade-levels/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['grade-levels'] }),
    })
}
