import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

interface LeaveParams { employeeId?: string; department?: string; status?: string; leaveType?: string; from?: string; to?: string; limit?: number; offset?: number }

function toQS(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
    return q.toString()
}

export function useLeaveRequests(params: LeaveParams = {}) {
    const { employeeId, department, status, leaveType, from, to, limit = 20, offset = 0 } = params
    return useQuery({
        queryKey: ['leave', employeeId, department, status, leaveType, from, to, limit, offset],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/leave?${toQS({ employeeId, department, status, leaveType, from, to, limit, offset })}`),
        staleTime: 30_000,
    })
}

export type LeaveType = 'annual' | 'sick' | 'maternity' | 'paternity' | 'unpaid' | 'compassionate' | 'emergency' | 'bereavement' | 'hajj'

export interface CreateLeaveInput {
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
        mutationFn: (data: CreateLeaveInput) => api.post('/leave', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }),
        onError: (err: Error) => toast.error('Failed to submit leave', err?.message ?? 'Please try again.'),
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
        onError: (err: Error) => toast.error('Action failed', err?.message ?? 'Could not update the leave request.'),
    })
}

export function useCancelLeave() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.post(`/leave/${id}/cancel`, {}),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave'] }),
        onError: (err: Error) => toast.error('Cancel failed', err?.message ?? 'Could not cancel the leave request.'),
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
        onError: (err: Error) => toast.error('Save failed', err?.message ?? 'Could not save leave policies.'),
    })
}

export function useRolloverYear() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (fromYear: number) => api.post(`/leave/rollover`, { fromYear }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-balance'] }),
        onError: (err: Error) => toast.error('Rollover failed', err?.message ?? 'Could not roll over leave balances.'),
    })
}

export function useAdjustLeaveBalance() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: { employeeId: string; leaveType: string; year: number; delta: number; reason?: string }) =>
            api.post(`/leave/balance/${input.employeeId}/adjust`, input),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave-balance'] }),
        onError: (err: Error) => toast.error('Adjustment failed', err?.message ?? 'Could not adjust leave balance.'),
    })
}
