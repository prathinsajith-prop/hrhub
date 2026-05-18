import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'
import type { Shift, WeekDay } from '@/types'

type ShiftCreate = {
    name: string
    startTime: string
    endTime: string
    weeklyOffDays?: WeekDay[]
    sortOrder?: number
}
type ShiftUpdate = Partial<ShiftCreate> & { isActive?: boolean }

export function useShifts(opts?: { includeInactive?: boolean }) {
    const query = opts?.includeInactive ? '?includeInactive=true' : ''
    return useQuery({
        queryKey: ['shifts', opts?.includeInactive ?? false],
        queryFn: () => api.get<{ data: Shift[] }>(`/shifts${query}`).then(r => r.data ?? []),
        staleTime: 5 * 60_000,
    })
}

// Active shifts as `{ value, label }` for the Combobox / Select primitives.
export function useShiftOptions() {
    const { data = [] } = useShifts()
    return useMemo(() => {
        const list = Array.isArray(data) ? data : []
        return list
            .filter(s => s.isActive)
            .map(s => ({ value: s.id, label: `${s.name} (${s.startTime}–${s.endTime})` }))
    }, [data])
}

export function useCreateShift() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: ShiftCreate) =>
            api.post<{ data: Shift }>('/shifts', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
        onError: (err: Error) => toast.error('Failed to create shift', err.message),
    })
}

export function useUpdateShift() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string; data: ShiftUpdate }) =>
            api.patch<{ data: Shift }>(`/shifts/${id}`, data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
        onError: (err: Error) => toast.error('Failed to update shift', err.message),
    })
}

export function useDeleteShift() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/shifts/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['shifts'] }),
        onError: (err: Error) => toast.error('Failed to delete shift', err.message),
    })
}
