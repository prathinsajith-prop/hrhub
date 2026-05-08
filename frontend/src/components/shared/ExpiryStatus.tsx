import { cn } from '@/lib/utils'

/**
 * Days from today to the given date (positive = future, negative = past).
 * Returns null if the input is empty/invalid.
 */
export function daysUntilExpiry(dateStr: string | null | undefined): number | null {
    if (!dateStr) return null
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    d.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - today.getTime()) / (24 * 3600 * 1000))
}

export type ExpiryTone = 'expired' | 'critical' | 'warning' | 'ok' | 'unknown'

export function expiryTone(days: number | null): ExpiryTone {
    if (days === null) return 'unknown'
    if (days < 0) return 'expired'
    if (days <= 30) return 'critical'
    if (days <= 90) return 'warning'
    return 'ok'
}

const TONE_CLASS: Record<ExpiryTone, string> = {
    expired:  'bg-red-100 text-red-800 border-red-200',
    critical: 'bg-red-100 text-red-800 border-red-200',
    warning:  'bg-amber-100 text-amber-800 border-amber-200',
    ok:       'bg-emerald-100 text-emerald-800 border-emerald-200',
    unknown:  'bg-muted text-muted-foreground border-border',
}

function formatLabel(days: number | null): string {
    if (days === null) return 'No expiry'
    if (days < 0) return `Expired ${Math.abs(days)}d ago`
    if (days === 0) return 'Expires today'
    if (days === 1) return 'Expires tomorrow'
    if (days <= 90) return `${days}d to expiry`
    return `${days}d remaining`
}

interface Props {
    /** ISO date string. null/undefined renders nothing. */
    date: string | null | undefined
    /** Override the rendered label (uses days-based text by default). */
    label?: string
    /** Smaller variant for inline placement next to a value. */
    size?: 'sm' | 'md'
    className?: string
}

/**
 * Color-coded expiry chip showing days remaining (or "Expired Nd ago").
 *
 * - Green when > 90 days left
 * - Amber when 31–90 days
 * - Red when ≤ 30 days or already expired
 */
export function ExpiryStatus({ date, label, size = 'sm', className }: Props) {
    const days = daysUntilExpiry(date)
    if (days === null) return null
    const tone = expiryTone(days)
    return (
        <span className={cn(
            'inline-flex items-center rounded-full border font-medium leading-none whitespace-nowrap',
            TONE_CLASS[tone],
            size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs',
            className,
        )}>
            {label ?? formatLabel(days)}
        </span>
    )
}

/**
 * Returns true if the document is past its expiry date.
 * Use to drive an "Expired" badge on document rows.
 */
export function isExpired(dateStr: string | null | undefined): boolean {
    const days = daysUntilExpiry(dateStr)
    return days !== null && days < 0
}
