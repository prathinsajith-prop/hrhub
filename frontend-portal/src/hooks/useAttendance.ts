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

type QueryPrimitive = string | number | undefined | null

function buildQuery(params: Record<string, QueryPrimitive> | ListParams): string {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    if (entries.length === 0) return ''
    return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
}

export function useAttendance(params: ListParams = {}) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'attendance', tenantId, params],
        queryFn: () => api.get<PaginatedResponse<AttendanceRecord>>(`/attendance${buildQuery(params)}`),
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

// ─── Calendar matrix view ────────────────────────────────────────────────

export interface CalendarCell {
    code: string
    checkIn: string | null
    checkOut: string | null
    hoursWorked: string | null
    leaveType?: string
    holidayName?: string
}

export interface CalendarEmployee {
    id: string
    employeeNo: string
    name: string
    department: string | null
    designation: string | null
    avatarUrl: string | null
    cells: CalendarCell[]
}

export interface CalendarResponse {
    month: string
    daysInMonth: number
    scope: 'me' | 'team'
    elevated: boolean
    firstWeekday: number
    employees: CalendarEmployee[]
}

export function useAttendanceCalendar(month: string, scope: 'me' | 'team') {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'attendance-calendar', tenantId, month, scope],
        queryFn: () =>
            api.get<CalendarResponse>(`/attendance/calendar?month=${encodeURIComponent(month)}&scope=${scope}`),
        enabled: !!tenantId && /^\d{4}-\d{2}$/.test(month),
    })
}
