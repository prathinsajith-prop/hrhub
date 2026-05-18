import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export type ChangeRequestCategory = 'bank_details' | 'personal' | 'contact'
export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected'

export interface ProfileChangeRequest {
    id: string
    employeeId: string
    category: ChangeRequestCategory
    status: ChangeRequestStatus
    proposedChanges: Record<string, string | null>
    currentSnapshot: Record<string, string | null>
    verifiedFields: string[] | null
    reviewerNotes: string | null
    rejectionReason: string | null
    reviewedBy: string | null
    reviewedAt: string | null
    createdAt: string
    updatedAt: string
    employeeName: string | null
    employeeNo: string | null
    employeeDepartment: string | null
    employeeAvatarUrl?: string | null
    requestedByName: string | null
}

const ROOT_KEY = ['profile-changes'] as const

export function usePendingProfileChanges() {
    return useQuery({
        queryKey: [...ROOT_KEY, 'pending'],
        queryFn: () => api.get<{ data: ProfileChangeRequest[] }>('/profile-changes/pending').then((r) => r.data),
        staleTime: 30_000,
    })
}

export function useProfileChangeHistory(filters: { status?: ChangeRequestStatus; employeeId?: string } = {}) {
    const qs = new URLSearchParams()
    if (filters.status) qs.set('status', filters.status)
    if (filters.employeeId) qs.set('employeeId', filters.employeeId)
    const query = qs.toString()
    return useQuery({
        queryKey: [...ROOT_KEY, 'history', filters],
        queryFn: () =>
            api.get<{ data: ProfileChangeRequest[] }>(`/profile-changes${query ? `?${query}` : ''}`).then((r) => r.data),
        staleTime: 60_000,
    })
}

export function useApproveProfileChange() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, verifiedFields, reviewerNotes }: { id: string; verifiedFields: string[]; reviewerNotes?: string }) =>
            api.post<{ data: ProfileChangeRequest }>(`/profile-changes/${id}/approve`, { verifiedFields, reviewerNotes }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ROOT_KEY })
            qc.invalidateQueries({ queryKey: ['employees'] })
            qc.invalidateQueries({ queryKey: ['notifications'] })
        },
    })
}

export function useRejectProfileChange() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            api.post<{ data: ProfileChangeRequest }>(`/profile-changes/${id}/reject`, { reason }),
        onSuccess: () => qc.invalidateQueries({ queryKey: ROOT_KEY }),
    })
}

// ─── UI helpers ──────────────────────────────────────────────────────────

export const CATEGORY_LABELS: Record<ChangeRequestCategory, string> = {
    bank_details: 'Bank details',
    contact: 'Contact details',
    personal: 'Personal details',
}

export const FIELD_LABELS: Record<string, string> = {
    bankName: 'Bank name',
    accountName: 'Account name',
    accountNumber: 'Account number',
    iban: 'IBAN',
    swiftCode: 'SWIFT code',
    bankBranch: 'Branch',
    phone: 'Phone',
    mobileNo: 'Mobile',
    personalEmail: 'Personal email',
    emergencyContactName: 'Emergency contact name',
    emergencyContactPhone: 'Emergency contact phone',
    emergencyContact: 'Emergency notes',
    homeCountryAddress: 'Home country address',
}
