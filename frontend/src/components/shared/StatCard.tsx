import { memo, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
    label: ReactNode
    value: ReactNode
    icon?: ReactNode
    accent?: string
    className?: string
}

/**
 * Compact stat tile for KPI strips. Replaces ad-hoc <Card><p/><p/></Card> blocks.
 */
function StatCardBase({ label, value, icon, accent, className }: StatCardProps) {
    return (
        <Card className={cn('p-3 flex flex-col items-center justify-center gap-0.5', className)}>
            {icon && <div className="mb-1 text-muted-foreground">{icon}</div>}
            <p className="text-xl font-bold leading-none" style={accent ? { color: accent } : undefined}>
                {value}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1 text-center">{label}</p>
        </Card>
    )
}

export const StatCard = memo(StatCardBase)
