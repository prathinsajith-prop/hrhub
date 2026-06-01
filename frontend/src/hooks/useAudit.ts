import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

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

interface PaginatedAuditResponse<T> {
    data: T[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
}

export function useLoginHistory(params: { userId?: string; limit?: number } = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const qs = new URLSearchParams()
    if (params.userId) qs.set('userId', params.userId)
    if (params.limit) qs.set('limit', String(params.limit))
    return useQuery({
        queryKey: ['login-history', tenantId, params],
        queryFn: () => api.get<PaginatedAuditResponse<LoginHistoryRecord>>(`/audit/login-history?${qs}`).then(r => r.data),
        enabled: !!tenantId,
    })
}

export function useInfiniteLoginHistory(params: { userId?: string; pageSize?: number } = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const pageSize = params.pageSize ?? 10
    return useInfiniteQuery({
        queryKey: ['login-history-infinite', tenantId, params.userId, pageSize],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams()
            if (params.userId) qs.set('userId', params.userId)
            qs.set('limit', String(pageSize))
            qs.set('offset', String(pageParam))
            return api.get<PaginatedAuditResponse<LoginHistoryRecord>>(`/audit/login-history?${qs}`).then(r => r.data)
        },
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage || lastPage.length < pageSize) return undefined
            return allPages.reduce((sum, p) => sum + p.length, 0)
        },
        enabled: !!tenantId,
    })
}

export function useActivityLogs(params: { entityType?: string; entityId?: string; userId?: string; action?: string; actorRole?: string; actorName?: string; entityName?: string; from?: string; to?: string; ipAddress?: string; limit?: number } = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && qs.set(k, String(v)))
    return useQuery({
        queryKey: ['activity-logs', tenantId, params],
        queryFn: () => api.get<PaginatedAuditResponse<ActivityLog>>(`/audit/activity?${qs}`).then(r => r.data),
        enabled: !!tenantId,
    })
}

/**
 * Employee-portal "My Activity" feed. Hits the unprivileged
 * `/audit/my-activity` endpoint which the backend scopes server-side to the
 * caller's own employeeId — so any authenticated user can call this without
 * elevated permissions, but they only ever see their own activity.
 */
export function useInfiniteMyActivity(params: { pageSize?: number; enabled?: boolean } = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const pageSize = params.pageSize ?? 20
    return useInfiniteQuery({
        queryKey: ['my-activity-infinite', tenantId, pageSize],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams()
            qs.set('limit', String(pageSize))
            qs.set('offset', String(pageParam))
            return api.get<PaginatedAuditResponse<ActivityLog>>(`/audit/my-activity?${qs}`).then(r => r.data)
        },
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage || lastPage.length < pageSize) return undefined
            return allPages.reduce((sum, p) => sum + p.length, 0)
        },
        enabled: !!tenantId && (params.enabled ?? true),
    })
}

export function useInfiniteActivityLogs(params: { entityType?: string; entityId?: string; userId?: string; action?: string; actorRole?: string; actorName?: string; entityName?: string; from?: string; to?: string; ipAddress?: string; pageSize?: number; enabled?: boolean } = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const pageSize = params.pageSize ?? 30
    return useInfiniteQuery({
        queryKey: ['activity-logs-infinite', tenantId, params.entityType, params.entityId, params.userId, params.action, params.actorRole, params.actorName, params.entityName, params.from, params.to, params.ipAddress, pageSize],
        initialPageParam: 0,
        queryFn: ({ pageParam }) => {
            const qs = new URLSearchParams()
            if (params.entityType) qs.set('entityType', params.entityType)
            if (params.entityId) qs.set('entityId', params.entityId)
            if (params.userId) qs.set('userId', params.userId)
            if (params.action) qs.set('action', params.action)
            if (params.actorRole) qs.set('actorRole', params.actorRole)
            if (params.actorName) qs.set('actorName', params.actorName)
            if (params.entityName) qs.set('entityName', params.entityName)
            if (params.from) qs.set('from', params.from)
            if (params.to) qs.set('to', params.to)
            if (params.ipAddress) qs.set('ipAddress', params.ipAddress)
            qs.set('limit', String(pageSize))
            qs.set('offset', String(pageParam))
            return api.get<PaginatedAuditResponse<ActivityLog>>(`/audit/activity?${qs}`).then(r => r.data)
        },
        getNextPageParam: (lastPage, allPages) => {
            if (!lastPage || lastPage.length < pageSize) return undefined
            return allPages.reduce((sum, p) => sum + p.length, 0)
        },
        enabled: !!tenantId && (params.enabled ?? true),
    })
}
