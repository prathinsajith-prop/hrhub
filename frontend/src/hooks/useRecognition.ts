import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

// ── Types ─────────────────────────────────────────────────────────────────────
export type RecognitionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'published' | 'archived'
export type Visibility = 'public' | 'team' | 'department' | 'branch' | 'manager' | 'hr' | 'private'
export type NominationType = 'peer' | 'manager' | 'leadership' | 'self_nomination' | 'employee_of_month'
export type ReactionType = 'like' | 'celebrate' | 'love' | 'support' | 'congrats'
export type BadgeLevel = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface RecognitionCategory {
    id: string
    key: string
    label: string
    description?: string | null
    icon: string
    color: string
    isDefault: boolean
    isArchived: boolean
    sortOrder: number
    createdAt: string
    updatedAt: string
}

export interface RecognitionBadge {
    id: string
    key: string
    label: string
    description?: string | null
    icon: string
    color: string
    level: BadgeLevel
    categoryKey?: string | null
    defaultPoints: number
    isArchived: boolean
    sortOrder: number
    createdAt: string
    updatedAt: string
}

export interface RecognitionRecipientLite {
    employeeId: string
    name: string
    isPrimary: boolean
    pointsAwarded: number
    avatarUrl?: string | null
    designation?: string | null
}

export interface RecognitionTeamLite { teamId: string; name: string }
export interface RecognitionDeptLite { orgUnitId: string; name: string }

export interface ReactionCounts {
    like: number
    celebrate: number
    love: number
    support: number
    congrats: number
    total: number
}

export interface Recognition {
    id: string
    tenantId: string
    giverUserId?: string | null
    giverEmployeeId?: string | null
    giverName?: string | null
    categoryKey: string
    badgeKey?: string | null
    title: string
    message: string
    achievementDate?: string | null
    visibility: Visibility
    visibilityScopeId?: string | null
    nominationType: NominationType
    points: number
    attachments: Array<{ name: string; s3Key: string; size?: number; mime?: string }>
    status: RecognitionStatus
    workflowState?: string | null
    commentsDisabled: boolean
    isPinned: boolean
    submittedAt?: string | null
    publishedAt?: string | null
    approvedAt?: string | null
    rejectedAt?: string | null
    rejectionReason?: string | null
    createdAt: string
    updatedAt: string
    // Joined on detail:
    recipients?: RecognitionRecipientLite[]
    teams?: RecognitionTeamLite[]
    departments?: RecognitionDeptLite[]
    reactionCounts?: ReactionCounts
    commentCount?: number
    myReaction?: ReactionType | null
    category?: RecognitionCategory
    badge?: RecognitionBadge
}

export interface RecognitionInput {
    categoryKey: string
    badgeKey?: string | null
    title: string
    message: string
    achievementDate?: string | null
    visibility?: Visibility
    visibilityScopeId?: string | null
    nominationType?: NominationType
    points?: number
    attachments?: Recognition['attachments']
    commentsDisabled?: boolean
    recipientEmployeeIds: string[]
    teamIds?: string[]
    orgUnitIds?: string[]
}

export interface RecognitionComment {
    id: string
    recognitionId: string
    parentId?: string | null
    userId?: string | null
    authorName?: string | null
    body: string
    editedAt?: string | null
    deletedAt?: string | null
    createdAt: string
    replies?: RecognitionComment[]
}

export interface PointsBalance {
    earned: number
    given: number
    redeemed: number
    available: number
}

export interface PointsEntry {
    id: string
    points: number
    type: string
    description?: string | null
    balanceAfter?: number | null
    createdAt: string
    recognitionId?: string | null
}

export interface AnalyticsSummary {
    totalRecognitions: number
    totalRecipients: number
    totalGivers: number
    avgPerEmployee: number
    byCategory: Array<{ key: string; label: string; color: string; count: number }>
    byDepartment: Array<{ orgUnitId: string; name: string; count: number }>
    byMonth: Array<{ month: string; count: number }>
}

export interface LeaderboardEntry {
    employeeId: string
    name: string
    department?: string | null
    designation?: string | null
    avatarUrl?: string | null
    count: number
    points: number
}

