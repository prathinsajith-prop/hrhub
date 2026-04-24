import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface CompanySettings {
    id: string
    name: string
    tradeLicenseNo: string
    jurisdiction: string
    industryType: string
    subscriptionPlan: string
    logoUrl: string | null
}

export interface TenantUser {
    id: string
    name: string
    email: string
    role: string
    department: string | null
    isActive: boolean
    lastLoginAt: string | null
    createdAt: string
}

export function useCompanySettings() {
    return useQuery({
        queryKey: ['settings', 'company'],
        queryFn: () =>
            api.get<{ data: CompanySettings }>('/settings/company').then((r) => r.data),
    })
}

export function useUpdateCompanySettings() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<CompanySettings>) =>
            api.patch<{ data: CompanySettings }>('/settings/company', data).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'company'] }),
    })
}

export function useTenantUsers() {
    return useQuery({
        queryKey: ['settings', 'users'],
        queryFn: () =>
            api.get<{ data: TenantUser[] }>('/settings/users').then((r) => r.data),
        staleTime: 30_000,
    })
}

export function useUpdateUser() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, ...data }: { id: string; isActive?: boolean; role?: string }) =>
            api.patch<{ data: TenantUser }>(`/settings/users/${id}`, data).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'users'] }),
    })
}

// ── 2FA hooks ────────────────────────────────────────────────────────────────
export function useTwoFaStatus() {
    return useQuery({
        queryKey: ['2fa', 'status'],
        queryFn: () => api.get<{ data: { enabled: boolean; backupCodesRemaining: number } }>('/auth/2fa/status').then((r) => r.data),
    })
}

export function useTwoFaSetup() {
    return useMutation({
        mutationFn: () =>
            api.post<{ data: { qrDataUrl: string; secret: string } }>('/auth/2fa/setup', {}).then((r) => r.data),
    })
}

export function useTwoFaVerify() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (token: string) =>
            api.post<{ data: { enabled: boolean; backupCodes: string[] } }>('/auth/2fa/verify', { token }).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['2fa', 'status'] }),
    })
}

export function useTwoFaDisable() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (token: string) =>
            api.post<{ data: { enabled: boolean } }>('/auth/2fa/disable', { token }).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['2fa', 'status'] }),
    })
}

export function useTwoFaRegenerateBackupCodes() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (token: string) =>
            api.post<{ data: { backupCodes: string[] } }>('/auth/2fa/backup-codes/regenerate', { token }).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['2fa', 'status'] }),
    })
}

// ── IP Allowlist hooks ────────────────────────────────────────────────────────
export function useIpAllowlist() {
    return useQuery({
        queryKey: ['settings', 'ip-allowlist'],
        queryFn: () => api.get<{ data: { ipAllowlist: string[] } }>('/settings/ip-allowlist').then((r) => r.data),
    })
}

export function useUpdateIpAllowlist() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (ipAllowlist: string[]) =>
            api.put<{ data: { ipAllowlist: string[] } }>('/settings/ip-allowlist', { ipAllowlist }).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'ip-allowlist'] }),
    })
}

