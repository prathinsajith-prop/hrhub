import { useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

function isoMonth(year: number, monthOneBased: number): string {
    return `${year}-${String(monthOneBased).padStart(2, '0')}`
}

function parseMonth(value: string): { year: number; month: number } {
    const [y, m] = value.split('-').map(Number)
    return { year: y || new Date().getFullYear(), month: m || new Date().getMonth() + 1 }
}

interface Props {
    /** YYYY-MM */
    value: string
    onChange: (next: string) => void
    /** How many years back to expose in the year dropdown (default 3). */
    yearsBack?: number
    /** How many years forward to expose (default 0 — no future months). */
    yearsForward?: number
    /** Hide the "Today" pill when not useful. */
    showToday?: boolean
}

/**
 * Compact month/year picker for the attendance views. Renders as
 * [◀] [Month ▾] [Year ▾] [▶] · Today
 *
 * Why two separate selects instead of a single date input: the native
 * `<input type="month">` doesn't render consistently across iOS Safari /
 * Android / desktop, and we want a clear arrow-step UX alongside it.
 */
export function MonthPicker({
    value,
    onChange,
    yearsBack = 3,
    yearsForward = 0,
    showToday = true,
}: Props) {
    const { year, month } = parseMonth(value)
    // `now` is captured once per render — we read it as `nowYear`/`nowMonthIdx`
    // primitives below so useMemo deps stay stable.
    const nowDate = new Date()
    const nowYear = nowDate.getFullYear()
    const nowMonthIdx = nowDate.getMonth() // 0-indexed
    const todayMonth = isoMonth(nowYear, nowMonthIdx + 1)
    const atUpperBound = value >= isoMonth(nowYear + yearsForward, nowMonthIdx + 1)

    const years = useMemo(() => {
        const start = nowYear - yearsBack
        const end = nowYear + yearsForward
        const list: number[] = []
        for (let y = end; y >= start; y--) list.push(y)
        return list
    }, [yearsBack, yearsForward, nowYear])

    function step(delta: number) {
        let m = month + delta
        let y = year
        while (m < 1) { m += 12; y -= 1 }
        while (m > 12) { m -= 12; y += 1 }
        // Clamp to allowed range
        const minY = nowYear - yearsBack
        const maxY = nowYear + yearsForward
        if (y < minY) return
        if (y > maxY) return
        if (y === maxY && m > nowMonthIdx + 1) return
        onChange(isoMonth(y, m))
    }

    return (
        <div className="flex flex-wrap items-center gap-1.5">
            <Button
                size="icon"
                variant="outline"
                onClick={() => step(-1)}
                aria-label="Previous month"
                className="size-8"
            >
                <ChevronLeft className="size-4" />
            </Button>

            <Select
                value={String(month)}
                onValueChange={(v) => onChange(isoMonth(year, Number(v)))}
            >
                <SelectTrigger className="h-8 w-[120px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {MONTH_NAMES.map((name, idx) => (
                        <SelectItem key={name} value={String(idx + 1)}>
                            {name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Select
                value={String(year)}
                onValueChange={(v) => onChange(isoMonth(Number(v), month))}
            >
                <SelectTrigger className="h-8 w-[90px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {years.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                            {y}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Button
                size="icon"
                variant="outline"
                onClick={() => step(1)}
                aria-label="Next month"
                disabled={atUpperBound}
                className="size-8"
            >
                <ChevronRight className="size-4" />
            </Button>

            {showToday && value !== todayMonth ? (
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onChange(todayMonth)}
                    className="h-8 px-2 text-xs"
                >
                    Today
                </Button>
            ) : null}
        </div>
    )
}
