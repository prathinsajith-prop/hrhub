import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

export interface Complaint {
    id: string
    title: string
    category: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    confidentiality: 'anonymous' | 'named' | 'confidential'
    status: 'draft' | 'submitted' | 'under_review' | 'escalated' | 'resolved'
    submittedByName: string | null
    subjectName: string | null
    assigneeName: string | null
    description: string
    resolutionNotes: string | null
    slaDueAt: string | null
    acknowledgedAt: string | null
    resolvedAt: string | null
    createdAt: string
}

export interface ComplaintStats {
    total: number
    open: number
    critical: number
    overdue: number
}

interface ListParams {
    search?: string
    status?: string
    severity?: string
    limit?: number
    offset?: number
}

function toQS(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && String(v) !== '' && q.set(k, String(v)))
    return q.toString()
}

export function useComplaintStats() {
    return useQuery({
        queryKey: ['complaints', 'stats'],
        queryFn: () => api.get<{ data: ComplaintStats }>('/complaints/stats').then(r => r.data),
        staleTime: 30_000,
    })
}

export function useComplaints(params: ListParams = {}) {
    const { search, status, severity, limit = 50, offset = 0 } = params
    return useQuery({
        queryKey: ['complaints', { search, status, severity, limit, offset }],
        queryFn: () => api.get<{ data: Complaint[] }>(`/complaints?${toQS({ search, status, severity, limit, offset })}`).then(r => r.data ?? []),
        staleTime: 30_000,
    })
}

export function useAcknowledgeComplaint() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post(`/complaints/${id}/acknowledge`, {}),
        onSuccess: () => {
            toast.success('Complaint acknowledged')
            qc.invalidateQueries({ queryKey: ['complaints'] })
        },
        onError: (err: Error) => toast.error('Failed to acknowledge', err?.message),
    })
}

export function useEscalateComplaint() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post(`/complaints/${id}/escalate`, {}),
        onSuccess: () => {
            toast.success('Complaint escalated')
            qc.invalidateQueries({ queryKey: ['complaints'] })
        },
        onError: (err: Error) => toast.error('Failed to escalate', err?.message),
    })
}

export function useResolveComplaint() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, resolutionNotes }: { id: string; resolutionNotes: string }) =>
            api.post(`/complaints/${id}/resolve`, { resolutionNotes }),
        onSuccess: () => {
            toast.success('Complaint resolved')
            qc.invalidateQueries({ queryKey: ['complaints'] })
        },
        onError: (err: Error) => toast.error('Failed to resolve', err?.message),
    })
}

export function useCreateComplaint() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: { title: string; description: string; category: string; severity: string; confidentiality: string }) =>
            api.post('/complaints', body),
        onSuccess: () => {
            toast.success('Complaint submitted')
            qc.invalidateQueries({ queryKey: ['complaints'] })
        },
        onError: (err: Error) => toast.error('Failed to submit complaint', err?.message),
    })
}
