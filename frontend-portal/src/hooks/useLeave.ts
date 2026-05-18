import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { LeaveBalance, LeaveRequest, LeaveType, PaginatedResponse } from '@/types'

export interface ListLeaveParams {
    employeeId?: string
    status?: 'pending' | 'approved' | 'rejected' | 'cancelled'
    leaveType?: string
    from?: string
    to?: string
    limit?: number
    offset?: number
    search?: string
}

function buildQuery(params: Record<string, string | number | undefined | null> | ListLeaveParams): string {
    const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    if (entries.length === 0) return ''
    return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
}

export function useLeaveRequests(params: ListLeaveParams = {}) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'leave', tenantId, params],
        queryFn: () => api.get<PaginatedResponse<LeaveRequest>>(`/leave${buildQuery(params)}`),
        enabled: !!tenantId,
    })
}

export function useLeaveBalance(employeeId: string | undefined, year?: number) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    const yr = year ?? new Date().getFullYear()
    return useQuery({
        queryKey: ['portal', 'leave-balance', tenantId, employeeId, yr],
        queryFn: () =>
            api
                .get<{ data: LeaveBalance }>(`/leave/balance/${employeeId}${buildQuery({ year: yr })}`)
                .then((r) => r.data),
        enabled: !!employeeId && !!tenantId,
    })
}

export interface CreateLeaveBody {
    employeeId: string
    leaveType: LeaveType
    startDate: string
    endDate: string
    reason?: string
    handoverTo?: string | null
    handoverNotes?: string | null
}

export function useCreateLeave() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: CreateLeaveBody) =>
            api.post<{ data: LeaveRequest }>('/leave', body).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'leave'] })
            qc.invalidateQueries({ queryKey: ['portal', 'leave-balance'] })
        },
    })
}

export function useCancelLeave() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) =>
            api.post<{ data: LeaveRequest }>(`/leave/${id}/cancel`).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'leave'] })
        },
    })
}

export interface ApproveLeaveBody {
    id: string
    approved: boolean
    notes?: string
}

export function useApproveLeave() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, approved, notes }: ApproveLeaveBody) =>
            api.post<{ data: LeaveRequest }>(`/leave/${id}/approve`, { approved, notes }).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'leave'] })
        },
    })
}
