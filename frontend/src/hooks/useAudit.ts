import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface LoginHistoryRecord {
    id: string
    userId: string | null
    email: string | null
    eventType: 'login' | 'logout' | 'failed_login' | 'password_change' | 'password_reset' | 'token_refresh'
    success: boolean
    ipAddress: string | null
    browser: string | null
    browserVersion: string | null
    os: string | null
    osVersion: string | null
    deviceType: 'desktop' | 'mobile' | 'tablet' | 'unknown' | null
    country: string | null
    city: string | null
    failureReason: string | null
    sessionRef: string | null
    createdAt: string
}

export interface ActivityLog {
    id: string
    userId: string | null
    actorName: string | null
    actorRole: string | null
    entityType: string
    entityId: string | null
    entityName: string | null
    action: string
    changes: Record<string, { from: unknown; to: unknown }> | null
    metadata: Record<string, unknown> | null
    ipAddress: string | null
    createdAt: string
}

export function useLoginHistory(params: { userId?: string; limit?: number } = {}) {
    const qs = new URLSearchParams()
    if (params.userId) qs.set('userId', params.userId)
    if (params.limit) qs.set('limit', String(params.limit))
    return useQuery({
        queryKey: ['login-history', params],
        queryFn: () => api.get<{ data: LoginHistoryRecord[] }>(`/audit/login-history?${qs}`).then(r => r.data),
    })
}

export function useInfiniteLoginHistory(params: { userId?: string; pageSize?: number } = {}) {
    const pageSize = params.pageSize ?? 10
    return useInfiniteQuery({
        queryKey: ['login-history-infinite', params.userId, pageSize],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams()
            if (params.userId) qs.set('userId', params.userId)
            qs.set('limit', String(pageSize))
            qs.set('offset', String(pageParam))
            return api.get<{ data: LoginHistoryRecord[] }>(`/audit/login-history?${qs}`).then(r => r.data)
        },
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage || lastPage.length < pageSize) return undefined
            return allPages.reduce((sum, p) => sum + p.length, 0)
        },
    })
}

export function useActivityLogs(params: { entityType?: string; entityId?: string; userId?: string; limit?: number } = {}) {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)))
    return useQuery({
        queryKey: ['activity-logs', params],
        queryFn: () => api.get<{ data: ActivityLog[] }>(`/audit/activity?${qs}`).then(r => r.data),
    })
}
