import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'
import { useSocketEvent } from '@/hooks/useSocket'

export function usePayrollRuns(params: { year?: number; limit?: number; offset?: number; enabled?: boolean } = {}) {
    const { year, limit = 12, offset = 0, enabled = true } = params
    const q = new URLSearchParams()
    if (year) q.set('year', String(year))
    q.set('limit', String(limit))
    q.set('offset', String(offset))

    return useQuery({
        queryKey: ['payroll', year, limit, offset],
        queryFn: () => api.get<{ data: unknown[]; total: number }>(`/payroll?${q}`),
        staleTime: 30_000,
        enabled,
    })
}

export function usePayrollRun(id: string | undefined) {
    const qc = useQueryClient()

    // Invalidate immediately when the worker emits payroll:completed or payroll:failed
    const onPayrollComplete = useCallback((payload: Record<string, unknown>) => {
        if (!id || payload.payrollRunId !== id) return
        qc.invalidateQueries({ queryKey: ['payroll-run', id] })
        qc.invalidateQueries({ queryKey: ['payroll'] })
    }, [qc, id])

    useSocketEvent('payroll:completed', onPayrollComplete)
    useSocketEvent('payroll:failed', onPayrollComplete)

    return useQuery({
        queryKey: ['payroll-run', id],
        queryFn: () => api.get<{ data: unknown }>(`/payroll/${id}`).then(r => r.data),
        enabled: !!id,
        // Keep 3s poll as fallback in case the WebSocket is down while processing
        refetchInterval: (query) => {
            const run = query.state.data as { status?: string }
            return run?.status === 'processing' ? 3000 : false
        },
    })
}

export function useCreatePayrollRun() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { month: number; year: number }) => api.post<{ data: unknown }>('/payroll', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
        onError: (err: Error) => toast.error('Failed to create payroll run', err?.message ?? 'Could not create a draft payroll run.'),
    })
}

export function useRunPayroll() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (runId: string) => api.post<{ data: unknown }>(`/payroll/${runId}/run`, {}).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
        onError: (err: Error) => toast.error('Payroll run failed', err?.message ?? 'Could not process the payroll run.'),
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
        onError: (err: Error) => toast.error('Update failed', err?.message ?? 'Could not update the payroll run.'),
    })
}

export function useSubmitWps() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (runId: string) => api.post<{ data: unknown }>(`/payroll/${runId}/submit-wps`, {}).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
        onError: (err: Error) => toast.error('WPS submission failed', err?.message ?? 'Could not submit the WPS file.'),
    })
}

/** Downloads WPS SIF file for the given payroll run and triggers browser save. */
export function useDownloadWpsSif() {
    return useMutation({
        onError: () => toast.error('Download failed', 'Could not download the WPS SIF file.'),
        mutationFn: async (runId: string) => {
            const blob = await api.download(`/payroll/${runId}/wps-sif`)
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
        onError: () => toast.error('Download failed', 'Could not download the payslip.'),
        mutationFn: async (payslipId: string) => {
            const blob = await api.download(`/payroll/payslips/${payslipId}/download`)
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
