/**
 * useUpcomingBirthdays — fetch colleague birthdays inside the user's natural
 * scope (their department, or for a dept_head the whole reporting subtree).
 *
 * Server returns rows pre-sorted by `daysUntil` ascending, plus `isToday` /
 * `isTomorrow` boolean flags so the UI can label them without re-deriving
 * from the date.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export interface UpcomingBirthday {
    id: string
    name: string
    employeeNo: string
    department: string
    designation: string
    avatarUrl: string | null
    day: number
    month: number
    daysUntil: number
    isToday: boolean
    isTomorrow: boolean
}

export function useUpcomingBirthdays(days = 30, enabled = true) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'birthdays', tenantId, days],
        queryFn: () =>
            api.get<{ data: UpcomingBirthday[] }>(`/employees/birthdays?days=${days}`).then((r) => r.data),
        enabled: enabled && !!tenantId,
        // Birthdays don't shift hourly; refresh once an hour at most.
        staleTime: 60 * 60 * 1000,
    })
}
