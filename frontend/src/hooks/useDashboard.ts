import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface KPIs {
    totalEmployees: number
    openJobs: number
    activeVisas: number
    pendingLeave: number
    expiringVisas: number
}

export function useDashboardKPIs() {
    return useQuery({
        queryKey: ['dashboard', 'kpis'],
        queryFn: () => api.get<{ data: KPIs }>('/dashboard/kpis').then(r => r.data),
    })
}

export function useNotifications(limit = 10) {
    return useQuery({
        queryKey: ['dashboard', 'notifications', limit],
        queryFn: () => api.get<{ data: unknown[] }>(`/dashboard/notifications?limit=${limit}`).then(r => r.data),
    })
}
