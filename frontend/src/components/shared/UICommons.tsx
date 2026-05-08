import * as React from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * UI primitives extracted from common inline patterns used across the app.
 * Pulling them here keeps pages thin and ensures visual consistency:
 * if a chip style or stat layout changes, it changes everywhere at once.
 */

// ─── StatCell ─────────────────────────────────────────────────────────────────

export type StatTone = 'blue' | 'emerald' | 'violet' | 'amber' | 'rose' | 'teal' | 'slate' | 'indigo'

const STAT_ICON_TONE: Record<StatTone, string> = {
    blue: 'text-blue-600',
    emerald: 'text-emerald-600',
    violet: 'text-violet-600',
    amber: 'text-amber-600',
    rose: 'text-rose-600',
    teal: 'text-teal-600',
    slate: 'text-slate-600',
    indigo: 'text-indigo-600',
}

interface StatCellProps {
    icon?: LucideIcon
    label: string
    value?: React.ReactNode
    trailing?: React.ReactNode
    valueClass?: string
    tone?: StatTone
    /** When true, render the cell even if value is empty (default: hide). */
    keepEmpty?: boolean
}

/**
 * Compact "label + value" cell used in dashboard hero strips and detail headers.
 *
 * Returns `null` when value is empty/null/'—' so empty data doesn't clutter
 * the layout — pass `keepEmpty` to opt out of that behaviour.
 */
export const StatCell = React.memo(function StatCell({
    icon: Icon, label, value, trailing, valueClass, tone = 'slate', keepEmpty = false,
}: StatCellProps) {
    const isEmpty =
        value === null
        || value === undefined
        || value === ''
        || value === '—'
        || (typeof value === 'number' && Number.isNaN(value))
    if (isEmpty && !trailing && !keepEmpty) return null
    return (
        <div className="bg-card hover:bg-muted/30 px-3.5 py-2.5 min-w-0 transition-colors">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {Icon && <Icon className={cn('h-3 w-3 shrink-0', STAT_ICON_TONE[tone])} />}
                <span className="truncate">{label}</span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1">
                <span className={cn('text-sm font-semibold text-foreground truncate', valueClass)}>
                    {value || (keepEmpty ? '—' : '')}
                </span>
                {trailing && <span className="shrink-0">{trailing}</span>}
            </div>
        </div>
    )
})

// ─── MetaItem ────────────────────────────────────────────────────────────────

interface MetaItemProps {
    icon?: LucideIcon
    label: string
    value: React.ReactNode
    className?: string
}

/**
 * "ICON · LABEL · value" inline meta strip — used in the account snapshot
 * row and any "summary footer" of cards.
 */
export const MetaItem = React.memo(function MetaItem({ icon: Icon, label, value, className }: MetaItemProps) {
    return (
        <div className={cn('flex items-center gap-2 text-[11px] text-muted-foreground', className)}>
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            <span className="uppercase tracking-wider font-semibold">{label}</span>
            <span className="text-foreground/90 font-medium tabular-nums">{value}</span>
        </div>
    )
})

// ─── InfoRow ─────────────────────────────────────────────────────────────────

interface InfoRowProps {
    icon?: LucideIcon
    label: string
    value?: React.ReactNode
    trailing?: React.ReactNode
}

/**
 * Two-column read-only field row: "label · value · trailing".
 * Returns null when there's no value AND no trailing element.
 */
export const InfoRow = React.memo(function InfoRow({ icon: Icon, label, value, trailing }: InfoRowProps) {
    const hasValue = value !== undefined && value !== null && String(value).trim() !== ''
    if (!hasValue && !trailing) return null
    return (
        <div className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
            <span className="text-sm text-muted-foreground w-36 shrink-0">{label}</span>
            <span className="text-sm font-medium text-foreground truncate flex-1">{hasValue ? value : ''}</span>
            {trailing && <span className="shrink-0">{trailing}</span>}
        </div>
    )
})

// ─── Chip ────────────────────────────────────────────────────────────────────

type ChipTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'violet'

const CHIP_TONE: Record<ChipTone, string> = {
    neutral: 'bg-muted text-muted-foreground border-border',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
    danger: 'bg-red-100 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200',
    violet: 'bg-violet-50 text-violet-700 border-violet-200',
}

interface ChipProps {
    tone?: ChipTone
    icon?: LucideIcon
    children: React.ReactNode
    className?: string
}

/** Standard pill chip with semantic tone. Use for inline status indicators. */
export function Chip({ tone = 'neutral', icon: Icon, children, className }: ChipProps) {
    return (
        <span className={cn(
            'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none',
            CHIP_TONE[tone],
            className,
        )}>
            {Icon && <Icon className="h-2.5 w-2.5" />}
            {children}
        </span>
    )
}

// ─── SectionHeader ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
    title: string
    description?: string
    icon?: LucideIcon
    actions?: React.ReactNode
    className?: string
}

