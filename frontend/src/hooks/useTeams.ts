import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

export interface TeamRow {
    id: string
    tenantId: string
    name: string
    description: string | null
    departmentId: string | null
    department: string | null
    createdById: string | null
    isActive: boolean
    memberCount: number
    createdAt: string
    updatedAt: string
}

export interface MyTeamRow {
    id: string
    name: string
    description: string | null
    departmentId: string | null
    department: string | null
    createdById: string | null
    memberCount: number
    joinedAt: string
    /** This employee's role within the team (viewer/member/manager/administrator). */
    role: 'viewer' | 'member' | 'manager' | 'administrator'
}

export type TeamMemberRole = 'viewer' | 'member' | 'manager' | 'administrator'

export interface TeamMemberRow {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    department: string | null
    designation: string | null
    avatarUrl: string | null
    email: string | null
    joinedAt: string
    role: TeamMemberRole
}

export interface EligibleEmployee {
    id: string
    firstName: string
    lastName: string
    department: string | null
    designation: string | null
    avatarUrl: string | null
}

export function useTeams(departmentId?: string) {
    return useQuery({
        queryKey: ['teams', departmentId],
        queryFn: () => {
            const path = departmentId ? `/teams?departmentId=${encodeURIComponent(departmentId)}` : '/teams'
            return api.get<{ data: TeamRow[] }>(path).then(r => r.data)
        },
        staleTime: 30_000,
    })
}

export function useMyTeams() {
    return useQuery({
        queryKey: ['teams', 'my'],
        queryFn: () => api.get<{ data: MyTeamRow[] }>('/teams/my').then(r => r.data),
        staleTime: 30_000,
    })
}

export function useEmployeeTeams(employeeId: string | undefined) {
    return useQuery({
        queryKey: ['teams', 'employee', employeeId],
        queryFn: () => api.get<{ data: MyTeamRow[] }>(`/teams/employee/${employeeId}`).then(r => r.data),
        enabled: !!employeeId,
    })
}

export function useTeamMembers(teamId: string | null) {
    return useQuery({
        queryKey: ['teams', teamId, 'members'],
        queryFn: () => api.get<{ data: TeamMemberRow[] }>(`/teams/${teamId}/members`).then(r => r.data),
        enabled: !!teamId,
        staleTime: 60_000,
        gcTime: 5 * 60_000,
    })
}

export function useEligibleEmployees(teamId: string | null) {
    return useQuery({
        queryKey: ['teams', teamId, 'eligible'],
        queryFn: () => api.get<{ data: EligibleEmployee[] }>(`/teams/${teamId}/eligible`).then(r => r.data),
        enabled: !!teamId,
    })
}

export function useCreateTeam() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { name: string; description?: string; departmentId?: string }) =>
            api.post<{ data: TeamRow }>('/teams', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
        onError: (err: Error) => toast.error('Failed to create team', err.message),
    })
}

export function useUpdateTeam() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string }) =>
            api.patch<{ data: TeamRow }>(`/teams/${id}`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
        onError: (err: Error) => toast.error('Failed to update team', err.message),
    })
}

export function useDeleteTeam() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/teams/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
        onError: (err: Error) => toast.error('Failed to delete team', err.message),
    })
}

export function useAddTeamMembers(teamId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ employeeIds, role }: { employeeIds: string[]; role: TeamMemberRole }) =>
            api.post(`/teams/${teamId}/members`, { employeeIds, role }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['teams', teamId, 'members'] })
            void qc.invalidateQueries({ queryKey: ['teams', teamId, 'eligible'] })
            void qc.invalidateQueries({ queryKey: ['teams'] })
        },
        onError: (err: Error) => toast.error('Failed to add team members', err.message),
    })
}

export function useUpdateTeamMemberRole(teamId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ employeeId, role }: { employeeId: string; role: TeamMemberRole }) =>
            api.patch(`/teams/${teamId}/members/${employeeId}`, { role }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['teams', teamId, 'members'] })
        },
        onError: (err: Error) => toast.error('Failed to update member role', err.message),
    })
}

export function useRemoveTeamMember(teamId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (employeeId: string) =>
            api.delete(`/teams/${teamId}/members/${employeeId}`),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['teams', teamId, 'members'] })
            void qc.invalidateQueries({ queryKey: ['teams', teamId, 'eligible'] })
            void qc.invalidateQueries({ queryKey: ['teams'] })
        },
        onError: (err: Error) => toast.error('Failed to remove team member', err.message),
    })
}
