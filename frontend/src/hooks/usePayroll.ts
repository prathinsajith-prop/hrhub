import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'
import { useSocketEvent } from '@/hooks/useSocket'
import type { PayrollAdjustment, PayrollAdjustmentCategory } from '@/types'

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

/** Delete a draft payroll run. Server returns 409 if the run has left draft. */
export function useDeletePayrollRun() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (runId: string) => api.delete(`/payroll/${runId}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll'] }),
        onError: (err: Error) => toast.error('Could not delete draft', err?.message ?? 'Unexpected error'),
    })
}

export interface PayrollReadinessEmployee {
    id: string
    employeeNo: string
    name: string
    avatarUrl: string | null
}

export interface PayrollReadiness {
    employeeCount: number
    missingIban: number
    missingSalary: number
    pendingLeaveInPeriod: number
    /** Up to 50 employees flagged — UI shows the list in a popover. */
    missingIbanEmployees: PayrollReadinessEmployee[]
    missingSalaryEmployees: PayrollReadinessEmployee[]
    blockers: string[]
    warnings: string[]
    canProcess: boolean
}

/**
 * Pre-processing readiness checklist for a draft run. Server returns 204 for
 * non-draft runs (nothing to check) — we treat that as `undefined` so the
 * checklist card simply doesn't render on processed/approved runs.
 */
export function useReadiness(runId: string | undefined) {
    return useQuery({
        queryKey: ['payroll', runId, 'readiness'],
        queryFn: async () => {
            // 204 returns no body; api.get would throw on JSON.parse. Use a
            // small fetch shim that handles the empty-body case.
            try {
                const res = await api.get<{ data: PayrollReadiness }>(`/payroll/${runId}/readiness`)
                return res?.data ?? null
            } catch {
                return null
            }
        },
        enabled: !!runId,
        staleTime: 30_000,
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

// ─── Payroll adjustments ────────────────────────────────────────────────────
// Single ledger of per-month additions/deductions consumed by runPayroll.

export function useAdjustments(year: number, month: number, enabled = true) {
    return useQuery({
        queryKey: ['payroll-adjustments', year, month],
        queryFn: () =>
            api.get<{ data: PayrollAdjustment[]; locked: boolean }>(
                `/payroll/adjustments?year=${year}&month=${month}`,
            ),
        staleTime: 30_000,
        enabled: enabled && Number.isInteger(year) && Number.isInteger(month),
    })
}

export interface CreateAdjustmentBody {
    employeeId: string
    periodYear: number
    periodMonth: number
    category: PayrollAdjustmentCategory
    amount: number
    notes?: string | null
}

export function useCreateAdjustment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: CreateAdjustmentBody) =>
            api.post<{ data: PayrollAdjustment }>('/payroll/adjustments', body).then((r) => r.data),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ['payroll-adjustments', vars.periodYear, vars.periodMonth] })
        },
        onError: (err: Error) => toast.error('Could not save adjustment', err?.message ?? 'Unexpected error'),
    })
}

export function useDeleteAdjustment(year: number, month: number) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/payroll/adjustments/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-adjustments', year, month] }),
        onError: (err: Error) => toast.error('Could not delete adjustment', err?.message ?? 'Unexpected error'),
    })
}

export interface BulkAdjustmentRow {
    rowNumber: number
    employeeNo?: string | null
    employeeName?: string | null
    employeeEmail?: string | null
    employeePhone?: string | null
    amount: number
    notes?: string | null
}

export interface BulkCreateAdjustmentsBody {
    periodYear: number
    periodMonth: number
    category: PayrollAdjustmentCategory
    rows: BulkAdjustmentRow[]
    /** When present, the dialog uploads the original .xlsx alongside the
     *  parsed rows. The server stores it in S3 and adds an entry to the
     *  bulk-import history. JSON-only callers (no file) still work. */
    file?: File
}

export interface BulkCreateAdjustmentsResult {
    /** Rows inserted as brand-new adjustments. */
    created: number
    /** Existing rows whose amount or notes were updated. */
    updated: number
    /** Existing rows that matched exactly — skipped. */
    unchanged: number
    /** Within-batch duplicates beyond the first occurrence — skipped. */
    duplicate: number
    /** Rows that failed validation (resolution / amount / category). */
    failed: number
    errors: Array<{ row: number; error: string }>
}

export function useBulkCreateAdjustments() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (body: BulkCreateAdjustmentsBody) => {
            const { file, ...payload } = body
            // Multipart path is opt-in: we ONLY send it when we actually have
            // file bytes to ship. A zero-byte file falls through to the JSON
            // route, which is functionally equivalent minus the S3 audit row
            // — better than failing with "missing file" when the buffer got
            // detached for any reason.
            if (file && file.size > 0) {
                const form = new FormData()
                form.append('file', file)
                form.append('payload', JSON.stringify(payload))
                return api.upload<BulkCreateAdjustmentsResult>('/payroll/adjustments/bulk', form)
            }
            return api.post<BulkCreateAdjustmentsResult>('/payroll/adjustments/bulk', payload)
        },
        onSuccess: (_d, vars) => {
            // Belt-and-suspenders refresh of every consumer downstream of the
            // adjustments ledger. invalidate marks each cache stale AND forces
            // active queries to refetch immediately (TanStack default behaviour),
            // so the Total additions / Total deductions KPIs on PayrollPage
            // update in the same tick the dialog closes — no stale-flash.
            qc.invalidateQueries({ queryKey: ['payroll-adjustments', vars.periodYear, vars.periodMonth] })
            qc.invalidateQueries({ queryKey: ['payroll-adjustment-imports'] })
            // Readiness + payslip totals depend on adjustments too — bulk
            // create can flip readiness from OK → blocked (or vice versa).
            qc.invalidateQueries({ queryKey: ['payroll'] })
        },
        // No global error toast — the dialog renders per-row errors inline.
        onError: () => {},
    })
}

// ─── Bulk import history ────────────────────────────────────────────────────

export interface BulkImportHistoryRow {
    id: string
    periodYear: number
    periodMonth: number
    category: PayrollAdjustmentCategory
    rowsCreated: number
    fileName: string
    fileSize: number
    createdAt: string
    createdByName: string | null
}

export function useBulkImportHistory(filter: { year?: number; month?: number } = {}) {
    const q = new URLSearchParams()
    if (filter.year !== undefined) q.set('year', String(filter.year))
    if (filter.month !== undefined) q.set('month', String(filter.month))
    return useQuery({
        queryKey: ['payroll-adjustment-imports', filter.year, filter.month],
        queryFn: () =>
            api.get<{ data: BulkImportHistoryRow[] }>(`/payroll/adjustments/imports${q.toString() ? `?${q}` : ''}`).then((r) => r.data),
        staleTime: 30_000,
    })
}

/** Trigger browser download of the original uploaded file via presigned URL. */
export function useDownloadImportFile() {
    return useMutation({
        mutationFn: async (id: string) => {
            const res = await api.get<{ data: { url: string; fileName: string } }>(`/payroll/adjustments/imports/${id}/download`)
            // Open the presigned URL directly. We use a hidden <a download> so
            // the browser keeps the filename even when the URL doesn't end in
            // a recognisable extension.
            const a = document.createElement('a')
            a.href = res.data.url
            a.download = res.data.fileName
            a.target = '_blank'
            a.rel = 'noopener noreferrer'
            document.body.appendChild(a)
            a.click()
            a.remove()
        },
        onError: (err: Error) => toast.error('Download failed', err?.message ?? 'Could not fetch the file.'),
    })
}

/** Verdict produced by the row-level comparison engine. Drives badge + colour. */
export type BulkRowAction = 'new' | 'unchanged' | 'updated' | 'duplicate' | 'invalid'

export interface FieldChange<T> {
    old: T
    new: T
}

export interface RowChanges {
    amount?: FieldChange<number>
    notes?: FieldChange<string | null>
}

export interface BulkValidateRow {
    rowNumber: number
    /** Legacy field — `valid` means the row will commit (new OR updated). */
    status: 'valid' | 'invalid'
    /** Per-row verdict — preferred over `status` for new code. */
    action: BulkRowAction
    error: string | null
    /** Non-blocking warning (e.g. duplicate-in-batch). */
    warning: string | null
    employeeId: string | null
    resolvedName: string | null
    resolvedEmployeeNo: string | null
    /** Existing manual adjustment matched on (employee, period, category). */
    existing: { id: string; amount: number; notes: string | null } | null
    /** Field-level diff when action === 'updated'. */
    changes: RowChanges | null
}

export interface BulkValidateResult {
    total: number
    /** Rows that will commit on submit (new + updated). */
    valid: number
    invalid: number
    /** Valid rows that also carry a non-blocking warning. */
    warned: number
    /** Counters fed into the preview summary cards. */
    newCount: number
    updatedCount: number
    unchangedCount: number
    duplicateCount: number
    /** True when the period is locked — surfaces the same blocker the
     *  bulk-create endpoint enforces, ahead of clicking Submit. */
    periodLocked: boolean
    rows: BulkValidateRow[]
}

// ─── Adjustment category catalog ────────────────────────────────────────────

export interface AdjustmentCategoryOption {
    value: string
    label: string
    kind: 'addition' | 'deduction'
    builtin: boolean
    /** False for auto-only categories (loan_repayment, unpaid_leave, sick_half_pay). */
    manual: boolean
}

export function useAdjustmentCategories() {
    return useQuery({
        queryKey: ['payroll-adjustment-categories'],
        queryFn: () =>
            api.get<{ data: AdjustmentCategoryOption[] }>('/payroll/adjustments/categories').then((r) => r.data),
        staleTime: 60_000,
    })
}

export function useCreateAdjustmentCategory() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: { label: string; kind: 'addition' | 'deduction' }) =>
            api.post<{ data: AdjustmentCategoryOption; created: boolean }>('/payroll/adjustments/categories', body),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['payroll-adjustment-categories'] })
        },
        onError: (err: Error) => toast.error('Could not create category', err?.message ?? 'Unexpected error'),
    })
}

export function useValidateBulkAdjustments() {
    return useMutation({
        // Period + category anchor the comparison engine — when all three are
        // present, every row is classified as new/updated/unchanged/duplicate.
        // Without them every row falls back to `new`.
        mutationFn: (body: {
            rows: BulkAdjustmentRow[]
            periodYear?: number
            periodMonth?: number
            category?: PayrollAdjustmentCategory
        }) =>
            api.post<BulkValidateResult>('/payroll/adjustments/bulk-validate', body),
        onError: () => {},
    })
}

export function useSyncAdjustments() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (vars: { year: number; month: number }) =>
            api.post<{ data: { leaveRows: number; loanRows: number } }>('/payroll/adjustments/sync', vars).then((r) => r.data),
        onSuccess: (_d, vars) => {
            qc.invalidateQueries({ queryKey: ['payroll-adjustments', vars.year, vars.month] })
        },
        onError: (err: Error) => toast.error('Sync failed', err?.message ?? 'Could not import leave + loan adjustments.'),
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
