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
        // Optimistic update: patch the cached applications list immediately so the
        // kanban column rerenders without waiting for the server round trip.
        onMutate: async ({ id, stage }) => {
            await qc.cancelQueries({ queryKey: ['applications'] })
            const snapshots: { key: unknown; data: unknown }[] = []
            const queries = qc.getQueriesData<{ data: Array<Record<string, unknown>>; total: number }>({ queryKey: ['applications'] })
            for (const [key, data] of queries) {
                if (!data?.data) continue
                snapshots.push({ key, data })
                qc.setQueryData(key, {
                    ...data,
                    data: data.data.map((row) => (row.id === id ? { ...row, stage } : row)),
                })
            }
            return { snapshots }
        },
        onError: (_err, _vars, ctx) => {
            // Roll back on failure and refetch authoritative state.
            if (ctx?.snapshots) {
                for (const snap of ctx.snapshots) {
                    qc.setQueryData(snap.key as readonly unknown[], snap.data)
                }
            }
            qc.invalidateQueries({ queryKey: ['applications'] })
        },
        // Note: we deliberately do NOT invalidate on success. The optimistic
        // patch already reflects the truth, and a refetch would cause an
        // extra network round trip plus a re-render flash on every drop.
    })
}

export function useCreateApplication() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ jobId, data }: { jobId: string; data: Record<string, unknown> }) =>
            api.post(`/jobs/${jobId}/applications`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
    })
}

export function useUpdateApplication() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
            api.patch(`/applications/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['applications'] }),
    })
}

export function useConvertCandidateToEmployee() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data?: Record<string, unknown> }) =>
            api.post<{ data: { employee: { id: string; employeeNo: string }; application: unknown } }>(
                `/applications/${id}/convert-to-employee`,
                data ?? {},
            ),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['applications'] })
            qc.invalidateQueries({ queryKey: ['employees'] })
        },
    })
}

export function useUpdateJob() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/jobs/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
    })
}
