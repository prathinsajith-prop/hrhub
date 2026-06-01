import { useMemo, useState } from 'react'
import { Calendar as CalendarIcon, ChevronDown } from 'lucide-react'
import {
    format, parse, isValid,
    startOfMonth, endOfMonth, subMonths, subDays,
    startOfYear, endOfYear, subYears,
} from 'date-fns'
import {
    DateRangePicker,
    createStaticRanges,
    type Range,
    type RangeKeyDict,
} from 'react-date-range'
// Plugin styles + default theme — this is the exact bootstrap-daterangepicker
// look. We only override the selection colour (via rangeColors) and a few
// radii in index.css so it sits inside our shadcn popover cleanly.
import 'react-date-range/dist/styles.css'
import 'react-date-range/dist/theme/default.css'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Reports date-range filter, built on the `react-date-range` plugin — the
 * React port of the classic bootstrap-daterangepicker (preset rail on the
 * left, two-month calendar, range shown in the trigger, Apply / Cancel).
 *
 * Presets are still computed locally from the user's clock so the client and
 * server agree on the same ISO `YYYY-MM-DD` date label (reports filter a
 * `date` column, not an instant). Returns ISO strings the backend `BETWEEN`
 * already validates — no backend impact.
 */

export type ReportRangePreset =
    | 'today'
    | 'this_week'
    | 'last_week'
    | 'this_month'
    | 'last_30_days'
    | 'last_90_days'
    | 'this_year'
    | 'custom'

export interface ReportDateRangeValue {
    preset: ReportRangePreset
    startDate: string
    endDate: string
}

const ISO = 'yyyy-MM-dd'
const PRIMARY = 'hsl(221, 83%, 53%)' // matches --primary token

function toIso(d: Date): string {
    // Local Y/M/D so "today" matches the wall clock, not UTC.
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function fromIso(s: string | undefined): Date | undefined {
    if (!s) return undefined
    const d = parse(s, ISO, new Date())
    return isValid(d) ? d : undefined
}

/** "05/26/2026" trigger label, matching the plugin's display format. */
function prettyUs(iso: string): string {
    const d = fromIso(iso)
    return d ? format(d, 'MM/dd/yyyy') : iso
}

function startOfIsoWeek(d: Date): Date {
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const day = copy.getDay() || 7 // ISO weeks start Monday
    copy.setDate(copy.getDate() - (day - 1))
    return copy
}

/** Resolve a preset to a concrete `{ startDate, endDate }` against now. */
export function resolvePreset(preset: ReportRangePreset, now: Date = new Date()): { startDate: string; endDate: string } {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    switch (preset) {
        case 'today':
            return { startDate: toIso(today), endDate: toIso(today) }
        case 'this_week': {
            const start = startOfIsoWeek(today)
            return { startDate: toIso(start), endDate: toIso(today) }
        }
        case 'last_week': {
            const thisWeekStart = startOfIsoWeek(today)
            const lastWeekEnd = new Date(thisWeekStart); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1)
            const lastWeekStart = new Date(lastWeekEnd); lastWeekStart.setDate(lastWeekStart.getDate() - 6)
            return { startDate: toIso(lastWeekStart), endDate: toIso(lastWeekEnd) }
        }
        case 'this_month': {
            const start = new Date(today.getFullYear(), today.getMonth(), 1)
            return { startDate: toIso(start), endDate: toIso(today) }
        }
        case 'last_30_days': {
            const start = new Date(today); start.setDate(start.getDate() - 29)
            return { startDate: toIso(start), endDate: toIso(today) }
        }
        case 'last_90_days': {
            const start = new Date(today); start.setDate(start.getDate() - 89)
            return { startDate: toIso(start), endDate: toIso(today) }
        }
        case 'this_year': {
            const start = new Date(today.getFullYear(), 0, 1)
            return { startDate: toIso(start), endDate: toIso(today) }
        }
        case 'custom':
            return { startDate: toIso(today), endDate: toIso(today) }
    }
}

