import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface ConnectedApp {
    id: string
    name: string
    description: string | null
    appKey: string
    scopes: string[]
    ipAllowlist: string[]
    status: 'active' | 'revoked'
    lastUsedAt: string | null
    requestCount: number
    revokedAt: string | null
    createdBy: string | null
    createdAt: string
    updatedAt: string
}

export interface CreatedApp {
    app: ConnectedApp
    appSecret: string
}

export function useConnectedApps() {
    return useQuery({
        queryKey: ['connected-apps'],
        queryFn: () => api.get<{ data: ConnectedApp[] }>('/apps').then(r => r.data),
    })
}

export function useApp(id: string | undefined) {
    return useQuery({
        queryKey: ['connected-apps', id],
        queryFn: () => api.get<{ data: ConnectedApp }>(`/apps/${id}`).then(r => r.data),
        enabled: !!id,
    })
}

export function useCreateApp() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: {
            name: string
            description?: string
            scopes?: string[]
            ipAllowlist?: string[]
        }) => api.post<{ data: CreatedApp }>('/apps', body).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['connected-apps'] }),
    })
}

export function useUpdateApp() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: Partial<ConnectedApp> }) =>
            api.patch<{ data: ConnectedApp }>(`/apps/${id}`, patch).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['connected-apps'] }),
    })
}

export function useRegenerateAppSecret() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) =>
            api.post<{ data: CreatedApp }>(`/apps/${id}/regenerate-secret`).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['connected-apps'] }),
    })
}

export function useDeleteApp() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete<void>(`/apps/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['connected-apps'] }),
    })
}

export interface AppAnalytics {
    stats: {
        totalRequests: number
        last24h: number
        last7d: number
        successRate: number
        totalErrors: number
        avgLatencyMs: number
        minLatencyMs: number
        maxLatencyMs: number
    }
    dailyVolume: { date: string; count: number }[]
    byPath: { path: string; count: number }[]
    byStatusCode: { statusCode: number; count: number }[]
}

export interface AppRequestLog {
    id: string
    appId: string
    tenantId: string
    method: string
    path: string
    statusCode: number
    latencyMs: number | null
    ipAddress: string | null
    createdAt: string
}

export function useAppAnalytics(id: string | undefined) {
    return useQuery({
        queryKey: ['app-analytics', id],
        queryFn: () => api.get<{ data: AppAnalytics }>(`/apps/${id}/analytics`).then(r => r.data),
        enabled: !!id,
        staleTime: 30_000,
    })
}

export function useAppRequestLogs(id: string | undefined, params: { page?: number; limit?: number; status?: string } = {}) {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page))
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.status) qs.set('status', params.status)
    return useQuery({
        queryKey: ['app-request-logs', id, params],
        queryFn: () => api.get<{ data: AppRequestLog[]; meta: { page: number; limit: number; total: number } }>(`/apps/${id}/request-logs?${qs}`).then(r => r),
        enabled: !!id,
    })
}
