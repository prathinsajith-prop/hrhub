import type { ReactNode } from 'react'

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
