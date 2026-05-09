import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'
import { buildSearchQuery, type AppliedFiltersMap } from '@/lib/filters'

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

export function usePerformanceReviews(params: { employeeId?: string; q?: string; filters?: AppliedFiltersMap } = {}) {
    const { employeeId, q, filters } = params
    const qs = buildSearchQuery(q, filters)
    const extra = employeeId ? `&employeeId=${employeeId}` : ''
    return useQuery({
        queryKey: ['performance', employeeId, q, filters],
        queryFn: () =>
            api
                .get<{ data: PerformanceReview[] }>(`/performance?${qs}${extra}`)
                .then((res) => res.data ?? []),
    })
}

export function useCreateReview() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/performance', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['performance'] }),
        onError: (err: Error) => toast.error('Failed to create review', err.message),
    })
}

export function useUpdateReview() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) => api.patch(`/performance/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['performance'] }),
        onError: (err: Error) => toast.error('Failed to update review', err.message),
    })
}

export function useDeleteReview() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/performance/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['performance'] }),
        onError: (err: Error) => toast.error('Failed to delete review', err.message),
    })
}
