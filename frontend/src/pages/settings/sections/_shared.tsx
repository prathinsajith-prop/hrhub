import React from 'react'
import { cn } from '@/lib/utils'

// ─── Reusable settings card wrapper ──────────────────────────────────────────────
export function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('rounded-xl border bg-card shadow-sm p-6', className)}>
            {children}
        </div>
    )
}

// ─── Section helper — renders a card with title + optional action ─────────────
export function Section({ icon: Icon, title, description, action, children, className }: {
    icon: React.ComponentType<{ className?: string }>
    title: string
    description?: string
    action?: React.ReactNode
    children: React.ReactNode
    className?: string
}) {
    return (
        <SettingsCard className={className}>
            <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            {title}
                        </h3>
                        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                    </div>
                    {action && <div className="shrink-0">{action}</div>}
                </div>
                {children}
            </div>
        </SettingsCard>
    )
}
