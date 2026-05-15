import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Soft glass surface used for hero / balance / KPI cards. */
export function GlassCard({
    children,
    className,
    tone = 'default',
}: {
    children: ReactNode
    className?: string
    tone?: 'default' | 'primary' | 'success' | 'warning'
}) {
    const tones: Record<string, string> = {
        default: 'from-white/80 to-white/60 dark:from-card/85 dark:to-card/60',
        primary: 'from-indigo-50/90 to-sky-50/70 dark:from-indigo-950/40 dark:to-sky-950/30',
        success: 'from-emerald-50/90 to-teal-50/60 dark:from-emerald-950/40 dark:to-teal-950/30',
        warning: 'from-amber-50/90 to-orange-50/60 dark:from-amber-950/40 dark:to-orange-950/30',
    }
    return (
        <div
            className={cn(
                'relative overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-br shadow-lg shadow-indigo-100/40 backdrop-blur-md dark:border-white/10 dark:shadow-black/30',
                tones[tone],
                className,
            )}
        >
            {children}
        </div>
    )
}