export interface EmployeeRecognitionProfile {
    received: Recognition[]
    given: Recognition[]
    stats: {
        receivedCount: number
        givenCount: number
        badgesEarned: number
        topCategories: Array<{ key: string; label: string; count: number }>
    }
}

export interface ListParams {
    status?: RecognitionStatus | string
    category?: string
    visibility?: Visibility | string
    q?: string
    dateFrom?: string
    dateTo?: string
    recipientId?: string
    giverId?: string
    limit?: number
}

interface Paginated<T> { data: T[]; total: number; limit: number; offset: number; hasMore: boolean }

const BASE = '/recognition'

// ── Feed / list / detail ──────────────────────────────────────────────────────
export function useRecognitionFeed(params: { limit?: number } = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const limit = params.limit ?? 20
    return useInfiniteQuery({
        queryKey: ['recognition-feed', tenantId, limit],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams()
            qs.set('limit', String(limit))
            qs.set('offset', String(pageParam))
            return api.get<Paginated<Recognition>>(`${BASE}/feed?${qs}`)
        },
        getNextPageParam: (last, all) => (last && last.hasMore ? all.reduce((s, p) => s + p.data.length, 0) : undefined),
        enabled: !!tenantId,
    })
}

export function useRecognitionList(params: ListParams = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const limit = params.limit ?? 20
    return useInfiniteQuery({
        queryKey: [
            'recognition-list', tenantId,
            params.status, params.category, params.visibility, params.q,
            params.dateFrom, params.dateTo, params.recipientId, params.giverId, limit,
        ],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams()
            if (params.status) qs.set('status', params.status)
            if (params.category) qs.set('category', params.category)
            if (params.visibility) qs.set('visibility', params.visibility)
            if (params.q) qs.set('q', params.q)
            if (params.dateFrom) qs.set('dateFrom', params.dateFrom)
            if (params.dateTo) qs.set('dateTo', params.dateTo)
            if (params.recipientId) qs.set('recipientId', params.recipientId)
            if (params.giverId) qs.set('giverId', params.giverId)
            qs.set('limit', String(limit))
            qs.set('offset', String(pageParam))
            return api.get<Paginated<Recognition>>(`${BASE}?${qs}`)
        },
        getNextPageParam: (last, all) => (last && last.hasMore ? all.reduce((s, p) => s + p.data.length, 0) : undefined),
        enabled: !!tenantId,
    })
}

export function useRecognition(id?: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['recognition', tenantId, id],
        queryFn: () => api.get<{ data: Recognition }>(`${BASE}/${id}`).then(r => r.data),
        enabled: !!tenantId && !!id,
    })
}

export function useTrendingRecognitions() {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['recognition-trending', tenantId],
        queryFn: () => api.get<{ data: Recognition[] }>(`${BASE}/trending`).then(r => r.data),
        enabled: !!tenantId,
    })
}

export function usePendingApprovals(params: { limit?: number } = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const limit = params.limit ?? 20
    return useInfiniteQuery({
        queryKey: ['recognition-pending', tenantId, limit],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams()
            qs.set('limit', String(limit))
            qs.set('offset', String(pageParam))
            // Use the role-scoped endpoint: HR sees all pending; managers see
            // only rows where they manage a recipient. The generic /recognition
            // list endpoint isn't approver-scoped and would mix in unrelated rows.
            return api.get<Paginated<Recognition>>(`${BASE}/approvals/pending?${qs}`)
        },
        getNextPageParam: (last, all) => (last && last.hasMore ? all.reduce((s, p) => s + p.data.length, 0) : undefined),
        enabled: !!tenantId,
    })
}

// ── Recognition mutations ─────────────────────────────────────────────────────
export function useCreateRecognition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: RecognitionInput) =>
            api.post<{ data: Recognition }>(BASE, input).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-list'] })
            qc.invalidateQueries({ queryKey: ['recognition-feed'] })
            qc.invalidateQueries({ queryKey: ['recognition-pending'] })
            qc.invalidateQueries({ queryKey: ['recognition-trending'] })
        },
    })
}

