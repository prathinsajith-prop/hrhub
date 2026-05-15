import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { AttendanceRecord, PaginatedResponse } from '@/types'

interface ListParams {
    employeeId?: string
    startDate?: string
    endDate?: string
    status?: string
    limit?: number
    offset?: number
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    if (entries.length === 0) return ''
    return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
}

export function useAttendance(params: ListParams = {}) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'attendance', tenantId, params],
        queryFn: () => api.get<PaginatedResponse<AttendanceRecord>>(`/attendance${buildQuery(params as any)}`),
        enabled: !!tenantId,
    })
}

export function useCheckIn() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (employeeId?: string) =>
            api.post<{ data: AttendanceRecord }>('/attendance/check-in', employeeId ? { employeeId } : {}).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'attendance'] })
        },
    })
}

export function useCheckOut() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (employeeId?: string) =>
            api.post<{ data: AttendanceRecord }>('/attendance/check-out', employeeId ? { employeeId } : {}).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'attendance'] })
        },
    })
}
