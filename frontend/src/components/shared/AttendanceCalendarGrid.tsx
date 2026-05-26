import { LogIn, LogOut } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import type { CalendarCell, CalendarEmployee, CalendarResponse } from '@/hooks/useAttendance'
import { cn } from '@/lib/utils'
import { CODE_META, AttendanceLegendPopover } from './AttendanceLegend'
// Re-export so existing consumers (e.g. `import { CODE_META } from
// './AttendanceCalendarGrid'`) keep working while the constants live in
// the new shared module. New code should import from `./AttendanceLegend`.
export { CODE_META } from './AttendanceLegend'

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

function GridSkeleton() {
    return (
        <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
        </div>
    )
}
