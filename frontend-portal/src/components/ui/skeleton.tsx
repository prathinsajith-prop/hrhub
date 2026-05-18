import { cn } from '@/lib/utils'

/**
 * Skeleton placeholder. Uses the `skeleton-shimmer` keyframe in index.css —
 * a moving gradient that reads as "loading" without the jarring opacity-pulse
 * flicker. Falls back to the muted background colour if @media (prefers-reduced-motion).
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            role="status"
            aria-busy="true"
            aria-live="polite"
            className={cn('skeleton-shimmer rounded-md', className)}
            {...props}
        />
    )
}

export { Skeleton }
