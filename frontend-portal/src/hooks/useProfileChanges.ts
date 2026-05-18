import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export type ChangeRequestCategory = 'bank_details' | 'personal' | 'contact'
type ChangeRequestStatus = 'pending' | 'approved' | 'rejected'

export interface ChangeRequest {
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
}

export interface PendingChangeRequest extends ChangeRequest {
    employeeName: string | null
    employeeNo: string | null
    employeeDepartment: string | null
    employeeAvatarUrl: string | null
    requestedByName: string | null
}

export function useMyChangeRequests() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'my-change-requests', tenantId],
        queryFn: () => api.get<{ data: ChangeRequest[] }>('/profile-changes/my').then((r) => r.data),
        enabled: !!tenantId,
    })
}

export function usePendingChangeRequests() {
    const tenantId = useAuthStore((s) => s.user?.tenantId)
    return useQuery({
        queryKey: ['portal', 'pending-change-requests', tenantId],
        queryFn: () =>
            api.get<{ data: PendingChangeRequest[] }>('/profile-changes/pending').then((r) => r.data),
        enabled: !!tenantId,
    })
}

export function useSubmitChangeRequest() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (input: { category: ChangeRequestCategory; changes: Record<string, string | null> }) =>
            api.post<{ data: ChangeRequest }>('/profile-changes', input),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'my-change-requests'] })
        },
    })
}

export function useApproveChangeRequest() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, verifiedFields, reviewerNotes }: { id: string; verifiedFields: string[]; reviewerNotes?: string }) =>
            api.post<{ data: ChangeRequest }>(`/profile-changes/${id}/approve`, { verifiedFields, reviewerNotes }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'pending-change-requests'] })
            qc.invalidateQueries({ queryKey: ['portal', 'me'] })
            qc.invalidateQueries({ queryKey: ['portal', 'my-change-requests'] })
        },
    })
}

export function useRejectChangeRequest() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            api.post<{ data: ChangeRequest }>(`/profile-changes/${id}/reject`, { reason }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['portal', 'pending-change-requests'] })
            qc.invalidateQueries({ queryKey: ['portal', 'my-change-requests'] })
        },
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

export const CATEGORY_FIELDS: Record<ChangeRequestCategory, string[]> = {
    bank_details: ['bankName', 'accountName', 'accountNumber', 'iban', 'swiftCode', 'bankBranch'],
    contact: ['phone', 'mobileNo', 'personalEmail'],
    personal: ['emergencyContactName', 'emergencyContactPhone', 'emergencyContact', 'homeCountryAddress'],
}
