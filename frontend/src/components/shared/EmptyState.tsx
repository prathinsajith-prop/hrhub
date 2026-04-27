import { type ReactNode, type ElementType, memo } from 'react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
    icon?: ElementType
    title?: string
    description?: ReactNode
    action?: ReactNode
    className?: string
    variant?: 'plain' | 'card'
    size?: 'sm' | 'md' | 'lg'
}

function EmptyStateBase({
    icon: Icon,
    title,
    description,
    action,
    className,
    variant = 'plain',
    size = 'md',
}: EmptyStateProps) {
    const padding = size === 'sm' ? 'py-8' : size === 'lg' ? 'py-24' : 'py-14'
    const iconSize = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-16 w-16' : 'h-11 w-11'
    const iconInner = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-8 w-8' : 'h-5 w-5'

    const inner = (
        <div className={cn('flex flex-col items-center gap-3 text-center px-4 animate-fade-fast', padding)}>
            {Icon && (
                <div className={cn('rounded-full bg-muted/80 flex items-center justify-center ring-4 ring-muted/40 shrink-0', iconSize)}>
                    <Icon className={cn('text-muted-foreground/60', iconInner)} />
                </div>
            )}
            <div className="space-y-1">
                {title && <p className="font-semibold text-sm text-foreground">{title}</p>}
                {description && (
                    <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">{description}</p>
                )}
            </div>
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
