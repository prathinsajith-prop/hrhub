import { type ReactNode, type ElementType, memo } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
    icon?: ElementType
    title?: string
    description?: ReactNode
    action?: ReactNode
    className?: string
    variant?: 'plain' | 'card'
}

/**
 * Standardised empty-state block used across pages.
 * Replaces the repeated `flex flex-col items-center gap-3 py-16` pattern.
 */
function EmptyStateBase({
    icon: Icon,
    title,
    description,
    action,
    className,
    variant = 'plain',
}: EmptyStateProps) {
    const inner = (
        <div className="flex flex-col items-center gap-3 py-16 text-center px-4">
            {Icon && (
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                    <Icon className="h-6 w-6 text-muted-foreground" />
                </div>
            )}
            {title && <p className="font-medium text-sm">{title}</p>}
            {description && (
                <p className="text-xs text-muted-foreground max-w-md">{description}</p>
            )}
            {action && <div className="mt-1">{action}</div>}
        </div>
    )

    if (variant === 'card') {
        return (
            <div className={cn('rounded-xl border bg-card shadow-sm', className)}>{inner}</div>
        )
    }

    return <div className={className}>{inner}</div>
}

export const EmptyState = memo(EmptyStateBase)
