// ─── Shared attendance-calendar helpers ─────────────────────────────────
//
// Mirrors `frontend-portal/src/lib/attendance/calendar.ts`. Lifted out of
// `MyAttendancePage.tsx` so both apps drive their timeline / list /
// calendar views from a single classifier + label/colour table.
//
// All exports are pure (no React imports, no side effects) and safe for
// use inside `useMemo`, render bodies, or unit tests.

import type { CalendarCell } from '@/hooks/useAttendance'

export type DayClassification =
    | 'weekend'
    | 'holiday'
    | 'present'
    | 'late'
    | 'short'
    | 'absent'
    | 'wfh'
    | 'on_leave'
    | 'future'

export interface DayInfo {
    date: Date
    iso: string
    cell: CalendarCell | null
    label: { weekday: string; day: string }
    classification: DayClassification
}

export function classify(cell: CalendarCell | null, date: Date, today: Date): DayClassification {
    if (date > today) return 'future'
    if (!cell) return 'absent'
    if (cell.code === 'WO') return 'weekend'
    if (cell.code === 'H') return 'holiday'
    if (cell.code === 'A' || cell.code === 'N/A') return 'absent'
    if (cell.code === 'WFH') return 'wfh'
    if (cell.code === 'P-late') return 'late'
    if (cell.code === 'P-short') return 'short'
    if (cell.code.endsWith('L')) return 'on_leave'
    return 'present'
}

export function statusLabel(c: DayClassification): string {
    switch (c) {
        case 'weekend': return 'Weekend'
        case 'holiday': return 'Holiday'
        case 'present': return 'Present'
        case 'late': return 'Late'
        case 'short': return 'Early out'
        case 'absent': return 'Absent'
        case 'wfh': return 'WFH'
        case 'on_leave': return 'On leave'
        case 'future': return ''
    }
}

export function statusTone(c: DayClassification): { bar: string; pill: string } {
    switch (c) {
        case 'weekend': return { bar: 'bg-amber-200/60 dark:bg-amber-900/30', pill: 'border-amber-300 text-amber-800 dark:text-amber-300 bg-amber-50/70 dark:bg-amber-950/30' }
        case 'holiday': return { bar: 'bg-sky-200/60 dark:bg-sky-900/30', pill: 'border-sky-300 text-sky-800 dark:text-sky-300 bg-sky-50/70 dark:bg-sky-950/30' }
        case 'present':
        case 'late':
        case 'short':
            return { bar: 'bg-emerald-200/60 dark:bg-emerald-900/30', pill: 'border-emerald-300 text-emerald-800 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30' }
        case 'absent': return { bar: 'bg-rose-200/60 dark:bg-rose-900/30', pill: 'border-rose-300 text-rose-700 dark:text-rose-300 bg-rose-50/70 dark:bg-rose-950/30' }
        case 'wfh': return { bar: 'bg-violet-200/60 dark:bg-violet-900/30', pill: 'border-violet-300 text-violet-800 dark:text-violet-300 bg-violet-50/70 dark:bg-violet-950/30' }
        case 'on_leave': return { bar: 'bg-blue-200/60 dark:bg-blue-900/30', pill: 'border-blue-300 text-blue-800 dark:text-blue-300 bg-blue-50/70 dark:bg-blue-950/30' }
        case 'future': return { bar: 'bg-muted/40', pill: 'border-border text-muted-foreground' }
    }
}

export interface AttendanceWeekStats {
    payable: number
    present: number
    onDuty: number
    paidLeave: number
    holidays: number
    weekend: number
}

export function computeStats(days: DayInfo[]): AttendanceWeekStats {
    const s: AttendanceWeekStats = { payable: 0, present: 0, onDuty: 0, paidLeave: 0, holidays: 0, weekend: 0 }
    for (const d of days) {
        if (d.classification === 'future') continue
        if (d.classification === 'present' || d.classification === 'late' || d.classification === 'short') {
            s.present++; s.payable++; s.onDuty++
        }
        if (d.classification === 'wfh') { s.present++; s.payable++; s.onDuty++ }
        if (d.classification === 'on_leave') { s.paidLeave++; s.payable++ }
        if (d.classification === 'holiday') { s.holidays++; s.payable++ }
        if (d.classification === 'weekend') s.weekend++
    }
    return s
}
