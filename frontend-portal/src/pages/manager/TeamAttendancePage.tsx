import { useState } from 'react'
import { CalendarRange } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { AttendanceCalendarGrid } from '@/components/shared/AttendanceCalendarGrid'
import { MonthPicker } from '@/components/shared/MonthPicker'
import { useAttendanceCalendar } from '@/hooks/useAttendance'

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
]

function isoMonth(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function readableMonth(month: string): string {
    const [y, m] = month.split('-').map(Number)
    if (!y || !m) return month
    return `${MONTH_NAMES[m - 1]} ${y}`
}

export function ManagerTeamAttendancePage() {
    const [month, setMonth] = useState(() => isoMonth(new Date()))
    const { data, isLoading } = useAttendanceCalendar(month, 'team')

    return (
        <div className="space-y-5">
            <PageHeader
                title="Team attendance"
                subtitle={`Daily attendance grid for ${readableMonth(month)}`}
            />

            <MonthPicker value={month} onChange={setMonth} />

            <AttendanceCalendarGrid data={data} loading={isLoading} />

            {!isLoading && data && data.employees.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-card/50 px-4 py-3 text-xs text-muted-foreground">
                    <CalendarRange className="size-3.5" />
                    No team members visible. Make sure they're in your reporting line.
                </div>
            ) : null}
        </div>
    )
}
