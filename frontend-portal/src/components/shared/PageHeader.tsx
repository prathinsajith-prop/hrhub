import type { ReactNode } from 'react'

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
    return (
        <div className="flex flex-wrap items-start justify-between gap-3 pb-5">
            <div>
                <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                    {title}
                </h1>
                {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
            </div>
            {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </div>
    )
}
