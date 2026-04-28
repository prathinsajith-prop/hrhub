import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

/**
 * Decode a JWT payload without verification (we trust the token here — the
 * backend re-validates on every request). Returns `null` on any failure so
 * callers can safely fall back.
 */
function decodeJwt(token: string | null): Record<string, unknown> | null {
    if (!token) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    try {
        // base64url → base64
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
        return JSON.parse(atob(padded)) as Record<string, unknown>
    } catch {
        return null
    }
}

/**
 * Returns the current user's `employeeId`, falling back to the JWT claim if
 * the persisted `user` object was hydrated from an older app version where
 * `employeeId` was not yet stored. This prevents "My Leave / My Payslips /
 * My Profile" pages from blanking out after a token refresh or app upgrade.
 *
 * Self-healing: if the store has no `employeeId` but the JWT does, the value
 * is written back to the store so subsequent renders use it from the cache.
 */
export function useCurrentEmployeeId(): string | undefined {
    const userEmployeeId = useAuthStore(s => s.user?.employeeId)
    const accessToken = useAuthStore(s => s.accessToken)
    const setUser = useAuthStore(s => s.setUser)

    const fromJwt = userEmployeeId
        ? undefined
        : (() => {
            const claims = decodeJwt(accessToken)
            return claims && typeof claims.employeeId === 'string' ? claims.employeeId : undefined
        })()

    // Write JWT-sourced employeeId back to the store so it survives the session
    // without relying on re-decoding every render.
    useEffect(() => {
        if (!userEmployeeId && fromJwt) {
            setUser({ employeeId: fromJwt })
        }
    }, [userEmployeeId, fromJwt, setUser])

    return userEmployeeId || fromJwt
}