export function useUpdateRecognition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: Partial<RecognitionInput> }) =>
            api.patch<{ data: Recognition }>(`${BASE}/${id}`, patch).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-list'] })
            qc.invalidateQueries({ queryKey: ['recognition-feed'] })
            qc.invalidateQueries({ queryKey: ['recognition'] })
        },
    })
}

export function useDeleteRecognition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`${BASE}/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-list'] })
            qc.invalidateQueries({ queryKey: ['recognition-feed'] })
            qc.invalidateQueries({ queryKey: ['recognition-pending'] })
            qc.invalidateQueries({ queryKey: ['recognition-trending'] })
        },
    })
}

export function usePublishRecognition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post<{ data: Recognition }>(`${BASE}/${id}/publish`).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-list'] })
            qc.invalidateQueries({ queryKey: ['recognition-feed'] })
            qc.invalidateQueries({ queryKey: ['recognition-pending'] })
            qc.invalidateQueries({ queryKey: ['recognition'] })
            qc.invalidateQueries({ queryKey: ['recognition-trending'] })
        },
    })
}

export function useApproveRecognition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, step, comment }: { id: string; step?: 'manager' | 'hr' | 'system'; comment?: string }) =>
            api.post<{ data: Recognition }>(`${BASE}/${id}/approve`, { step, comment }).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-list'] })
            qc.invalidateQueries({ queryKey: ['recognition-feed'] })
            qc.invalidateQueries({ queryKey: ['recognition-pending'] })
            qc.invalidateQueries({ queryKey: ['recognition'] })
        },
    })
}

export function useRejectRecognition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            api.post<{ data: Recognition }>(`${BASE}/${id}/reject`, { reason }).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-list'] })
            qc.invalidateQueries({ queryKey: ['recognition-pending'] })
            qc.invalidateQueries({ queryKey: ['recognition'] })
        },
    })
}

export function useHoldRecognition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
            api.post<{ data: Recognition }>(`${BASE}/${id}/hold`, { comment }).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-list'] })
            qc.invalidateQueries({ queryKey: ['recognition-pending'] })
            qc.invalidateQueries({ queryKey: ['recognition'] })
        },
    })
}

export function usePinRecognition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, pin }: { id: string; pin: boolean }) =>
            api.post<{ data: Recognition }>(`${BASE}/${id}/${pin ? 'pin' : 'unpin'}`).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-list'] })
            qc.invalidateQueries({ queryKey: ['recognition-feed'] })
            qc.invalidateQueries({ queryKey: ['recognition'] })
            qc.invalidateQueries({ queryKey: ['recognition-trending'] })
        },
    })
}

// ── Comments ─────────────────────────────────────────────────────────────────
export function useRecognitionComments(id?: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['recognition-comments', tenantId, id],
        queryFn: () => api.get<{ data: RecognitionComment[] }>(`${BASE}/${id}/comments`).then(r => r.data),
        enabled: !!tenantId && !!id,
    })
}

export function useAddComment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ recognitionId, body, parentId }: { recognitionId: string; body: string; parentId?: string | null }) =>
            api.post<{ data: RecognitionComment }>(`${BASE}/${recognitionId}/comments`, { body, parentId }).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-comments'] })
            qc.invalidateQueries({ queryKey: ['recognition'] })
        },
    })
}

export function useEditComment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ recognitionId, commentId, body }: { recognitionId: string; commentId: string; body: string }) =>
            api.patch<{ data: RecognitionComment }>(`${BASE}/${recognitionId}/comments/${commentId}`, { body }).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-comments'] })
        },
    })
}

export function useDeleteComment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ recognitionId, commentId }: { recognitionId: string; commentId: string }) =>
            api.delete(`${BASE}/${recognitionId}/comments/${commentId}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-comments'] })
            qc.invalidateQueries({ queryKey: ['recognition'] })
        },
    })
}

// ── Reactions (with optimistic updates) ───────────────────────────────────────
function adjustReactionCounts(prev: ReactionCounts | undefined, oldType: ReactionType | null | undefined, newType: ReactionType | null): ReactionCounts {
    const base: ReactionCounts = prev ?? { like: 0, celebrate: 0, love: 0, support: 0, congrats: 0, total: 0 }
    const next: ReactionCounts = { ...base }
    if (oldType && next[oldType] > 0) {
        next[oldType] = next[oldType] - 1
        next.total = Math.max(0, next.total - 1)
    }
    if (newType) {
        next[newType] = (next[newType] ?? 0) + 1
        next.total = next.total + 1
    }
    return next
}

