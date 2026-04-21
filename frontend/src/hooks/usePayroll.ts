import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function usePayrollRuns(params: { year?: number; limit?: number; offset?: number } = {}) {
    const q = new URLSearchParams()
    if (params.year) q.set('year', String(params.year))
    q.set('limit', String(params.limit ?? 12))
    q.set('offset', String(params.offset ?? 0))

    return useQuery({
        queryKey: ['payroll', params],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/payroll?${q}`),
    })
}

export function usePayslips(runId: string) {
    return useQuery({
        queryKey: ['payroll', runId, 'payslips'],
        queryFn: () => api.get<{ data: unknown[] }>(`/payroll/${runId}/payslips`).then(r => r.data),
        enabled: !!runId,
    })
}

export function useGratuityCalc(basicSalary: number, yearsOfService: number) {
    return useQuery({
        queryKey: ['gratuity', basicSalary, yearsOfService],
        queryFn: () => api.get<{ data: { gratuity: number } }>(`/payroll/gratuity-calc?basicSalary=${basicSalary}&yearsOfService=${yearsOfService}`).then(r => r.data),
        enabled: basicSalary > 0 && yearsOfService >= 0,
    })
}

export function useUpdatePayrollRun(id: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: unknown) => api.patch(`/payroll/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
    })
}
