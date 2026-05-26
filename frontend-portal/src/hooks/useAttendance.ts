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

// Today's date in the user's local timezone — used both as the query key for
// the today-punches cache and the optimistic-update target on punch success.
function localTodayISO(): string {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Append a synthetic punch into the today-punches cache the moment the
// mutation succeeds. The UI then flips Check-in ↔ Check-out and the live
// timer starts ticking from `recordedAt` immediately — no need to wait for
// the GET refetch to land. Once the real refetch lands, the server's row
// replaces this stub.
function pushOptimisticPunch(
    qc: ReturnType<typeof useQueryClient>,
    tenantId: string | undefined,
    employeeId: string | undefined,
    punchType: 'in' | 'out',
    body: PunchBody,
) {
    if (!tenantId) return
    const date = localTodayISO()
    // Match the queryKey shape used by usePunchesForDay so we land on the
    // right cache entry. employeeId in the key may be `null` (the hook
    // normalises undefined → null) — match that.
    const key = ['portal', 'attendance-punches', tenantId, date, employeeId ?? null]
    qc.setQueryData<AttendancePunch[]>(key, (prev) => {
        const list = prev ?? []
        const stub: AttendancePunch = {
            id: `optimistic-${Date.now()}`,
            tenantId,
            employeeId: employeeId ?? '',
            date,
            punchType,
            recordedAt: new Date().toISOString(),
            locationName: body.locationName ?? null,
            latitude: body.latitude != null ? String(body.latitude) : null,
            longitude: body.longitude != null ? String(body.longitude) : null,
            source: 'web',
            deviceId: null,
            notes: body.notes ?? null,
            createdBy: null,
            createdAt: new Date().toISOString(),
        }
        return [...list, stub]
    })
}

export function useCheckIn() {
    const qc = useQueryClient()
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    const employeeId = useAuthStore((s) => s.user?.employeeId ?? undefined)
    return useMutation({
        mutationFn: (body: PunchBody = {}) =>
            api.post<{ data: AttendanceRecord }>('/attendance/check-in', body).then((r) => r.data),
        onSuccess: (_data, body) => {
            pushOptimisticPunch(qc, tenantId, body.employeeId ?? employeeId, 'in', body)
            qc.invalidateQueries({ queryKey: ['portal', 'attendance'] })
            qc.invalidateQueries({ queryKey: ['portal', 'attendance-calendar'] })
            qc.invalidateQueries({ queryKey: ['portal', 'attendance-punches'] })
        },
    })
}

export function useCheckOut() {
    const qc = useQueryClient()
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    const employeeId = useAuthStore((s) => s.user?.employeeId ?? undefined)
    return useMutation({
        mutationFn: (body: PunchBody = {}) =>
            api.post<{ data: AttendanceRecord }>('/attendance/check-out', body).then((r) => r.data),
        onSuccess: (_data, body) => {
            pushOptimisticPunch(qc, tenantId, body.employeeId ?? employeeId, 'out', body)
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
    // When the requested day is *today*, treat the cache as always stale and
    // refetch on every mount: this is the data that drives the live check-in
    // band, so we never want it to lag a tab-switch or page-revisit.
    const isToday = date === (() => {
        const d = new Date()
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })()
    return useQuery({
        queryKey: ['portal', 'attendance-punches', tenantId, date, employeeId ?? null],
        queryFn: () => {
            const qs = new URLSearchParams({ date: date! })
            if (employeeId) qs.set('employeeId', employeeId)
            return api.get<{ data: AttendancePunch[] }>(`/attendance/punches?${qs}`).then((r) => r.data)
        },
        enabled: !!tenantId && !!date && /^\d{4}-\d{2}-\d{2}$/.test(date),
        staleTime: isToday ? 0 : 30_000,
        refetchOnMount: isToday ? 'always' : true,
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
