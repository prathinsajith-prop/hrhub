/**
 * Team memberships — both the signed-in user's own teams (/teams/my) and any
 * teammate's teams (/teams/by-employee/:id) for manager member-detail views.
 *
 * `memberRole` is one of: 'member' | 'manager' | 'administrator' — same
 * vocabulary used by the admin app. UI badges these distinctively so a user
 * can see at a glance where they lead vs participate.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export interface TeamMembership {
    id: string
    name: string
    description: string | null
    departmentId: string | null
    department: string | null
    memberRole: 'member' | 'manager' | 'administrator' | string
    joinedAt: string
}

export function useMyTeams(enabled = true) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    const employeeId = useAuthStore((s) => s.user?.employeeId)
    return useQuery({
        queryKey: ['portal', 'my-teams', tenantId, employeeId],
        queryFn: () => api.get<{ data: TeamMembership[] }>('/teams/my').then((r) => r.data),
        enabled: enabled && !!tenantId && !!employeeId,
        staleTime: 5 * 60 * 1000, // team memberships shift rarely
    })
}

export function useEmployeeTeams(employeeId: string | undefined) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'employee-teams', tenantId, employeeId],
        queryFn: () =>
            api
                .get<{ data: TeamMembership[] }>(`/teams/by-employee/${employeeId}`)
                .then((r) => r.data),
        enabled: !!tenantId && !!employeeId,
        staleTime: 5 * 60 * 1000,
    })
}
