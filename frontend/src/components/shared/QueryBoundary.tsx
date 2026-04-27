import { type ReactNode, type ElementType } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { EmptyState } from './EmptyState'

interface QueryBoundaryProps {
    isLoading: boolean
    error?: Error | null
    isEmpty?: boolean
    onRetry?: () => void
    // Loading skeleton — pass count for repeated rows, or a custom element
    skeletonRows?: number
    skeletonHeight?: string
    skeleton?: ReactNode
    // Empty state
    emptyIcon?: ElementType
    emptyTitle?: string
    emptyDescription?: string
    emptyAction?: ReactNode
    // Actual content
    children: ReactNode
    className?: string
}

/**
 * Uniform loading / error / empty-state wrapper for any data-driven section.
 * Eliminates the repeated isLoading ? <Skeleton> : isEmpty ? <EmptyState> : <Content> pattern.
 *
 * Usage:
 *   <QueryBoundary isLoading={isLoading} error={error} isEmpty={items.length === 0} onRetry={refetch}
 *     emptyIcon={Users} emptyTitle="No employees found" skeletonRows={5}>
 *     {items.map(...)}
 *   </QueryBoundary>
 */
export function QueryBoundary({
    isLoading,
    error,
    isEmpty = false,
    onRetry,
    skeletonRows = 3,
    skeletonHeight = 'h-12',
    skeleton,
    emptyIcon,
    emptyTitle = 'No data found',
    emptyDescription,
    emptyAction,
    children,
    className,
}: QueryBoundaryProps) {
    if (isLoading) {
        if (skeleton) return <>{skeleton}</>
        return (
            <div className={`space-y-2 ${className ?? ''}`}>
                {Array.from({ length: skeletonRows }).map((_, i) => (
                    <Skeleton key={i} className={`w-full rounded-lg ${skeletonHeight}`} />
                ))}
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex flex-col items-center gap-3 py-12 text-center px-4">
                <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertCircle className="h-6 w-6 text-destructive" />
                </div>
                <div>
                    <p className="text-sm font-medium text-foreground">Something went wrong</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                        {error.message || 'An unexpected error occurred. Please try again.'}
                    </p>
                </div>
                {onRetry && (
                    <Button variant="outline" size="sm" onClick={onRetry} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
                        Retry
                    </Button>
                )}
            </div>
        )
    }

    if (isEmpty) {
        return (
            <EmptyState
                icon={emptyIcon}
                title={emptyTitle}
                description={emptyDescription}
                action={emptyAction}
                className={className}
            />
        )
    }

    return <>{children}</>
}
