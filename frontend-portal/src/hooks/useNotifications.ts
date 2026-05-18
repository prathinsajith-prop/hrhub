import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { Notification } from '@/types'

export function useNotifications(params: { limit?: number; unreadOnly?: boolean } = {}) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    const qs = new URLSearchParams()
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.unreadOnly) qs.set('unreadOnly', 'true')
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return useQuery({
        queryKey: ['portal', 'notifications', tenantId, params],
        queryFn: () => api.get<{ data: Notification[] }>(`/notifications${query}`).then((r) => r.data),
        enabled: !!tenantId,
        // Keep the popover list in sync with the badge — the bell badge polls
        // every minute, so the list should too. Without this, a new
        // notification arrives, the badge ticks up, but the dropdown still
        // shows stale (or empty) cached items until the page is reloaded.
        staleTime: 30_000,
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
    })
}

export function useUnreadNotificationsCount() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'notifications-unread', tenantId],
        queryFn: () => api.get<{ data: { unread: number } }>('/notifications/unread-count').then((r) => r.data.unread),
        enabled: !!tenantId,
        // Poll every minute so the badge stays fresh even with no other activity
        refetchInterval: 60_000,
        refetchOnWindowFocus: true,
    })
}

export function useMarkNotificationRead() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post<{ data: Notification }>(`/notifications/${id}/read`).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'notifications'] })
            qc.invalidateQueries({ queryKey: ['portal', 'notifications-unread'] })
        },
    })
}

export function useMarkAllNotificationsRead() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.post<{ data: { ok: boolean } }>('/notifications/read-all'),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'notifications'] })
            qc.invalidateQueries({ queryKey: ['portal', 'notifications-unread'] })
        },
    })
}
