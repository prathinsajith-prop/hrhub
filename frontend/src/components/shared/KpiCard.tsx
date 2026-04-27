import React, { memo, type ReactNode } from 'react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type KpiColor = 'blue' | 'purple' | 'amber' | 'red' | 'green' | 'cyan'

type Tone = 'primary' | 'blue' | 'amber' | 'rose' | 'emerald' | 'violet' | 'neutral'

export interface KpiCardProps {
    label: ReactNode
    value: ReactNode
    /** Secondary text under the value (e.g. "All active visas"). */
    hint?: ReactNode
    /** Optional trend indicator, e.g. "↑ 20%" + color. */
    trend?: { label: string; direction?: 'up' | 'down' | 'flat' }
    icon?: ReactNode
    tone?: Tone
    className?: string
}

const TONE_STYLES: Record<Tone, { bar: string; iconBg: string; iconFg: string; trend: string }> = {
    primary: { bar: 'bg-primary', iconBg: 'bg-primary/10 dark:bg-primary/20', iconFg: 'text-primary', trend: 'text-primary' },
    blue: { bar: 'bg-blue-500', iconBg: 'bg-blue-50 dark:bg-blue-950/60', iconFg: 'text-blue-600 dark:text-blue-400', trend: 'text-blue-600 dark:text-blue-400' },
    amber: { bar: 'bg-amber-500', iconBg: 'bg-amber-50 dark:bg-amber-950/60', iconFg: 'text-amber-600 dark:text-amber-400', trend: 'text-amber-600 dark:text-amber-400' },
    rose: { bar: 'bg-rose-500', iconBg: 'bg-rose-50 dark:bg-rose-950/60', iconFg: 'text-rose-600 dark:text-rose-400', trend: 'text-rose-600 dark:text-rose-400' },
    emerald: { bar: 'bg-emerald-500', iconBg: 'bg-emerald-50 dark:bg-emerald-950/60', iconFg: 'text-emerald-600 dark:text-emerald-400', trend: 'text-emerald-600 dark:text-emerald-400' },
    violet: { bar: 'bg-violet-500', iconBg: 'bg-violet-50 dark:bg-violet-950/60', iconFg: 'text-violet-600 dark:text-violet-400', trend: 'text-violet-600 dark:text-violet-400' },
    neutral: { bar: 'bg-slate-400', iconBg: 'bg-slate-100 dark:bg-slate-800', iconFg: 'text-slate-600 dark:text-slate-400', trend: 'text-slate-500 dark:text-slate-400' },
}

/**
 * Primary KPI tile — large card with colored top accent bar, icon tile,
 * metric + secondary hint + optional trend. Matches the reference design.
 */
function KpiCardBase({ label, value, hint, trend, icon, tone = 'primary', className }: KpiCardProps) {
    const s = TONE_STYLES[tone]
    const trendColor =
        trend?.direction === 'up'
            ? 'text-emerald-600'
            : trend?.direction === 'down'
                ? 'text-rose-600'
                : 'text-muted-foreground'
    const trendArrow =
        trend?.direction === 'up' ? '↑' : trend?.direction === 'down' ? '↓' : '—'

    return (
        <Card className={cn('relative overflow-hidden p-0 border-border/60 shadow-sm card-hover', className)}>
            {/* Top accent stripe */}
            <span className={cn('absolute left-4 top-0 h-[3px] w-12 rounded-b-full', s.bar)} aria-hidden="true" />
            <div className="flex items-start gap-3 p-4 pt-5">
                {icon && (
                    <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-black/5', s.iconBg, s.iconFg)}>
                        {icon}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</p>
                    <p className="text-2xl font-bold leading-tight mt-0.5 tracking-tight tabular-figures font-display">{value}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                        {hint && <span className="text-[11px] text-muted-foreground/80">{hint}</span>}
                        {trend && (
                            <span className={cn('text-[11px] font-semibold ml-auto tabular-figures', trendColor)}>
                                {trendArrow} {trend.label}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    )
}

export const KpiCard = memo(KpiCardBase)

// ── KpiCardCompact ────────────────────────────────────────────────────────────
// Compact variant used across all module pages.

export interface KpiCardCompactProps {
    label: string
    value: string | number | undefined | null
    icon: React.ElementType
    color?: KpiColor
    loading?: boolean
    className?: string
    hint?: string
}

const colorToTone: Record<KpiColor, Tone> = {
    blue: 'blue',
    green: 'emerald',
    amber: 'amber',
    red: 'rose',
    cyan: 'blue',
    purple: 'violet',
}

function KpiCardCompactBase({ label, value, icon: Icon, color = 'blue', loading = false, className, hint }: KpiCardCompactProps) {
    if (loading) {
        return (
            <div className={cn('rounded-xl bg-card p-5 border border-border/60 space-y-3 overflow-hidden', className)}>
                <div className="h-2.5 skeleton-shimmer rounded-full w-1/3" />
                <div className="h-7 skeleton-shimmer rounded-lg w-2/5" />
                <div className="h-2 skeleton-shimmer rounded-full w-1/2" />
            </div>
        )
    }
    return (
        <KpiCard
            label={label}
            value={value ?? '—'}
            hint={hint}
            icon={<Icon className="h-5 w-5" />}
            tone={colorToTone[color] ?? 'primary'}
            className={className}
        />
    )
}

export const KpiCardCompact = memo(KpiCardCompactBase)
