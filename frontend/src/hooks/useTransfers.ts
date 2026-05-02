import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EmployeeTransfer {
    id: string
    tenantId: string
    employeeId: string
    transferDate: string
    fromDesignation: string | null
    fromDepartment: string | null
    fromBranchId: string | null
    fromDivisionId: string | null
    fromDepartmentId: string | null
    toDesignation: string | null
    toDepartment: string | null
    toBranchId: string | null
    toDivisionId: string | null
    toDepartmentId: string | null
    newSalary: string | null
    reason: string | null
    notes: string | null
    approvedBy: string | null
    approvedByName: string | null
    createdAt: string
}

export interface CreateTransferInput {
    transferDate: string
    toDesignation?: string
    toBranchId?: string | null
    toDivisionId?: string | null
    toDepartmentId?: string | null
    newSalary?: number | null
    reason?: string
    notes?: string
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useEmployeeTransfers(employeeId: string | undefined) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['transfers', tenantId, employeeId],
        queryFn: () =>
            api.get<{ data: EmployeeTransfer[] }>(`/employees/${employeeId}/transfers`).then(r => r.data),
        enabled: !!employeeId && !!tenantId,
        staleTime: 30_000,
    })
}

export function useCreateTransfer(employeeId: string) {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useMutation({
        mutationFn: (data: CreateTransferInput) =>
            api.post<{ data: EmployeeTransfer }>(`/employees/${employeeId}/transfer`, data).then(r => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['transfers', tenantId, employeeId] })
            qc.invalidateQueries({ queryKey: ['employees', employeeId] })
            qc.invalidateQueries({ queryKey: ['employees'] })
        },
    })
}
