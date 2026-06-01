import { useMemo, useState } from 'react'
import { Calendar as CalendarIcon, Check, ChevronDown } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

/**
 * Compact date-range filter used by the Reports page.
 *
 * Five preset options (Today / This Week / Last Week / This Month / Custom)
 * map to a `{ startDate, endDate }` pair the parent passes down to the
 * report hooks. The presets are computed locally from the user's clock —
 * we deliberately avoid round-tripping to the server for "what is today",
 * because every report query already filters by ISO `YYYY-MM-DD` so the
 * client and server need to agree on the same date label, not the same
 * instant. That agreement is what the user sees on the chart anyway.
 *
 * "This Week" / "Last Week" use **ISO weeks (Mon-Sun)** — that's the
 * convention for UAE business days and is also what every UAE/HR product
 * the team uses (Bayzat, ZenHR) reports against. If a tenant ever needs
 * Sun-Sat we can flip this with a per-tenant locale flag.
 *
 * "Custom" reveals two `DatePicker` inputs in the same popover; commit
 * only fires when both dates are valid AND `start <= end`.
 *
 * Returns ISO `YYYY-MM-DD` strings (no time component) — the backend
 * routes validate this exact shape before reaching the SQL `BETWEEN`.
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

function toIso(d: Date): string {
    // Use the local-time Y/M/D so "today" matches the user's wall clock,
    // not UTC. Reports filter on a `date` column (no time component) so
    // a timezone-shifted `toISOString().slice(0, 10)` would skew the
    // window by a day for any tenant west of UTC after midnight UTC.
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

function startOfIsoWeek(d: Date): Date {
    // ISO weeks start Monday. JS getDay() returns 0=Sun, 1=Mon, ..., 6=Sat
    // — shift Sunday to 7 so subtracting (day - 1) lands on Monday.
    const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const day = copy.getDay() || 7
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
            const lastWeekEnd = new Date(thisWeekStart)
            lastWeekEnd.setDate(lastWeekEnd.getDate() - 1)
            const lastWeekStart = new Date(lastWeekEnd)
            lastWeekStart.setDate(lastWeekStart.getDate() - 6)
            return { startDate: toIso(lastWeekStart), endDate: toIso(lastWeekEnd) }
        }
        case 'this_month': {
            const start = new Date(today.getFullYear(), today.getMonth(), 1)
            return { startDate: toIso(start), endDate: toIso(today) }
        }
        case 'last_30_days': {
            const start = new Date(today)
            start.setDate(start.getDate() - 29)
            return { startDate: toIso(start), endDate: toIso(today) }
        }
        case 'last_90_days': {
            const start = new Date(today)
            start.setDate(start.getDate() - 89)
            return { startDate: toIso(start), endDate: toIso(today) }
        }
        case 'this_year': {
            const start = new Date(today.getFullYear(), 0, 1)
            return { startDate: toIso(start), endDate: toIso(today) }
        }
        case 'custom':
            // Custom resolves to whatever the user typed — handled by the
            // controlled inputs, not by this helper. Default to today
            // so the popover opens against a real range.
            return { startDate: toIso(today), endDate: toIso(today) }
    }
}

interface PresetSpec {
    id: ReportRangePreset
    label: string
}

const QUICK_PRESETS: PresetSpec[] = [
    { id: 'today', label: 'Today' },
    { id: 'this_week', label: 'This week' },
    { id: 'last_week', label: 'Last week' },
    { id: 'this_month', label: 'This month' },
]

const EXTENDED_PRESETS: PresetSpec[] = [
    { id: 'last_30_days', label: 'Last 30 days' },
    { id: 'last_90_days', label: 'Last 90 days' },
    { id: 'this_year', label: 'This year' },
]

interface Props {
    value: ReportDateRangeValue
    onChange: (next: ReportDateRangeValue) => void
    className?: string
    /** Hides the inline preset chips — useful when horizontal space is
     *  tight and HR should select via the dropdown instead. */
    compact?: boolean
}

