import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { PublicHoliday } from '@/types'

export function useHolidays(year?: number) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    const yr = year ?? new Date().getFullYear()
    return useQuery({
        queryKey: ['portal', 'holidays', tenantId, yr],
        queryFn: () => api.get<{ data: PublicHoliday[] }>(`/holidays?year=${yr}`).then((r) => r.data),
        enabled: !!tenantId,
        staleTime: 5 * 60_000, // holidays rarely change — cache longer
    })
}

export function useUpcomingHolidays(limit = 5) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'holidays-upcoming', tenantId, limit],
        queryFn: () =>
            api
                .get<{ data: PublicHoliday[] }>(`/holidays/upcoming?limit=${limit}`)
                .then((r) => r.data),
        enabled: !!tenantId,
        staleTime: 5 * 60_000,
    })
}
