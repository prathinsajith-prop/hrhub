import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

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

export function useExitRequests() {
    return useQuery({
        queryKey: ['exit'],
        queryFn: () => api.get<ExitRequest[]>('/exit'),
    })
}

export function useSettlementPreview(employeeId: string | undefined, exitDate: string | undefined, exitType: string | undefined) {
    return useQuery({
        queryKey: ['exit-preview', employeeId, exitDate, exitType],
        queryFn: () => api.get<SettlementPreview>(`/exit/settlement-preview?employeeId=${employeeId}&exitDate=${exitDate}&exitType=${exitType}`),
        enabled: !!employeeId && !!exitDate && !!exitType,
    })
}

export function useInitiateExit() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.post('/exit', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['exit'] }),
    })
}

export function useApproveExit() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.patch(`/exit/${id}/approve`, {}),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['exit'] }),
    })
}

export function useMarkSettlementPaid() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.patch(`/exit/${id}/settlement-paid`, {}),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['exit'] }),
    })
}
