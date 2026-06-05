import { useCallback, useState } from 'react'
import { useQuery, useMutation, useQueryClient, useInfiniteQuery, type InfiniteData } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { buildFilterQueryString, type AppliedFiltersMap } from '@/lib/filters'
import { toast } from '@/components/ui/overlays'
import type { Candidate, Job, RecommendedCandidate, RecommendedJob } from '@/types'
import type { RecruitmentStage } from '@/lib/recruitmentStages'
import type { ChipsFieldPagedSource } from '@/components/shared/ChipsField'

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

// ─── Paginated skill / qualification suggestions ──────────────────────────────
//
// Drives the job-dialog ChipsField type-ahead. Each page is a server fetch (10
// items by default) — the dropdown grows via useInfiniteQuery's fetchNextPage
// when the bottom of the list scrolls into view. The query string is folded
// into the queryKey so typing into the input refetches from offset=0.
//
// Why server-paginated (not client slice): the per-tenant catalog can grow
// large in long-running recruitment use, and the candidate / referral / public
// careers forms also read these — keeping the wire payload small avoids slow
// dialog opens on tenants with hundreds of tags.

export interface SuggestionsPage {
    data: string[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
}

const SUGGESTIONS_PAGE_SIZE = 10

function useSuggestionsInfinite(endpoint: 'skill-suggestions' | 'qualification-suggestions', q: string) {
    const query = q.trim()
    return useInfiniteQuery<SuggestionsPage, Error, InfiniteData<SuggestionsPage>, [string, string], number>({
        // Query key includes the trimmed query so distinct text inputs cache
        // independently. Empty string is the unfiltered (alphabetical) listing.
        queryKey: [endpoint, query],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams()
            if (query) qs.set('q', query)
            qs.set('limit', String(SUGGESTIONS_PAGE_SIZE))
            qs.set('offset', String(pageParam))
            return api.get<SuggestionsPage>(`/jobs/${endpoint}?${qs}`)
        },
        getNextPageParam: (last) => (last.hasMore ? last.offset + last.limit : undefined),
        // Keep cached pages warm but not forever — the catalog gets updated
        // whenever a job save lands, and useUpdateJob/useCreateJob invalidate.
        staleTime: 60_000,
    })
}

export function useSkillSuggestions(q: string = '') {
    return useSuggestionsInfinite('skill-suggestions', q)
}

export function useQualificationSuggestions(q: string = '') {
    return useSuggestionsInfinite('qualification-suggestions', q)
}

/**
 * One-stop ChipsField `paged` source for a suggestions endpoint. Owns the
 * debounce-target query state, the infinite query, and the load-more guard so
 * the job dialogs don't repeat the wiring per field (New/Edit × skills/quals
 * = 4 call sites). `onQueryChange`/`onLoadMore` are stable across renders so
 * ChipsField's debounce + IntersectionObserver effects don't churn.
 */
export function usePagedSuggestions(endpoint: 'skill-suggestions' | 'qualification-suggestions'): ChipsFieldPagedSource {
    const [query, setQuery] = useState('')
    const { data, hasNextPage, isLoading, isFetchingNextPage, fetchNextPage } = useSuggestionsInfinite(endpoint, query)
    const onLoadMore = useCallback(() => {
        if (!isFetchingNextPage) fetchNextPage()
    }, [isFetchingNextPage, fetchNextPage])
    return {
        items: data?.pages.flatMap((p) => p.data) ?? [],
        hasMore: !!hasNextPage,
        isLoading,
        isFetchingMore: isFetchingNextPage,
        onLoadMore,
        onQueryChange: setQuery,
    }
}

export function useCreateJob() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/jobs', data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['jobs'] })
            // New skills/qualifications may have been introduced — refresh the type-ahead vocabulary.
            qc.invalidateQueries({ queryKey: ['job-tag-suggestions'] })
            qc.invalidateQueries({ queryKey: ['skill-suggestions'] })
            qc.invalidateQueries({ queryKey: ['qualification-suggestions'] })
        },
    })
}

/**
 * AI-assisted talent-pool matching for a job — returns the candidates whose
 * skills/qualifications/location/industry best fit the posting. `capped` is
 * true when the engine only scored the most recent `scanned` candidates.
 */
export function useRecommendedCandidates(jobId: string, enabled = true) {
    return useQuery({
        queryKey: ['recommended-candidates', jobId],
        queryFn: () => api.get<{ data: RecommendedCandidate[]; capped: boolean; scanned: number }>(
            `/jobs/${jobId}/recommended-candidates?limit=10`,
        ),
        enabled: enabled && !!jobId,
        staleTime: 30_000,
    })
}

