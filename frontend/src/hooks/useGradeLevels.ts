import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type GradeHierarchy = 'Entry' | 'Junior' | 'Mid' | 'Senior' | 'Lead' | 'Manager' | 'Leadership'

export const HIERARCHY_OPTIONS: GradeHierarchy[] = ['Entry', 'Junior', 'Mid', 'Senior', 'Lead', 'Manager', 'Leadership']

export const HIERARCHY_COLORS: Record<GradeHierarchy, string> = {
    Entry:      'bg-slate-100 text-slate-700',
    Junior:     'bg-blue-100 text-blue-700',
    Mid:        'bg-cyan-100 text-cyan-700',
    Senior:     'bg-emerald-100 text-emerald-700',
    Lead:       'bg-violet-100 text-violet-700',
    Manager:    'bg-orange-100 text-orange-700',
    Leadership: 'bg-rose-100 text-rose-700',
}

export interface GradeLevel {
    id: string
    tenantId: string
    name: string
    code: string | null
    level: number | null
    hierarchy: GradeHierarchy | null
    roles: string[]
    salaryMin: number | null
    salaryMax: number | null
    description: string | null
    isActive: boolean
    sortOrder: number
    createdAt: string
}

export interface GradeLevelInput {
    name: string
    code?: string
    level?: number
    hierarchy?: GradeHierarchy
    roles?: string[]
    salaryMin?: number
    salaryMax?: number
    description?: string
    sortOrder?: number
}

const QK = ['grade-levels'] as const

export function useGradeLevels() {
    return useQuery({
        queryKey: QK,
        queryFn: () => api.get<{ data: GradeLevel[] }>('/grade-levels').then(r => r.data ?? []),
        staleTime: 60_000,
    })
}

export function useAllGradeLevels() {
    return useQuery({
        queryKey: [...QK, 'all'],
        queryFn: () => api.get<{ data: GradeLevel[] }>('/grade-levels/all').then(r => r.data ?? []),
        staleTime: 60_000,
    })
}

export function useCreateGradeLevel() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: GradeLevelInput) =>
            api.post<{ data: GradeLevel }>('/grade-levels', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    })
}

export function useUpdateGradeLevel() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: Partial<GradeLevelInput> & { isActive?: boolean } }) =>
            api.patch<{ data: GradeLevel }>(`/grade-levels/${id}`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    })
}

export function useDeleteGradeLevel() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/grade-levels/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    })
}

export function useSeedDefaultGradeLevels() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.post('/grade-levels/seed-defaults', {}),
        onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    })
}
