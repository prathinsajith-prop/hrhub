import { useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import type { CalendarCell, CalendarResponse } from '@/hooks/useAttendance'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Code → tone metadata (single source for the whole-month view) ───────
//
// Mirrors the row-grid component's palette so the legend reads the same. The
// `tone` controls the cell background; the `text` colors apply to the day
// number and code together.

interface CodeMeta {
    label: string
    short: string
    bg: string
    text: string
    /** When true, the whole cell wears the tone; otherwise just a small chip. */
    fill: boolean
}

const CODE_META: Record<string, CodeMeta> = {
    // Present cells get a vivid emerald fill — bumped from `emerald-50` so
    // a "good" day stands out at a glance from weekends, leaves, and any
    // other muted-tone status. Picked green (not blue) to match the
    // universal positive-status convention; matches the portal's chart
    // colours so the whole attendance surface tells the same story.
    P: { label: 'Present', short: 'P', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-100', fill: true },
    'P-late': { label: 'Late', short: 'Late', bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-300', fill: true },
    'P-short': { label: 'Short Hours', short: 'Short', bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', fill: true },
    A: { label: 'Absent', short: 'A', bg: 'bg-rose-500', text: 'text-white', fill: true },
    AL: { label: 'Annual Leave', short: 'AL', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', fill: true },
    SL: { label: 'Sick Leave', short: 'SL', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', fill: true },
    ML: { label: 'Maternity Leave', short: 'ML', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', fill: true },
    PL: { label: 'Paternity Leave', short: 'PL', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', fill: true },
    BL: { label: 'Bereavement Leave', short: 'BL', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', fill: true },
    HJ: { label: 'Hajj Leave', short: 'HJ', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', fill: true },
    BT: { label: 'Business Trip', short: 'BT', bg: 'bg-sky-50 dark:bg-sky-950/30', text: 'text-sky-700 dark:text-sky-300', fill: true },
    WFH: { label: 'Work From Home', short: 'WFH', bg: 'bg-indigo-50 dark:bg-indigo-950/30', text: 'text-indigo-700 dark:text-indigo-300', fill: true },
    E: { label: 'Excuse', short: 'E', bg: 'bg-slate-100 dark:bg-slate-800/40', text: 'text-slate-700 dark:text-slate-300', fill: true },
    H: { label: 'Holiday', short: 'H', bg: 'bg-rose-500', text: 'text-white', fill: true },
    WO: { label: 'Week Off', short: 'WO', bg: 'bg-muted', text: 'text-muted-foreground', fill: true },
    OS: { label: 'Offset', short: 'OS', bg: 'bg-muted', text: 'text-muted-foreground', fill: true },
    'N/A': { label: 'N/A', short: 'N/A', bg: 'bg-slate-100 dark:bg-slate-800/40', text: 'text-slate-500 dark:text-slate-400', fill: true },
}

const LEGEND_ORDER = ['P', 'P-late', 'P-short', 'A', 'AL', 'SL', 'H', 'WFH', 'BT', 'E', 'WO', 'N/A']

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatTime(iso: string | null): string | null {
    if (!iso) return null
    try {
        const d = new Date(iso)
        if (Number.isNaN(d.getTime())) return null
        return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: true })
    } catch {
        return null
    }
}

interface Props {
    data: CalendarResponse | undefined
    loading: boolean
}

/**
 * Whole-month calendar view (7×6 grid) for a single employee. Fits the entire
 * month on one screen — no horizontal scroll. Sun-first week to match
 * conventional UAE/MENA calendars.
 *
 * For the manager team grid (many employees × 31 days), use
 * AttendanceCalendarGrid instead.
 */
export function AttendanceMonthCalendar({ data, loading }: Props) {
    const now = new Date()
    const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    if (loading) {
        return (
            <div className="space-y-3">
                <Skeleton className="h-8 w-full" />
                <div className="grid grid-cols-7 gap-1">
                    {SKELETON_SLOTS.map((slot) => (
                        <Skeleton key={slot} className="h-12 w-full rounded-md" />
                    ))}
                </div>
            </div>
        )
    }
    if (!data || data.employees.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
                No attendance to show for this month.
            </div>
        )
    }

    // Single-employee view — take the first (and only) row.
    const cells = data.employees[0].cells
    const firstWeekday = data.firstWeekday // 0 = Sun
    const totalSlots = Math.ceil((firstWeekday + cells.length) / 7) * 7

    // Each slot uses a stable key (`empty-N` for leading/trailing blanks, ISO date for days)
    // so React reconciliation isn't tied to array index ordering.
    const slots: Array<{ key: string; day: number; iso: string; cell: CalendarCell } | { key: string; empty: true }> = []
    for (let i = 0; i < totalSlots; i++) {
        const dayIdx = i - firstWeekday
        if (dayIdx < 0 || dayIdx >= cells.length) {
            slots.push({ key: `empty-${i}`, empty: true })
        } else {
            const day = dayIdx + 1
            const iso = `${data.month}-${String(day).padStart(2, '0')}`
            slots.push({ key: iso, day, iso, cell: cells[dayIdx] })
        }
    }

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {WEEKDAY_LABELS.map((w) => (
                    <div key={w}>{w}</div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
                {slots.map((slot) =>
                    'empty' in slot ? (
                        <div key={slot.key} className="h-12 rounded-md bg-transparent" />
                    ) : (
                        <DayCell
                            key={slot.key}
                            day={slot.day}
                            cell={slot.cell}
                            isToday={slot.iso === todayISO}
                        />
                    ),
                )}
            </div>

            <Legend />
        </div>
    )
}

// 35 skeleton tiles — labelled with stable keys so we don't fall back to array index.
const SKELETON_SLOTS = Array.from({ length: 35 }, (_, i) => `sk-${i}`)

function DayCell({ day, cell, isToday }: { day: number; cell: CalendarCell; isToday: boolean }) {
    const [open, setOpen] = useState(false)
    const meta = cell.code ? CODE_META[cell.code] ?? null : null
    const checkInLabel = formatTime(cell.checkIn)
    const checkOutLabel = formatTime(cell.checkOut)
    const hasTooltip = !!(checkInLabel || checkOutLabel || cell.leaveType || cell.holidayName)

    // Render an actual <button> when there's something to reveal — that gives
    // us free keyboard activation (Enter / Space) and the right semantics for
    // assistive tech. Otherwise stay a plain div so non-interactive cells
    // aren't announced as buttons.
    if (hasTooltip) {
        function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
            if (e.key === 'Escape') setOpen(false)
        }
        return (
            <button
                type="button"
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onClick={() => setOpen((v) => !v)}
                onKeyDown={onKeyDown}
                className={cn(
                    'relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-md border px-1 text-center transition-shadow',
                    meta?.fill ? `${meta.bg} ${meta.text} border-transparent` : 'border-border bg-card/40',
                    isToday && 'ring-1 ring-primary ring-offset-1 ring-offset-background',
                    'cursor-help hover:shadow-sm',
                )}
            >
                <CellBody day={day} meta={meta} />
                {open ? (
                    <CellTooltip cell={cell} checkInLabel={checkInLabel} checkOutLabel={checkOutLabel} />
                ) : null}
            </button>
        )
    }
    return (
        <div
            className={cn(
                'relative flex h-12 flex-col items-center justify-center gap-0.5 rounded-md border px-1 text-center',
                meta?.fill ? `${meta.bg} ${meta.text} border-transparent` : 'border-border bg-card/40',
                isToday && 'ring-1 ring-primary ring-offset-1 ring-offset-background',
            )}
        >
            <CellBody day={day} meta={meta} />
        </div>
    )
}

function CellBody({ day, meta }: { day: number; meta: CodeMeta | null }) {
    return (
        <>
            <span className={cn('text-[11px] font-semibold tabular-figures leading-none', !meta?.fill && 'text-foreground')}>
                {day}
            </span>
            {meta ? (
                <span className="line-clamp-1 text-[9px] font-semibold uppercase leading-none tracking-wide">
                    {meta.short}
                </span>
            ) : null}
        </>
    )
}

function CellTooltip({
    cell,
    checkInLabel,
    checkOutLabel,
}: {
    cell: CalendarCell
    checkInLabel: string | null
    checkOutLabel: string | null
}) {
    return (
        <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-emerald-600 px-3 py-1.5 text-[10px] font-medium text-white shadow-lg">
            {checkInLabel || checkOutLabel ? (
                <>
                    <div className="flex items-center gap-4">
                        <span className="opacity-80">Time In</span>
                        <span className="opacity-80">Time Out</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-4 text-xs tabular-figures">
                        <span>{checkInLabel ?? '–'}</span>
                        <span>{checkOutLabel ?? '–'}</span>
                    </div>
                </>
            ) : cell.holidayName ? (
                <span>{cell.holidayName}</span>
            ) : cell.leaveType ? (
                <span className="capitalize">{cell.leaveType.replace(/_/g, ' ')} leave</span>
            ) : null}
        </div>
    )
}

function Legend() {
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border/70 bg-card/40 px-3 py-2 text-[11px]">
            {LEGEND_ORDER.map((code) => {
                const meta = CODE_META[code]
                if (!meta) return null
                return (
                    <span key={code} className="inline-flex items-center gap-1.5">
                        <span
                            className={cn(
                                'flex h-5 min-w-[1.75rem] items-center justify-center rounded px-1 text-[10px] font-semibold',
                                meta.bg,
                                meta.text,
                            )}
                        >
                            {meta.short}
                        </span>
                        <span className="text-muted-foreground">{meta.label}</span>
                    </span>
                )
            })}
        </div>
    )
}
