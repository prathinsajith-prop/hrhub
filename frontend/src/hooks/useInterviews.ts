import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface Interview {
    id: string
    tenantId: string
    applicationId: string
    interviewerUserId?: string
    scheduledAt: string
    durationMinutes: string
    type: 'video' | 'phone' | 'in_person' | 'technical'
    link?: string
    location?: string
    status: 'scheduled' | 'completed' | 'cancelled' | 'no_show'
    feedback?: string
    rating?: '1' | '2' | '3' | '4' | '5'
    passed?: boolean
    notes?: string
    createdAt: string
    updatedAt: string
}

export function useInterviews(applicationId?: string) {
    return useQuery({
        queryKey: ['interviews', applicationId],
        queryFn: () => applicationId
            ? api.get<Interview[]>(`/interviews/application/${applicationId}`)
            : api.get<Interview[]>('/interviews'),
    })
}

export function useScheduleInterview() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/interviews', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['interviews'] }),
    })
}

export function useUpdateInterview() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) => api.patch(`/interviews/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['interviews'] }),
    })
}
