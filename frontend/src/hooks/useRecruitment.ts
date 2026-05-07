import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { buildFilterQueryString, type AppliedFiltersMap } from '@/lib/filters'
import type { Candidate } from '@/types'

interface JobParams { status?: string; department?: string; q?: string; filters?: AppliedFiltersMap; limit?: number; offset?: number }
interface AppParams { jobId?: string; stage?: string; q?: string; filters?: AppliedFiltersMap; limit?: number; offset?: number }

interface KanbanPage { data: Candidate[]; total: number; hasMore: boolean; limit: number; offset: number }

export const KANBAN_PAGE_SIZE = 20

function toQS(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
    return q.toString()
}

export function useJobs(params: JobParams = {}) {
    const { filters, q, ...rest } = params
    const qs = new URLSearchParams(toQS({ ...rest, limit: rest.limit ?? 20, offset: rest.offset ?? 0 }))
    if (q) qs.set('q', q)
    if (filters && Object.keys(filters).length > 0) {
        const filterStr = buildFilterQueryString(filters)
        if (filterStr) qs.set('filter', filterStr)
    }
    return useQuery({
        queryKey: ['jobs', params],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/jobs?${qs}`),
    })
}

export function useCreateJob() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/jobs', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
    })
}

export function useApplication(id: string | undefined) {
    return useQuery({
        queryKey: ['application', id],
        queryFn: () => api.get<unknown>(`/applications/${id}`),
        enabled: !!id,
    })
}

export function useApplications(params: AppParams = {}) {
    const { filters, q, ...rest } = params
    const qs = new URLSearchParams(toQS({ ...rest, limit: rest.limit ?? 20, offset: rest.offset ?? 0 }))
    if (q) qs.set('q', q)
    if (filters && Object.keys(filters).length > 0) {
        const filterStr = buildFilterQueryString(filters)
        if (filterStr) qs.set('filter', filterStr)
    }
    return useQuery({
        queryKey: ['applications', params],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/applications?${qs}`),
    })
}

// Per-stage infinite query powering the kanban columns.
// Each column independently fetches and pages its own candidates.
export function useKanbanStage(stageId: string, params: { q?: string; filter?: string; jobId?: string } = {}) {
    const { q, filter, jobId } = params
    return useInfiniteQuery<KanbanPage, Error, InfiniteData<KanbanPage>, readonly ['applications-kanban', string, string | undefined, string | undefined, string | undefined], number>({
        queryKey: ['applications-kanban', stageId, q, filter, jobId],
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams({ stage: stageId, limit: String(KANBAN_PAGE_SIZE), offset: String(pageParam) })
            if (q) qs.set('q', q)
            if (filter) qs.set('filter', filter)
            if (jobId) qs.set('jobId', jobId)
            return api.get<KanbanPage>(`/applications?${qs}`)
        },
        initialPageParam: 0,
        getNextPageParam: (last) => last.hasMore ? last.offset + last.limit : undefined,
        staleTime: 30_000,
    })
}

export function useUpdateApplicationStage() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, stage }: { id: string; stage: string; fromStage?: string; candidate?: Candidate }) =>
            api.patch(`/applications/${id}/stage`, { stage }),

        onMutate: async ({ id, stage: toStage, fromStage, candidate }) => {
            const snapshots: { key: readonly unknown[]; data: unknown }[] = []

            if (fromStage) {
                await qc.cancelQueries({ queryKey: ['applications-kanban', fromStage] })
                // getQueriesData uses prefix/filter matching so it correctly finds the 5-element keys
                const fromEntries = qc.getQueriesData<InfiniteData<KanbanPage>>({ queryKey: ['applications-kanban', fromStage] })
                for (const [key, data] of fromEntries) {
                    if (!data) continue
                    snapshots.push({ key, data })
                    qc.setQueryData<InfiniteData<KanbanPage>>(key, {
                        ...data,
                        pages: data.pages.map((page, i) => ({
                            ...page,
                            data: page.data.filter((c) => c.id !== id),
                            total: i === 0 ? Math.max(0, page.total - 1) : page.total,
                        })),
                    })
                }
            }

            await qc.cancelQueries({ queryKey: ['applications-kanban', toStage] })
            const toEntries = qc.getQueriesData<InfiniteData<KanbanPage>>({ queryKey: ['applications-kanban', toStage] })
            for (const [key, data] of toEntries) {
                if (!data) continue
                snapshots.push({ key, data })
                if (candidate) {
                    qc.setQueryData<InfiniteData<KanbanPage>>(key, {
                        ...data,
                        pages: data.pages.map((page, i) => ({
                            ...page,
                            data: i === 0 ? [{ ...candidate, stage: toStage as Candidate['stage'] }, ...page.data] : page.data,
                            total: i === 0 ? page.total + 1 : page.total,
                        })),
                    })
                }
            }

            return { snapshots }
        },

        onError: (_err, { fromStage, stage: toStage }, ctx) => {
            if (ctx?.snapshots) {
                for (const snap of ctx.snapshots) {
                    qc.setQueryData(snap.key as readonly unknown[], snap.data)
                }
            }
            qc.invalidateQueries({ queryKey: ['applications-kanban', fromStage] })
            qc.invalidateQueries({ queryKey: ['applications-kanban', toStage] })
        },

        // Sync with server after a move so the column counts stay accurate.
        onSuccess: (_data, { fromStage, stage: toStage }) => {
            qc.invalidateQueries({ queryKey: ['applications-kanban', fromStage] })
            qc.invalidateQueries({ queryKey: ['applications-kanban', toStage] })
        },
    })
}

export function useCreateApplication() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ jobId, data }: { jobId: string; data: Record<string, unknown> }) =>
            api.post(`/jobs/${jobId}/applications`, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['applications-kanban', 'received'] })
            qc.invalidateQueries({ queryKey: ['applications'] })
        },
    })
}

export function useUpdateApplication() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
            api.patch(`/applications/${id}`, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['applications-kanban'] })
            qc.invalidateQueries({ queryKey: ['applications'] })
        },
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
            qc.invalidateQueries({ queryKey: ['applications-kanban'] })
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

export function useUploadResume() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, file }: { id: string; file: File }) => {
            const fd = new FormData()
            fd.append('resume', file)
            return api.upload<{ data: { s3Key: string; downloadUrl: string } }>(`/applications/${id}/resume`, fd)
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['applications-kanban'] })
            qc.invalidateQueries({ queryKey: ['applications'] })
        },
    })
}
