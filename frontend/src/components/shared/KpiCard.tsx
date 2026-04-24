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
    primary: { bar: 'bg-primary', iconBg: 'bg-primary/10', iconFg: 'text-primary', trend: 'text-primary' },
    blue: { bar: 'bg-blue-500', iconBg: 'bg-blue-50', iconFg: 'text-blue-600', trend: 'text-blue-600' },
    amber: { bar: 'bg-amber-500', iconBg: 'bg-amber-50', iconFg: 'text-amber-600', trend: 'text-amber-600' },
    rose: { bar: 'bg-rose-500', iconBg: 'bg-rose-50', iconFg: 'text-rose-600', trend: 'text-rose-600' },
    emerald: { bar: 'bg-emerald-500', iconBg: 'bg-emerald-50', iconFg: 'text-emerald-600', trend: 'text-emerald-600' },
    violet: { bar: 'bg-violet-500', iconBg: 'bg-violet-50', iconFg: 'text-violet-600', trend: 'text-violet-600' },
    neutral: { bar: 'bg-slate-400', iconBg: 'bg-slate-100', iconFg: 'text-slate-600', trend: 'text-slate-500' },
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
        <Card className={cn('relative overflow-hidden p-0 border-border/80 shadow-sm hover:shadow-md transition-shadow', className)}>
            {/* Top accent stripe */}
            <span className={cn('absolute left-4 top-0 h-1 w-10 rounded-b-full', s.bar)} aria-hidden="true" />
            <div className="flex items-start gap-3 p-4">
                {icon && (
                    <div className={cn('h-11 w-11 rounded-full flex items-center justify-center shrink-0', s.iconBg, s.iconFg)}>
                        {icon}
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="text-2xl font-bold leading-tight mt-1 tracking-tight tabular-figures">{value}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
                        {trend && (
                            <span className={cn('text-[11px] font-medium ml-auto', trendColor)}>
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
            <div className={cn('rounded-xl bg-card p-5 border border-border animate-pulse space-y-3', className)}>
                <div className="h-3 bg-muted rounded w-1/2" />
                <div className="h-8 bg-muted rounded w-2/3" />
                <div className="h-2 bg-muted rounded w-3/4" />
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
