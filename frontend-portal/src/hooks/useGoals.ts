import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export type GoalStatus = 'active' | 'completed' | 'archived'

export interface Goal {
    id: string
    tenantId: string
    employeeId: string
    title: string
    description: string | null
    category: string
    status: GoalStatus
    progress: number
    targetDate: string | null
    completedAt: string | null
    createdAt: string
    updatedAt: string
}

export interface CreateGoalInput {
    title: string
    description?: string | null
    category?: string
    targetDate?: string | null
    progress?: number
    status?: GoalStatus
}

export interface UpdateGoalInput {
    title?: string
    description?: string | null
    category?: string
    targetDate?: string | null
    progress?: number
    status?: GoalStatus
}

const GOALS_KEY = ['portal', 'goals'] as const

/** The signed-in employee's own goals, newest first. */
export function useGoals() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: [...GOALS_KEY, tenantId],
        queryFn: () => api.get<{ data: Goal[] }>('/goals').then((r) => r.data),
        enabled: !!tenantId,
        staleTime: 30_000,
    })
}

export function useCreateGoal() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: CreateGoalInput) =>
            api.post<{ data: Goal }>('/goals', input).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: GOALS_KEY }),
    })
}

export function useUpdateGoal() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...patch }: UpdateGoalInput & { id: string }) =>
            api.patch<{ data: Goal }>(`/goals/${id}`, patch).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: GOALS_KEY }),
    })
}

export function useDeleteGoal() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/goals/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: GOALS_KEY }),
    })
}
