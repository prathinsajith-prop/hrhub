import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from '@/components/ui/overlays'

export interface CompanySettings {
    id: string
    name: string
    companyCode: string | null
    tradeLicenseNo: string
    /** UAE business type — mainland or freezone. Was named `jurisdiction`
        until migration 0051; the API still accepts the old key on PATCH for
        back-compat. */
    businessType: string
    industryType: string
    subscriptionPlan: string
    logoUrl: string | null
    // Org Profile contact fields
    phone: string | null
    address: string | null
    companyEmail: string | null
    companyWebsite: string | null
}

export interface TenantUser {
    id: string
    name: string
    email: string
    role: string
    roles: string[]
    isActive: boolean
    /** HR-controlled switch — when false, the employee portal hides the
     *  check-in / check-out buttons for this user. Defaults to true. */
    attendancePunchEnabled: boolean
    /** HR-controlled switch — when false, the employee portal hides the
     *  manual-entry panel that lets the user back-fill missed punches.
     *  Defaults to true. */
    attendanceManualEntryEnabled: boolean
    lastLoginAt: string | null
    createdAt: string
    employeeId: string
    employeeNo: string | null
    designation: string | null
    department: string | null
    avatarUrl: string | null
}

export interface InvitableEmployee {
    id: string
    employeeNo: string | null
    firstName: string
    lastName: string
    email: string | null
    workEmail: string | null
    department: string | null
    designation: string | null
    avatarUrl: string | null
    fullName: string
    inviteEmail: string | null
}

export function useCompanySettings() {
    return useQuery({
        queryKey: ['settings', 'company'],
        queryFn: () =>
            api.get<{ data: CompanySettings }>('/settings/company').then((r) => r.data),
        staleTime: 5 * 60 * 1000,
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
        mutationFn: ({ id, ...data }: { id: string; isActive?: boolean; role?: string; roles?: string[]; attendancePunchEnabled?: boolean; attendanceManualEntryEnabled?: boolean }) =>
            api.patch<{ data: TenantUser }>(`/settings/users/${id}`, data).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'users'] }),
    })
}

export function useInvitableEmployees(options?: { enabled?: boolean }) {
    return useQuery({
        queryKey: ['settings', 'invitable-employees'],
        queryFn: () =>
            api.get<{ data: InvitableEmployee[] }>('/settings/invitable-employees').then((r) => r.data),
        staleTime: 30_000,
        enabled: options?.enabled ?? true,
    })
}

export function useInviteUser() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { employeeId: string; role: string; roles?: string[] }) =>
            api.post<{ data: TenantUser }>('/settings/users/invite', data).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['settings', 'users'] })
            qc.invalidateQueries({ queryKey: ['settings', 'invitable-employees'] })
        },
    })
}

export interface BulkInviteResult {
    succeeded: Array<{ employeeId: string; name: string; email: string }>
    failed: Array<{ employeeId: string; reason: string }>
}

export function useInviteUserBulk() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { employeeIds: string[]; role: string; roles?: string[] }) =>
            api.post<{ data: BulkInviteResult }>('/settings/users/invite-bulk', data).then((r) => r.data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['settings', 'users'] })
            qc.invalidateQueries({ queryKey: ['settings', 'invitable-employees'] })
        },
    })
}

export function useResendUserInvite() {
    return useMutation({
        mutationFn: (employeeId: string) =>
            api.post(`/settings/users/${employeeId}/resend-invite`, {}).then(() => undefined),
        onError: (err: Error) => toast.error('Failed to resend invite', err.message),
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

// ── Regional Settings hooks ───────────────────────────────────────────────────
export interface RegionalSettings {
    timezone: string
    currency: string
    dateFormat: string
}

export function useRegionalSettings() {
    return useQuery({
        queryKey: ['settings', 'regional'],
        queryFn: () => api.get<{ data: RegionalSettings }>('/settings/regional').then(r => r.data),
        staleTime: 5 * 60 * 1000,
    })
}

export function useUpdateRegionalSettings() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<RegionalSettings>) =>
            api.patch<{ data: RegionalSettings }>('/settings/regional', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'regional'] }),
    })
}

