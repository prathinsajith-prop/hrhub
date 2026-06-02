import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export type AnnouncementPriority = 'low' | 'normal' | 'high' | 'critical'
export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'expired' | 'archived'
export type AudienceKind =
    | 'all' | 'branch' | 'division' | 'department' | 'team'
    | 'designation' | 'grade' | 'employment_type' | 'location' | 'employee'

export interface AudienceRule { kind: AudienceKind; value?: string | null }

export interface Announcement {
    id: string
    title: string
    body: string
    category: string
    priority: AnnouncementPriority
    status: AnnouncementStatus
    audienceType: 'all' | 'targeted'
    pinned: boolean
    requireAck: boolean
    attachments?: Array<{ name: string; s3Key: string; size?: number; mime?: string }>
    publishAt?: string | null
    expireAt?: string | null
    publishedAt?: string | null
    authorName?: string | null
    createdAt: string
    updatedAt: string
    audiences?: AudienceRule[]
    // Feed-only fields:
    readAt?: string | null
    acknowledgedAt?: string | null
}

export interface AnnouncementInput {
    title: string
    body?: string
    category?: string
    priority?: AnnouncementPriority
    pinned?: boolean
    requireAck?: boolean
    publishAt?: string | null
    expireAt?: string | null
    audiences?: AudienceRule[]
}

export interface ReceiptStats {
    targeted: number; viewed: number; read: number; acknowledged: number
    readPct: number; ackPct: number; unread: number; unreadPct: number
}

interface Paginated<T> { data: T[]; total: number; limit: number; offset: number; hasMore: boolean }

const BASE = '/announcements'

// ── Admin: list / detail / mutations ──────────────────────────────────────────
export function useAnnouncements(params: { status?: string; category?: string; priority?: string; q?: string; limit?: number } = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const limit = params.limit ?? 20
    return useInfiniteQuery({
        queryKey: ['announcements', tenantId, params.status, params.category, params.priority, params.q, limit],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams()
            if (params.status) qs.set('status', params.status)
            if (params.category) qs.set('category', params.category)
            if (params.priority) qs.set('priority', params.priority)
            if (params.q) qs.set('q', params.q)
            qs.set('limit', String(limit)); qs.set('offset', String(pageParam))
            return api.get<Paginated<Announcement>>(`${BASE}?${qs}`)
        },
        getNextPageParam: (last, all) => (last && last.hasMore ? all.reduce((s, p) => s + p.data.length, 0) : undefined),
        enabled: !!tenantId,
    })
}

export function useAnnouncement(id: string | undefined) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['announcement', tenantId, id],
        queryFn: () => api.get<{ data: Announcement }>(`${BASE}/${id}`).then(r => r.data),
        enabled: !!tenantId && !!id,
    })
}

export function useAnnouncementReceipts(id: string | undefined, enabled = true) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['announcement-receipts', tenantId, id],
        queryFn: () => api.get<{ data: ReceiptStats }>(`${BASE}/${id}/receipts`).then(r => r.data),
        enabled: !!tenantId && !!id && enabled,
    })
}

export function useCreateAnnouncement() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: AnnouncementInput) => api.post<{ data: Announcement }>(BASE, input).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
    })
}

export function useUpdateAnnouncement() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, input }: { id: string; input: Partial<AnnouncementInput> }) =>
            api.patch<{ data: Announcement }>(`${BASE}/${id}`, input).then(r => r.data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['announcements'] }); qc.invalidateQueries({ queryKey: ['announcement'] }) },
    })
}

export function useAnnouncementAction() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, action }: { id: string; action: 'publish' | 'schedule' | 'archive' | 'expire' }) =>
            api.post(`${BASE}/${id}/${action}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
    })
}

export function useDeleteAnnouncement() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`${BASE}/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements'] }),
    })
}

// ── Shared feed (admin can also preview their own feed) ────────────────────────
export function useAnnouncementFeed(params: { category?: string; limit?: number } = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const limit = params.limit ?? 20
    return useInfiniteQuery({
        queryKey: ['announcement-feed', tenantId, params.category, limit],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams()
            if (params.category) qs.set('category', params.category)
            qs.set('limit', String(limit)); qs.set('offset', String(pageParam))
            return api.get<Paginated<Announcement>>(`${BASE}/feed?${qs}`)
        },
        getNextPageParam: (last, all) => (last && last.hasMore ? all.reduce((s, p) => s + p.data.length, 0) : undefined),
        enabled: !!tenantId,
    })
}

export function useAcknowledgeAnnouncement() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post(`${BASE}/${id}/acknowledge`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['announcement-feed'] }),
    })
}
