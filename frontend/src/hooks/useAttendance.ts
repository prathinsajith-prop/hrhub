import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface AttendanceRecord {
    id: string
    tenantId: string
    employeeId: string
    date: string
    checkIn?: string
    checkOut?: string
    hoursWorked?: string
    overtimeHours?: string
    status: 'present' | 'absent' | 'half_day' | 'late' | 'wfh' | 'on_leave'
    notes?: string
    createdAt: string
    updatedAt: string
    employeeName?: string
    employeeNo?: string
    employeeDepartment?: string
    employeeAvatarUrl?: string
}

export interface AttendancePage {
    items: AttendanceRecord[]
    nextCursor: string | null
    total?: number
}

export function useAttendance(params: {
    employeeId?: string
    startDate?: string
    endDate?: string
    status?: string
    page?: number
    limit?: number
    cursor?: string
} = {}) {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, String(v))
    })
    return useQuery({
        queryKey: ['attendance', params],
        // Backend now returns { items, nextCursor, total? }. Keep `data.items`
        // as the primary array; consumers that expect a plain list should
        // read response.items instead.
        queryFn: () => api.get<AttendancePage>(`/attendance?${qs}`),
    })
}

export function useCheckIn() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (employeeId: string) => api.post('/attendance/check-in', { employeeId }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
    })
}

export function useCheckOut() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (employeeId: string) => api.post('/attendance/check-out', { employeeId }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
    })
}

export function useUpsertAttendance() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.patch('/attendance', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
    })
}
