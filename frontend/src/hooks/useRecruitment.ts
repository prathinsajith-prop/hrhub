import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { buildFilterQueryString, type AppliedFiltersMap } from '@/lib/filters'
import { toast } from '@/components/ui/overlays'
import type { Candidate, Job } from '@/types'
import type { RecruitmentStage } from '@/lib/recruitmentStages'

interface JobParams { status?: string; department?: string; q?: string; filters?: AppliedFiltersMap; limit?: number; offset?: number }
interface AppParams { jobId?: string; stage?: string; q?: string; filters?: AppliedFiltersMap; limit?: number; offset?: number; enabled?: boolean }

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

export function useJob(id: string | undefined) {
    return useQuery({
        queryKey: ['job', id],
        // Unwrap the `{ data: ... }` envelope here so consumers get the Job
        // directly — consistent with every other detail hook.
        queryFn: () => api.get<{ data: Job }>(`/jobs/${id}`).then((r) => r.data),
        enabled: !!id,
    })
}

/**
 * Distinct skills + qualifications already used across the tenant's jobs —
 * powers the type-ahead suggestions in the job create/edit dialogs. Cached a
 * little longer than the default since the tag vocabulary changes slowly.
 */
export function useJobTagSuggestions() {
    return useQuery({
        queryKey: ['job-tag-suggestions'],
        queryFn: () => api.get<{ data: { skills: string[]; qualifications: string[] } }>('/jobs/tag-suggestions').then((r) => r.data),
        staleTime: 5 * 60_000,
    })
}

export function useCreateJob() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/jobs', data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['jobs'] })
            // New skills/qualifications may have been introduced — refresh the type-ahead vocabulary.
            qc.invalidateQueries({ queryKey: ['job-tag-suggestions'] })
        },
    })
}

export function useApplication(id: string | undefined) {
    return useQuery({
        queryKey: ['application', id],
        // The detail endpoint wraps the record in `{ data: ... }` — unwrap it
        // here so consumers receive the Candidate directly (the list endpoint
        // is unwrapped at the call site, this one wasn't).
        queryFn: () => api.get<{ data: Candidate }>(`/applications/${id}`),
        select: (res) => res.data,
        enabled: !!id,
    })
}

