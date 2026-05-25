import { Info, LogIn, LogOut } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import type { CalendarCell, CalendarEmployee, CalendarResponse } from '@/hooks/useAttendance'
import { cn } from '@/lib/utils'

// ─── Code → tone metadata ─────────────────────────────────────────────────

interface CodeMeta {
    label: string
    short: string
    bg: string
    text: string
    weight: 'badge' | 'plain'
}

// Each status gets a distinct hue so a month's grid is readable at a glance
// without consulting the legend constantly. Solid fills are reserved for the
// two events that *demand* attention (Absent, Holiday); everything else uses
// the matching "100"-shade soft tint so the eye groups them by family
// (sky-blue = absence-with-leave, pink/indigo = maternity/paternity, etc.).
export const CODE_META: Record<string, CodeMeta> = {
    // ── Present (green family) ─────────────────────────────────────
    P:         { label: 'Present',       short: 'P',  bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-100', weight: 'badge' },
    'P-late':  { label: 'Late',          short: 'P',  bg: 'bg-orange-100 dark:bg-orange-950/40',   text: 'text-orange-800 dark:text-orange-200',   weight: 'badge' },
    'P-short': { label: 'Short Hours',   short: 'P',  bg: 'bg-amber-100 dark:bg-amber-950/40',     text: 'text-amber-800 dark:text-amber-200',     weight: 'badge' },

    // ── Hard absence (filled red) ──────────────────────────────────
    A:         { label: 'Absent / Unpaid Leave / Only Punch In', short: 'A', bg: 'bg-rose-600',     text: 'text-white',                              weight: 'badge' },

    // ── Leaves (each a distinct hue) ───────────────────────────────
    AL:        { label: 'Annual Leave',     short: 'AL', bg: 'bg-sky-100 dark:bg-sky-950/40',       text: 'text-sky-800 dark:text-sky-200',          weight: 'badge' },
    SL:        { label: 'Sick Leave',       short: 'SL', bg: 'bg-red-100 dark:bg-red-950/40',       text: 'text-red-800 dark:text-red-200',          weight: 'badge' },
    ML:        { label: 'Maternity Leave',  short: 'ML', bg: 'bg-pink-100 dark:bg-pink-950/40',     text: 'text-pink-800 dark:text-pink-200',        weight: 'badge' },
    PL:        { label: 'Paternity Leave',  short: 'PL', bg: 'bg-indigo-100 dark:bg-indigo-950/40', text: 'text-indigo-800 dark:text-indigo-200',    weight: 'badge' },
    BL:        { label: 'Bereavement Leave',short: 'BL', bg: 'bg-stone-200 dark:bg-stone-800/60',   text: 'text-stone-800 dark:text-stone-200',      weight: 'badge' },
    HJ:        { label: 'Hajj Leave',       short: 'HJ', bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-800 dark:text-violet-200',    weight: 'badge' },

    // ── Working away from the office (cool tints) ──────────────────
    BT:        { label: 'Business Trip',    short: 'BT', bg: 'bg-cyan-100 dark:bg-cyan-950/40',     text: 'text-cyan-800 dark:text-cyan-200',        weight: 'badge' },
    WFH:       { label: 'Work from home',   short: 'WFH',bg: 'bg-teal-100 dark:bg-teal-950/40',     text: 'text-teal-800 dark:text-teal-200',        weight: 'badge' },
    E:         { label: 'Excuse',           short: 'E',  bg: 'bg-yellow-100 dark:bg-yellow-950/40', text: 'text-yellow-800 dark:text-yellow-200',    weight: 'badge' },

    // ── Calendar markers (filled fuchsia for holidays, neutral grays) ─
    H:         { label: 'Holiday',          short: 'H',  bg: 'bg-fuchsia-600',                      text: 'text-white',                              weight: 'badge' },
    WO:        { label: 'Week Off',         short: 'WO', bg: 'bg-zinc-200 dark:bg-zinc-800/60',     text: 'text-zinc-700 dark:text-zinc-300',        weight: 'badge' },
    OS:        { label: 'Offset',           short: 'OS', bg: 'bg-neutral-200 dark:bg-neutral-800/60', text: 'text-neutral-700 dark:text-neutral-300', weight: 'badge' },
    'N/A':     { label: 'New Employees',    short: 'N/A',bg: 'bg-slate-200 dark:bg-slate-800',      text: 'text-slate-700 dark:text-slate-300',      weight: 'badge' },
}

const LEGEND_ORDER = ['P', 'P-late', 'P-short', 'A', 'AL', 'SL', 'ML', 'PL', 'BL', 'BT', 'WFH', 'E', 'H', 'WO', 'OS', 'N/A']

export function formatTime(iso: string | null): string | null {
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
    /**
     * When true, omits the sticky employee name column - useful inside an
     * employee detail page where the row already identifies the person.
     */
    hideEmployeeColumn?: boolean
    /**
     * When true (default), renders the legend popover above the grid. Callers
     * that surface the legend in their own header should set this `false` and
     * place `<AttendanceLegendPopover />` themselves to avoid duplication.
     */
    showLegend?: boolean
    /**
     * Compact mode shrinks cell width + height so a full month fits inside a
     * narrow container (e.g. a dialog) without horizontal scroll. Use with
     * `hideEmployeeColumn` for the single-employee preview shape.
     */
    compact?: boolean
    emptyMessage?: string
}

/**
 * Whole-team attendance grid (employees × 31 days). Sticky first column for
 * employee names, status badges per cell with the same legend the user
 * provided. Hover/focus a cell to reveal a tooltip with check-in/out times,
 * holiday name, or leave type.
 *
 * With `hideEmployeeColumn`, renders a single employee's row without the
 * name column - reused by EmployeeDetailPage's attendance tab.
 */
export function AttendanceCalendarGrid({ data, loading, hideEmployeeColumn, showLegend = true, compact = false, emptyMessage }: Props) {
    if (loading) return <GridSkeleton />
    if (!data) return null

    if (data.employees.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
                {emptyMessage ?? 'No attendance to show for this month.'}
            </div>
        )
    }

    const days = Array.from({ length: data.daysInMonth }, (_, i) => i + 1)

    return (
        <div className="space-y-3">
            {showLegend ? (
                <div className="flex items-center justify-end">
                    <AttendanceLegendPopover />
                </div>
            ) : null}
            <div className={cn('rounded-xl border border-border bg-card', !compact && 'overflow-x-auto')}>
                <table className={cn(
                    'border-separate border-spacing-0 text-xs',
                    compact ? 'w-full table-fixed' : 'min-w-full',
                )}>
                    <thead>
                        <tr>
                            {!hideEmployeeColumn && (
                                <th
                                    scope="col"
                                    className="sticky left-0 z-30 min-w-[220px] border-b-2 border-r border-border bg-muted px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-[1px_0_0_0_var(--border)]"
                                >
                                    Employee
                                </th>
                            )}
                            {days.map((d) => {
                                const dateObj = new Date(`${data.month}-${String(d).padStart(2, '0')}T00:00:00Z`)
                                const dayOfWeek = dateObj.getUTCDay()
                                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                                return (
                                    <th
                                        key={d}
                                        scope="col"
                                        className={cn(
                                            'border-b-2 border-r border-border px-0 text-center font-semibold tabular-figures',
                                            compact
                                                ? 'py-1.5 text-[10px]'
                                                : 'w-9 min-w-[36px] py-2.5 text-[11px]',
                                            isWeekend ? 'bg-muted/50 text-muted-foreground' : 'bg-muted text-foreground',
                                        )}
                                    >
                                        {d}
                                    </th>
                                )
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {data.employees.map((emp) => (
                            <Row key={emp.id} employee={emp} month={data.month} hideEmployeeColumn={hideEmployeeColumn} compact={compact} />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function Row({ employee, month, hideEmployeeColumn, compact }: { employee: CalendarEmployee; month: string; hideEmployeeColumn?: boolean; compact?: boolean }) {
    return (
        <tr className="group">
            {!hideEmployeeColumn && (
                // Hover bg must stay fully opaque, otherwise day badges in this same
                // row bleed through the sticky cell (Tailwind's `bg-muted/30` is
                // 30% alpha — visually transparent enough to leak the badges).
                <td className="sticky left-0 z-20 min-w-[220px] max-w-[260px] border-b border-r border-border bg-background px-3 py-2 text-left font-medium group-hover:bg-muted shadow-[1px_0_0_0_var(--border)]">
                    <div className="truncate">{employee.name}</div>
                    {employee.department ? (
                        <div className="truncate text-[10px] font-normal text-muted-foreground">
                            {employee.department}
                        </div>
                    ) : null}
                </td>
            )}
            {employee.cells.map((cell, i) => {
                const day = i + 1
                const dateObj = new Date(`${month}-${String(day).padStart(2, '0')}T00:00:00Z`)
                const dayOfWeek = dateObj.getUTCDay()
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                return <Cell key={`${employee.id}-d${day}`} cell={cell} isWeekend={isWeekend} compact={compact} />
            })}
        </tr>
    )
}

function Cell({ cell, isWeekend, compact }: { cell: CalendarCell; isWeekend?: boolean; compact?: boolean }) {
    const meta = CODE_META[cell.code] ?? null
    const checkInLabel = formatTime(cell.checkIn)
    const checkOutLabel = formatTime(cell.checkOut)
    const hasTooltip = !!(checkInLabel || checkOutLabel || cell.leaveType || cell.holidayName)
    // Empty cells (no code) get a subtle striped fallback so missing days
    // read as "no data on file" rather than a rendering glitch. Weekend
    // empty cells use a slightly darker tint to mirror the header.
    const fallbackBg = !meta ? (isWeekend ? 'bg-muted/40' : 'bg-muted/15') : ''
    const sizeCellClass = compact ? '' : 'w-9 min-w-[36px]'
    const sizeInnerClass = compact ? 'h-7 text-[10px]' : 'h-9 text-[11px]'

    const inner = (
        <div
            className={cn(
                'flex w-full items-center justify-center font-semibold tabular-figures',
                sizeInnerClass,
                meta?.weight === 'badge' && meta.bg,
                meta?.text,
            )}
        >
            {meta ? meta.short : ''}
        </div>
    )

    return (
        <td className={cn(
            'border-b border-r border-border p-0 text-center align-middle group-hover:bg-muted/10',
            sizeCellClass,
            fallbackBg,
        )}>
            {hasTooltip ? (
                // Radix Tooltip portals its content into <body>, so the popup is
                // never clipped by an `overflow-y-auto` ancestor (e.g. the dialog
                // body that surrounds the calendar in the punch-history modal).
                // It also auto-flips to `top` when there's no room below.
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            aria-label={meta?.label}
                            className={cn(
                                'block w-full cursor-help',
                                meta?.weight === 'badge' && meta.bg,
                                meta?.text,
                            )}
                        >
                            <div
                                className={cn(
                                    'flex w-full items-center justify-center font-semibold tabular-figures',
                                    sizeInnerClass,
                                )}
                            >
                                {meta ? meta.short : ''}
                            </div>
                        </button>
                    </TooltipTrigger>
                    {/* Tooltip side defaults to `top` so it stays clear of the
                        dialog's bottom edge (the old `bottom` placement
                        clipped Time In/Out times). Radix auto-flips back to
                        bottom for the first row if `top` would clip there.
                        Design: clean card on the popover/dialog's own
                        surface, with a green "in" chip and red "out" chip
                        so the punch direction reads at a glance. */}
                    <TooltipContent
                        side="top"
                        align="center"
                        sideOffset={6}
                        collisionPadding={12}
                        className="rounded-md border bg-popover px-3 py-2 text-popover-foreground shadow-md min-w-[180px]"
                    >
                        {checkInLabel || checkOutLabel ? (
                            <div className="space-y-1.5">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                        <LogIn className="size-3" aria-hidden />
                                        Time In
                                    </span>
                                    <span className="text-xs font-semibold tabular-figures text-foreground">
                                        {checkInLabel ?? '—'}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-rose-700 dark:text-rose-400">
                                        <LogOut className="size-3" aria-hidden />
                                        Time Out
                                    </span>
                                    <span className="text-xs font-semibold tabular-figures text-foreground">
                                        {checkOutLabel ?? '—'}
                                    </span>
                                </div>
                            </div>
                        ) : cell.holidayName ? (
                            <span className="text-xs font-medium">{cell.holidayName}</span>
                        ) : cell.leaveType ? (
                            <span className="text-xs font-medium capitalize">{cell.leaveType.replace(/_/g, ' ')} leave</span>
                        ) : null}
                    </TooltipContent>
                </Tooltip>
            ) : (
                inner
            )}
        </td>
    )
}

/**
 * Standalone legend popover. Exported so callers can place it next to their
 * own header (e.g. opposite the section title) instead of using the default
 * top-of-grid position. Pass `showLegend={false}` on AttendanceCalendarGrid
 * when you render this yourself.
 */
export function AttendanceLegendPopover() {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <Info className="size-3.5" />
                    Legend
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[340px] p-4">
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
                                        meta.weight === 'badge' ? meta.bg : 'bg-transparent',
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

function GridSkeleton() {
    return (
        <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
        </div>
    )
}
