/**
 * Travel module — TanStack Query hooks.
 *
 * Query keys are scoped to (tenantId, year, month, filters) where applicable
 * so cross-tenant cache leaks are impossible and invalidation can be surgical.
 *
 *   ['travel-requests', tenantId, filters]     list endpoint (paginated)
 *   ['travel-request',  tenantId, id]          single request
 *   ['travel-expenses', tenantId, requestId]   expenses + totals for one trip
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'

export type TravelRequestStatus =
    | 'draft'
    | 'submitted'
    | 'approved'
    | 'rejected'
    | 'cancelled'
    | 'completed'

export type TravelExpenseStatus =
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'reimbursed'

export interface TravelRequestListRow {
    id: string
    travelNo: string
    employeeId: string
    employeeNo: string | null
    employeeName: string
    department: string | null
    placeOfVisit: string | null
    departureDate: string
    arrivalDate: string
    durationDays: number
    purposeOfVisit: string | null
    customerName: string | null
    isBillableToCustomer: boolean
    status: TravelRequestStatus
    approvedAt: string | null
    rejectionReason: string | null
    notes: string | null
    createdAt: string
    updatedAt: string
}

export interface TravelRequestDetail extends TravelRequestListRow {
    approvedBy: string | null
    approverName: string | null
    createdBy: string | null
}

export interface TravelRequestListResponse {
    data: TravelRequestListRow[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
}

export interface TravelRequestFilter {
    employeeId?: string
    status?: TravelRequestStatus
    from?: string
    to?: string
    search?: string
    limit?: number
    offset?: number
}

export interface TravelExpenseRow {
    id: string
    travelRequestId: string
    travelNo: string
    employeeId: string
    employeeNo: string | null
    employeeName: string
    description: string | null
    expenseDate: string
    ticket: string
    lodging: string
    boarding: string
    phone: string
    localConveyance: string
    incidentals: string
    others: string
    currency: string
    receiptS3Key: string | null
    status: TravelExpenseStatus
    approvedAt: string | null
    rejectionReason: string | null
    createdAt: string
    total: string
}

export interface TravelExpenseTotals {
    ticket: string
    lodging: string
    boarding: string
    phone: string
    localConveyance: string
    incidentals: string
    others: string
    grandTotal: string
    rowCount: number
}

/** Tenant id from the auth store — feeds every query key. */
function useTenantId(): string {
    return useAuthStore((s) => s.user?.tenantId ?? '')
}

function buildQuery(filter: TravelRequestFilter): string {
    const qs = new URLSearchParams()
    if (filter.employeeId) qs.set('employeeId', filter.employeeId)
    if (filter.status) qs.set('status', filter.status)
    if (filter.from) qs.set('from', filter.from)
    if (filter.to) qs.set('to', filter.to)
    if (filter.search) qs.set('search', filter.search)
    if (filter.limit !== undefined) qs.set('limit', String(filter.limit))
    if (filter.offset !== undefined) qs.set('offset', String(filter.offset))
    const q = qs.toString()
    return q ? `?${q}` : ''
}

// ─── Travel requests ────────────────────────────────────────────────────────

export function useTravelRequests(filter: TravelRequestFilter = {}) {
    const tenantId = useTenantId()
    return useQuery({
        queryKey: ['travel-requests', tenantId, filter],
        queryFn: () => api.get<TravelRequestListResponse>(`/travel/requests${buildQuery(filter)}`),
        staleTime: 30_000,
    })
}

export function useTravelRequest(id: string | null) {
    const tenantId = useTenantId()
    return useQuery({
        queryKey: ['travel-request', tenantId, id],
        queryFn: () => api.get<{ data: TravelRequestDetail }>(`/travel/requests/${id}`).then((r) => r.data),
        enabled: !!id,
        staleTime: 30_000,
    })
}

export interface CreateTravelRequestPayload {
    employeeId?: string
    placeOfVisit?: string | null
    departureDate: string
    arrivalDate: string
    purposeOfVisit?: string | null
    customerName?: string | null
    isBillableToCustomer?: boolean
    notes?: string | null
}

export function useCreateTravelRequest() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (payload: CreateTravelRequestPayload) =>
            api.post<{ data: TravelRequestDetail }>('/travel/requests', payload).then((r) => r.data),
        // Returning the Promise from onSuccess makes `mutateAsync` wait for
        // every active list query to refetch BEFORE resolving — so when the
        // dialog closes, the table behind it already shows the new row. No
        // more "page reload to see my submission" surprise.
        onSuccess: () => Promise.all([
            qc.invalidateQueries({ queryKey: ['travel-requests'] }),
        ]),
        onError: (err: Error) => toast.error('Could not create travel request', err?.message ?? 'Unexpected error'),
    })
}

