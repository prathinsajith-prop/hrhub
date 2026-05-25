import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssetCategory {
    id: string
    tenantId: string
    name: string
    description?: string | null
    createdAt: string
    updatedAt: string
}

export interface Asset {
    id: string
    tenantId: string
    assetCode: string
    name: string
    categoryId?: string | null
    categoryName?: string | null
    brand?: string | null
    model?: string | null
    serialNumber?: string | null
    purchaseDate?: string | null
    purchaseCost?: string | null
    status: 'available' | 'assigned' | 'maintenance' | 'lost' | 'retired'
    condition: 'new' | 'good' | 'damaged'
    notes?: string | null
    assignedEmployeeId?: string | null
    assignedEmployeeName?: string | null
    assignedEmployeeNo?: string | null
    deletedAt?: string | null
    createdAt: string
    updatedAt: string
}

export interface AssetAssignment {
    id: string
    tenantId: string
    assetId: string
    assetCode?: string | null
    assetName?: string | null
    assetBrand?: string | null
    assetModel?: string | null
    assetSerialNumber?: string | null
    assetCondition?: string | null
    categoryName?: string | null
    employeeId: string
    employeeName?: string | null
    employeeNo?: string | null
    employeeDepartment?: string | null
    assignedBy?: string | null
    assignedDate: string
    expectedReturnDate?: string | null
    actualReturnDate?: string | null
    status: 'assigned' | 'returned' | 'lost'
    notes?: string | null
    createdAt: string
    updatedAt: string
}

export interface AssetMaintenance {
    id: string
    tenantId: string
    assetId: string
    reportedBy?: string | null
    issueDescription: string
    status: 'open' | 'in_progress' | 'resolved'
    cost?: string | null
    resolvedAt?: string | null
    notes?: string | null
    createdAt: string
    updatedAt: string
}

export interface AssetSummary {
    total: number
    available: number
    assigned: number
    maintenance: number
}

export interface AssetListResponse {
    data: Asset[]
    total?: number
    nextCursor?: string
    hasMore?: boolean
    limit: number
    offset?: number
    summary: AssetSummary
}

// ─── Query Params ─────────────────────────────────────────────────────────────

interface AssetParams {
    status?: string
    categoryId?: string
    search?: string
    filter?: string
    limit?: number
    offset?: number
    after?: string
}

function toQS(params: Record<string, string | number | undefined>) {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v !== undefined && q.set(k, String(v)))
    return q.toString()
}

// ─── Categories ───────────────────────────────────────────────────────────────

export function useAssetCategories() {
    return useQuery({
        queryKey: ['asset-categories'],
        queryFn: () => api.get<{ data: AssetCategory[] }>('/assets/categories').then(r => r.data),
        staleTime: 60_000,
    })
}

export function useCreateAssetCategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { name: string; description?: string }) =>
            api.post<{ data: AssetCategory }>('/assets/categories', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['asset-categories'] }),
        onError: (err: Error) => toast.error('Failed to create category', err.message),
    })
}

export function useDeleteAssetCategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/assets/categories/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['asset-categories'] }),
        onError: (err: Error) => toast.error('Failed to delete category', err.message),
    })
}

// ─── Assets ───────────────────────────────────────────────────────────────────

export function useAssets(params: AssetParams = {}) {
    return useQuery({
        queryKey: ['assets', params],
        queryFn: () =>
            api.get<AssetListResponse>(
                `/assets?${toQS({ ...params, limit: params.limit ?? 25, offset: params.offset ?? 0 })}`,
            ),
        staleTime: 30_000,
    })
}

export function useAsset(id: string) {
    return useQuery({
        queryKey: ['assets', id],
        queryFn: () => api.get<{ data: Asset }>(`/assets/${id}`).then(r => r.data),
        enabled: !!id,
        staleTime: 30_000,
    })
}

export function useCreateAsset() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<Asset>) => api.post<{ data: Asset }>('/assets', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
        onError: (err: Error) => toast.error('Failed to create asset', err.message),
    })
}

export function useUpdateAsset(id: string) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<Asset>) => api.patch<{ data: Asset }>(`/assets/${id}`, data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['assets'] })
            qc.invalidateQueries({ queryKey: ['assets', id] })
        },
        onError: (err: Error) => toast.error('Failed to update asset', err.message),
    })
}

export function useDeleteAsset() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/assets/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
        onError: (err: Error) => toast.error('Failed to delete asset', err.message),
    })
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export function useAssignAsset() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({
            assetId,
            ...data
        }: {
            assetId: string
            employeeId: string
            assignedDate?: string
            expectedReturnDate?: string
            notes?: string
        }) => api.post<{ data: AssetAssignment }>(`/assets/${assetId}/assign`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
        onError: (err: Error) => toast.error('Failed to assign asset', err.message),
    })
}

