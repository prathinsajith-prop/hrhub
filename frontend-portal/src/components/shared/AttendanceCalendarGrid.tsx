import { useMemo, useState } from 'react'
import { LogIn, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarCell, CalendarEmployee, CalendarResponse } from '@/hooks/useAttendance'
import { Skeleton } from '@/components/ui/skeleton'
import { CODE_META, AttendanceLegendPopover } from '@/components/shared/AttendanceLegend'
import { formatTime } from '@/lib/datetime'

interface Props {
    data: CalendarResponse | undefined
    loading: boolean
    /** Hide the "Employee" column when rendering for a single user. */
    hideEmployeeColumn?: boolean
}

export function AttendanceCalendarGrid({ data, loading, hideEmployeeColumn }: Props) {
    const days = useMemo(
        () => (data ? Array.from({ length: data.daysInMonth }, (_, i) => i + 1) : []),
        [data],
    )

    if (loading) return <GridSkeleton />
    if (!data) return null
    if (data.employees.length === 0) {
        return (
            <div className="rounded-xl border border-dashed border-border bg-card/50 px-6 py-12 text-center text-sm text-muted-foreground">
                No attendance to show for this month.
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-end">
                <AttendanceLegendPopover width={320} />
            </div>
            <div className="overflow-x-auto rounded-xl border border-border/70 bg-card/40">
                <table className="min-w-full border-separate border-spacing-0 text-xs">
                    <thead>
                        <tr className="bg-muted/40">
                            {!hideEmployeeColumn ? (
                                <th
                                    scope="col"
                                    className="sticky left-0 z-10 min-w-[180px] border-b border-r border-border/70 bg-muted/40 px-3 py-2 text-left font-semibold backdrop-blur"
                                >
                                    Employee
                                </th>
                            ) : null}
                            {days.map((d) => {
                                const dateObj = new Date(`${data.month}-${String(d).padStart(2, '0')}T00:00:00Z`)
                                const isWeekend = dateObj.getUTCDay() === 0 || dateObj.getUTCDay() === 6
                                return (
                                    <th
                                        key={d}
                                        scope="col"
                                        className={cn(
                                            'min-w-[36px] border-b border-r border-border/70 px-1 py-2 text-center font-semibold tabular-figures',
                                            isWeekend && 'text-muted-foreground',
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
                            <Row
                                key={emp.id}
                                employee={emp}
                                hideEmployeeColumn={hideEmployeeColumn}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

function Row({
    employee,
    hideEmployeeColumn,
}: {
    employee: CalendarEmployee
    hideEmployeeColumn?: boolean
}) {
    return (
        <tr className="hover:bg-muted/20">
            {!hideEmployeeColumn ? (
                <td className="sticky left-0 z-10 min-w-[180px] border-b border-r border-border/70 bg-background px-3 py-2 text-left font-medium">
                    <div className="truncate">{employee.name}</div>
                    {employee.department ? (
                        <div className="truncate text-[10px] font-normal text-muted-foreground">
                            {employee.department}
                        </div>
                    ) : null}
                </td>
            ) : null}
            {employee.cells.map((cell, i) => (
                // Day index within the month is the natural stable key here —
                // cells are never reordered, only re-emitted, so this is fine.
                <Cell key={`${employee.id}-d${i + 1}`} cell={cell} />
            ))}
        </tr>
    )
}

function Cell({ cell }: { cell: CalendarCell }) {
    const [open, setOpen] = useState(false)
    const meta = CODE_META[cell.code] ?? null
    const checkInLabel = formatTime(cell.checkIn)
    const checkOutLabel = formatTime(cell.checkOut)
    const hasTooltip = !!(checkInLabel || checkOutLabel || cell.leaveType || cell.holidayName)

    return (
        <td className="relative border-b border-r border-border/70 p-0 text-center align-middle">
            <div
                role={hasTooltip ? 'button' : undefined}
                tabIndex={hasTooltip ? 0 : undefined}
                onMouseEnter={hasTooltip ? () => setOpen(true) : undefined}
                onMouseLeave={hasTooltip ? () => setOpen(false) : undefined}
                onFocus={hasTooltip ? () => setOpen(true) : undefined}
                onBlur={hasTooltip ? () => setOpen(false) : undefined}
                className={cn(
                    'flex h-9 w-full items-center justify-center text-[11px] font-semibold tabular-figures',
                    meta?.weight === 'badge' && meta.bg,
                    meta?.text,
                )}
                aria-label={meta ? `${meta.label}${checkInLabel ? `, in ${checkInLabel}` : ''}${checkOutLabel ? `, out ${checkOutLabel}` : ''}` : undefined}
            >
                {meta ? meta.short : ''}
            </div>
            {/* Tooltip renders ABOVE the cell (bottom-full + mb-1) so it
                stays clear of the dialog / page bottom edge — the old
                "below" placement clipped Time In/Out values inside
                modals. Clean card on the popover surface with a green
                "in" chip and red "out" chip so the punch direction reads
                at a glance. */}
            {hasTooltip && open ? (
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
            ) : null}
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
