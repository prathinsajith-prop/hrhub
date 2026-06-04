import { useTranslation } from 'react-i18next'
import { CalendarDays, Clock } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatShiftRange } from '@/lib/utils'

// Day-name ordering used by the weekly-off chips. Mirrors the
// backend's WEEKDAY_NAMES table so casing of the saved strings doesn't matter.
const WEEK_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

// 2024-01-07 is a Sunday, so each index lands on the matching weekday. We format
// these reference dates through Intl so the short names follow the active locale
// (e.g. Arabic) rather than hard-coded English abbreviations.
function localizedWeekdayShort(locale: string): Record<(typeof WEEK_DAYS)[number], string> {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    const out = {} as Record<(typeof WEEK_DAYS)[number], string>
    WEEK_DAYS.forEach((day, i) => {
        out[day] = fmt.format(new Date(Date.UTC(2024, 0, 7 + i)))
    })
    return out
}

export interface ShiftInfo {
    name: string
    startTime: string
    endTime: string
    weeklyOffDays: string[]
}

/**
 * Dedicated schedule card — surfaces the shift name, work hours, and which
 * days of the week are off. When the employee has no shift assigned, falls
 * back to a short hint about tenant-default hours so the panel isn't blank.
 */
export function ScheduleCard({ shift }: { shift: ShiftInfo | null }) {
    const { t, i18n } = useTranslation()
    const range = shift ? formatShiftRange(shift.startTime, shift.endTime) : null
    const offSet = new Set((shift?.weeklyOffDays ?? []).map((d) => d.toLowerCase()))
    const weekdayShort = localizedWeekdayShort(i18n.language)

    return (
        <Card className="overflow-hidden border-border/70">
            <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Clock className="size-3.5" /> {t('profile.schedule', { defaultValue: 'Schedule' })}
                    </h3>
                    {shift ? (
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                            {shift.name}
                        </span>
                    ) : (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            {t('profile.defaultWorkingHours', { defaultValue: 'Default working hours' })}
                        </span>
                    )}
                </div>

                {shift ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm">
                            <Clock className="size-4 text-muted-foreground" />
                            <span className="font-display text-base font-semibold tabular-figures">
                                {range ?? '—'}
                            </span>
                        </div>

                        <div>
                            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                <CalendarDays className="size-3" /> {t('profile.weeklyOff', { defaultValue: 'Weekly off' })}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {WEEK_DAYS.map((d) => {
                                    const isOff = offSet.has(d)
                                    return (
                                        <span
                                            key={d}
                                            className={
                                                isOff
                                                    ? 'inline-flex h-7 min-w-[44px] items-center justify-center rounded-md bg-rose-100 px-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                                    : 'inline-flex h-7 min-w-[44px] items-center justify-center rounded-md border border-border bg-card/50 px-2 text-xs text-muted-foreground'
                                            }
                                        >
                                            {weekdayShort[d]}
                                        </span>
                                    )
                                })}
                            </div>
                            {offSet.size === 0 ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {t('profile.noWeeklyOff', { defaultValue: 'No weekly off days configured for this shift.' })}
                                </p>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {t('profile.defaultWeekHint', { defaultValue: "You're on the tenant's default working week. Ask HR if you need a custom shift." })}
                    </p>
                )}
            </CardContent>
        </Card>
    )
}
