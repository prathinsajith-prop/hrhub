import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface JobParams { status?: string; department?: string; limit?: number; offset?: number }
interface AppParams { jobId?: string; stage?: string; limit?: number; offset?: number }

function toQS(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
    return q.toString()
}

export function useJobs(params: JobParams = {}) {
    return useQuery({
        queryKey: ['jobs', params],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/jobs?${toQS({ ...params, limit: params.limit ?? 20, offset: params.offset ?? 0 })}`),
    })
}

export function useCreateJob() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/jobs', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
    })
}

export function useApplications(params: AppParams = {}) {
    return useQuery({
        queryKey: ['applications', params],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/applications?${toQS({ ...params, limit: params.limit ?? 20, offset: params.offset ?? 0 })}`),
    })
}

export function useUpdateApplicationStage() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, stage }: { id: string; stage: string }) => api.patch(`/applications/${id}/stage`, { stage }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
    })
}

export function useUpdateJob() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/jobs/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
    })
}
