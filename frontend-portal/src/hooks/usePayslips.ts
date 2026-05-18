import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import type { Payslip, PayslipDetail } from '@/types'

// Payslips are immutable once a run is finalised, so we extend the freshness
// window well beyond the global 30s default to avoid pointless refetches.
const PAYSLIP_STALE_TIME = 10 * 60 * 1000

export function useMyPayslips() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'my-payslips', tenantId],
        queryFn: () => api.get<{ data: Payslip[] }>('/payroll/my-payslips').then((r) => r.data),
        enabled: !!tenantId,
        staleTime: PAYSLIP_STALE_TIME,
    })
}

export function usePayslipDetail(payslipId: string | undefined) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'payslip', tenantId, payslipId],
        queryFn: () =>
            api.get<{ data: PayslipDetail }>(`/payroll/payslips/${payslipId}`).then((r) => r.data),
        enabled: !!payslipId && !!tenantId,
        staleTime: PAYSLIP_STALE_TIME,
    })
}
