import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'
import { useSocketEvent } from '@/hooks/useSocket'
import { useAuthStore } from '@/store/authStore'

export interface Notification {
    id: string
    tenantId: string
    userId: string
    type: 'info' | 'warning' | 'error' | 'success'
    title: string
    message: string
    actionUrl: string | null
    isRead: boolean
    createdAt: string
}

interface NotificationsResponse {
    data: Notification[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
}

interface UnreadCountResponse {
    data: { count: number }
}

// Single socket → query-cache bridge. Any hook that touches a `['notifications', ...]`
// key benefits from this, so we wire it up once per consumer rather than per query.
function useNotificationsSocketInvalidation() {
    const qc = useQueryClient()
    const onNew = useCallback(() => {
        // Prefix match: invalidates every ['notifications', ...] key in one call,
        // covering both the list and the unread-count query.
        qc.invalidateQueries({ queryKey: ['notifications'] })
    }, [qc])
    useSocketEvent('notification:new', onNew)
}

export function useNotificationsList(params?: { limit?: number; offset?: number; unreadOnly?: boolean }) {
    const { limit = 20, offset = 0, unreadOnly = false } = params ?? {}
    const tenantId = useAuthStore(s => s.tenant?.id)
    useNotificationsSocketInvalidation()

    return useQuery({
        queryKey: ['notifications', tenantId, { limit, offset, unreadOnly }],
        queryFn: () =>
            api.get<NotificationsResponse>(
                `/notifications?limit=${limit}&offset=${offset}&unreadOnly=${unreadOnly}`,
            ),
        staleTime: 30_000,
        // Fallback poll for environments where the socket can't connect.
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
        enabled: !!tenantId,
    })
}

export function useUnreadCount() {
    const tenantId = useAuthStore(s => s.tenant?.id)
    useNotificationsSocketInvalidation()

    return useQuery({
        queryKey: ['notifications', tenantId, 'unread-count'],
        queryFn: () => api.get<UnreadCountResponse>('/notifications/unread-count').then(r => r.data.count),
        staleTime: 30_000,
        // 5-minute fallback poll in case the WebSocket is temporarily down.
        refetchInterval: 5 * 60_000,
        enabled: !!tenantId,
    })
}

export function useMarkNotificationRead() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.patch<{ data: Notification }>(`/notifications/${id}/read`, {}),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['notifications'] })
        },
    })
}

export function useMarkAllRead() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.post<{ data: { markedRead: number } }>('/notifications/mark-all-read', {}),
        onSuccess: (res) => {
            qc.invalidateQueries({ queryKey: ['notifications'] })
            const count = res?.data?.markedRead ?? 0
            if (count > 0) {
                toast.success('All notifications marked as read', `${count} notification${count === 1 ? '' : 's'} updated.`)
            } else {
                toast.info('You\u2019re all caught up', 'No unread notifications to mark.')
            }
        },
        onError: () => {
            toast.error('Could not mark as read', 'Please try again in a moment.')
        },
    })
}
