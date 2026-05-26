/**
 * Biometric ID mappings + attendance import hooks.
 *
 * Query keys:
 *   ['biometric-mappings', tenantId]       — list of mappings
 *
 * The import flow has no read query (validate is a mutation that returns
 * the preview rows). Commit invalidates attendance-records so the daily
 * rollup picks up the new punches.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'

export interface BiometricMapping {
    id: string
    employeeId: string
    employeeNo: string | null
    employeeName: string
    department: string | null
    mapperId: string
    label: string | null
    createdAt: string
    createdByName: string | null
}

export interface CreateMappingPayload {
    employeeId: string
    mapperId: string
    label?: string | null
}

export interface UpdateMappingPayload {
    id: string
    mapperId?: string
    label?: string | null
}

export interface AttendanceImportRow {
    rowNumber: number
    mapperId?: string | null
    employeeNo?: string | null
    date: string
    recordedAt: string
    punchType: 'in' | 'out'
    locationName?: string | null
    deviceId?: string | null
    notes?: string | null
}

export type AttendanceImportAction = 'new' | 'duplicate' | 'invalid'

export interface AttendanceImportRowResult {
    rowNumber: number
    action: AttendanceImportAction
    error: string | null
    employeeId: string | null
    resolvedName: string | null
    resolvedEmployeeNo: string | null
    resolvedVia: 'mapper_id' | 'employee_no' | null
    parsedAt: string | null
    punchType: 'in' | 'out'
}

export interface AttendanceImportValidateResult {
    total: number
    newCount: number
    duplicateCount: number
    invalidCount: number
    rows: AttendanceImportRowResult[]
}

export interface AttendanceImportCommitResult {
    created: number
    duplicate: number
    failed: number
    errors: Array<{ row: number; error: string }>
}

function useTenantId(): string {
    return useAuthStore((s) => s.user?.tenantId ?? '')
}

// ─── Mappings ───────────────────────────────────────────────────────────────

export function useBiometricMappings() {
    const tenantId = useTenantId()
    return useQuery({
        queryKey: ['biometric-mappings', tenantId],
        queryFn: () => api.get<{ data: BiometricMapping[] }>('/attendance/mappings').then((r) => r.data),
        staleTime: 30_000,
    })
}

export function useCreateMapping() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (payload: CreateMappingPayload) =>
            api.post<{ data: BiometricMapping }>('/attendance/mappings', payload).then((r) => r.data),
        // Await the refetch so the table reflects the new row when the
        // dialog closes — same pattern as the travel mutations.
        onSuccess: () => Promise.all([
            qc.invalidateQueries({ queryKey: ['biometric-mappings'] }),
        ]),
        onError: (err: Error) => toast.error('Could not create mapping', err?.message ?? 'Unexpected error'),
    })
}

export function useUpdateMapping() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...patch }: UpdateMappingPayload) =>
            api.patch<{ data: BiometricMapping }>(`/attendance/mappings/${id}`, patch).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['biometric-mappings'] }),
        onError: (err: Error) => toast.error('Could not update mapping', err?.message ?? 'Unexpected error'),
    })
}

export function useDeleteMapping() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/attendance/mappings/${id}`),
        onSuccess: async () => {
            await qc.invalidateQueries({ queryKey: ['biometric-mappings'] })
            toast.success('Mapping removed')
        },
        onError: (err: Error) => toast.error('Could not remove mapping', err?.message ?? 'Unexpected error'),
    })
}

// ─── Import ─────────────────────────────────────────────────────────────────

export function useValidateAttendanceImport() {
    return useMutation({
        mutationFn: (rows: AttendanceImportRow[]) =>
            api.post<AttendanceImportValidateResult>('/attendance/import/validate', { rows }),
        // Inline errors only — the dialog renders the validation result table
        // itself, so a global toast would be noisy.
        onError: () => {},
    })
}

export function useCommitAttendanceImport() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (rows: AttendanceImportRow[]) =>
            api.post<AttendanceImportCommitResult>('/attendance/import/commit', { rows }),
        // Commit affects the daily attendance rollup and any cached punch
        // view — invalidate broadly so every consumer refreshes.
        onSuccess: () => Promise.all([
            qc.invalidateQueries({ queryKey: ['attendance'] }),
            qc.invalidateQueries({ queryKey: ['attendance-punches'] }),
        ]),
        onError: () => {},
    })
}

// ─── Bulk mapping update ─────────────────────────────────────────────────────
//
// Mirrors the assets / jobs bulk-import hooks: preview mutation + commit
// mutation. The preview echoes the resolved employee name and any errors
// per row so the dialog can render a green/red table.

export interface BulkMappingRowInput {
    rowNumber: number
    employeeNo?: string | null
    mappingId?: string | null
    label?: string | null
}

export interface BulkMappingRowResult {
    rowNumber: number
    ok: boolean
    errors: string[]
    employeeName?: string
    mappingId?: string
    resolved?: {
        employeeId: string
        mapperId: string
        label: string | null
    }
}

export interface BulkMappingValidationResponse {
    rows: BulkMappingRowResult[]
    summary: { total: number; valid: number; invalid: number }
}

export interface BulkMappingCreateResponse extends BulkMappingValidationResponse {
    created: number
    skipped: number
}

export function useValidateBulkMappings() {
    return useMutation({
        mutationFn: (rows: BulkMappingRowInput[]) =>
            api.post<BulkMappingValidationResponse>('/attendance/mappings/bulk-validate', { rows }),
    })
}

export function useBulkCreateMappings() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (rows: BulkMappingRowInput[]) =>
            api.post<BulkMappingCreateResponse>('/attendance/mappings/bulk', { rows }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['biometric-mappings'] }),
        onError: (err: Error) => toast.error('Bulk import failed', err?.message ?? 'Unexpected error'),
    })
}
