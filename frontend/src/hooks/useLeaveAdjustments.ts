import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LeaveAdjustment {
    id: string
    tenantId: string
    employeeId: string
    employeeName?: string | null
    leaveType: string
    year: number
    delta: string
    reason?: string | null
    createdBy?: string | null
    createdByName?: string | null
    createdAt: string
}

export interface AirTicket {
    id: string
    tenantId: string
    employeeId: string
    employeeName?: string | null
    year: number
    ticketFor: 'self' | 'family' | 'both'
    destination?: string | null
    amount?: string | null
    currency: string
    status: 'pending' | 'approved' | 'rejected' | 'used'
    reason?: string | null
    notes?: string | null
    createdBy?: string | null
    createdByName?: string | null
    createdAt: string
}

export interface LeaveOffset {
    id: string
    tenantId: string
    employeeId: string
    employeeName?: string | null
    workDate: string
    days: string
    reason?: string | null
    status: 'pending' | 'approved' | 'rejected'
    notes?: string | null
    createdBy?: string | null
    createdByName?: string | null
    createdAt: string
}

interface PaginatedResponse<T> {
    data: T[]
    total: number
    limit: number
    offset: number
    hasMore: boolean
}

// ─── Leave Adjustments ────────────────────────────────────────────────────────

export function useLeaveAdjustments(params?: { employeeId?: string; limit?: number; offset?: number }) {
    const tenantId = useAuthStore(s => s.user?.tenantId)
    const qs = new URLSearchParams()
    if (params?.employeeId) qs.set('employeeId', params.employeeId)
    qs.set('limit', String(params?.limit ?? 25))
    qs.set('offset', String(params?.offset ?? 0))

    return useQuery<PaginatedResponse<LeaveAdjustment>>({
        queryKey: ['leave', 'adjustments', tenantId, params],
        queryFn: () => api.get(`/leave/adjustments?${qs}`),
        staleTime: 30_000,
        enabled: !!tenantId,
    })
}

export function useDeleteLeaveAdjustment() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: (id: string) => api.delete(`/leave/adjustments/${id}`),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['leave', 'adjustments', tenantId] })
            qc.invalidateQueries({ queryKey: ['leave-balance'] })
        },
    })
}

// ─── Air Tickets ──────────────────────────────────────────────────────────────

export function useAirTickets(params?: { employeeId?: string; status?: string; limit?: number; offset?: number }) {
    const tenantId = useAuthStore(s => s.user?.tenantId)
    const qs = new URLSearchParams()
    if (params?.employeeId) qs.set('employeeId', params.employeeId)
    if (params?.status) qs.set('status', params.status)
    qs.set('limit', String(params?.limit ?? 25))
    qs.set('offset', String(params?.offset ?? 0))

    return useQuery<PaginatedResponse<AirTicket>>({
        queryKey: ['leave', 'air-tickets', tenantId, params],
        queryFn: () => api.get(`/leave/air-tickets?${qs}`),
        staleTime: 30_000,
        enabled: !!tenantId,
    })
}

export interface CreateAirTicketInput {
    employeeId: string
    year: number
    ticketFor: 'self' | 'family' | 'both'
    destination?: string
    amount?: number
    currency?: string
    reason?: string
    notes?: string
}

export function useCreateAirTicket() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: (data: CreateAirTicketInput) => api.post('/leave/air-tickets', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave', 'air-tickets', tenantId] }),
    })
}

export function useUpdateAirTicket() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: ({ id, ...data }: Partial<CreateAirTicketInput> & { id: string; status?: AirTicket['status'] }) =>
            api.patch(`/leave/air-tickets/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave', 'air-tickets', tenantId] }),
    })
}

export function useDeleteAirTicket() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: (id: string) => api.delete(`/leave/air-tickets/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave', 'air-tickets', tenantId] }),
    })
}

// ─── Leave Offsets ────────────────────────────────────────────────────────────

export function useLeaveOffsets(params?: { employeeId?: string; status?: string; limit?: number; offset?: number }) {
    const tenantId = useAuthStore(s => s.user?.tenantId)
    const qs = new URLSearchParams()
    if (params?.employeeId) qs.set('employeeId', params.employeeId)
    if (params?.status) qs.set('status', params.status)
    qs.set('limit', String(params?.limit ?? 25))
    qs.set('offset', String(params?.offset ?? 0))

    return useQuery<PaginatedResponse<LeaveOffset>>({
        queryKey: ['leave', 'offsets', tenantId, params],
        queryFn: () => api.get(`/leave/offsets?${qs}`),
        staleTime: 30_000,
        enabled: !!tenantId,
    })
}

export interface CreateLeaveOffsetInput {
    employeeId: string
    workDate: string
    days?: number
    reason?: string
    notes?: string
}

export function useCreateLeaveOffset() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: (data: CreateLeaveOffsetInput) => api.post('/leave/offsets', data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave', 'offsets', tenantId] }),
    })
}

export function useUpdateLeaveOffset() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: ({ id, ...data }: Partial<CreateLeaveOffsetInput> & { id: string; status?: LeaveOffset['status'] }) =>
            api.patch(`/leave/offsets/${id}`, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave', 'offsets', tenantId] }),
    })
}

export function useDeleteLeaveOffset() {
    const qc = useQueryClient()
    const tenantId = useAuthStore(s => s.user?.tenantId)
    return useMutation({
        mutationFn: (id: string) => api.delete(`/leave/offsets/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['leave', 'offsets', tenantId] }),
    })
}
