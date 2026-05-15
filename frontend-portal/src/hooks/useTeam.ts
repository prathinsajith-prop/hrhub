import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { Employee, PaginatedResponse } from '@/types'

export function useTeam(params: { limit?: number; offset?: number; search?: string } = {}) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    const qs = new URLSearchParams()
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    if (params.search) qs.set('search', params.search)
    const query = qs.toString() ? `?${qs.toString()}` : ''
    return useQuery({
        queryKey: ['portal', 'team', tenantId, params],
        queryFn: () => api.get<PaginatedResponse<Employee>>(`/employees${query}`),
        enabled: !!tenantId,
    })
}

export function useTeamMember(id: string | undefined) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'team-member', tenantId, id],
        queryFn: () => api.get<{ data: Employee }>(`/employees/${id}`).then((r) => r.data),
        enabled: !!id && !!tenantId,
    })
}
