import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmployeeLoan {
    id: string
    tenantId: string
    employeeId: string
    employeeName?: string | null
    employeeNo?: string | null
    employeeDepartment?: string | null
    approverName?: string | null
    amount: string
    monthlyDeduction: string
    reason?: string | null
    status: 'pending' | 'approved' | 'rejected' | 'active' | 'completed' | 'cancelled'
    approvedBy?: string | null
    approvedAt?: string | null
    startDate?: string | null
    totalInstallments?: number | null
    paidInstallments: number
    remainingBalance?: string | null
    notes?: string | null
    createdAt: string
    updatedAt: string
}

export interface LoanSummary {
    total: number
    pending: number
    active: number
    totalDisbursed: number
    totalOutstanding: number
}

export interface LoanListResponse {
    data: EmployeeLoan[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
    summary: LoanSummary
}

export interface CreateLoanInput {
    employeeId?: string
    amount: string
    monthlyDeduction: string
    reason?: string
    notes?: string
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useLoans(params?: {
    employeeId?: string
    status?: string
    limit?: number
    offset?: number
}) {
    const tenantId = useAuthStore(s => s.user?.tenantId)
    const qs = new URLSearchParams()
    if (params?.employeeId) qs.set('employeeId', params.employeeId)
    if (params?.status) qs.set('status', params.status)
    qs.set('limit', String(params?.limit ?? 25))
    qs.set('offset', String(params?.offset ?? 0))

    return useQuery<LoanListResponse>({
        queryKey: ['loans', tenantId, params],
        queryFn: () => api.get(`/loans?${qs}`),
        staleTime: 30_000,
        enabled: !!tenantId,
    })
}

export function useMyLoans() {
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useQuery<{ data: EmployeeLoan[] }>({
        queryKey: ['loans', tenantId, 'my'],
        queryFn: () => api.get('/loans/my'),
        staleTime: 30_000,
        enabled: !!tenantId,
    })
}

export function useCreateLoan() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: (data: CreateLoanInput) => api.post('/loans', data),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans', tenantId] }) },
    })
}

export function useApproveLoan() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: ({ id, startDate }: { id: string; startDate?: string }) =>
            api.post(`/loans/${id}/approve`, { startDate }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans', tenantId] }) },
    })
}

export function useRejectLoan() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
            api.post(`/loans/${id}/reject`, { notes }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans', tenantId] }) },
    })
}

export function useRecordLoanPayment() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: (id: string) => api.post(`/loans/${id}/payment`),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['loans', tenantId] }) },
    })
}
