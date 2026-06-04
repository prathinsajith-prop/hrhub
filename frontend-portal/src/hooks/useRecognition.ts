import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export type ReactionType = 'like' | 'celebrate' | 'love' | 'support' | 'congrats'

export interface RecognitionRecipient {
    employeeId: string
    name: string
    designation: string | null
    department: string | null
    avatarUrl: string | null
    isPrimary: boolean
}

export interface ReactionCounts { like: number; celebrate: number; love: number; support: number; congrats: number; total: number }

export interface Recognition {
    id: string
    title: string
    message: string
    categoryKey: string
    badgeKey: string | null
    giverName: string | null
    giverEmployeeId: string | null
    giverUserId: string | null
    visibility: string
    nominationType: string
    points: number
    status: string
    isPinned: boolean
    commentsDisabled: boolean
    achievementDate: string | null
    attachments?: Array<{ name: string; s3Key: string; size?: number; mime?: string }>
    publishedAt: string | null
    createdAt: string
    recipients: RecognitionRecipient[]
    reactionCounts: ReactionCounts
    commentCount: number
    myReaction: ReactionType | null
}

export interface RecognitionComment {
    id: string
    parentId: string | null
    userId: string | null
    authorName: string | null
    body: string
    editedAt: string | null
    deletedAt: string | null
    createdAt: string
}

export interface RecognitionCategory { id: string; key: string; label: string; description: string | null; icon: string; color: string }
export interface RecognitionBadge { id: string; key: string; label: string; icon: string; color: string; level: string; categoryKey: string | null }

export interface GiveRecognitionInput {
    categoryKey: string
    badgeKey?: string | null
    title: string
    message: string
    visibility?: string
    points?: number
    recipientEmployeeIds: string[]
}

interface FeedPage { data: Recognition[]; total: number; limit: number; offset: number; hasMore: boolean }

const BASE = '/recognition'

/** Employee recognition feed (visible-to-me, paginated, pinned first). */
export function useRecognitionFeed(pageSize = 15) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useInfiniteQuery({
        queryKey: ['portal', 'recognition', 'feed', tenantId, pageSize],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => api.get<FeedPage>(`${BASE}/feed?limit=${pageSize}&offset=${pageParam}`),
        getNextPageParam: (last, all) => (last && last.hasMore ? all.reduce((s, p) => s + p.data.length, 0) : undefined),
        enabled: !!tenantId,
    })
}

/** Manager team recognition feed (recognitions for the manager's direct reports). */
export function useTeamRecognitionFeed(pageSize = 15) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useInfiniteQuery({
        queryKey: ['portal', 'recognition', 'team-feed', tenantId, pageSize],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => api.get<FeedPage>(`${BASE}/team/feed?limit=${pageSize}&offset=${pageParam}`),
        getNextPageParam: (last, all) => (last && last.hasMore ? all.reduce((s, p) => s + p.data.length, 0) : undefined),
        enabled: !!tenantId,
    })
}

export function useRecognition(id: string | undefined) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'recognition', 'detail', tenantId, id],
        queryFn: () => api.get<{ data: Recognition }>(`${BASE}/${id}`).then((r) => r.data),
        enabled: !!tenantId && !!id,
    })
}

export function useRecognitionCategories() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'recognition', 'categories', tenantId],
        queryFn: () => api.get<{ data: RecognitionCategory[] }>(`${BASE}/categories`).then((r) => r.data),
        enabled: !!tenantId,
        staleTime: 5 * 60_000,
    })
}

export function useGiveRecognition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: GiveRecognitionInput) => api.post<{ data: Recognition }>(BASE, input).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'recognition', 'feed'] })
            qc.invalidateQueries({ queryKey: ['portal', 'recognition', 'team-feed'] })
        },
    })
}

export function useSetReaction() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, type }: { id: string; type: ReactionType | null }) =>
            type ? api.post(`${BASE}/${id}/reactions`, { type }) : api.delete(`${BASE}/${id}/reactions`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'recognition', 'feed'] })
            qc.invalidateQueries({ queryKey: ['portal', 'recognition', 'team-feed'] })
            qc.invalidateQueries({ queryKey: ['portal', 'recognition', 'detail'] })
        },
    })
}

export function useRecognitionComments(id: string | undefined, enabled = true) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'recognition', 'comments', tenantId, id],
        queryFn: () => api.get<{ data: RecognitionComment[] }>(`${BASE}/${id}/comments`).then((r) => r.data),
        enabled: !!tenantId && !!id && enabled,
    })
}

export function useAddComment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, body, parentId }: { id: string; body: string; parentId?: string | null }) =>
            api.post<{ data: RecognitionComment }>(`${BASE}/${id}/comments`, { body, parentId }).then((r) => r.data),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ['portal', 'recognition', 'comments', undefined] })
            qc.invalidateQueries({ queryKey: ['portal', 'recognition', 'comments'] })
            qc.invalidateQueries({ queryKey: ['portal', 'recognition', 'detail'] })
            void vars
        },
    })
}
