import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface VisaParams { status?: string; urgencyLevel?: string; limit?: number; offset?: number }

function toQS(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
    return q.toString()
}

export function useVisas(params: VisaParams = {}) {
    return useQuery({
        queryKey: ['visa', params],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/visa?${toQS({ ...params, limit: params.limit ?? 20, offset: params.offset ?? 0 })}`),
    })
}

export function useCreateVisa() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/visa', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['visa'] }),
    })
}

export function useAdvanceVisaStep() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post(`/visa/${id}/advance`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['visa'] }),
    })
}

export function useCancelVisa() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
            api.post(`/visa/${id}/cancel`, { reason }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['visa'] }),
    })
}

export function useRecalcVisaUrgency() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.post<{ data: { updated: number } }>('/visa/recalc-urgency', {}).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['visa'] }),
    })
}
