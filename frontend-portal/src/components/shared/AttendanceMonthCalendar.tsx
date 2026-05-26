import { useState, type KeyboardEvent } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarCell, CalendarResponse } from '@/hooks/useAttendance'
import { Skeleton } from '@/components/ui/skeleton'
import { CODE_META, AttendanceLegendPopover, type CodeMeta } from '@/components/shared/AttendanceLegend'
import { formatTime } from '@/lib/datetime'

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
            {/* Legend sits in the top-right corner so it's discoverable
                without pushing the calendar grid down. The popover opens
                under the trigger and aligns to the right edge — works on
                narrow screens too. */}
            <div className="flex justify-end">
                <AttendanceLegendPopover width={320} />
            </div>

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
                    meta?.weight === 'badge' ? `${meta.bg} ${meta.text} border-transparent` : 'border-border bg-card/40',
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
                meta?.weight === 'badge' ? `${meta.bg} ${meta.text} border-transparent` : 'border-border bg-card/40',
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
            <span className={cn('text-[11px] font-semibold tabular-figures leading-none', meta?.weight !== 'badge' && 'text-foreground')}>
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
    checkInLabel: string
    checkOutLabel: string
}) {
    // Tooltip renders ABOVE the day cell so it stays clear of the
    // dialog / page bottom edge — the old "below" placement clipped
    // Time In/Out values inside modals. Clean card on the popover
    // surface with a green "in" chip and red "out" chip so the punch
    // direction reads at a glance, regardless of the cell's tone.
    return (
        <div className="pointer-events-none absolute left-1/2 bottom-full z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-3 py-2 text-popover-foreground shadow-md min-w-[180px]">
            {checkInLabel || checkOutLabel ? (
                <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-4">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                            <LogIn className="size-3" aria-hidden />
                            Time In
                        </span>
                        <span className="text-xs font-semibold tabular-figures text-foreground">
                            {checkInLabel || '—'}
                        </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-700 dark:text-rose-400">
                            <LogOut className="size-3" aria-hidden />
                            Time Out
                        </span>
                        <span className="text-xs font-semibold tabular-figures text-foreground">
                            {checkOutLabel || '—'}
                        </span>
                    </div>
                </div>
            ) : cell.holidayName ? (
                <span className="text-xs font-medium">{cell.holidayName}</span>
            ) : cell.leaveType ? (
                <span className="text-xs font-medium capitalize">{cell.leaveType.replace(/_/g, ' ')} leave</span>
            ) : null}
        </div>
    )
}

