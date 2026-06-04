/**
 * Shared, semantic badges for job postings.
 *
 *   <JobTypeBadge type="full_time" />
 *   <WorkplaceBadge workplace="remote" />
 *
 * Each badge maps the enum value to a deliberate colour + icon so users can
 * scan a list of openings at a glance:
 *
 *   • Employment type — colour signals the commitment shape
 *       full_time   emerald  (stable, salaried)
 *       part_time   sky      (flexible hours)
 *       contract    amber    (time-bound engagement)
 *       internship  violet   (learning / early career)
 *       temporary   orange   (short-term)
 *       freelance   pink     (independent)
 *
 *   • Workplace — colour signals where the work happens
 *       on_site     slate    (traditional)
 *       hybrid      indigo   (mix)
 *       remote      teal     (anywhere)
 *
 * The badges work in light & dark mode and are RTL-safe. Used by the public
 * careers list/detail and the internal recruitment job detail.
 */
import { useTranslation } from 'react-i18next'
import {
    Briefcase, Clock, FileSignature, GraduationCap, Hourglass, Sparkles,
    Building2, Blend, Globe,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'internship' | 'temporary' | 'freelance' | string
type Workplace = 'on_site' | 'hybrid' | 'remote' | string

// ── Employment type tone map ─────────────────────────────────────────────────
// `border` is used in the bordered variant; the bare variant drops it.
const TYPE_STYLE: Record<string, { bg: string; text: string; border: string; icon: typeof Briefcase }> = {
    full_time: {
        bg: 'bg-emerald-50 dark:bg-emerald-950/40',
        text: 'text-emerald-700 dark:text-emerald-300',
        border: 'border-emerald-200/70 dark:border-emerald-900/50',
        icon: Briefcase,
    },
    part_time: {
        bg: 'bg-sky-50 dark:bg-sky-950/40',
        text: 'text-sky-700 dark:text-sky-300',
        border: 'border-sky-200/70 dark:border-sky-900/50',
        icon: Clock,
    },
    contract: {
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        text: 'text-amber-700 dark:text-amber-300',
        border: 'border-amber-200/70 dark:border-amber-900/50',
        icon: FileSignature,
    },
    internship: {
        bg: 'bg-violet-50 dark:bg-violet-950/40',
        text: 'text-violet-700 dark:text-violet-300',
        border: 'border-violet-200/70 dark:border-violet-900/50',
        icon: GraduationCap,
    },
    temporary: {
        bg: 'bg-orange-50 dark:bg-orange-950/40',
        text: 'text-orange-700 dark:text-orange-300',
        border: 'border-orange-200/70 dark:border-orange-900/50',
        icon: Hourglass,
    },
    freelance: {
        bg: 'bg-pink-50 dark:bg-pink-950/40',
        text: 'text-pink-700 dark:text-pink-300',
        border: 'border-pink-200/70 dark:border-pink-900/50',
        icon: Sparkles,
    },
}

const TYPE_FALLBACK = {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-border',
    icon: Briefcase,
}

const WORKPLACE_STYLE: Record<string, { bg: string; text: string; border: string; icon: typeof Building2 }> = {
    on_site: {
        bg: 'bg-slate-100 dark:bg-slate-800/50',
        text: 'text-slate-700 dark:text-slate-300',
        border: 'border-slate-200/70 dark:border-slate-700/50',
        icon: Building2,
    },
    hybrid: {
        bg: 'bg-indigo-50 dark:bg-indigo-950/40',
        text: 'text-indigo-700 dark:text-indigo-300',
        border: 'border-indigo-200/70 dark:border-indigo-900/50',
        icon: Blend,
    },
    remote: {
        bg: 'bg-teal-50 dark:bg-teal-950/40',
        text: 'text-teal-700 dark:text-teal-300',
        border: 'border-teal-200/70 dark:border-teal-900/50',
        icon: Globe,
    },
}

const WORKPLACE_FALLBACK = {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    border: 'border-border',
    icon: Building2,
}

type Variant = 'soft' | 'bordered' | 'subtle'
type Size = 'xs' | 'sm' | 'md'

interface BaseProps {
    variant?: Variant
    size?: Size
    showIcon?: boolean
    className?: string
}

function baseClasses(size: Size) {
    if (size === 'xs') return 'text-[10px] px-1.5 py-0.5 gap-1 rounded-full'
    if (size === 'md') return 'text-sm px-3 py-1 gap-1.5 rounded-full'
    return 'text-[11px] px-2.5 py-0.5 gap-1.5 rounded-full'
}

function iconSize(size: Size) {
    if (size === 'xs') return 'size-2.5'
    if (size === 'md') return 'size-3.5'
    return 'size-3'
}

// ── Job type badge ──────────────────────────────────────────────────────────
export function JobTypeBadge({
    type,
    variant = 'soft',
    size = 'sm',
    showIcon = true,
    className,
}: BaseProps & { type: EmploymentType }) {
    const { t } = useTranslation()
    const style = TYPE_STYLE[type] ?? TYPE_FALLBACK
    const Icon = style.icon
    const label = t(`careers.type.${type}`, { defaultValue: humanise(type) })

    const surface = variant === 'subtle'
        ? `${style.text}`
        : variant === 'bordered'
            ? `${style.bg} ${style.text} border ${style.border}`
            : `${style.bg} ${style.text}`

    return (
        <span className={cn('inline-flex items-center font-semibold whitespace-nowrap', baseClasses(size), surface, className)}>
            {showIcon && <Icon className={cn(iconSize(size), 'shrink-0')} />}
            {label}
        </span>
    )
}

// ── Workplace badge ─────────────────────────────────────────────────────────
export function WorkplaceBadge({
    workplace,
    variant = 'soft',
    size = 'sm',
    showIcon = true,
    className,
}: BaseProps & { workplace: Workplace }) {
    const { t } = useTranslation()
    const style = WORKPLACE_STYLE[workplace] ?? WORKPLACE_FALLBACK
    const Icon = style.icon
    const label = t(`careers.workplace.${workplace}`, { defaultValue: humanise(workplace) })

    const surface = variant === 'subtle'
        ? `${style.text}`
        : variant === 'bordered'
            ? `${style.bg} ${style.text} border ${style.border}`
            : `${style.bg} ${style.text}`

    return (
        <span className={cn('inline-flex items-center font-medium whitespace-nowrap', baseClasses(size), surface, className)}>
            {showIcon && <Icon className={cn(iconSize(size), 'shrink-0')} />}
            {label}
        </span>
    )
}

// ── Skill / qualification chip ──────────────────────────────────────────────
// Small reusable tag used for both lists. Skills tend to be short technology
// names; qualifications are longer phrases — same surface, different tone.
type TagTone = 'sky' | 'emerald' | 'slate' | 'primary'

export function TagChip({ children, tone = 'slate', className }: { children: React.ReactNode; tone?: TagTone; className?: string }) {
    const tones: Record<TagTone, string> = {
        sky: 'bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300',
        emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
        slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300',
        primary: 'bg-primary/10 text-primary',
    }
    return (
        <span className={cn(
            'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap',
            tones[tone], className,
        )}>
            {children}
        </span>
    )
}

// ── Helper: format relative time (e.g. "2d ago") ────────────────────────────
// Lightweight; no library. Falls back to a date string for old items.
export function formatPostedAgo(iso: string | null | undefined): string {
    if (!iso) return ''
    const then = new Date(iso).getTime()
    if (Number.isNaN(then)) return ''
    const diffMs = Date.now() - then
    const sec = Math.max(1, Math.floor(diffMs / 1000))
    const min = Math.floor(sec / 60)
    const hr = Math.floor(min / 60)
    const day = Math.floor(hr / 24)
    if (day >= 30) return new Date(iso).toLocaleDateString()
    if (day >= 1) return `${day}d ago`
    if (hr >= 1) return `${hr}h ago`
    if (min >= 1) return `${min}m ago`
    return 'just now'
}

function humanise(value: string): string {
    if (!value) return ''
    return value.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