/** Reusable card-section header (title + optional description + actions). */
export function SectionHeader({ title, description, icon: Icon, actions, className }: SectionHeaderProps) {
    return (
        <div className={cn('flex items-start justify-between gap-3 flex-wrap', className)}>
            <div className="min-w-0 flex items-center gap-2">
                {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold leading-tight truncate">{title}</h3>
                    {description && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{description}</p>
                    )}
                </div>
            </div>
            {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
        </div>
    )
}

// ─── Money ───────────────────────────────────────────────────────────────────

interface MoneyProps {
    value: number | string | null | undefined
    /** Show empty placeholder when value is null/undefined (default: '—'). */
    fallback?: React.ReactNode
    className?: string
    /** When true, show 0 as 0 instead of fallback. Default true. */
    keepZero?: boolean
}

/**
 * Formatted currency with `tabular-nums` for alignment.
 * Handles string|number|null without spreading the conditional everywhere.
 */
export const Money = React.memo(function Money({ value, fallback = '—', className, keepZero = true }: MoneyProps) {
    if (value === null || value === undefined || value === '') {
        return <span className={cn('text-muted-foreground tabular-nums', className)}>{fallback}</span>
    }
    const n = typeof value === 'string' ? Number(value) : value
    if (Number.isNaN(n) || (!keepZero && n === 0)) {
        return <span className={cn('text-muted-foreground tabular-nums', className)}>{fallback}</span>
    }
    return <span className={cn('tabular-nums', className)}>{formatCurrency(n)}</span>
})

// ─── DateText ────────────────────────────────────────────────────────────────

interface DateTextProps {
    value: string | Date | null | undefined
    fallback?: React.ReactNode
    className?: string
}

/** Locale-formatted date with `tabular-nums` and graceful empty fallback. */
export const DateText = React.memo(function DateText({ value, fallback = '—', className }: DateTextProps) {
    if (!value) return <span className={cn('text-muted-foreground tabular-nums', className)}>{fallback}</span>
    return <span className={cn('tabular-nums', className)}>{formatDate(value)}</span>
})

// ─── ListSkeleton ────────────────────────────────────────────────────────────

interface ListSkeletonProps {
    count?: number
    rowHeight?: string
    className?: string
}

/** N skeleton rows — replaces the inline `[...Array(n)].map(...)` pattern. */
export function ListSkeleton({ count = 4, rowHeight = 'h-10', className }: ListSkeletonProps) {
    return (
        <div className={cn('space-y-2', className)}>
            {Array.from({ length: count }).map((_, i) => (
                <Skeleton key={i} className={cn('w-full', rowHeight)} />
            ))}
        </div>
    )
}

// ─── FieldLabel ──────────────────────────────────────────────────────────────

interface FieldLabelProps {
    children: React.ReactNode
    className?: string
}

/** Tiny uppercase label used above values in stat blocks and read-only cards. */
export function FieldLabel({ children, className }: FieldLabelProps) {
    return (
        <span className={cn('text-[10px] font-semibold uppercase tracking-wider text-muted-foreground', className)}>
            {children}
        </span>
    )
}

// ─── Activity action badge ───────────────────────────────────────────────────

/**
 * Color-coded pill for an audit/activity action keyword
 * (create, update, delete, approve, reject, …).
 *
 * Falls back to neutral slate when an unknown action is passed.
 */
const ACTION_PILL_TONE: Record<string, string> = {
    create: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    update: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    delete: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    approve: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    reject: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    submit: 'bg-primary/10 text-primary ring-1 ring-primary/20',
    view: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
    export: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    import: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
    login: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200',
    logout: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
    cancel: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
    activate: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    suspend: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    archive: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
}

const ACTION_FALLBACK = 'bg-slate-50 text-slate-600 ring-1 ring-slate-200'

export function actionPillToneFor(action: string): string {
    return ACTION_PILL_TONE[action.toLowerCase()] ?? ACTION_FALLBACK
}

interface ActionBadgeProps {
    action: string
    className?: string
}

/** Color-coded action badge (for audit / activity logs). */
export function ActionBadge({ action, className }: ActionBadgeProps) {
    return (
        <span className={cn(
            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize whitespace-nowrap',
            actionPillToneFor(action),
            className,
        )}>
            {action.replace(/_/g, ' ')}
        </span>
    )
}

// ─── Stat (number + label) ────────────────────────────────────────────────────

interface StatProps {
    label: string
    value: React.ReactNode
    sub?: React.ReactNode
    valueClass?: string
    align?: 'start' | 'end' | 'center'
    className?: string
}

/**
 * Big "value above label" stat block used in payment summaries / progress
 * strips. Contrast with `<StatCell>` (icon-led, used in tile grids).
 */
export const Stat = React.memo(function Stat({ label, value, sub, valueClass, align = 'start', className }: StatProps) {
    const alignCls = align === 'center' ? 'text-center items-center' : align === 'end' ? 'text-right items-end' : 'text-left items-start'
    return (
        <div className={cn('flex flex-col', alignCls, className)}>
            <span className={cn('text-base font-bold text-foreground tabular-nums leading-tight', valueClass)}>{value}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mt-0.5">{label}</span>
            {sub && <span className="text-[11px] text-muted-foreground mt-0.5">{sub}</span>}
        </div>
    )
})
