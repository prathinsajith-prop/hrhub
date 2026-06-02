import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