// ── Security Settings hooks ───────────────────────────────────────────────────
export interface SecuritySettings {
    sessionTimeoutMinutes: number
    auditLoggingEnabled: boolean
}

export function useSecuritySettings() {
    return useQuery({
        queryKey: ['settings', 'security'],
        queryFn: () => api.get<{ data: SecuritySettings }>('/settings/security').then(r => r.data),
        staleTime: 5 * 60 * 1000,
    })
}

export function useUpdateSecuritySettings() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<SecuritySettings>) =>
            api.patch<{ data: SecuritySettings }>('/settings/security', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'security'] }),
    })
}

// ── Organisation Policy hooks ────────────────────────────────────────────────
// Mirrors backend `/settings/org-policy`. The org-wide privacy policy + the
// notifications-enabled master toggle live here; per-user prefs use the
// separate `notifications` hook below.
export interface OrgPolicy {
    notificationsEnabled: boolean
    privacyPolicy: {
        showBirthday: boolean
        showWorkAnniversary: boolean
        showMobile: boolean
        searchableInDirectory: boolean
    }
}

export function useOrgPolicy() {
    return useQuery({
        queryKey: ['settings', 'org-policy'],
        queryFn: () => api.get<{ data: OrgPolicy }>('/settings/org-policy').then(r => r.data),
        staleTime: 5 * 60 * 1000,
    })
}

export function useUpdateOrgPolicy() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<{ notificationsEnabled: boolean; privacyPolicy: Partial<OrgPolicy['privacyPolicy']> }>) =>
            api.patch<{ data: OrgPolicy }>('/settings/org-policy', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'org-policy'] }),
    })
}

// ── Per-employee privacy overrides (self-service) ────────────────────────────
export type PrivacyOverrides = Partial<{
    showBirthday: boolean
    showWorkAnniversary: boolean
    showMobile: boolean
    searchableInDirectory: boolean
}>

export function useMyPrivacy() {
    return useQuery({
        queryKey: ['settings', 'me', 'privacy'],
        queryFn: () => api.get<{ data: PrivacyOverrides }>('/settings/me/privacy').then(r => r.data),
        staleTime: 5 * 60 * 1000,
    })
}

export function useUpdateMyPrivacy() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: PrivacyOverrides) =>
            api.patch<{ data: PrivacyOverrides }>('/settings/me/privacy', data).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'me', 'privacy'] }),
    })
}

// ── Notification Preferences hooks ───────────────────────────────────────────
export type NotifPrefs = Record<string, { email: boolean; push: boolean }>

export function useNotifPrefs() {
    return useQuery({
        queryKey: ['settings', 'notifications'],
        queryFn: () => api.get<{ data: NotifPrefs }>('/settings/notifications').then(r => r.data),
        staleTime: 5 * 60 * 1000,
    })
}

export function useUpdateNotifPrefs() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (prefs: NotifPrefs) =>
            api.put<{ data: NotifPrefs }>('/settings/notifications', prefs).then(r => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'notifications'] }),
    })
}

// ── IP Allowlist hooks ────────────────────────────────────────────────────────
export function useIpAllowlist() {
    return useQuery({
        queryKey: ['settings', 'ip-allowlist'],
        queryFn: () => api.get<{ data: { ipAllowlist: string[] } }>('/settings/ip-allowlist').then((r) => r.data),
        staleTime: 5 * 60 * 1000,
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

// ── Leave Settings hooks ──────────────────────────────────────────────────────
export type Weekday = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

export interface LeaveSettings {
    rolloverEnabledFrom: string | null
    weekOffDays: Weekday[]
    workingWeekStart: Weekday
}

export function useLeaveSettings() {
    return useQuery({
        queryKey: ['settings', 'leave'],
        queryFn: () => api.get<{ data: LeaveSettings }>('/settings/leave').then((r) => r.data),
        staleTime: 5 * 60 * 1000,
    })
}

export function useUpdateLeaveSettings() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<LeaveSettings>) =>
            api.patch<{ data: LeaveSettings }>('/settings/leave', data).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'leave'] }),
    })
}

