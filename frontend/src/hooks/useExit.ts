import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { buildFilterQueryString, type AppliedFiltersMap } from '@/lib/filters'

export interface ExitRequest {
    id: string
    tenantId: string
    employeeId: string
    exitType: 'resignation' | 'termination' | 'contract_end' | 'retirement'
    exitDate: string
    lastWorkingDay: string
    reason?: string
    noticePeriodDays: string
    status: 'pending' | 'approved' | 'rejected' | 'completed'
    gratuityAmount?: string
    leaveEncashmentAmount?: string
    unpaidSalaryAmount?: string
    deductions?: string
    totalSettlement?: string
    settlementPaid?: boolean
    settlementPaidDate?: string
    approvedBy?: string
    notes?: string
    createdAt: string
    updatedAt: string
    // enriched by backend JOIN
    employeeName?: string
    employeeNo?: string
    employeeDesignation?: string
    employeeDepartment?: string
    employeeAvatarUrl?: string | null
}

export interface SettlementPreview {
    employeeId: string
    employeeName: string
    basicSalary: number
    totalSalary: number
    yearsOfService: number
    joinDate: string
    exitDate: string
    exitType: string
    gratuityAmount: number
    leaveEncashmentAmount: number
    unpaidSalaryAmount: number
    unusedLeaveDays: number
    deductions: number
    totalSettlement: number
}

export function useExitRequests(params: { status?: string; q?: string; filters?: AppliedFiltersMap; limit?: number; offset?: number } = {}) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    const { status, q, filters, limit = 20, offset = 0 } = params
    const qs = new URLSearchParams()
    if (status) qs.set('status', status)
    if (q) qs.set('q', q)
    qs.set('limit', String(limit))
    qs.set('offset', String(offset))
    if (filters && Object.keys(filters).length > 0) {
        const filterStr = buildFilterQueryString(filters)
        if (filterStr) qs.set('filter', filterStr)
    }
    return useQuery({
        queryKey: ['exit', tenantId, status, q, filters, limit, offset],
        queryFn: () => api.get<{ data: ExitRequest[]; total: number; hasMore: boolean }>(`/exit?${qs}`),
        enabled: !!tenantId,
    })
}

export function useExitRequest(id: string | undefined) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['exit', tenantId, id],
        queryFn: () => api.get<{ data: ExitRequest }>(`/exit/${id}`).then(r => r.data),
        enabled: !!id && !!tenantId,
    })
}

export function useSettlementPreview(
    employeeId: string | undefined,
    exitDate: string | undefined,
    exitType: string | undefined,
    deductions?: number,
) {
    const deductionsParam = deductions ? `&deductions=${deductions}` : ''
    return useQuery({
        queryKey: ['exit-preview', employeeId, exitDate, exitType, deductions],
        queryFn: () => api.get<{ data: SettlementPreview }>(
            `/exit/settlement-preview?employeeId=${employeeId}&exitDate=${exitDate}&exitType=${exitType}${deductionsParam}`
        ).then(r => r.data),
        enabled: !!employeeId && !!exitDate && !!exitType,
    })
}

export interface InitiateExitInput {
    employeeId: string
    exitType: 'resignation' | 'termination' | 'contract_end' | 'retirement'
    exitDate: string
    lastWorkingDay: string
    noticePeriodDays?: number
    reason?: string
    deductions?: number
    notes?: string
}

export function useInitiateExit() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: InitiateExitInput) => api.post('/exit', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['exit'] }), // broad invalidation covers all tenant variants
    })
}

export function useApproveExit() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.patch(`/exit/${id}/approve`, {}),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['exit'] })
            qc.invalidateQueries({ queryKey: ['employees'] })
        },
    })
}

export function useRejectExit() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
            api.patch(`/exit/${id}/reject`, { reason }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['exit'] }), // broad invalidation covers all tenant variants
    })
}

export function useMarkSettlementPaid() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.patch(`/exit/${id}/settlement-paid`, {}),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['exit'] }), // broad invalidation covers all tenant variants
    })
}
