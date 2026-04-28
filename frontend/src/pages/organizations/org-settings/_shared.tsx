import React from 'react'
import { cn } from '@/lib/utils'

// ─── Shared layout primitives ─────────────────────────────────────────────────
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('rounded-xl border bg-card shadow-sm p-5', className)}>
            {children}
        </div>
    )
}

export function Section({
    icon: Icon,
    title,
    description,
    action,
    children,
    className,
}: {
    icon: React.ElementType
    title: string
    description?: string
    action?: React.ReactNode
    children?: React.ReactNode
    className?: string
}) {
    return (
        <Card className={className}>
            <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold leading-tight">{title}</p>
                        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                    </div>
                </div>
                {action}
            </div>
            {children}
        </Card>
    )
}
