import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

interface VisaParams { status?: string; urgencyLevel?: string; from?: string; to?: string; limit?: number; offset?: number }

function toQS(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
    return q.toString()
}

export function useVisas(params: VisaParams = {}) {
    const { status, urgencyLevel, from, to, limit = 20, offset = 0 } = params
    return useQuery({
        queryKey: ['visa', status, urgencyLevel, from, to, limit, offset],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/visa?${toQS({ status, urgencyLevel, from, to, limit, offset })}`),
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

export interface AdvanceWithCostsInput {
    id: string
    notes?: string
    costs: Array<{
        employeeId: string
        category: 'govt_fee' | 'medical' | 'typing' | 'translation' | 'other'
        description?: string
        amount: number
        currency?: string
        paidDate: string
        receiptRef?: string
    }>
}

export interface AdvanceWithCostsResponse {
    data: unknown
    transition: {
        advanced: boolean
        fromStep: number
        toStep: number
        fromStepLabel: string
        toStepLabel: string
        historyId: string | null
    }
    costs: Array<{ id: string; amount: string; category: string; stepLabel: string | null }>
}

/**
 * Atomic stage-advance with optional cost capture. Replaces the legacy
 * "POST /costs N times then POST /advance" sequence with a single round-trip
 * that writes a `visa_step_history` row and an audit-log entry per cost +
 * one for the transition itself.
 */
export function useAdvanceVisaWithCosts() {
    const qc = useQueryClient()
    return useMutation<AdvanceWithCostsResponse, Error, AdvanceWithCostsInput>({
        mutationFn: ({ id, notes, costs }) =>
            api.post<AdvanceWithCostsResponse>(`/visa/${id}/advance`, { notes, costs }),
        onSuccess: (_, variables) => {
            qc.invalidateQueries({ queryKey: ['visa'] })
            qc.invalidateQueries({ queryKey: ['visa', variables.id, 'costs'] })
            qc.invalidateQueries({ queryKey: ['visa', variables.id, 'history'] })
            qc.invalidateQueries({ queryKey: ['reports', 'pro-costs'] })
            qc.invalidateQueries({ queryKey: ['dashboard'] })
        },
        onError: (err) => toast.error('Advance failed', err?.message ?? 'Could not advance the visa step.'),
    })
}

export interface VisaStepHistoryItem {
    id: string
    visaApplicationId: string
    fromStep: number
    toStep: number
    fromStepLabel: string
    toStepLabel: string | null
    fromStatus: string
    toStatus: string
    costsTotal: string
    costsCount: number
    notes: string | null
    advancedBy: string | null
    advancedByName: string | null
    advancedByRole: string | null
    createdAt: string
}

export function useVisaHistory(visaId: string) {
    return useQuery({
        queryKey: ['visa', visaId, 'history'],
        queryFn: () =>
            api.get<{ data: VisaStepHistoryItem[] }>(`/visa/${visaId}/history`).then(r => r.data),
        enabled: !!visaId,
        staleTime: 30_000,
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
