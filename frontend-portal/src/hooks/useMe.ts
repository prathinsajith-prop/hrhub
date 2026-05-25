import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { Employee, User } from '@/types'

/**
 * Account-level flags the employee portal cares about — fetched on demand
 * (not embedded in the JWT) so HR toggles in Users → Manage Access take
 * effect quickly without a re-login.
 *
 * Cache tuning:
 *   - `staleTime: 0`     — the query is always considered stale, so React
 *     Query refetches on every mount (i.e., each route change re-pulls).
 *     The actual network calls are still cheap (single row, no joins).
 *   - `refetchOnWindowFocus: true` — when the employee tabs away to read an
 *     email about a policy change and tabs back, fresh flags arrive without
 *     a page refresh.
 *   - `refetchInterval: 30_000` — heartbeat poll while the tab is open so a
 *     mid-session HR change reflects within ~30s even if the user never
 *     leaves the page.
 *
 * Defaults to "everything enabled" while the first fetch is in flight so the
 * UI never flashes a disabled state for the (vast) majority of users who
 * have both switches on.
 */
export interface AccountFlags {
    attendancePunchEnabled: boolean
    attendanceManualEntryEnabled: boolean
}

export function useAccountFlags(): AccountFlags & { isLoading: boolean } {
    const userId = useAuthStore((s) => s.user?.id)
    const query = useQuery({
        queryKey: ['portal', 'auth-me-flags', userId],
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

export function useMyEmployee() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'me', tenantId],
        queryFn: () => api.get<{ data: Employee }>('/employees/me').then((r) => r.data),
        enabled: !!tenantId,
    })
}

export interface UpdateMyProfileBody {
    phone?: string
    mobileNo?: string
    personalEmail?: string
    emergencyContact?: string
    emergencyContactName?: string
    emergencyContactPhone?: string
    homeCountryAddress?: string
}

export function useUpdateMyProfile() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: UpdateMyProfileBody) =>
            api.patch<{ data: Employee }>('/employees/me', body).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'me'] })
        },
    })
}
