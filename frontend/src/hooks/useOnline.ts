import { useEffect, useState } from 'react'

/**
 * Tracks real-time network connectivity.
 * Returns `true` when online, `false` when offline.
 *
 * Note: `navigator.onLine` is a coarse signal — it detects the presence of a
 * network interface, not actual internet reachability. Use this for UI hints
 * (banners, disabling mutations) rather than authoritative connectivity checks.
 */
export function useOnline(): boolean {
    const [isOnline, setIsOnline] = useState(() =>
        typeof navigator !== 'undefined' ? navigator.onLine : true,
    )

    useEffect(() => {
        const goOnline = () => setIsOnline(true)
        const goOffline = () => setIsOnline(false)

        window.addEventListener('online', goOnline)
        window.addEventListener('offline', goOffline)

        return () => {
            window.removeEventListener('online', goOnline)
            window.removeEventListener('offline', goOffline)
        }
    }, [])

    return isOnline
}
