import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export interface FeedAnnouncement {
    id: string
    title: string
    body: string
    category: string
    priority: 'low' | 'normal' | 'high' | 'critical'
    pinned: boolean
    requireAck: boolean
    attachments?: Array<{ name: string; s3Key: string; size?: number; mime?: string }>
    publishedAt: string | null
    authorName: string | null
    createdAt: string
    readAt: string | null
    acknowledgedAt: string | null
}

interface FeedPage { data: FeedAnnouncement[]; total: number; limit: number; offset: number; hasMore: boolean }

/** Announcements targeted to the signed-in employee. Pinned first, newest next. */
export function useAnnouncementFeed(pageSize = 15) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useInfiniteQuery({
        queryKey: ['portal', 'announcements', tenantId, pageSize],
        initialPageParam: 0,
        queryFn: ({ pageParam }) =>
            api.get<FeedPage>(`/announcements/feed?limit=${pageSize}&offset=${pageParam}`),
        getNextPageParam: (last, all) => (last && last.hasMore ? all.reduce((s, p) => s + p.data.length, 0) : undefined),
        enabled: !!tenantId,
    })
}

export function useMarkAnnouncementRead() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post(`/announcements/${id}/read`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'announcements'] }),
    })
}

export function useAcknowledgeAnnouncement() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post(`/announcements/${id}/acknowledge`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'announcements'] }),
    })
}

// ── Comments ────────────────────────────────────────────────────────────

export interface AnnouncementComment {
    id: string
    tenantId: string
    announcementId: string
    parentId: string | null
    userId: string | null
    authorName: string | null
    body: string
    editedAt: string | null
    deletedAt: string | null
    createdAt: string
}

/**
 * Comments for a single announcement, oldest first. Disabled until
 * `enabled = true` so the home-page feed can list multiple announcements
 * without preloading every thread at once — the comment count badge
 * triggers fetching only when the user expands or interacts.
 */
export function useAnnouncementComments(id: string | null, enabled = true) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'announcement-comments', tenantId, id],
        queryFn: () =>
            api.get<{ data: AnnouncementComment[] }>(`/announcements/${id}/comments`).then((r) => r.data),
        enabled: !!tenantId && !!id && enabled,
        staleTime: 30_000,
    })
}

/**
 * Post a comment. Sends `{ body, parentId? }` and invalidates the
 * thread cache on success. The caller's optimistic update lives in the
 * component (the input clears on submit and we refetch — adding a true
 * optimistic insert would need a deterministic local UUID, which is
 * overkill for a thread that typically has < 10 comments).
 */
export function useAddAnnouncementComment(id: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: { body: string; parentId?: string | null }) =>
            api.post<{ data: AnnouncementComment }>(`/announcements/${id}/comments`, body).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'announcement-comments'] })
        },
    })
}
