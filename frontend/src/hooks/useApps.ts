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
