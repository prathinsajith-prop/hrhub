import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

interface VisaParams { status?: string; urgencyLevel?: string; limit?: number; offset?: number }

function toQS(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
    return q.toString()
}

export function useVisas(params: VisaParams = {}) {
    const { status, urgencyLevel, limit = 20, offset = 0 } = params
    return useQuery({
        queryKey: ['visa', status, urgencyLevel, limit, offset],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/visa?${toQS({ status, urgencyLevel, limit, offset })}`),
        staleTime: 30_000,
    })
}

export function useCreateVisa() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/visa', data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['visa'] })
            qc.invalidateQueries({ queryKey: ['dashboard'] })
        },
        onError: (err: Error) => toast.error('Failed to create visa application', err?.message ?? 'Please try again.'),
    })
}

export function useAdvanceVisaStep() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post(`/visa/${id}/advance`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['visa'] }),
        onError: (err: Error) => toast.error('Step advance failed', err?.message ?? 'Could not advance the visa step.'),
    })
}

export function useCancelVisa() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
            api.post(`/visa/${id}/cancel`, { reason }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['visa'] })
            qc.invalidateQueries({ queryKey: ['dashboard'] })
        },
        onError: (err: Error) => toast.error('Cancellation failed', err?.message ?? 'Could not cancel the visa application.'),
    })
}

export function useRecalcVisaUrgency() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.post<{ data: { updated: number } }>('/visa/recalc-urgency', {}).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['visa'] }),
        onError: () => toast.error('Recalculation failed', 'Could not recalculate visa urgency.'),
    })
}

export function useUpdateVisa() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
            api.patch<{ data: unknown }>(`/visa/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['visa'] }),
        onError: (err: Error) => toast.error('Update failed', err?.message ?? 'Could not update the visa application.'),
    })
}