/**
 * AI-assisted job matching for a candidate/application — returns the open
 * roles that best fit the candidate. Unwraps the `{ data }` envelope so
 * consumers receive the typed array directly.
 */
export function useRecommendedJobs(applicationId: string, enabled = true) {
    return useQuery({
        queryKey: ['recommended-jobs', applicationId],
        queryFn: () => api.get<{ data: RecommendedJob[] }>(
            `/applications/${applicationId}/recommended-jobs?limit=10`,
        ).then((r) => r.data),
        enabled: enabled && !!applicationId,
        staleTime: 30_000,
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
            qc.invalidateQueries({ queryKey: ['skill-suggestions'] })
            qc.invalidateQueries({ queryKey: ['qualification-suggestions'] })
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

// ─── Recruitment tag catalog (skills / qualifications) ────────────────────────
// CRUD for the per-tenant skill & qualification catalogs managed in Org Settings.
// Mutations invalidate both the managed list and the job dialogs' tag suggestions
// so type-ahead stays in sync. `kind` is part of the query key so the two
// catalogs cache independently.

export type RecruitmentTagKind = 'skills' | 'qualifications'
export interface RecruitmentTag { id: string; name: string }
// Query key omits the q (parameterised below) so cache invalidations from
// create/update/delete invalidate every search-scoped page in one go.
const tagKey = (kind: RecruitmentTagKind) => ['recruitment-tags', kind] as const

export interface RecruitmentTagsPage {
    data: RecruitmentTag[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
}

const TAGS_PAGE_SIZE = 10

/**
 * Paginated, searchable catalog list for the Org Settings CRUD page. Driven by
 * `useInfiniteQuery` so the Tag Manager renders 10 rows initially and pulls
 * the next 10 each time the bottom sentinel scrolls into view. The trimmed
 * `q` is folded into the queryKey so typing into the search input refetches
 * cleanly from offset 0 without manual cache mutation.
 */
export function useRecruitmentTags(kind: RecruitmentTagKind, q: string = '') {
    const query = q.trim()
    return useInfiniteQuery<RecruitmentTagsPage, Error, InfiniteData<RecruitmentTagsPage>, readonly [string, RecruitmentTagKind, string], number>({
        queryKey: ['recruitment-tags', kind, query] as const,
        initialPageParam: 0,
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams()
            if (query) qs.set('q', query)
            qs.set('limit', String(TAGS_PAGE_SIZE))
            qs.set('offset', String(pageParam))
            return api.get<RecruitmentTagsPage>(`/recruitment-tags/${kind}?${qs}`)
        },
        getNextPageParam: (last) => (last.hasMore ? last.offset + last.limit : undefined),
        staleTime: 60_000,
    })
}

function useTagInvalidate(kind: RecruitmentTagKind) {
    const qc = useQueryClient()
    return () => {
        qc.invalidateQueries({ queryKey: tagKey(kind) })
        qc.invalidateQueries({ queryKey: ['job-tag-suggestions'] })
        qc.invalidateQueries({ queryKey: ['skill-suggestions'] })
        qc.invalidateQueries({ queryKey: ['qualification-suggestions'] })
    }
}

export function useCreateRecruitmentTag(kind: RecruitmentTagKind) {
    const invalidate = useTagInvalidate(kind)
    return useMutation({
        mutationFn: (name: string) => api.post<{ data: RecruitmentTag }>(`/recruitment-tags/${kind}`, { name }).then(r => r.data),
        onSuccess: invalidate,
        onError: (err: Error) => toast.error('Could not add', err.message),
    })
}

export function useUpdateRecruitmentTag(kind: RecruitmentTagKind) {
    const invalidate = useTagInvalidate(kind)
    return useMutation({
        mutationFn: ({ id, name }: { id: string; name: string }) =>
            api.patch<{ data: RecruitmentTag }>(`/recruitment-tags/${kind}/${id}`, { name }).then(r => r.data),
        onSuccess: invalidate,
        onError: (err: Error) => toast.error('Could not rename', err.message),
    })
}

export function useDeleteRecruitmentTag(kind: RecruitmentTagKind) {
    const invalidate = useTagInvalidate(kind)
    return useMutation({
        mutationFn: (id: string) => api.delete(`/recruitment-tags/${kind}/${id}`),
        onSuccess: invalidate,
        onError: (err: Error) => toast.error('Could not delete', err.message),
    })
}
