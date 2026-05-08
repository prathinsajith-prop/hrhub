import { useState } from 'react'
import {
    CalendarClock, Save, CheckCircle2, LockKeyhole, UnlockKeyhole,
    CalendarDays, CalendarRange,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLeaveSettings, useUpdateLeaveSettings, type Weekday } from '@/hooks/useSettings'
import { Section } from './_shared'
import { cn } from '@/lib/utils'

const DAYS: { id: Weekday; full: string; short: string; abbr: string }[] = [
    { id: 'monday',    full: 'Monday',    short: 'Mon', abbr: 'M' },
    { id: 'tuesday',   full: 'Tuesday',   short: 'Tue', abbr: 'T' },
    { id: 'wednesday', full: 'Wednesday', short: 'Wed', abbr: 'W' },
    { id: 'thursday',  full: 'Thursday',  short: 'Thu', abbr: 'T' },
    { id: 'friday',    full: 'Friday',    short: 'Fri', abbr: 'F' },
    { id: 'saturday',  full: 'Saturday',  short: 'Sat', abbr: 'S' },
    { id: 'sunday',    full: 'Sunday',    short: 'Sun', abbr: 'S' },
]

export function LeaveSettingsTab() {
    const { data, isLoading } = useLeaveSettings()
    const updateMut = useUpdateLeaveSettings()
    const [rolloverEnabledFrom, setRolloverEnabledFrom] = useState<string>('')
    const [weekOffDays, setWeekOffDays] = useState<Weekday[]>(['saturday', 'sunday'])
    const [workingWeekStart, setWorkingWeekStart] = useState<Weekday>('monday')
    const [saved, setSaved] = useState(false)

    // Sync local state once when settings load. Ref-style guard via tracked previous payload.
    const [synced, setSynced] = useState(false)
    if (!synced && data) {
        setRolloverEnabledFrom(data.rolloverEnabledFrom ?? '')
        setWeekOffDays(data.weekOffDays?.length ? data.weekOffDays : ['saturday', 'sunday'])
        setWorkingWeekStart(data.workingWeekStart ?? 'monday')
        setSynced(true)
    }

    const isLocked = (() => {
        if (!data?.rolloverEnabledFrom) return false
        const unlock = new Date(data.rolloverEnabledFrom)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        return today < unlock
    })()

    const toggleWeekOff = (day: Weekday) => {
        setWeekOffDays(prev =>
            prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day],
        )
    }

    const handleSave = async () => {
        try {
            await updateMut.mutateAsync({
                rolloverEnabledFrom: rolloverEnabledFrom || null,
                weekOffDays,
                workingWeekStart,
            })
            setSaved(true)
            toast.success('Leave settings saved', 'Your team’s working week and rollover gate were updated.')
            setTimeout(() => setSaved(false), 2000)
        } catch {
            toast.error('Save failed', 'Could not update leave settings.')
        }
    }

    const handleClearGate = async () => {
        try {
            setRolloverEnabledFrom('')
            await updateMut.mutateAsync({ rolloverEnabledFrom: null })
            toast.success('Gate removed', 'Year-end rollover is now always available.')
        } catch {
            toast.error('Save failed', 'Could not update leave settings.')
        }
    }

    const workingDays = DAYS.filter(d => !weekOffDays.includes(d.id))

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-36 w-full" />
                <Skeleton className="h-36 w-full" />
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* ── Working Week ─────────────────────────────────────────── */}
            <Section
                icon={CalendarRange}
                title="Working Week"
                description="Define which days are weekly off and the day the working week begins. This drives leave-day counting and calendar views."
            >
                <div className="space-y-6">
                    {/* Week off days — visual chip selector */}
                    <div className="space-y-2">
                        <Label>Weekly off days</Label>
                        <p className="text-[11px] text-muted-foreground">
                            Tap the days your team doesn't work. These are skipped when calculating leave days.
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                            {DAYS.map(d => {
                                const selected = weekOffDays.includes(d.id)
                                return (
                                    <button
                                        key={d.id}
                                        type="button"
                                        onClick={() => toggleWeekOff(d.id)}
                                        className={cn(
                                            'h-10 min-w-[72px] rounded-lg border px-3 text-sm font-medium transition-all',
                                            'flex items-center justify-center gap-1.5',
                                            selected
                                                ? 'border-rose-200 bg-rose-50 text-rose-700 ring-1 ring-rose-200'
                                                : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted/50',
                                        )}
                                    >
                                        <span>{d.short}</span>
                                        {selected && <span className="h-1 w-1 rounded-full bg-rose-500" />}
                                    </button>
                                )
                            })}
                        </div>
                        {weekOffDays.length === 0 && (
                            <p className="text-[11px] text-amber-700">No weekly off selected — every day will count as a working day.</p>
                        )}
                    </div>

                    {/* Working week start — clean select */}
                    <div className="space-y-2 max-w-sm">
                        <Label htmlFor="weekStart">Working week starts on</Label>
                        <Select value={workingWeekStart} onValueChange={(v) => setWorkingWeekStart(v as Weekday)}>
                            <SelectTrigger id="weekStart">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DAYS.map(d => (
                                    <SelectItem key={d.id} value={d.id}>{d.full}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                            Used as the first day of week in calendars and timesheet views.
                        </p>
                    </div>

                    {/* Live preview */}
                    <div className="rounded-lg border bg-muted/30 p-3.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">Working schedule preview</p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {workingDays.length > 0 ? (
                                workingDays.map(d => (
                                    <Badge key={d.id} variant="secondary" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                        {d.short}
                                    </Badge>
                                ))
                            ) : (
                                <span className="text-xs text-muted-foreground">No working days configured.</span>
                            )}
                            <span className="mx-1.5 text-muted-foreground/50">·</span>
                            <span className="text-xs text-muted-foreground">
                                {workingDays.length} working {workingDays.length === 1 ? 'day' : 'days'} per week
                            </span>
                        </div>
                    </div>
                </div>
            </Section>

            {/* ── Year-End Rollover Gate ───────────────────────────────── */}
            <Section
                icon={CalendarClock}
                title="Year-End Rollover Gate"
                description="Block HR from running the annual leave rollover before a chosen date. Leave blank to allow it any time."
                action={
                    isLocked ? (
                        <Badge variant="destructive" className="gap-1.5">
                            <LockKeyhole className="h-3 w-3" />
                            Locked until {data?.rolloverEnabledFrom}
                        </Badge>
                    ) : (
                        <Badge variant="secondary" className="gap-1.5 text-emerald-700 bg-emerald-50 border-emerald-200">
                            <UnlockKeyhole className="h-3 w-3" />
                            {data?.rolloverEnabledFrom ? `Unlocked since ${data.rolloverEnabledFrom}` : 'No gate set'}
                        </Badge>
                    )
                }
            >
                <div className="space-y-2 max-w-sm">
                    <Label htmlFor="rolloverDate">Allow rollover from</Label>
                    <div className="flex items-center gap-2">
                        <DatePicker
                            id="rolloverDate"
                            value={rolloverEnabledFrom}
                            onChange={v => setRolloverEnabledFrom(v ?? '')}
                            className="flex-1"
                        />
                        {rolloverEnabledFrom && (
                            <Button variant="ghost" size="sm" onClick={handleClearGate} disabled={updateMut.isPending}>
                                Clear
                            </Button>
                        )}
                    </div>
                    <p className="text-[11px] text-muted-foreground inline-flex items-center gap-1.5">
                        <CalendarDays className="h-3 w-3" />
                        Tip: set to <span className="font-mono">2026-01-01</span> to prevent premature rollovers.
                    </p>
                </div>
            </Section>

            {/* ── Save bar ─────────────────────────────────────────────── */}
            <div className="flex justify-end pt-2 sticky bottom-0 bg-gradient-to-t from-background via-background to-transparent pb-2 -mb-2">
                <Button
                    onClick={handleSave}
                    loading={updateMut.isPending}
                    leftIcon={saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                    variant={saved ? 'success' : 'default'}
                >
                    {saved ? 'Saved' : 'Save changes'}
                </Button>
            </div>
        </div>
    )
}