// Sidebar presets matching the classic daterangepicker layout. Windows are
// capped at "today" (no future dates in a reports filter); "Last Month" is the
// full previous calendar month. createStaticRanges adds the isSelected matcher.
function buildStaticRanges() {
    const today = new Date()
    return createStaticRanges([
        { label: 'Today', range: () => ({ startDate: today, endDate: today }) },
        { label: 'Yesterday', range: () => ({ startDate: subDays(today, 1), endDate: subDays(today, 1) }) },
        { label: 'Last 7 Days', range: () => ({ startDate: subDays(today, 6), endDate: today }) },
        { label: 'Last 30 Days', range: () => ({ startDate: subDays(today, 29), endDate: today }) },
        { label: 'This Month', range: () => ({ startDate: startOfMonth(today), endDate: today }) },
        { label: 'Last Month', range: () => ({ startDate: startOfMonth(subMonths(today, 1)), endDate: endOfMonth(subMonths(today, 1)) }) },
        { label: 'This Year', range: () => ({ startDate: startOfYear(today), endDate: today }) },
        { label: 'Last Year', range: () => ({ startDate: startOfYear(subYears(today, 1)), endDate: endOfYear(subYears(today, 1)) }) },
    ])
}

interface Props {
    value: ReportDateRangeValue
    onChange: (next: ReportDateRangeValue) => void
    className?: string
    /** Reserved for API compatibility; the control is already a single trigger. */
    compact?: boolean
}

export function DateRangePresets({ value, onChange, className }: Props) {
    const [open, setOpen] = useState(false)
    const staticRanges = useMemo(() => buildStaticRanges(), [])

    // Draft selection edited inside the picker before Apply commits it.
    const toRange = (v: ReportDateRangeValue): Range => ({
        startDate: fromIso(v.startDate) ?? new Date(),
        endDate: fromIso(v.endDate) ?? new Date(),
        key: 'selection',
    })
    const [draft, setDraft] = useState<Range>(() => toRange(value))

    // Re-sync the draft from the external value when it changes (e.g. parent
    // reset) — state-during-render, no effect needed.
    const [lastValue, setLastValue] = useState(`${value.startDate}|${value.endDate}`)
    const valueKey = `${value.startDate}|${value.endDate}`
    if (valueKey !== lastValue) {
        setLastValue(valueKey)
        setDraft(toRange(value))
    }

    const triggerLabel = useMemo(
        () => `${prettyUs(value.startDate)} - ${prettyUs(value.endDate)}`,
        [value],
    )

    function openChange(next: boolean) {
        // Reset the draft to the committed value whenever we (re)open so a
        // prior un-applied edit doesn't linger.
        if (next) setDraft(toRange(value))
        setOpen(next)
    }

    function applyDraft() {
        const s = draft.startDate ?? new Date()
        const e = draft.endDate ?? s
        const startDate = toIso(s <= e ? s : e)
        const endDate = toIso(s <= e ? e : s)
        onChange({ preset: 'custom', startDate, endDate })
        setOpen(false)
    }

    const draftLabel = `${draft.startDate ? prettyUs(toIso(draft.startDate)) : ''} - ${draft.endDate ? prettyUs(toIso(draft.endDate)) : ''}`

    return (
        <div className={cn('inline-flex items-center', className)}>
            <Popover open={open} onOpenChange={openChange}>
                <PopoverTrigger asChild>
                    {/* Input-style trigger showing the active range. */}
                    <Button variant="outline" size="sm" className="h-9 gap-2 text-xs font-medium tabular-nums">
                        <CalendarIcon className="size-3.5 text-muted-foreground" />
                        <span>{triggerLabel}</span>
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-0 overflow-hidden">
                    <div className="hrhub-rdr">
                        <DateRangePicker
                            ranges={[draft]}
                            onChange={(r: RangeKeyDict) => r.selection && setDraft(r.selection)}
                            months={2}
                            direction="horizontal"
                            showDateDisplay={false}
                            showMonthAndYearPickers
                            moveRangeOnFirstSelection={false}
                            staticRanges={staticRanges}
                            inputRanges={[]}
                            rangeColors={[PRIMARY]}
                            weekStartsOn={1}
                        />
                        {/* Footer: live span + Apply / Cancel, matching the plugin. */}
                        <div className="flex items-center justify-end gap-2 border-t px-3 py-2.5">
                            <span className="mr-auto text-xs text-muted-foreground tabular-nums">{draftLabel}</span>
                            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setOpen(false)}>
                                Cancel
                            </Button>
                            <Button size="sm" className="h-8 text-xs" onClick={applyDraft}>
                                Apply
                            </Button>
                        </div>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    )
}

/** Default seed — Reports opens on "This month". */
export function defaultReportRange(): ReportDateRangeValue {
    const { startDate, endDate } = resolvePreset('this_month')
    return { preset: 'this_month', startDate, endDate }
}
