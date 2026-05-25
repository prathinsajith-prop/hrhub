import { useState, type KeyboardEvent } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarCell, CalendarResponse } from '@/hooks/useAttendance'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

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

// Palette mirrors the admin HR Manager attendance grid so the same status
// reads the same colour on every attendance surface. Each row of the legend
// gets a distinct hue family — green = present, orange/amber = degraded-
// present (late/short), red-solid = hard absence, sky/red/pink/indigo/
// stone/violet = leave variants, cyan/teal = working-away, yellow = excuse,
// fuchsia-solid = holiday, neutrals = calendar markers.
const CODE_META: Record<string, CodeMeta> = {
    // Present (green family)
    P:         { label: 'Present',       short: 'P',  bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-100', fill: true },
    'P-late':  { label: 'Late',          short: 'P',  bg: 'bg-orange-100 dark:bg-orange-950/40',   text: 'text-orange-800 dark:text-orange-200',   fill: true },
    'P-short': { label: 'Short Hours',   short: 'P',  bg: 'bg-amber-100 dark:bg-amber-950/40',     text: 'text-amber-800 dark:text-amber-200',     fill: true },

    // Hard absence (filled red)
    A:         { label: 'Absent',        short: 'A',  bg: 'bg-rose-600',                           text: 'text-white',                              fill: true },

    // Leaves (each a distinct hue)
    AL:        { label: 'Annual Leave',     short: 'AL', bg: 'bg-sky-100 dark:bg-sky-950/40',       text: 'text-sky-800 dark:text-sky-200',          fill: true },
    SL:        { label: 'Sick Leave',       short: 'SL', bg: 'bg-red-100 dark:bg-red-950/40',       text: 'text-red-800 dark:text-red-200',          fill: true },
    ML:        { label: 'Maternity Leave',  short: 'ML', bg: 'bg-pink-100 dark:bg-pink-950/40',     text: 'text-pink-800 dark:text-pink-200',        fill: true },
    PL:        { label: 'Paternity Leave',  short: 'PL', bg: 'bg-indigo-100 dark:bg-indigo-950/40', text: 'text-indigo-800 dark:text-indigo-200',    fill: true },
    BL:        { label: 'Bereavement Leave',short: 'BL', bg: 'bg-stone-200 dark:bg-stone-800/60',   text: 'text-stone-800 dark:text-stone-200',      fill: true },
    HJ:        { label: 'Hajj Leave',       short: 'HJ', bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-800 dark:text-violet-200',    fill: true },

    // Working away from the office (cool tints)
    BT:        { label: 'Business Trip',    short: 'BT', bg: 'bg-cyan-100 dark:bg-cyan-950/40',     text: 'text-cyan-800 dark:text-cyan-200',        fill: true },
    WFH:       { label: 'Work From Home',   short: 'WFH',bg: 'bg-teal-100 dark:bg-teal-950/40',     text: 'text-teal-800 dark:text-teal-200',        fill: true },
    E:         { label: 'Excuse',           short: 'E',  bg: 'bg-yellow-100 dark:bg-yellow-950/40', text: 'text-yellow-800 dark:text-yellow-200',    fill: true },

    // Calendar markers (filled fuchsia for holidays, neutral grays)
    H:         { label: 'Holiday',          short: 'H',  bg: 'bg-fuchsia-600',                      text: 'text-white',                              fill: true },
    WO:        { label: 'Week Off',         short: 'WO', bg: 'bg-zinc-200 dark:bg-zinc-800/60',     text: 'text-zinc-700 dark:text-zinc-300',        fill: true },
    OS:        { label: 'Offset',           short: 'OS', bg: 'bg-neutral-200 dark:bg-neutral-800/60', text: 'text-neutral-700 dark:text-neutral-300',fill: true },
    'N/A':     { label: 'New Employees',    short: 'N/A',bg: 'bg-slate-200 dark:bg-slate-800',      text: 'text-slate-700 dark:text-slate-300',      fill: true },
}

const LEGEND_ORDER = ['P', 'P-late', 'P-short', 'A', 'AL', 'SL', 'ML', 'PL', 'BL', 'HJ', 'BT', 'WFH', 'E', 'H', 'WO', 'OS', 'N/A']

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
            {/* Legend sits in the top-right corner so it's discoverable
                without pushing the calendar grid down. The popover opens
                under the trigger and aligns to the right edge — works on
                narrow screens too. */}
            <div className="flex justify-end">
                <Legend />
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

// Popover-backed legend (replaces the old inline horizontal strip that
// crowded the month view). Click "Legend" to reveal the full status-code
// key in a focused two-column grid.
function Legend() {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <Info className="size-3.5" />
                    Legend
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] p-4">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Status codes
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                    {LEGEND_ORDER.map((code) => {
                        const meta = CODE_META[code]
                        if (!meta) return null
                        return (
                            <span key={code} className="inline-flex items-center gap-2 min-w-0">
                                <span
                                    className={cn(
                                        'flex h-5 min-w-[1.75rem] items-center justify-center rounded px-1 text-[10px] font-semibold shrink-0',
                                        meta.bg,
                                        meta.text,
                                    )}
                                >
                                    {meta.short}
                                </span>
                                <span className="text-muted-foreground truncate" title={meta.label}>
                                    {meta.label}
                                </span>
                            </span>
                        )
                    })}
                </div>
            </PopoverContent>
        </Popover>
    )
}