export function useReturnAsset() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({
            assignmentId,
            ...data
        }: {
            assignmentId: string
            actualReturnDate?: string
            notes?: string
        }) => api.post<{ data: AssetAssignment }>(`/assets/assignments/${assignmentId}/return`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
        onError: (err: Error) => toast.error('Failed to return asset', err.message),
    })
}

export function useMarkAssetLost() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (assignmentId: string) =>
            api.post<{ data: AssetAssignment }>(`/assets/assignments/${assignmentId}/lost`, {}),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
        onError: (err: Error) => toast.error('Failed to mark asset as lost', err.message),
    })
}

export function useEmployeeAssets(employeeId: string) {
    return useQuery({
        queryKey: ['assets', 'employee', employeeId],
        queryFn: () =>
            api.get<{ data: AssetAssignment[] }>(`/assets/assignments/employee/${employeeId}`).then(r => r.data),
        enabled: !!employeeId,
        staleTime: 30_000,
    })
}

export function useAssetHistory(assetId: string) {
    return useQuery({
        queryKey: ['assets', 'history', assetId],
        queryFn: () =>
            api.get<{ data: AssetAssignment[] }>(`/assets/${assetId}/history`).then(r => r.data),
        enabled: !!assetId,
        staleTime: 30_000,
    })
}

// ─── Maintenance ──────────────────────────────────────────────────────────────

export function useAssetMaintenance(assetId: string) {
    return useQuery({
        queryKey: ['assets', 'maintenance', assetId],
        queryFn: () =>
            api.get<{ data: AssetMaintenance[] }>(`/assets/${assetId}/maintenance`).then(r => r.data),
        enabled: !!assetId,
        staleTime: 30_000,
    })
}

export function useCreateMaintenanceRecord() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({
            assetId,
            ...data
        }: {
            assetId: string
            issueDescription: string
            notes?: string
        }) => api.post<{ data: AssetMaintenance }>(`/assets/${assetId}/maintenance`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
        onError: (err: Error) => toast.error('Failed to log maintenance', err.message),
    })
}

export function useUpdateMaintenanceRecord() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({
            maintenanceId,
            ...data
        }: {
            maintenanceId: string
            status?: 'open' | 'in_progress' | 'resolved'
            cost?: string
            notes?: string
        }) => api.patch<{ data: AssetMaintenance }>(`/assets/maintenance/${maintenanceId}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
        onError: (err: Error) => toast.error('Failed to update maintenance record', err.message),
    })
}

// ─── Bulk import ──────────────────────────────────────────────────────────────
//
// Two endpoints, same row shape. `useValidateBulkAssets` runs the
// server-side preview (no DB writes) so the dialog can show green/red
// per row before HR commits. `useBulkCreateAssets` does the actual insert
// — only after the preview looks good.

export interface BulkAssetRowInput {
    rowNumber: number
    assetCode?: string | null
    name?: string | null
    categoryName?: string | null
    brand?: string | null
    model?: string | null
    serialNumber?: string | null
    purchaseDate?: string | null
    purchaseCost?: number | string | null
    status?: string | null
    condition?: string | null
    notes?: string | null
}

export interface BulkAssetRowResult {
    rowNumber: number
    ok: boolean
    errors: string[]
    duplicateCode?: boolean
    resolved?: {
        assetCode: string | null
        name: string
        categoryId: string | null
        categoryName: string | null
        brand: string | null
        model: string | null
        serialNumber: string | null
        purchaseDate: string | null
        purchaseCost: string | null
        status: Asset['status']
        condition: Asset['condition']
        notes: string | null
    }
}

export interface BulkAssetValidationResponse {
    rows: BulkAssetRowResult[]
    summary: { total: number; valid: number; invalid: number }
}

export interface BulkAssetCreateResponse extends BulkAssetValidationResponse {
    created: number
    skipped: number
}

export function useValidateBulkAssets() {
    return useMutation({
        mutationFn: (rows: BulkAssetRowInput[]) =>
            api.post<BulkAssetValidationResponse>('/assets/bulk-validate', { rows }),
    })
}

export function useBulkCreateAssets() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (rows: BulkAssetRowInput[]) =>
            api.post<BulkAssetCreateResponse>('/assets/bulk', { rows }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
        onError: (err: Error) => toast.error('Bulk import failed', err.message),
    })
}