/**
 * Patch every cached Recognition with matching id, across:
 *   - the single-detail cache (['recognition', tenantId, id])
 *   - the feed infinite cache (['recognition-feed', ...])
 *   - the list infinite caches (['recognition-list', ...])
 *   - the trending cache (['recognition-trending', ...])
 *
 * Without this, reactions on a feed card show no immediate UI change — they
 * only update after invalidate + refetch round-trip.
 */
function patchRecognitionCachesById(qc: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Recognition>) {
    const apply = (r: Recognition): Recognition => (r && r.id === id ? { ...r, ...patch } : r)
    qc.setQueriesData<any>({ queryKey: ['recognition'] }, (old: any) => {
        if (!old) return old
        if (Array.isArray(old?.pages)) {
            return { ...old, pages: old.pages.map((p: any) => ({ ...p, data: p.data.map(apply) })) }
        }
        if (Array.isArray(old)) return old.map(apply)
        if (old?.id === id) return { ...old, ...patch }
        return old
    })
    qc.setQueriesData<any>({ queryKey: ['recognition-feed'] }, (old: any) => {
        if (!old?.pages) return old
        return { ...old, pages: old.pages.map((p: any) => ({ ...p, data: p.data.map(apply) })) }
    })
    qc.setQueriesData<any>({ queryKey: ['recognition-list'] }, (old: any) => {
        if (!old?.pages) return old
        return { ...old, pages: old.pages.map((p: any) => ({ ...p, data: p.data.map(apply) })) }
    })
    qc.setQueriesData<any>({ queryKey: ['recognition-trending'] }, (old: any) => {
        if (!Array.isArray(old)) return old
        return old.map(apply)
    })
}

function readReactionFromCaches(qc: ReturnType<typeof useQueryClient>, id: string): { myReaction?: ReactionType | null; reactionCounts?: ReactionCounts } {
    const detail = qc.getQueriesData<Recognition>({ queryKey: ['recognition'] })
        .map(([, v]) => v).find((v) => v && (v as any).id === id) as Recognition | undefined
    if (detail) return { myReaction: detail.myReaction ?? null, reactionCounts: detail.reactionCounts }
    const feed = qc.getQueriesData<any>({ queryKey: ['recognition-feed'] })
    for (const [, v] of feed) {
        const r = v?.pages?.flatMap((p: any) => p.data)?.find((x: any) => x.id === id) as Recognition | undefined
        if (r) return { myReaction: r.myReaction ?? null, reactionCounts: r.reactionCounts }
    }
    return {}
}

export function useSetReaction() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, type }: { id: string; type: ReactionType }) =>
            api.post<{ data: { ok: boolean; type: ReactionType } }>(`${BASE}/${id}/reactions`, { type }).then(r => r.data),
        onMutate: async ({ id, type }) => {
            await qc.cancelQueries({ queryKey: ['recognition'] })
            await qc.cancelQueries({ queryKey: ['recognition-feed'] })
            const before = readReactionFromCaches(qc, id)
            patchRecognitionCachesById(qc, id, {
                myReaction: type,
                reactionCounts: adjustReactionCounts(before.reactionCounts, before.myReaction, type),
            })
            return { before }
        },
        onError: (_err, vars, ctx) => {
            if (ctx?.before) {
                patchRecognitionCachesById(qc, vars.id, {
                    myReaction: ctx.before.myReaction ?? null,
                    reactionCounts: ctx.before.reactionCounts,
                })
            }
        },
        onSettled: (_data, _err, _vars) => {
            // Reconcile from server — the optimistic patch is best-effort.
            qc.invalidateQueries({ queryKey: ['recognition'] })
            qc.invalidateQueries({ queryKey: ['recognition-feed'] })
            qc.invalidateQueries({ queryKey: ['recognition-trending'] })
        },
    })
}

