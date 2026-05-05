import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface ApiMeta {
    version: string
    docsEnabled: boolean
    docsUrl: string | null
}

export function useApiMeta() {
    return useQuery({
        queryKey: ['api-meta'],
        queryFn: () => api.get<ApiMeta>('/meta'),
        staleTime: 10 * 60_000,
        gcTime: 30 * 60_000,
        retry: false,
    })
}
