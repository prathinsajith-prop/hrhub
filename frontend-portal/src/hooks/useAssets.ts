import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export interface AssetAssignment {
    id: string
    assetId: string
    assignedDate: string
    expectedReturnDate: string | null
    notes: string | null
    assetCode: string | null
    assetName: string | null
    assetBrand: string | null
    assetModel: string | null
    assetSerialNumber: string | null
    assetCondition: 'new' | 'good' | 'damaged' | null
    categoryName: string | null
}

// Assignments only change when HR re-issues gear — cache for 5 min.
const ASSET_STALE_TIME = 5 * 60 * 1000

export function useMyAssets() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'my-assets', tenantId],
        queryFn: () => api.get<{ data: AssetAssignment[] }>('/assets/my').then((r) => r.data),
        enabled: !!tenantId,
        staleTime: ASSET_STALE_TIME,
    })
}

export function useEmployeeAssets(employeeId: string | undefined) {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'employee-assets', tenantId, employeeId],
        queryFn: () =>
            api.get<{ data: AssetAssignment[] }>(`/assets/employee/${employeeId}`).then((r) => r.data),
        enabled: !!tenantId && !!employeeId,
        staleTime: ASSET_STALE_TIME,
    })
}