export function useRemoveReaction() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`${BASE}/${id}/reactions`),
        onMutate: async (id) => {
            await qc.cancelQueries({ queryKey: ['recognition'] })
            await qc.cancelQueries({ queryKey: ['recognition-feed'] })
            const before = readReactionFromCaches(qc, id)
            patchRecognitionCachesById(qc, id, {
                myReaction: null,
                reactionCounts: adjustReactionCounts(before.reactionCounts, before.myReaction, null),
            })
            return { before }
        },
        onError: (_err, id, ctx) => {
            if (ctx?.before) {
                patchRecognitionCachesById(qc, id, {
                    myReaction: ctx.before.myReaction ?? null,
                    reactionCounts: ctx.before.reactionCounts,
                })
            }
        },
        onSettled: () => {
            qc.invalidateQueries({ queryKey: ['recognition'] })
            qc.invalidateQueries({ queryKey: ['recognition-feed'] })
            qc.invalidateQueries({ queryKey: ['recognition-trending'] })
        },
    })
}

// ── Categories (HR) ──────────────────────────────────────────────────────────
export function useRecognitionCategories() {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['recognition-categories', tenantId],
        queryFn: () => api.get<{ data: RecognitionCategory[] }>(`${BASE}/categories`).then(r => r.data),
        enabled: !!tenantId,
    })
}

export interface CategoryInput {
    key: string
    label: string
    description?: string | null
    icon?: string
    color?: string
    sortOrder?: number
}

export function useCreateCategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: CategoryInput) =>
            api.post<{ data: RecognitionCategory }>(`${BASE}/categories`, input).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['recognition-categories'] }),
    })
}

export function useUpdateCategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: Partial<CategoryInput> }) =>
            api.patch<{ data: RecognitionCategory }>(`${BASE}/categories/${id}`, patch).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['recognition-categories'] }),
    })
}

export function useArchiveCategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`${BASE}/categories/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['recognition-categories'] }),
    })
}

export function useSeedDefaultCategories() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.post<{ data: RecognitionCategory[] }>(`${BASE}/categories/seed-defaults`).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['recognition-categories'] }),
    })
}

// ── Badges (HR) ──────────────────────────────────────────────────────────────
export function useRecognitionBadges() {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['recognition-badges', tenantId],
        queryFn: () => api.get<{ data: RecognitionBadge[] }>(`${BASE}/badges`).then(r => r.data),
        enabled: !!tenantId,
    })
}

export interface BadgeInput {
    key: string
    label: string
    description?: string | null
    icon?: string
    color?: string
    level: BadgeLevel
    categoryKey?: string | null
    defaultPoints?: number
}

export function useCreateBadge() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: BadgeInput) =>
            api.post<{ data: RecognitionBadge }>(`${BASE}/badges`, input).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['recognition-badges'] }),
    })
}

export function useUpdateBadge() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: Partial<BadgeInput> }) =>
            api.patch<{ data: RecognitionBadge }>(`${BASE}/badges/${id}`, patch).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['recognition-badges'] }),
    })
}

export function useArchiveBadge() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`${BASE}/badges/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['recognition-badges'] }),
    })
}

export function useSeedDefaultBadges() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.post<{ data: RecognitionBadge[] }>(`${BASE}/badges/seed-defaults`).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['recognition-badges'] }),
    })
}

// ── Points ───────────────────────────────────────────────────────────────────
// NOTE: useMyPointsBalance and usePointsBalance return DIFFERENT shapes
// (`{balance, ledger:Paginated}` vs `PointsBalance`). They MUST use distinct
// query keys to avoid cache collisions where one hook reads the other's payload.
export function useMyPointsBalance() {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const userId = useAuthStore(s => s.user?.id)
    return useQuery({
        queryKey: ['recognition-points-me', tenantId, userId],
        queryFn: () => api.get<{ data: { balance: PointsBalance; ledger: Paginated<PointsEntry> } }>(`${BASE}/points/me`).then(r => r.data),
        enabled: !!tenantId && !!userId,
    })
}

export function usePointsBalance(userId?: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['recognition-points-balance', tenantId, userId],
        queryFn: () => api.get<{ data: PointsBalance }>(`${BASE}/points/balance/${userId}`).then(r => r.data),
        enabled: !!tenantId && !!userId,
    })
}

