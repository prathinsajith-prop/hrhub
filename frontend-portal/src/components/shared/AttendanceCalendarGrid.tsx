import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CalendarCell, CalendarEmployee, CalendarResponse } from '@/hooks/useAttendance'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

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

// Palette mirrors the admin HR Manager attendance grid so the same status
// reads the same colour on both surfaces. Each row of the legend is a
// distinct hue family so the eye can scan a month's grid without
// consulting the legend constantly: green = present, orange/amber =
// degraded-present (late/short), red-solid = hard absence, sky/red/pink/
// indigo/stone/violet = leave variants, cyan/teal = working-away,
// fuchsia-solid = holiday, neutrals = calendar markers.
const CODE_META: Record<string, CodeMeta> = {
    // Present (green family)
    P:         { label: 'Present',       short: 'P',  bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-100', weight: 'badge' },
    'P-late':  { label: 'Late',          short: 'P',  bg: 'bg-orange-100 dark:bg-orange-950/40',   text: 'text-orange-800 dark:text-orange-200',   weight: 'badge' },
    'P-short': { label: 'Short Hours',   short: 'P',  bg: 'bg-amber-100 dark:bg-amber-950/40',     text: 'text-amber-800 dark:text-amber-200',     weight: 'badge' },

    // Hard absence (filled red)
    A:         { label: 'Absent / Unpaid Leave / Only Punch In', short: 'A', bg: 'bg-rose-600', text: 'text-white', weight: 'badge' },

    // Leaves (each a distinct hue)
    AL:        { label: 'Annual Leave',     short: 'AL', bg: 'bg-sky-100 dark:bg-sky-950/40',       text: 'text-sky-800 dark:text-sky-200',          weight: 'badge' },
    SL:        { label: 'Sick Leave',       short: 'SL', bg: 'bg-red-100 dark:bg-red-950/40',       text: 'text-red-800 dark:text-red-200',          weight: 'badge' },
    ML:        { label: 'Maternity Leave',  short: 'ML', bg: 'bg-pink-100 dark:bg-pink-950/40',     text: 'text-pink-800 dark:text-pink-200',        weight: 'badge' },
    PL:        { label: 'Paternity Leave',  short: 'PL', bg: 'bg-indigo-100 dark:bg-indigo-950/40', text: 'text-indigo-800 dark:text-indigo-200',    weight: 'badge' },
    BL:        { label: 'Bereavement Leave',short: 'BL', bg: 'bg-stone-200 dark:bg-stone-800/60',   text: 'text-stone-800 dark:text-stone-200',      weight: 'badge' },
    HJ:        { label: 'Hajj Leave',       short: 'HJ', bg: 'bg-violet-100 dark:bg-violet-950/40', text: 'text-violet-800 dark:text-violet-200',    weight: 'badge' },

    // Working away from the office (cool tints)
    BT:        { label: 'Business Trip',    short: 'BT', bg: 'bg-cyan-100 dark:bg-cyan-950/40',     text: 'text-cyan-800 dark:text-cyan-200',        weight: 'badge' },
    WFH:       { label: 'Work from home',   short: 'WFH',bg: 'bg-teal-100 dark:bg-teal-950/40',     text: 'text-teal-800 dark:text-teal-200',        weight: 'badge' },
    E:         { label: 'Excuse',           short: 'E',  bg: 'bg-yellow-100 dark:bg-yellow-950/40', text: 'text-yellow-800 dark:text-yellow-200',    weight: 'badge' },

    // Calendar markers (filled fuchsia for holidays, neutral grays)
    H:         { label: 'Holiday',          short: 'H',  bg: 'bg-fuchsia-600',                      text: 'text-white',                              weight: 'badge' },
    WO:        { label: 'Week Off',         short: 'WO', bg: 'bg-zinc-200 dark:bg-zinc-800/60',     text: 'text-zinc-700 dark:text-zinc-300',        weight: 'badge' },
    OS:        { label: 'Offset',           short: 'OS', bg: 'bg-neutral-200 dark:bg-neutral-800/60', text: 'text-neutral-700 dark:text-neutral-300', weight: 'badge' },
    'N/A':     { label: 'New Employees',    short: 'N/A',bg: 'bg-slate-200 dark:bg-slate-800',      text: 'text-slate-700 dark:text-slate-300',      weight: 'badge' },
}

const LEGEND_ORDER: string[] = ['P', 'P-late', 'P-short', 'A', 'AL', 'SL', 'ML', 'PL', 'BL', 'HJ', 'BT', 'WFH', 'E', 'H', 'WO', 'OS', 'N/A']

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
            <div className="flex items-center justify-end">
                <Legend />
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

// Popover-backed legend (replaces the old inline horizontal strip that
// crowded the page header). Click the "Legend" pill to reveal the full
// status-code key in a focused two-column grid. Stays out of the way on
// small screens and stops re-flowing the calendar when the legend grows.
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
