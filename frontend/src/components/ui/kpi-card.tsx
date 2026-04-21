import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export type KpiColor = 'blue' | 'purple' | 'amber' | 'red' | 'green' | 'cyan'

const topBorderClass: Record<KpiColor, string> = {
    blue: 'kpi-card-blue',
    purple: 'kpi-card-purple',
    amber: 'kpi-card-amber',
    red: 'kpi-card-red',
    green: 'kpi-card-green',
    cyan: 'kpi-card-cyan',
}

const iconBgClass: Record<KpiColor, string> = {
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-emerald-50 text-emerald-600',
    cyan: 'bg-cyan-50 text-cyan-600',
}

export interface KpiCardProps {
    label: string
    value: string | number | undefined | null
    sub?: string
    icon: React.ElementType
    color?: KpiColor
    /** Percentage change vs previous period — positive = up, negative = down */
    trend?: number
    loading?: boolean
    onClick?: () => void
    className?: string
}

export function KpiCard({
    label,
    value,
    sub,
    icon: Icon,
    color = 'blue',
    trend,
    loading = false,
    onClick,
    className,
}: KpiCardProps) {
    const Wrapper = onClick ? 'button' : 'div'

    return (
        <Wrapper
            onClick={onClick}
            className={cn(
                'rounded-xl bg-card p-5 card-hover border border-border border-t-0 text-left w-full',
                topBorderClass[color],
                onClick && 'cursor-pointer',
                className,
            )}
        >
            {loading ? (
                <div className="space-y-2 animate-pulse">
                    <div className="h-2.5 bg-muted rounded w-2/3" />
                    <div className="h-7 bg-muted rounded w-1/2" />
                    <div className="h-2 bg-muted rounded w-3/4" />
                </div>
            ) : (
                <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground truncate">
                            {label}
                        </p>
                        <p className="text-2xl font-bold mt-1.5 mb-0.5 text-foreground font-display">
                            {value ?? '—'}
                        </p>
                        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
                        {trend !== undefined && (
                            <div
                                className={cn(
                                    'flex items-center gap-1 mt-1.5 text-[11px] font-medium',
                                    trend >= 0 ? 'text-emerald-600' : 'text-red-500',
                                )}
                            >
                                {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {Math.abs(trend)}% vs last month
                            </div>
                        )}
                    </div>
                    <div
                        className={cn(
                            'h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ml-2',
                            iconBgClass[color],
                        )}
                    >
                        <Icon className="h-4 w-4" />
                    </div>
                </div>
            )}
        </Wrapper>
    )
}

/** Compact version used in pages like Employees/Recruitment with a bg-muted icon */
export interface KpiCardCompactProps {
    label: string
    value: string | number | undefined | null
    icon: React.ElementType
    color?: KpiColor
    className?: string
}

export function KpiCardCompact({ label, value, icon: Icon, color = 'blue', className }: KpiCardCompactProps) {
    return (
        <div
            className={cn(
                'rounded-xl bg-card p-4 flex items-center gap-3 card-hover border border-border border-t-0',
                topBorderClass[color],
                className,
            )}
        >
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
                <p className="text-xl font-bold leading-tight font-display">
                    {value ?? '—'}
                </p>
                <p className="text-[11px] text-muted-foreground">{label}</p>
            </div>
        </div>
    )
}
