import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

export type MemberRole = 'super_admin' | 'hr_manager' | 'pro_officer' | 'dept_head' | 'employee'

export interface TenantMembershipSummary {
    membershipId: string
    role: MemberRole
    isActive: boolean
    status: 'pending' | 'accepted' | 'revoked'
    tenantId: string
    tenantName: string
    jurisdiction: string | null
    industryType: string | null
    subscriptionPlan: string | null
    logoUrl: string | null
}

export interface CurrentTenant {
    tenant: {
        id: string
        name: string
        jurisdiction: string | null
        industryType: string | null
        subscriptionPlan: string | null
        logoUrl: string | null
        tradeLicenseNo?: string | null
    }
    role: MemberRole
    permissions: Record<string, boolean>
}

/* ─────────────────────────── My tenants ─────────────────────────── */

export function useMyTenants() {
    return useQuery({
        queryKey: ['tenants', 'mine'],
        queryFn: () => api.get<{ data: TenantMembershipSummary[] }>('/tenants').then(r => r.data),
    })
}

export function useCurrentTenant() {
    return useQuery({
        queryKey: ['tenants', 'current'],
        queryFn: () => api.get<{ data: CurrentTenant }>('/tenants/current').then(r => r.data),
    })
}

export function useCreateTenant() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: { name: string; jurisdiction?: string; industryType?: string; subscriptionPlan?: string }) =>
            api.post<{ data: { id: string; name: string } }>('/tenants', body).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
    })
}

/**
 * Switch to another tenant: receives a fresh token pair and updates the auth
 * store so all subsequent requests run against the new tenantId.
 */
export function useSwitchTenant() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: async (tenantId: string) => {
            const res = await api.post<{
                accessToken: string
                refreshToken: string
                user: any
                tenant: any
            }>('/tenants/switch', { tenantId })
            return res
        },
        onSuccess: (data) => {
            useAuthStore.getState().login(data.user, data.tenant, data.accessToken, data.refreshToken)
            // Hard refresh of all queries — server data is now scoped to the new tenant.
            qc.clear()
        },
    })
}

export function useAcceptInvite() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (token: string) =>
            api.post<{ data: { tenantId: string; role: MemberRole } }>('/tenants/invites/accept', { token })
                .then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['tenants'] }),
    })
}

/* ─────────────────────────── Members ─────────────────────────── */

export interface MemberRow {
    id: string
    userId: string | null
    role: MemberRole
    isActive: boolean
    status: 'pending' | 'accepted' | 'revoked'
    invitedEmail: string | null
    invitedAt: string | null
    acceptedAt: string | null
    expiresAt: string | null
    createdAt: string
    userName: string | null
    userEmail: string | null
    userAvatar: string | null
}

export function useTenantMembers() {
    return useQuery({
        queryKey: ['tenant-members'],
        queryFn: () => api.get<{ data: MemberRow[] }>('/tenants/members').then(r => r.data),
    })
}

export function useInviteMember() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (body: { email: string; role: MemberRole }) =>
            api.post<{
                data: {
                    membership: MemberRow
                    inviteToken: string
                    acceptUrl: string
                    expiresAt: string
                }
            }>('/tenants/members', body).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-members'] }),
    })
}

export function useChangeMemberRole() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, role }: { id: string; role: MemberRole }) =>
            api.patch<{ data: MemberRow }>(`/tenants/members/${id}`, { role }).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-members'] }),
    })
}

export function useRemoveMember() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.delete<void>(`/tenants/members/${id}`),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['tenant-members'] }),
    })
}
