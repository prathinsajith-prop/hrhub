import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface TwoFactorStatus {
    enabled: boolean
    backupCodesRemaining: number
}

const STATUS_KEY = ['portal', '2fa', 'status']

/** Current 2FA state for the signed-in user. */
export function useTwoFactorStatus() {
    return useQuery({
        queryKey: STATUS_KEY,
        queryFn: () => api.get<{ data: TwoFactorStatus }>('/auth/2fa/status').then((r) => r.data),
        staleTime: 30_000,
    })
}

/** Begin enrollment — returns a QR data URL + the base32 secret (not yet enabled). */
export function useSetupTwoFactor() {
    return useMutation({
        mutationFn: () =>
            api.post<{ data: { qrDataUrl: string; secret: string } }>('/auth/2fa/setup').then((r) => r.data),
    })
}

/** Confirm a code to activate 2FA; returns one-time backup codes. */
export function useVerifyTwoFactor() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (token: string) =>
            api.post<{ data: { enabled: boolean; backupCodes: string[] } }>('/auth/2fa/verify', { token }).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
    })
}

/** Disable 2FA (requires a current TOTP code). */
export function useDisableTwoFactor() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (token: string) =>
            api.post<{ data: { enabled: boolean } }>('/auth/2fa/disable', { token }).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
    })
}

/** Regenerate backup codes (requires a current TOTP code); returns the new set. */
export function useRegenerateBackupCodes() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (token: string) =>
            api.post<{ data: { backupCodes: string[] } }>('/auth/2fa/backup-codes/regenerate', { token }).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
    })
}
