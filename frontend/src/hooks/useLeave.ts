import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface LeaveParams { employeeId?: string; status?: string; leaveType?: string; limit?: number; offset?: number }

function toQS(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
    return q.toString()
}

export function useLeaveRequests(params: LeaveParams = {}) {
    return useQuery({
        queryKey: ['leave', params],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/leave?${toQS({ ...params, limit: params.limit ?? 20, offset: params.offset ?? 0 })}`),
    })
}

export function useCreateLeave() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/leave', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }),
    })
}

export function useApproveLeave() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
            api.post(`/leave/${id}/approve`, { approved }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['leave'] })
            qc.invalidateQueries({ queryKey: ['dashboard'] })
        },
    })
}

export interface LeaveBalanceEntry {
    entitled: number
    accrued: number
    carriedForward: number
    carryExpiresOn: string | null
    taken: number
    pending: number
    adjustment: number
    available: number
    unlimited: boolean
}
export interface LeaveBalance {
    employeeId: string
    year: number
    monthsOfService: number
    balance: Record<string, LeaveBalanceEntry>
}

export function useLeaveBalance(employeeId: string | undefined, year = new Date().getFullYear()) {
    return useQuery({
        queryKey: ['leave-balance', employeeId, year],
        queryFn: () => api.get<{ data: LeaveBalance }>(`/leave/balance/${employeeId}?year=${year}`).then(r => r.data),
        enabled: !!employeeId,
    })
}

export type AccrualRule = 'flat' | 'monthly_2_then_30' | 'unlimited' | 'none'
export interface LeavePolicy {
    leaveType: string
    daysPerYear: number
    accrualRule: AccrualRule
    maxCarryForward: number
    carryExpiresAfterMonths: number
}

export function useLeavePolicies() {
    return useQuery({
        queryKey: ['leave-policies'],
        queryFn: () => api.get<{ data: LeavePolicy[] }>(`/leave/policies`).then(r => r.data),
    })
}

export function useSaveLeavePolicies() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (policies: LeavePolicy[]) => api.put(`/leave/policies`, { policies }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['leave-policies'] })
            qc.invalidateQueries({ queryKey: ['leave-balance'] })
        },
    })
}

export function useRolloverYear() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (fromYear: number) => api.post(`/leave/rollover`, { fromYear }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-balance'] }),
    })
}

export function useAdjustLeaveBalance() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: { employeeId: string; leaveType: string; year: number; delta: number; reason?: string }) =>
            api.post(`/leave/balance/${input.employeeId}/adjust`, input),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-balance'] }),
    })
}
