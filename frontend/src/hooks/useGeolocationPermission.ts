import { useCallback, useEffect, useState } from 'react'

/**
 * Tracks the device's geolocation permission so the UI can gate actions
 * (e.g. employee check-in) on the user having enabled location.
 *
 * Status values:
 *   - 'granted'      — permission granted, geolocation calls will succeed
 *   - 'prompt'       — not asked yet; calling request() will pop the browser prompt
 *   - 'denied'       — user blocked the permission; they must change it in
 *                      browser/OS settings (`unblock`)
 *   - 'unsupported'  — the device/browser has no Geolocation API at all
 *   - 'checking'     — initial state while the Permissions API is being polled
 *
 * `request()` attempts to read the current position once. On success the
 * status flips to 'granted'; on failure it reflects the reason (denied /
 * unsupported / unavailable).
 */
export type GeolocationStatus =
    | 'granted'
    | 'prompt'
    | 'denied'
    | 'unsupported'
    | 'checking'

export interface UseGeolocationPermissionResult {
    status: GeolocationStatus
    /** Last known position, populated after the first successful read. */
    position: GeolocationPosition | null
    /** Error from the last attempted request, if any. */
    error: GeolocationPositionError | null
    /** Trigger a permission prompt + immediate position read. */
    request: () => Promise<GeolocationPosition | null>
}

export function useGeolocationPermission(): UseGeolocationPermissionResult {
    const [status, setStatus] = useState<GeolocationStatus>(() => {
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
            return 'unsupported'
        }
        return 'checking'
    })
    const [position, setPosition] = useState<GeolocationPosition | null>(null)
    const [error, setError] = useState<GeolocationPositionError | null>(null)

    // Subscribe to Permissions API changes when available. Some browsers
    // (older Safari/iOS) don't expose `navigator.permissions` — in that case
    // we leave the status at 'prompt' until the user clicks request().
    useEffect(() => {
        if (status === 'unsupported') return
        let cancelled = false
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perms = (navigator as any).permissions as Permissions | undefined
        if (!perms?.query) {
            setStatus('prompt')
            return
        }
        perms.query({ name: 'geolocation' as PermissionName })
            .then((result) => {
                if (cancelled) return
                setStatus(result.state as GeolocationStatus)
                result.onchange = () => {
                    if (!cancelled) setStatus(result.state as GeolocationStatus)
                }
            })
            .catch(() => {
                if (!cancelled) setStatus('prompt')
            })
        return () => { cancelled = true }
    }, [status])

    const request = useCallback(async (): Promise<GeolocationPosition | null> => {
        if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
            setStatus('unsupported')
            return null
        }
        return new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    setPosition(pos)
                    setError(null)
                    setStatus('granted')
                    resolve(pos)
                },
                (err) => {
                    setError(err)
                    if (err.code === err.PERMISSION_DENIED) setStatus('denied')
                    else setStatus('prompt')
                    resolve(null)
                },
                { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
            )
        })
    }, [])

    return { status, position, error, request }
}
