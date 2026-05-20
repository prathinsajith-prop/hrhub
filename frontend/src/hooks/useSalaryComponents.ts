import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'
import type { SalaryComponent, SalaryComponentKind } from '@/types'

const KEY = ['salary-components'] as const

export function useSalaryComponents(kind?: SalaryComponentKind) {
    return useQuery({
        queryKey: [...KEY, kind ?? 'all'],
        queryFn: () => {
            const qs = kind ? `?kind=${kind}` : ''
            return api.get<{ data: SalaryComponent[] }>(`/salary-components${qs}`).then((r) => r.data)
        },
        staleTime: 30_000,
    })
}

export interface CreateSalaryComponentBody {
    kind: SalaryComponentKind
    category: string
    name: string
    nameInPayslip: string
    nameInPayslipAr?: string | null
    payType?: 'fixed' | 'variable' | null
    calculationType?: 'flat' | 'percentage_of_basic' | null
    amount?: number | null
    proRata?: boolean
    applicableSocialSecurity?: string[]
    frequency?: 'one_time' | 'recurring' | null
    isActive?: boolean
}

export function useCreateSalaryComponent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: CreateSalaryComponentBody) =>
            api.post<{ data: SalaryComponent }>('/salary-components', body).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
        onError: (err: Error) => toast.error('Could not save component', err?.message ?? 'Unexpected error'),
    })
}

export function useUpdateSalaryComponent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, patch }: { id: string; patch: Partial<CreateSalaryComponentBody> }) =>
            api.patch<{ data: SalaryComponent }>(`/salary-components/${id}`, patch).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
        onError: (err: Error) => toast.error('Could not update component', err?.message ?? 'Unexpected error'),
    })
}

export function useDeleteSalaryComponent() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/salary-components/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
        onError: (err: Error) => toast.error('Could not delete component', err?.message ?? 'Unexpected error'),
    })
}
