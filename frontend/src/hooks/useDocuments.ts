import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface DocParams { employeeId?: string; category?: string; status?: string; limit?: number; offset?: number }

function toQS(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
    return q.toString()
}

export function useDocuments(params: DocParams = {}) {
    return useQuery({
        queryKey: ['documents', params],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/documents?${toQS({ ...params, limit: params.limit ?? 20, offset: params.offset ?? 0 })}`),
    })
}

export function useExpiringDocuments(days = 90) {
    return useQuery({
        queryKey: ['documents', 'expiring', days],
        queryFn: () => api.get<{ data: unknown[] }>(`/documents/expiring?days=${days}`).then(r => r.data),
    })
}

export function useCreateDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/documents', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
    })
}

export function useVerifyDocument() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post(`/documents/${id}/verify`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }),
    })
}
