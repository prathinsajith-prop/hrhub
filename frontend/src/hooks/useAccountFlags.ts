import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { User } from '@/types'

/**
 * Mirrors the same hook on the employee portal — fetches /auth/me so HR
 * toggles to the per-user attendance switches take effect quickly without a
 * re-login. Used by `MyAttendancePage` (the main app's employee view).
 *
 * Cache tuning matches the portal so behavior is identical across surfaces:
 *   - staleTime 0 + refetchOnMount: 'always' → fresh on every navigation
 *   - refetchOnWindowFocus → fresh when the user tabs back in
 *   - refetchInterval 30s → catches mid-session HR changes
 */
export interface AccountFlags {
    attendancePunchEnabled: boolean
    attendanceManualEntryEnabled: boolean
}

export function useAccountFlags(): AccountFlags & { isLoading: boolean } {
    const userId = useAuthStore((s) => s.user?.id)
    const query = useQuery({
        queryKey: ['auth-me-flags', userId],
        queryFn: () => api.get<{ data: User }>('/auth/me').then((r) => r.data),
        enabled: !!userId,
        staleTime: 0,
        refetchOnWindowFocus: true,
        refetchOnMount: 'always',
        refetchInterval: 30_000,
    })
    return {
        attendancePunchEnabled: query.data?.attendancePunchEnabled ?? true,
        attendanceManualEntryEnabled: query.data?.attendanceManualEntryEnabled ?? true,
        isLoading: query.isLoading,
    }
}
