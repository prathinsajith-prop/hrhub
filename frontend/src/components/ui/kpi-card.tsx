import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Supported semantic tones for KPI cards. We keep a few color names for
 * backwards compatibility, but all styling is now driven off a small set
 * of design tokens (primary, accent, success, destructive, info) — no
 * hard-coded hex colors, and no purple/violet.
 */
export type KpiColor = 'blue' | 'purple' | 'amber' | 'red' | 'green' | 'cyan'

type Tone = {
  accent: string // top border color (uses token-based border utilities)
  icon: string // icon container bg + fg
}

const toneMap: Record<KpiColor, Tone> = {
  blue: { accent: 'border-t-primary', icon: 'bg-primary/10 text-primary' },
  cyan: { accent: 'border-t-info', icon: 'bg-info/10 text-info' },
  green: { accent: 'border-t-success', icon: 'bg-success/10 text-success' },
  amber: { accent: 'border-t-warning', icon: 'bg-warning/10 text-warning' },
  red: { accent: 'border-t-destructive', icon: 'bg-destructive/10 text-destructive' },
  /* Legacy "purple" slot is mapped to the accent (amber) tone to stay
     on-brand and avoid purple usage per design guidelines. */
  purple: { accent: 'border-t-accent', icon: 'bg-accent/15 text-accent-foreground' },
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
  const tone = toneMap[color] ?? toneMap.blue

  return (
    <Wrapper
      onClick={onClick}
      className={cn(
        'rounded-xl bg-card p-5 border border-border border-t-2 text-left w-full card-hover',
        tone.accent,
        onClick && 'cursor-pointer hover:border-primary/40',
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
        <div className="flex items-start justify-between gap-3">
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
                  trend >= 0 ? 'text-success' : 'text-destructive',
                )}
              >
                {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {Math.abs(trend)}% vs last month
              </div>
            )}
          </div>
          <div
            className={cn(
              'h-9 w-9 rounded-lg flex items-center justify-center shrink-0',
              tone.icon,
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
      )}
    </Wrapper>
  )
}

/** Compact horizontal KPI card — delegates to the shared modern KpiCard
 *  so the entire app gets the new design while keeping the legacy API.
 */
import { KpiCard as ModernKpiCard } from '@/components/shared/KpiCard'

export interface KpiCardCompactProps {
  label: string
  value: string | number | undefined | null
  icon: React.ElementType
  color?: KpiColor
  loading?: boolean
  className?: string
  hint?: string
}

const colorToTone: Record<KpiColor, 'blue' | 'emerald' | 'amber' | 'rose' | 'primary' | 'violet'> = {
  blue: 'blue',
  green: 'emerald',
  amber: 'amber',
  red: 'rose',
  cyan: 'blue',
  purple: 'violet',
}

export function KpiCardCompact({ label, value, icon: Icon, color = 'blue', loading = false, className, hint }: KpiCardCompactProps) {
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
    <ModernKpiCard
      label={label}
      value={value ?? '—'}
      hint={hint}
      icon={<Icon className="h-5 w-5" />}
      tone={colorToTone[color] ?? 'primary'}
      className={className}
    />
  )
}
