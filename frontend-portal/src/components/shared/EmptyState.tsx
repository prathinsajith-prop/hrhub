import type { ComponentType, ReactNode } from 'react'

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
            {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
            <h3 className="font-display text-base font-semibold text-foreground">{title}</h3>
            {description ? <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p> : null}
            {action ? <div className="mt-4">{action}</div> : null}
        </div>
    )
}

/**
 * Compact empty state for use INSIDE a card body. The full `EmptyState`
 * above ships its own dashed border + padding, which conflicts with the
 * parent card chrome. This variant drops the border, uses a single-line
 * message instead of title+description, and accepts a lucide-style
 * `ComponentType` icon directly so callers don't have to wrap it.
 *
 * Previously each consumer (HomePage, ReportsPage) shipped its own
 * private copy of this same component; the duplicates were a drift
 * hazard and are now consolidated here.
 */
export function CompactEmptyState({
    icon: Icon,
    message,
}: {
    icon: ComponentType<{ className?: string }>
    message: string
}) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-muted/60">
                <Icon className="size-5 text-muted-foreground" />
            </span>
            <p className="text-sm font-medium text-muted-foreground">{message}</p>
        </div>
    )
}
