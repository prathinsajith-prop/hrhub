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

export function usePayrollRun(id: string | undefined) {
    return useQuery({
        queryKey: ['payroll-run', id],
        queryFn: () => api.get<{ data: unknown }>(`/payroll/${id}`).then(r => r.data),
        enabled: !!id,
        refetchInterval: (query) => {
            const run = query.state.data as any
            return run?.status === 'processing' ? 3000 : false
        },
    })
}

export function useRunPayroll() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (runId: string) => api.post<{ data: unknown }>(`/payroll/${runId}/run`, {}).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
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

export function useSubmitWps() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (runId: string) => api.post<{ data: unknown }>(`/payroll/${runId}/submit-wps`, {}).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
    })
}

/** Downloads WPS SIF file for the given payroll run and triggers browser save. */
export function useDownloadWpsSif() {
    return useMutation({
        mutationFn: async (runId: string) => {
            const { useAuthStore } = await import('@/store/authStore')
            const token = useAuthStore.getState().accessToken
            const res = await fetch(`/api/v1/payroll/${runId}/wps-sif`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                cache: 'no-store',
            })
            if (!res.ok) throw new Error('Failed to download WPS file')
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `wps-sif-${runId}.txt`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        },
    })
}

/** Downloads payslip PDF for the given payslip ID and triggers browser save. */
export function useDownloadPayslip() {
    return useMutation({
        mutationFn: async (payslipId: string) => {
            const { useAuthStore } = await import('@/store/authStore')
            const token = useAuthStore.getState().accessToken
            const res = await fetch(`/api/v1/payroll/payslips/${payslipId}/download`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                cache: 'no-store',
            })
            if (!res.ok) throw new Error('Failed to download payslip')
            const blob = await res.blob()
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `payslip-${payslipId}.pdf`
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        },
    })
}
