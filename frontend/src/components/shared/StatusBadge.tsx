import { memo, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type StatusTone =
    | 'success'
    | 'danger'
    | 'warning'
    | 'info'
    | 'neutral'
    | 'purple'
    | 'orange'

const TONE_STYLES: Record<StatusTone, string> = {
    success: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    neutral: 'bg-muted text-foreground/70',
    purple: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
    orange: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
}

interface StatusBadgeProps {
    tone?: StatusTone
    children: ReactNode
    className?: string
    dot?: boolean
}

function StatusBadgeBase({ tone = 'neutral', children, className, dot }: StatusBadgeProps) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
                TONE_STYLES[tone],
                className,
            )}
        >
            {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
            {children}
        </span>
    )
}

export const StatusBadge = memo(StatusBadgeBase)