export interface UpdateTravelRequestPayload {
    id: string
    placeOfVisit?: string | null
    departureDate?: string
    arrivalDate?: string
    purposeOfVisit?: string | null
    customerName?: string | null
    isBillableToCustomer?: boolean
    notes?: string | null
}

export function useUpdateTravelRequest() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...patch }: UpdateTravelRequestPayload) =>
            api.patch<{ data: TravelRequestDetail }>(`/travel/requests/${id}`, patch).then((r) => r.data),
        onSuccess: () => Promise.all([
            qc.invalidateQueries({ queryKey: ['travel-requests'] }),
            // Prefix-match every cached singleton via ['travel-request'] —
            // simpler than passing the id (and resilient if the id changes).
            qc.invalidateQueries({ queryKey: ['travel-request'] }),
        ]),
        onError: (err: Error) => toast.error('Could not update travel request', err?.message ?? 'Unexpected error'),
    })
}

/** Generic "transition" hook. One mutation per verb keeps the cache
 *  invalidation isolated and the toast copy specific. */
function useTransitionTravelRequest(
    verb: 'submit' | 'cancel' | 'approve' | 'reject' | 'complete',
    successCopy: string,
) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, rejectionReason }: { id: string; rejectionReason?: string }) =>
            api.post<{ data: TravelRequestDetail }>(
                `/travel/requests/${id}/${verb}`,
                verb === 'reject' ? { rejectionReason } : undefined,
            ).then((r) => r.data),
        // Wait for the table to refresh before the toast fires so the user
        // sees the status badge change and then "approved" — not the other
        // way around.
        onSuccess: async () => {
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['travel-requests'] }),
                qc.invalidateQueries({ queryKey: ['travel-request'] }),
                // Approving a trip changes whether it's eligible for new
                // expenses — refresh the picker too.
                qc.invalidateQueries({ queryKey: ['travel-expenses-all'] }),
            ])
            toast.success(successCopy)
        },
        onError: (err: Error) => toast.error(`Could not ${verb} request`, err?.message ?? 'Unexpected error'),
    })
}

export const useSubmitTravelRequest = () => useTransitionTravelRequest('submit', 'Travel request submitted')
export const useCancelTravelRequest = () => useTransitionTravelRequest('cancel', 'Travel request cancelled')
export const useApproveTravelRequest = () => useTransitionTravelRequest('approve', 'Travel request approved')
export const useRejectTravelRequest = () => useTransitionTravelRequest('reject', 'Travel request rejected')
export const useCompleteTravelRequest = () => useTransitionTravelRequest('complete', 'Travel marked as completed')

