import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface PerformanceReview {
    id: string
    tenantId: string
    employeeId: string
    reviewerId?: string
    period: string
    reviewDate?: string
    status: 'draft' | 'submitted' | 'acknowledged' | 'completed'
    overallRating?: number
    qualityScore?: number
    productivityScore?: number
    teamworkScore?: number
    attendanceScore?: number
    initiativeScore?: number
    strengths?: string
    improvements?: string
    goals?: string
    managerComments?: string
    employeeComments?: string
    createdAt: string
    updatedAt: string
}

export function usePerformanceReviews(employeeId?: string) {
    return useQuery({
        queryKey: ['performance', employeeId],
        queryFn: () => api.get<PerformanceReview[]>(`/performance${employeeId ? `?employeeId=${employeeId}` : ''}`),
    })
}

export function useCreateReview() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/performance', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['performance'] }),
    })
}

export function useUpdateReview() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) => api.patch(`/performance/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['performance'] }),
    })
}

export function useDeleteReview() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/performance/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['performance'] }),
    })
}
