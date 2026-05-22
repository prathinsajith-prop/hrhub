import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import type { CalendarCell, CalendarEmployee, CalendarResponse } from '@/hooks/useAttendance'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Legend definitions ──────────────────────────────────────────────────
//
// Each entry maps a UI code → label + visual tone. Tone classes follow the
// screenshot the user shared: P (plain), P-late (red text), P-short (orange),
// A (red badge), AL/SL/ML/PL/BL (peach), BT/WFH/E (outline), H (red badge),
// WO (grey), OS (grey), N/A (slate).
//
// Codes returned by the backend: P, P-late, P-short, A, AL, SL, ML, PL, BL,
// BT, WFH, E, H, WO, OS, N/A, HJ.

interface CodeMeta {
    label: string
    short: string
    bg: string
    text: string
    weight: 'badge' | 'plain'
}

const CODE_META: Record<string, CodeMeta> = {
    // Present cells now wear a vivid emerald fill so a "good" day pops out
    // of the team-grid background — matches the employee-side calendar's
    // colour vocabulary so HR and the employee see the same green for a
    // present day.
    P: { label: 'Present', short: 'P', bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-100', weight: 'badge' },
    'P-late': { label: 'Late', short: 'P', bg: 'bg-rose-100 dark:bg-rose-950/40', text: 'text-rose-700 dark:text-rose-300', weight: 'badge' },
    'P-short': { label: 'Short Hours', short: 'P', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', weight: 'badge' },
    A: { label: 'Absent / Unpaid Leave / Only Punch In', short: 'A', bg: 'bg-rose-500', text: 'text-white', weight: 'badge' },
    AL: { label: 'Annual Leave', short: 'AL', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', weight: 'badge' },
    SL: { label: 'Sick Leave', short: 'SL', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', weight: 'badge' },
    ML: { label: 'Maternity Leave', short: 'ML', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', weight: 'badge' },
    PL: { label: 'Paternity Leave', short: 'PL', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', weight: 'badge' },
    BL: { label: 'Bereavement Leave', short: 'BL', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', weight: 'badge' },
    HJ: { label: 'Hajj Leave', short: 'HJ', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200', weight: 'badge' },
    BT: { label: 'Business Trip', short: 'BT', bg: 'bg-white dark:bg-transparent', text: 'text-foreground', weight: 'plain' },
    WFH: { label: 'Work from home', short: 'WFH', bg: 'bg-white dark:bg-transparent', text: 'text-foreground', weight: 'plain' },
    E: { label: 'Excuse', short: 'E', bg: 'bg-white dark:bg-transparent', text: 'text-foreground', weight: 'plain' },
    H: { label: 'Holiday', short: 'H', bg: 'bg-rose-500', text: 'text-white', weight: 'badge' },
    WO: { label: 'Week Off', short: 'WO', bg: 'bg-muted', text: 'text-muted-foreground', weight: 'badge' },
    OS: { label: 'Offset', short: 'OS', bg: 'bg-muted', text: 'text-muted-foreground', weight: 'badge' },
    'N/A': { label: 'New Employees', short: 'N/A', bg: 'bg-slate-200 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-300', weight: 'badge' },
}

const LEGEND_ORDER: string[] = ['P', 'P-late', 'P-short', 'A', 'AL', 'SL', 'ML', 'PL', 'BL', 'BT', 'WFH', 'E', 'H', 'WO', 'OS', 'N/A']

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
            <Legend />
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
            {hasTooltip && open ? (
                <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border/70 bg-emerald-600 px-3 py-1.5 text-[10px] font-medium text-white shadow-lg">
                    {checkInLabel || checkOutLabel ? (
                        <>
                            <div className="flex items-center gap-4">
                                <span className="opacity-80">Time In</span>
                                <span className="opacity-80">Time Out</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-4 text-xs tabular-figures">
                                <span>{checkInLabel ?? '—'}</span>
                                <span>{checkOutLabel ?? '—'}</span>
                            </div>
                        </>
                    ) : cell.holidayName ? (
                        <span>{cell.holidayName}</span>
                    ) : cell.leaveType ? (
                        <span className="capitalize">{cell.leaveType.replace(/_/g, ' ')} leave</span>
                    ) : null}
                </div>
            ) : null}
        </td>
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
                                'flex h-5 min-w-[1.5rem] items-center justify-center rounded px-1 text-[10px] font-semibold',
                                meta.weight === 'badge' ? meta.bg : 'bg-transparent',
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

function GridSkeleton() {
    return (
        <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
        </div>
    )
}