export function useDeleteTravelRequest() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/travel/requests/${id}`),
        onSuccess: async () => {
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['travel-requests'] }),
                qc.invalidateQueries({ queryKey: ['travel-request'] }),
                // Deleting a request cascade-removes its expenses — the flat
                // expense list and any per-trip caches need to drop them.
                qc.invalidateQueries({ queryKey: ['travel-expenses'] }),
                qc.invalidateQueries({ queryKey: ['travel-expenses-all'] }),
            ])
            toast.success('Travel request deleted')
        },
        onError: (err: Error) => toast.error('Could not delete request', err?.message ?? 'Unexpected error'),
    })
}

// ─── Travel expenses ────────────────────────────────────────────────────────

export interface TravelExpensesResponse {
    data: TravelExpenseRow[]
    totals: TravelExpenseTotals
}

/** Per-request expense list + grand totals. */
export function useTravelExpenses(travelRequestId: string | null) {
    const tenantId = useTenantId()
    return useQuery({
        queryKey: ['travel-expenses', tenantId, travelRequestId],
        queryFn: () => api.get<TravelExpensesResponse>(`/travel/requests/${travelRequestId}/expenses`),
        enabled: !!travelRequestId,
        staleTime: 30_000,
    })
}

/**
 * Flat list of every travel expense the viewer is allowed to see — used by
 * the top-level Expenses tab when no specific request is selected. The
 * server applies the same scope rules as the requests endpoint, so an
 * employee only sees their own expenses and a dept_head sees their subtree.
 */
export function useAllTravelExpenses(filter: { status?: TravelExpenseStatus } = {}) {
    const tenantId = useTenantId()
    const qs = filter.status ? `?status=${filter.status}` : ''
    return useQuery({
        queryKey: ['travel-expenses-all', tenantId, filter],
        queryFn: () => api.get<{ data: TravelExpenseRow[] }>(`/travel/expenses${qs}`).then((r) => r.data),
        staleTime: 30_000,
    })
}

export interface CreateTravelExpensePayload {
    travelRequestId: string
    description?: string | null
    expenseDate: string
    ticket?: number | string
    lodging?: number | string
    boarding?: number | string
    phone?: number | string
    localConveyance?: number | string
    incidentals?: number | string
    others?: number | string
    currency?: string
    receiptS3Key?: string | null
}

export function useCreateTravelExpense() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (payload: CreateTravelExpensePayload) =>
            api.post<{ data: TravelExpenseRow }>('/travel/expenses', payload).then((r) => r.data),
        // Three caches need to refresh on every expense write:
        //
        //   • ['travel-expenses']         — per-trip detail (used inside
        //     TravelExpensesPanel — line items + per-category totals).
        //     Previous version passed [_, undefined, id] which fails prefix
        //     matching against [_, tenantId, id]; we use just the leading
        //     key so every per-trip cache invalidates.
        //
        //   • ['travel-expenses-all']     — flat AllExpensesView table on
        //     the top-level Expenses tab. Was missing entirely before —
        //     hence "the new row doesn't appear without a reload".
        //
        //   • ['travel-requests']         — list view may render a "has
        //     expenses" pip per row in the future; safe to refresh.
        //
        // The whole onSuccess returns a Promise.all, which means the
        // mutation's `mutateAsync` only resolves after EVERY active list
        // query has refetched. The dialog closes only when data is fresh.
        onSuccess: () => Promise.all([
            qc.invalidateQueries({ queryKey: ['travel-expenses'] }),
            qc.invalidateQueries({ queryKey: ['travel-expenses-all'] }),
            qc.invalidateQueries({ queryKey: ['travel-requests'] }),
        ]),
        onError: (err: Error) => toast.error('Could not add expense', err?.message ?? 'Unexpected error'),
    })
}

export interface UpdateTravelExpensePayload {
    id: string
    description?: string | null
    expenseDate?: string
    ticket?: number | string
    lodging?: number | string
    boarding?: number | string
    phone?: number | string
    localConveyance?: number | string
    incidentals?: number | string
    others?: number | string
    currency?: string
    receiptS3Key?: string | null
}

export function useUpdateTravelExpense() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...patch }: UpdateTravelExpensePayload) =>
            api.patch<{ data: TravelExpenseRow }>(`/travel/expenses/${id}`, patch).then((r) => r.data),
        onSuccess: () => Promise.all([
            qc.invalidateQueries({ queryKey: ['travel-expenses'] }),
            qc.invalidateQueries({ queryKey: ['travel-expenses-all'] }),
        ]),
        onError: (err: Error) => toast.error('Could not update expense', err?.message ?? 'Unexpected error'),
    })
}

export function useDeleteTravelExpense() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete(`/travel/expenses/${id}`),
        onSuccess: async () => {
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['travel-expenses'] }),
                qc.invalidateQueries({ queryKey: ['travel-expenses-all'] }),
            ])
            toast.success('Expense deleted')
        },
        onError: (err: Error) => toast.error('Could not delete expense', err?.message ?? 'Unexpected error'),
    })
}

function useTransitionTravelExpense(
    verb: 'approve' | 'reject' | 'reimburse',
    successCopy: string,
) {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, rejectionReason }: { id: string; rejectionReason?: string }) =>
            api.post<{ data: TravelExpenseRow }>(
                `/travel/expenses/${id}/${verb}`,
                verb === 'reject' ? { rejectionReason } : undefined,
            ).then((r) => r.data),
        onSuccess: async () => {
            await Promise.all([
                qc.invalidateQueries({ queryKey: ['travel-expenses'] }),
                qc.invalidateQueries({ queryKey: ['travel-expenses-all'] }),
            ])
            toast.success(successCopy)
        },
        onError: (err: Error) => toast.error(`Could not ${verb} expense`, err?.message ?? 'Unexpected error'),
    })
}

export const useApproveTravelExpense   = () => useTransitionTravelExpense('approve',   'Expense approved')
export const useRejectTravelExpense    = () => useTransitionTravelExpense('reject',    'Expense rejected')
export const useReimburseTravelExpense = () => useTransitionTravelExpense('reimburse', 'Expense marked as reimbursed')
