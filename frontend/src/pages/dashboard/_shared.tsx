import React from 'react'
import type { CSSProperties } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Design-token chart palette ──────────────────────────────────────────────
export const CHART_COLORS = {
  primary:     'hsl(var(--primary))',
  info:        'hsl(var(--info))',
  accent:      'hsl(var(--accent))',
  success:     'hsl(var(--success))',
  destructive: 'hsl(var(--destructive))',
  warning:     'hsl(var(--warning))',
  muted:       'hsl(var(--muted-foreground) / 0.4)',
  grid:        'hsl(var(--border))',
  axis:        'hsl(var(--muted-foreground))',
}

export const NAT_FILLS = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.accent,
  CHART_COLORS.info,
  CHART_COLORS.muted,
]

export const tooltipStyle: CSSProperties = {
  borderRadius: 8,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
  boxShadow: '0 4px 16px -4px hsl(var(--foreground) / 0.1)',
}

// ─── Reusable quick-action button ────────────────────────────────────────────
interface QuickActionProps {
  icon: React.ElementType
  label: string
  onClick: () => void
}

export function QuickAction({ icon: Icon, label, onClick }: QuickActionProps) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-border/70 bg-card p-5 text-center transition-all hover:border-primary/40 hover:bg-accent/40 hover:shadow-sm active:scale-[0.98]"
    >
      <div className="h-9 w-9 rounded-xl bg-primary/8 flex items-center justify-center">
        <Icon className="h-4.5 w-4.5 text-primary" />
      </div>
      <span className="text-xs font-medium text-foreground">{label}</span>
    </button>
  )
}

// ─── Section heading ──────────────────────────────────────────────────────────
export function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  )
}

// ─── Skeleton row used in card lists ─────────────────────────────────────────
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-5 w-14 rounded-full shrink-0" />
        </div>
      ))}
    </div>
  )
}
