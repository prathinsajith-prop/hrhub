// ─── Shared attendance-legend module ────────────────────────────────────
//
// Single source of truth for:
//   • CodeMeta type    — shape of each status-code entry
//   • CODE_META        — every supported attendance status code + its
//                        label / short / colour pair
//   • LEGEND_ORDER     — alphabetical-by-label rendering order
//   • <AttendanceLegendPopover/> — the popover trigger + content shared by
//                        every surface that needs a status-code legend
//
// Previously this constant table + popover were copy-pasted into both
// `AttendanceCalendarGrid.tsx` and `AttendanceMonthCalendar.tsx`. Any code
// change (new code, palette tweak, label fix) had to be done in two
// places — easy to forget, easy to drift. Importing from here keeps the
// two grids visually identical and the bundle a few KB smaller because
// Vite can deduplicate the constants.

import { Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export interface CodeMeta {
    label: string
    short: string
    /** Tailwind background classes (used both for cell fills and the legend swatch). */
    bg: string
    /** Tailwind text-colour classes (paired with `bg` for contrast). */
    text: string
    /**
     * `badge` → render with the `bg` pill (the default). `plain` → render
     * transparently and let the cell take the underlying surface colour.
     * Kept as a discriminated string rather than a boolean so future visual
     * variants (e.g. `outline`) slot in without renames.
     */
    weight: 'badge' | 'plain'
}

// Palette mirrors the admin HR Manager attendance grid so the same status
// reads the same colour on the employee portal and the HR app. Each row of
// the legend is a distinct hue family so the eye can scan a month grid
// without consulting the legend constantly:
//   green = present, orange/amber = degraded-present (late/short),
//   red-solid = hard absence, sky/red/pink/indigo/stone/violet = leave
//   variants, cyan/teal/yellow = working-away, fuchsia-solid = holiday,
//   neutrals = calendar markers.
export const CODE_META: Record<string, CodeMeta> = {
    // Present (green family)
    P:         { label: 'Present',       short: 'P',  bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-800 dark:text-emerald-100', weight: 'badge' },
    'P-late':  { label: 'Late',          short: 'P',  bg: 'bg-orange-100 dark:bg-orange-950/40',   text: 'text-orange-800 dark:text-orange-200',   weight: 'badge' },
    'P-short': { label: 'Short Hours',   short: 'P',  bg: 'bg-amber-100 dark:bg-amber-950/40',     text: 'text-amber-800 dark:text-amber-200',     weight: 'badge' },

    // Hard absence (filled red) — strict no-show only. The "checked in
    // but never checked out" path now lives in 'INC' (Incomplete) below,
    // so a red A always means a true no-show.
    A:         { label: 'Absent',                                short: 'A',   bg: 'bg-rose-600',                            text: 'text-white',                              weight: 'badge' },

    // Active / partial states. IP keeps a still-checked-in employee
    // from showing as red Absent on today's row; INC distinguishes a
    // forgot-to-checkout from a true no-show on past days.
    IP:        { label: 'In Progress (checked in)',              short: 'IP',  bg: 'bg-emerald-200 dark:bg-emerald-900/60',  text: 'text-emerald-900 dark:text-emerald-50',   weight: 'badge' },
    INC:       { label: 'Incomplete (no check-out)',             short: 'INC', bg: 'bg-amber-200 dark:bg-amber-900/60',      text: 'text-amber-900 dark:text-amber-50',       weight: 'badge' },

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

// Strictly alphabetical by label so the popover reads like a glossary, not
// by historical insertion order. If you add/rename a code, keep this list
// in alphabetical order by the corresponding `CODE_META[code].label`.
//   Absent → Annual Leave → Bereavement Leave → Business Trip → Excuse →
//   Hajj Leave → Holiday → Late → Maternity Leave → New Employees → Offset →
//   Paternity Leave → Present → Short Hours → Sick Leave → Week Off →
//   Work from home
export const LEGEND_ORDER: string[] = ['A', 'AL', 'BL', 'BT', 'E', 'HJ', 'H', 'IP', 'INC', 'P-late', 'ML', 'N/A', 'OS', 'PL', 'P', 'P-short', 'SL', 'WO', 'WFH']

/**
 * Standalone legend popover. Drop next to any surface that renders status
 * codes so users can decode what a badge means. The trigger is a small
 * outline button so it can live in tight headers; the content is a fixed
 * 320px popover with a 2-column glossary.
 */
export function AttendanceLegendPopover({ width = 320 }: { width?: 320 | 340 }) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <Info className="size-3.5" />
                    Legend
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className={cn('p-4', width === 320 ? 'w-[320px]' : 'w-[340px]')}>
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
