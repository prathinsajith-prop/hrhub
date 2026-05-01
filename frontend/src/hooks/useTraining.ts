import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TrainingRecord {
    id: string
    tenantId: string
    employeeId: string
    employeeName?: string | null
    employeeNo?: string | null
    employeeDepartment?: string | null
    title: string
    provider?: string | null
    type: 'internal' | 'external' | 'online' | 'conference'
    startDate: string
    endDate?: string | null
    cost?: string | null
    currency?: string | null
    status: 'planned' | 'in_progress' | 'completed' | 'cancelled'
    certificateUrl?: string | null
    certificateExpiry?: string | null
    notes?: string | null
    createdBy?: string | null
    deletedAt?: string | null
    createdAt: string
    updatedAt: string
}

export interface TrainingSummary {
    total: number
    planned: number
    inProgress: number
    completed: number
    totalCost: number
}

export interface TrainingListResponse {
    data: TrainingRecord[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
    summary: TrainingSummary
}

export interface CreateTrainingInput {
    employeeId: string
    title: string
    provider?: string
    type?: 'internal' | 'external' | 'online' | 'conference'
    startDate: string
    endDate?: string
    cost?: string
    currency?: string
    status?: 'planned' | 'in_progress' | 'completed' | 'cancelled'
    certificateUrl?: string
    certificateExpiry?: string
    notes?: string
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useTraining(params?: {
    employeeId?: string
    status?: string
    type?: string
    search?: string
    limit?: number
    offset?: number
}) {
    const tenantId = useAuthStore(s => s.user?.tenantId)
    const qs = new URLSearchParams()
    if (params?.employeeId) qs.set('employeeId', params.employeeId)
    if (params?.status) qs.set('status', params.status)
    if (params?.type) qs.set('type', params.type)
    if (params?.search) qs.set('search', params.search)
    qs.set('limit', String(params?.limit ?? 25))
    qs.set('offset', String(params?.offset ?? 0))

    return useQuery<TrainingListResponse>({
        queryKey: ['training', tenantId, params],
        queryFn: () => api.get(`/training?${qs}`),
        staleTime: 30_000,
        enabled: !!tenantId,
    })
}

export function useMyTraining() {
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useQuery<{ data: TrainingRecord[] }>({
        queryKey: ['training', tenantId, 'my'],
        queryFn: () => api.get('/training/my'),
        staleTime: 30_000,
        enabled: !!tenantId,
    })
}

export function useEmployeeTraining(employeeId: string | undefined) {
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useQuery<{ data: TrainingRecord[] }>({
        queryKey: ['training', tenantId, 'employee', employeeId],
        queryFn: () => api.get(`/training/employee/${employeeId}`),
        staleTime: 30_000,
        enabled: !!tenantId && !!employeeId,
    })
}

export function useCreateTraining() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: (data: CreateTrainingInput) => api.post('/training', data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['training', tenantId] }) },
    })
}

export function useUpdateTraining() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: ({ id, ...data }: Partial<TrainingRecord> & { id: string }) =>
            api.patch(`/training/${id}`, data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['training', tenantId] }) },
    })
}

export function useDeleteTraining() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: (id: string) => api.delete(`/training/${id}`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['training', tenantId] }) },
    })
}
