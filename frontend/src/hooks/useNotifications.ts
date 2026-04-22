import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

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

export function useNotificationsList(params?: { limit?: number; offset?: number; unreadOnly?: boolean }) {
    const { limit = 20, offset = 0, unreadOnly = false } = params ?? {}
    return useQuery({
        queryKey: ['notifications', { limit, offset, unreadOnly }],
        queryFn: () =>
            api.get<NotificationsResponse>(
                `/notifications?limit=${limit}&offset=${offset}&unreadOnly=${unreadOnly}`,
            ),
        staleTime: 30_000,
    })
}

export function useUnreadCount() {
    return useQuery({
        queryKey: ['notifications', 'unread-count'],
        queryFn: () => api.get<UnreadCountResponse>('/notifications/unread-count').then(r => r.data.count),
        refetchInterval: 60_000, // poll every 60s
        staleTime: 30_000,
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