export function useApplications(params: AppParams = {}) {
    const { filters, q, enabled = true, ...rest } = params
    const qs = new URLSearchParams(toQS({ ...rest, limit: rest.limit ?? 20, offset: rest.offset ?? 0 }))
    if (q) qs.set('q', q)
    if (filters && Object.keys(filters).length > 0) {
        const filterStr = buildFilterQueryString(filters)
        if (filterStr) qs.set('filter', filterStr)
    }
    return useQuery({
        queryKey: ['applications', params],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/applications?${qs}`),
        enabled,
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
        onSuccess: (_res, { id }) => {
            qc.invalidateQueries({ queryKey: ['jobs'] })       // list view
            qc.invalidateQueries({ queryKey: ['job', id] })    // detail page
            qc.invalidateQueries({ queryKey: ['job-tag-suggestions'] }) // refresh tag vocabulary
        },
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

/** Attach a candidate photo (e.g. one auto-extracted from the résumé). */
export function useUploadCandidatePhoto() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async ({ id, photo }: { id: string; photo: Blob }) => {
            const fd = new FormData()
            fd.append('photo', photo, 'photo.jpg')
            return api.upload<{ data: { s3Key: string; downloadUrl: string } }>(`/applications/${id}/photo`, fd)
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['applications-kanban'] })
            qc.invalidateQueries({ queryKey: ['applications'] })
        },
    })
}

// ─── Bulk import (job listings) ──────────────────────────────────────────────
//
// Same shape as the bulk-asset hooks: a no-cache validate mutation
// for the preview step, and a create mutation that invalidates the
// jobs list on success.

export type BulkJobType = 'full_time' | 'part_time' | 'contract'
export type BulkJobStatus = 'draft' | 'open' | 'closed' | 'on_hold'

export interface BulkJobRowInput {
    rowNumber: number
    title?: string | null
    department?: string | null
    location?: string | null
    type?: string | null
    status?: string | null
    openings?: number | string | null
    minSalary?: number | string | null
    maxSalary?: number | string | null
    industry?: string | null
    closingDate?: string | null
}

export interface BulkJobRowResult {
    rowNumber: number
    ok: boolean
    errors: string[]
    resolved?: {
        title: string
        department: string | null
        location: string | null
        type: BulkJobType
        status: BulkJobStatus
        openings: number
        minSalary: string | null
        maxSalary: string | null
        industry: string | null
        closingDate: string | null
    }
}

export interface BulkJobValidationResponse {
    rows: BulkJobRowResult[]
    summary: { total: number; valid: number; invalid: number }
}

export interface BulkJobCreateResponse extends BulkJobValidationResponse {
    created: number
    skipped: number
}

export function useValidateBulkJobs() {
    return useMutation({
        mutationFn: (rows: BulkJobRowInput[]) =>
            api.post<BulkJobValidationResponse>('/jobs/bulk-validate', { rows }),
    })
}

export function useBulkCreateJobs() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (rows: BulkJobRowInput[]) =>
            api.post<BulkJobCreateResponse>('/jobs/bulk', { rows }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
        onError: (err: Error) => toast.error('Bulk import failed', err.message),
    })
}

// ─── Bulk import (candidates / job applications) ─────────────────────────────

export interface BulkCandidateRowInput {
    rowNumber: number
    firstName?: string | null
    lastName?: string | null
    name?: string | null
    email?: string | null
    phone?: string | null
    nationality?: string | null
    experience?: number | string | null
    expectedSalary?: number | string | null
    notes?: string | null
}

export interface BulkCandidateRowResult {
    rowNumber: number
    ok: boolean
    errors: string[]
    duplicate?: boolean
    displayName?: string
    displayEmail?: string
    resolved?: {
        name: string
        email: string
        phone: string | null
        nationality: string | null
        experience: number | null
        expectedSalary: string | null
        notes: string | null
    }
}

export interface BulkCandidateValidationResponse {
    rows: BulkCandidateRowResult[]
    summary: { total: number; valid: number; invalid: number; duplicate: number }
    jobExists: boolean
}

export interface BulkCandidateCreateResponse extends BulkCandidateValidationResponse {
    created: number
    skipped: number
}

export function useValidateBulkCandidates() {
    return useMutation({
        mutationFn: ({ jobId, rows }: { jobId: string; rows: BulkCandidateRowInput[] }) =>
            api.post<BulkCandidateValidationResponse>('/applications/bulk-validate', { jobId, rows }),
    })
}

export function useBulkCreateCandidates() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ jobId, rows }: { jobId: string; rows: BulkCandidateRowInput[] }) =>
            api.post<BulkCandidateCreateResponse>('/applications/bulk', { jobId, rows }),
        // Invalidate every applications query (the kanban uses an infinite
        // query per stage; broad invalidation refreshes them all). Also
        // bump jobs since the application-count badge can change.
        onSuccess: () => Promise.all([
            qc.invalidateQueries({ queryKey: ['applications'] }),
            qc.invalidateQueries({ queryKey: ['applications-kanban'] }),
            qc.invalidateQueries({ queryKey: ['jobs'] }),
        ]),
        onError: (err: Error) => toast.error('Bulk import failed', err.message),
    })
}

/* ─── Recruitment pipeline stages (per-tenant settings) ───────────────────── */

const STAGES_KEY = ['recruitment-stages'] as const

export function useRecruitmentStages() {
    return useQuery({
        queryKey: STAGES_KEY,
        queryFn: () => api.get<{ data: RecruitmentStage[] }>('/stages').then(r => r.data),
        // Stages change rarely; cache for 5 minutes to avoid refetching across
        // every recruitment page navigation.
        staleTime: 5 * 60_000,
    })
}

export function useCreateRecruitmentStage() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { label: string; colorKey?: string; isTerminal?: boolean }) =>
            api.post<{ data: RecruitmentStage }>('/stages', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: STAGES_KEY }),
        onError: (err: Error) => toast.error('Failed to add stage', err.message),
    })
}

export function useUpdateRecruitmentStage() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ stageId, ...data }: { stageId: string; label?: string; colorKey?: string; isFirst?: boolean; isFinal?: boolean; showInKanban?: boolean }) =>
            api.patch<{ data: RecruitmentStage }>(`/stages/${stageId}`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: STAGES_KEY }),
        onError: (err: Error) => toast.error('Failed to update stage', err.message),
    })
}

export function useDeleteRecruitmentStage() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (stageId: string) => api.delete(`/stages/${stageId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: STAGES_KEY }),
        // Suppress the generic toast - the settings tab handles the
        // candidate-still-on-stage case with its own clearer message.
        onError: () => { },
    })
}

export function useReorderRecruitmentStages() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (orderedIds: string[]) =>
            api.post<{ data: RecruitmentStage[] }>('/stages/reorder', { orderedIds }).then(r => r.data),
        onSuccess: (data) => qc.setQueryData(STAGES_KEY, data),
        onError: (err: Error) => toast.error('Failed to reorder stages', err.message),
    })
}

export function useResetRecruitmentStages() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () =>
            api.post<{ data: RecruitmentStage[] }>('/stages/reset').then(r => r.data),
        onSuccess: (data) => qc.setQueryData(STAGES_KEY, data),
        onError: (err: Error) => toast.error('Failed to reset stages', err.message),
    })
}
