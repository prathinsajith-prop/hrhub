import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface PublicHoliday {
    id: string
    tenantId: string
    name: string
    date: string
    year: number
    isRecurring: boolean
    country: string
    notes: string | null
    createdAt: string
    updatedAt: string
}

export function usePublicHolidays(year?: number) {
    const currentYear = year ?? new Date().getFullYear()
    return useQuery({
        queryKey: ['public-holidays', currentYear],
        queryFn: () =>
            api.get<{ data: PublicHoliday[] }>(`/hr/public-holidays?year=${currentYear}`).then(r => r.data),
    })
}

export function useCreatePublicHoliday() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { name: string; date: string; isRecurring?: boolean; notes?: string }) =>
            api.post<{ data: PublicHoliday }>('/hr/public-holidays', data).then(r => r.data),
        onSuccess: (_, vars) => {
            const year = new Date(vars.date).getFullYear()
            qc.invalidateQueries({ queryKey: ['public-holidays', year] })
        },
    })
}

export function useDeletePublicHoliday() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/hr/public-holidays/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['public-holidays'] }),
    })
}

export function useSeedUaeHolidays() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (year: number) =>
            api.post<{ message: string }>('/hr/public-holidays/seed-uae', { year }),
        onSuccess: (_, year) => qc.invalidateQueries({ queryKey: ['public-holidays', year] }),
    })
}
