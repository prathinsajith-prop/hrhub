import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Surface wrapper for dashboard charts — keeps every chart tile consistent in size,
 * spacing, and elevation. Header + body + optional caption.
 */
export function ChartCard({
    title,
    subtitle,
    icon,
    children,
    height = 220,
    className,
    headerAction,
}: {
    title: string
    subtitle?: string
    icon?: ReactNode
    children: ReactNode
    height?: number
    className?: string
    headerAction?: ReactNode
}) {
    return (
        <div
            className={cn(
                'flex flex-col gap-3 rounded-2xl border border-border bg-card/80 p-4 shadow-sm backdrop-blur-sm sm:p-5',
                className,
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        {icon}
                        <span className="truncate">{title}</span>
                    </h3>
                    {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
                </div>
                {headerAction}
            </div>
            <div style={{ height }} className="-mx-1">
                {children}
            </div>
        </div>
    )
}