export function useGrantPoints() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ userId, points, description }: { userId: string; points: number; description: string }) =>
            api.post<{ data: PointsEntry }>(`${BASE}/points/grant`, { userId, points, description }).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-points-me'] })
            qc.invalidateQueries({ queryKey: ['recognition-points-balance'] })
        },
    })
}

export function useRedeemPoints() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ points, description }: { points: number; description: string }) =>
            api.post<{ data: PointsEntry }>(`${BASE}/points/redeem`, { points, description }).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-points-me'] })
            qc.invalidateQueries({ queryKey: ['recognition-points-balance'] })
        },
    })
}

// ── Return for revision (workflow action) ─────────────────────────────────────
export function useReturnRecognition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, comment }: { id: string; comment?: string }) =>
            api.post<{ data: Recognition }>(`${BASE}/${id}/return`, { comment }).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-list'] })
            qc.invalidateQueries({ queryKey: ['recognition-pending'] })
            qc.invalidateQueries({ queryKey: ['recognition'] })
        },
    })
}

// ── Submit a draft for approval ───────────────────────────────────────────────
export function useSubmitRecognition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post<{ data: Recognition }>(`${BASE}/${id}/submit`).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['recognition-list'] })
            qc.invalidateQueries({ queryKey: ['recognition-feed'] })
            qc.invalidateQueries({ queryKey: ['recognition-pending'] })
            qc.invalidateQueries({ queryKey: ['recognition'] })
        },
    })
}

// ── Analytics ────────────────────────────────────────────────────────────────
// Backend gates analytics endpoints to hr_manager / super_admin / dept_head
// — pass `enabled: false` from the caller when the current user lacks the
// role, so we don't fire a guaranteed-403 request and trip the global error
// toast.
export function useAnalyticsSummary(period: string = '30d', opts: { enabled?: boolean } = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const { enabled = true } = opts
    return useQuery({
        queryKey: ['recognition-analytics-summary', tenantId, period],
        queryFn: () => api.get<{ data: AnalyticsSummary }>(`${BASE}/analytics/summary?period=${encodeURIComponent(period)}`).then(r => r.data),
        enabled: !!tenantId && enabled,
    })
}

export function useLeaderboard(period: string = '30d', type: 'received' | 'given' = 'received') {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['recognition-leaderboard', tenantId, period, type],
        queryFn: () => api.get<{ data: LeaderboardEntry[] }>(`${BASE}/analytics/leaderboard?period=${encodeURIComponent(period)}&type=${encodeURIComponent(type)}`).then(r => r.data),
        enabled: !!tenantId,
    })
}

export function useTopRecognized(period: string = '30d') {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['recognition-top-recognized', tenantId, period],
        queryFn: () => api.get<{ data: LeaderboardEntry[] }>(`${BASE}/analytics/top-recognized?limit=10&period=${encodeURIComponent(period)}`).then(r => r.data),
        enabled: !!tenantId,
    })
}

export function useTopGivers(period: string = '30d') {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['recognition-top-givers', tenantId, period],
        queryFn: () => api.get<{ data: LeaderboardEntry[] }>(`${BASE}/analytics/top-givers?limit=10&period=${encodeURIComponent(period)}`).then(r => r.data),
        enabled: !!tenantId,
    })
}

export function useBadgesDistribution(period: string = '30d') {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['recognition-badges-distribution', tenantId, period],
        queryFn: () => api.get<{ data: Array<{ badgeKey: string; label: string; level: BadgeLevel; color: string; count: number }> }>(`${BASE}/analytics/badges-distribution?period=${encodeURIComponent(period)}`).then(r => r.data),
        enabled: !!tenantId,
    })
}

// ── Employee profile integration ─────────────────────────────────────────────
export function useEmployeeRecognitionProfile(employeeId?: string) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['recognition-employee-profile', tenantId, employeeId],
        queryFn: () => api.get<{ data: EmployeeRecognitionProfile }>(`${BASE}/employee/${employeeId}`).then(r => r.data),
        enabled: !!tenantId && !!employeeId,
    })
}
