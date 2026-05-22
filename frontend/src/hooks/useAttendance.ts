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
    filter?: string
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

// ─── Calendar matrix view (HR / dept_head) ───────────────────────────────

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
    firstWeekday: number
    employees: CalendarEmployee[]
}

export function useAttendanceCalendar(month: string, opts?: { department?: string; employeeId?: string }) {
    const department = opts?.department
    const employeeId = opts?.employeeId
    return useQuery({
        queryKey: ['attendance-calendar', month, department ?? null, employeeId ?? null],
        queryFn: () => {
            const qs = new URLSearchParams({ month })
            if (department) qs.set('department', department)
            if (employeeId) qs.set('employeeId', employeeId)
            return api.get<CalendarResponse>(`/attendance/calendar?${qs}`)
        },
        enabled: /^\d{4}-\d{2}$/.test(month),
    })
}

export function useUpsertAttendance() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.patch('/attendance', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
    })
}

export interface AttendanceSummary {
    month: number
    year: number
    totalPresent: number
    totalAbsent: number
    totalLate: number
    totalWfh: number
    totalHalfDay: number
    totalOnLeave: number
    avgHoursWorked: number
    avgOvertimeHours: number
    byDepartment: Array<{ department: string; present: number; absent: number; late: number }>
}

export function useAttendanceSummary(params: { month?: number; year?: number } = {}) {
    const qs = new URLSearchParams()
    if (params.month) qs.set('month', String(params.month))
    if (params.year) qs.set('year', String(params.year))
    return useQuery({
        queryKey: ['attendance', 'summary', params],
        queryFn: () => api.get<{ data: AttendanceSummary }>(`/attendance/summary?${qs}`).then(r => r.data),
    })
}

export function useExternalPunch() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { employeeId: string; punchType: 'in' | 'out'; timestamp?: string; deviceId?: string; source?: string }) =>
            api.post('/attendance/external-punch', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance'] }),
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

/** Insert a paired in/out manual punch via /attendance/punches.
 *  Used by the bulk-import modal — also useful for ad-hoc HR entry. */
export function useAddManualPunch() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: ManualPunchBody) => api.post('/attendance/punches', body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['attendance'] })
            qc.invalidateQueries({ queryKey: ['attendance-calendar'] })
        },
    })
}