export function DateRangePresets({ value, onChange, className, compact = false }: Props) {
    const [open, setOpen] = useState(false)
    const [customStart, setCustomStart] = useState<string>(value.startDate)
    const [customEnd, setCustomEnd] = useState<string>(value.endDate)

    // Label shown on the trigger when closed.
    const triggerLabel = useMemo(() => {
        if (value.preset === 'custom') return `${value.startDate} - ${value.endDate}`
        const preset = [...QUICK_PRESETS, ...EXTENDED_PRESETS].find((p) => p.id === value.preset)
        return preset?.label ?? `${value.startDate} - ${value.endDate}`
    }, [value])

    function applyPreset(id: ReportRangePreset) {
        const { startDate, endDate } = resolvePreset(id)
        onChange({ preset: id, startDate, endDate })
        setOpen(false)
    }

    function applyCustom() {
        if (!customStart || !customEnd) return
        if (customStart > customEnd) return
        onChange({ preset: 'custom', startDate: customStart, endDate: customEnd })
        setOpen(false)
    }

    return (
        <div className={cn('inline-flex items-center gap-2', className)}>
            {/* Inline quick-preset chips. On narrow viewports these wrap
                under the trigger; HR can also pick from the dropdown. */}
            {!compact && (
                <div className="hidden md:inline-flex items-center gap-1 rounded-lg border bg-card p-1">
                    {QUICK_PRESETS.map((p) => {
                        const active = value.preset === p.id
                        return (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => applyPreset(p.id)}
                                className={cn(
                                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                    active
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                )}
                                title={p.label}
                            >
                                {p.label}
                            </button>
                        )
                    })}
                </div>
            )}

            {/* Dropdown trigger — always available. Shows the current
                window label so the inline chips aren't load-bearing. */}
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2 text-xs font-medium"
                    >
                        <CalendarIcon className="size-3.5 text-muted-foreground" />
                        <span className="tabular-nums">{triggerLabel}</span>
                        <ChevronDown className="size-3.5 text-muted-foreground" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-0 overflow-hidden">
                    {/* Preset list. Grouped: quick presets on top, extended
                        windows below. Active preset gets a check mark. */}
                    <div className="py-1">
                        <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                            Quick
                        </p>
                        {QUICK_PRESETS.map((p) => (
                            <PresetRow key={p.id} preset={p} active={value.preset === p.id} onSelect={() => applyPreset(p.id)} />
                        ))}
                        <p className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                            Extended
                        </p>
                        {EXTENDED_PRESETS.map((p) => (
                            <PresetRow key={p.id} preset={p} active={value.preset === p.id} onSelect={() => applyPreset(p.id)} />
                        ))}
                    </div>

                    {/* Custom range. Two date pickers + a small Apply button.
                        Validate `start <= end` locally so the parent only
                        ever receives a sane pair. */}
                    <div className="border-t bg-muted/30 px-3 py-3 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                            Custom range
                        </p>
                        <div className="flex items-center gap-1.5">
                            <DatePicker
                                value={customStart}
                                onChange={setCustomStart}
                                placeholder="Start"
                                max={customEnd || undefined}
                                className="h-8 text-xs"
                            />
                            <span className="text-muted-foreground text-xs">to</span>
                            <DatePicker
                                value={customEnd}
                                onChange={setCustomEnd}
                                placeholder="End"
                                min={customStart || undefined}
                                className="h-8 text-xs"
                            />
                        </div>
                        <Button
                            size="sm"
                            className="w-full h-8 text-xs"
                            disabled={!customStart || !customEnd || customStart > customEnd}
                            onClick={applyCustom}
                        >
                            Apply custom range
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>
        </div>
    )
}

function PresetRow({ preset, active, onSelect }: { preset: PresetSpec; active: boolean; onSelect: () => void }) {
    return (
        <button
            type="button"
            onClick={onSelect}
            className={cn(
                'flex w-full items-center justify-between gap-2 px-3 py-1.5 text-xs text-left transition-colors',
                active ? 'bg-muted/60 text-foreground font-medium' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
        >
            <span>{preset.label}</span>
            {active && <Check className="size-3.5 text-primary" />}
        </button>
    )
}

/** Convenience factory for the default value. Reports page seeds with
 *  "This month" because that's HR's most common starting window. */
export function defaultReportRange(): ReportDateRangeValue {
    const { startDate, endDate } = resolvePreset('this_month')
    return { preset: 'this_month', startDate, endDate }
}
