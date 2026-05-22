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

/** Payload accepted by /attendance/check-in and /attendance/check-out.
 *  All identifier fields are optional — the server falls back to the
 *  caller's own employee record when omitted. */
export interface PunchBody {
    employeeId?: string
    locationName?: string | null
    latitude?: number | null
    longitude?: number | null
    notes?: string | null
}

export function useCheckIn() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: PunchBody = {}) =>
            api.post<{ data: AttendanceRecord }>('/attendance/check-in', body).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'attendance'] })
            qc.invalidateQueries({ queryKey: ['portal', 'attendance-calendar'] })
            qc.invalidateQueries({ queryKey: ['portal', 'attendance-punches'] })
        },
    })
}

export function useCheckOut() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: PunchBody = {}) =>
            api.post<{ data: AttendanceRecord }>('/attendance/check-out', body).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'attendance'] })
            qc.invalidateQueries({ queryKey: ['portal', 'attendance-calendar'] })
            qc.invalidateQueries({ queryKey: ['portal', 'attendance-punches'] })
        },
    })
}

// ─── Punches log (multi-punch support) ───────────────────────────────────

export interface AttendancePunch {
    id: string
    tenantId: string
    employeeId: string
    date: string
    punchType: 'in' | 'out'
    recordedAt: string
    locationName: string | null
    latitude: string | null
    longitude: string | null
    source: 'web' | 'mobile' | 'biometric' | 'manual'
    deviceId: string | null
    notes: string | null
    createdBy: string | null
    createdAt: string
}

export function usePunchesForDay(date: string | null, employeeId?: string) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'attendance-punches', tenantId, date, employeeId ?? null],
        queryFn: () => {
            const qs = new URLSearchParams({ date: date! })
            if (employeeId) qs.set('employeeId', employeeId)
            return api.get<{ data: AttendancePunch[] }>(`/attendance/punches?${qs}`).then((r) => r.data)
        },
        enabled: !!tenantId && !!date && /^\d{4}-\d{2}-\d{2}$/.test(date),
    })
}

export interface ManualPunchBody {
    employeeId?: string
    date: string
    inTime: string
    outTime?: string
    inDayOffset?: number
    outDayOffset?: number
    inNotes?: string
    outNotes?: string
    locationName?: string
    latitude?: number
    longitude?: number
}

export function useAddManualPunch() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: ManualPunchBody) =>
            api.post<{ data: { inPunch: AttendancePunch; outPunch: AttendancePunch | null } }>(
                '/attendance/punches', body,
            ).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'attendance'] })
            qc.invalidateQueries({ queryKey: ['portal', 'attendance-calendar'] })
            qc.invalidateQueries({ queryKey: ['portal', 'attendance-punches'] })
        },
    })
}

export function useDeletePunch() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, employeeId }: { id: string; employeeId?: string }) => {
            const qs = new URLSearchParams()
            if (employeeId) qs.set('employeeId', employeeId)
            return api.delete(`/attendance/punches/${id}${qs.toString() ? `?${qs}` : ''}`)
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'attendance'] })
            qc.invalidateQueries({ queryKey: ['portal', 'attendance-calendar'] })
            qc.invalidateQueries({ queryKey: ['portal', 'attendance-punches'] })
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
