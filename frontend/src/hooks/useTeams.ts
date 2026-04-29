import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

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
    memberCount: number
    joinedAt: string
}

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
    })
}

export function useMyTeams() {
    return useQuery({
        queryKey: ['teams', 'my'],
        queryFn: () => api.get<{ data: MyTeamRow[] }>('/teams/my').then(r => r.data),
    })
}

export function useTeamMembers(teamId: string | null) {
    return useQuery({
        queryKey: ['teams', teamId, 'members'],
        queryFn: () => api.get<{ data: TeamMemberRow[] }>(`/teams/${teamId}/members`).then(r => r.data),
        enabled: !!teamId,
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
    })
}

export function useUpdateTeam() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...data }: { id: string; name?: string; description?: string }) =>
            api.patch<{ data: TeamRow }>(`/teams/${id}`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
    })
}

export function useDeleteTeam() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/teams/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['teams'] }),
    })
}

export function useAddTeamMembers(teamId: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (employeeIds: string[]) =>
            api.post(`/teams/${teamId}/members`, { employeeIds }),
        onSuccess: () => {
            void qc.invalidateQueries({ queryKey: ['teams', teamId, 'members'] })
            void qc.invalidateQueries({ queryKey: ['teams', teamId, 'eligible'] })
            void qc.invalidateQueries({ queryKey: ['teams'] })
        },
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
    })
}
