import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

export interface SponsoringEntity {
    id: string
    tenantId: string
    name: string
    isActive: boolean
    sortOrder: number
    createdAt: string
}

export function useSponsoringEntities() {
    return useQuery({
        queryKey: ['sponsoring-entities'],
        queryFn: () => api.get<{ data: SponsoringEntity[] }>('/sponsoring-entities').then(r => r.data ?? []),
        staleTime: 60_000,
    })
}

export function useCreateSponsoringEntity() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { name: string; sortOrder?: number }) =>
            api.post<{ data: SponsoringEntity }>('/sponsoring-entities', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsoring-entities'] }),
        onError: (err: Error) => toast.error('Failed to create sponsoring entity', err.message),
    })
}

export function useUpdateSponsoringEntity() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: { name?: string; isActive?: boolean; sortOrder?: number } }) =>
            api.patch<{ data: SponsoringEntity }>(`/sponsoring-entities/${id}`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsoring-entities'] }),
        onError: (err: Error) => toast.error('Failed to update sponsoring entity', err.message),
    })
}

export function useDeleteSponsoringEntity() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/sponsoring-entities/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['sponsoring-entities'] }),
        onError: (err: Error) => toast.error('Failed to delete sponsoring entity', err.message),
    })
}
