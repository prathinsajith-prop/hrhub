import { WifiOff } from 'lucide-react'
import { useOnline } from '@/hooks/useOnline'
import { cn } from '@/lib/utils'

/**
 * Thin banner that slides in from the top when the browser goes offline.
 * Disappears automatically when the connection is restored.
 * Wrap at the app-layout level so it sits above all page content.
 */
export function OfflineBanner() {
    const isOnline = useOnline()

    return (
        <div
            role="status"
            aria-live="polite"
            aria-label={isOnline ? undefined : 'You are offline'}
            className={cn(
                'overflow-hidden transition-all duration-300 ease-in-out',
                isOnline ? 'max-h-0 opacity-0' : 'max-h-12 opacity-100',
            )}
        >
            <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
                <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>You're offline — changes will sync when reconnected.</span>
            </div>
        </div>
    )
}
