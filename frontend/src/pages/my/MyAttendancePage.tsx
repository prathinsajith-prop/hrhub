/**
 * Employee-facing attendance summary at /my/attendance.
 *
 * Three view modes share the same underlying calendar response from
 * `GET /attendance/calendar?month=YYYY-MM` (scoped to the caller's own
 * employee row by the backend). The page picks a 7-day window inside the
 * month and renders:
 *
 *   - Timeline:  per-day horizontal bar with status pill + check-in/out times
 *   - List:      same data as a table
 *   - Calendar:  the shared <AttendanceMonthCalendar/> month grid
 *
 * Clicking a timeline / list row opens a side Sheet showing the day's
 * check-in/out + an Apply Leave shortcut when the day is marked absent.
 * The Audit History link inside the sheet opens a modal that filters the
 * activity_logs feed for the calling user on that date — uses the existing
 * /audit/activity endpoint (HR-only there, so for non-admins we fall back
 * to the attendance row itself as a single timeline entry).
 */
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calendar, ChevronLeft, ChevronRight, LayoutGrid, List as ListIcon,
  CalendarDays, Filter, MoreHorizontal, X, FileClock, MonitorSmartphone,
  LogIn, LogOut,
} from 'lucide-react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody,
} from '@/components/ui/overlays'
import { Input } from '@/components/ui/input'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import {
  useAttendanceCalendar,
  useCheckIn, useCheckOut,
  type CalendarCell, type CalendarEmployee,
} from '@/hooks/useAttendance'
import { useShifts } from '@/hooks/useShifts'

// ─── Helpers ────────────────────────────────────────────────────────────────

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDayLabel(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS_SHORT[d.getMonth()]}-${d.getFullYear()}`
}

function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() - out.getDay()) // Sunday-start
  return out
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + n)
  return out
}

function isoMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

interface DayInfo {
  date: Date
  iso: string
  cell: CalendarCell | null
  // Pre-computed display fields so each render is cheap.
  label: { weekday: string; day: string }
  classification: DayClassification
}

type DayClassification =
  | 'weekend'
  | 'holiday'
  | 'present'
  | 'late'
  | 'short'
  | 'absent'
  | 'wfh'
  | 'on_leave'
  | 'future'

function classify(cell: CalendarCell | null, date: Date, today: Date): DayClassification {
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

function statusLabel(c: DayClassification): string {
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

function statusTone(c: DayClassification): { bar: string; pill: string } {
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

function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

// ─── Page ───────────────────────────────────────────────────────────────────

type ViewMode = 'timeline' | 'list' | 'calendar'

export function MyAttendancePage() {
  const user = useAuthStore((s) => s.user)
  const employeeId = user?.employeeId ?? undefined

  const today = useMemo(() => new Date(), [])
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(today))
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const [view, setView] = useState<ViewMode>('timeline')
  const [detailDate, setDetailDate] = useState<DayInfo | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [note, setNote] = useState('')

  // Calendar response is per-month. When the week spans two months we fall
  // back to the month containing weekStart — for the screenshots' use case
  // (current week), this is always the right month.
  const monthQuery = isoMonth(weekStart)
  const { data: calendar, isLoading } = useAttendanceCalendar(monthQuery, { employeeId })
  const myRow = (calendar?.employees?.[0] ?? null) as CalendarEmployee | null
  const { data: shifts = [] } = useShifts({ includeInactive: true })
  const myShift = useMemo(() => shifts[0] ?? null, [shifts])

  // Build the 7-day window from the calendar cells.
  const days: DayInfo[] = useMemo(() => {
    const out: DayInfo[] = []
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i)
      const iso = toISODate(d)
      // The calendar response has one row per day of the month, in order.
      // Indexing by day-of-month - 1 works only when the week is in the same
      // month as `monthQuery`; for cross-month weeks the missing days are null.
      const cell = (myRow && d.getMonth() === weekStart.getMonth() && d.getFullYear() === weekStart.getFullYear())
        ? myRow.cells[d.getDate() - 1] ?? null
        : null
      out.push({
        date: d,
        iso,
        cell,
        label: { weekday: WEEKDAYS[d.getDay()], day: String(d.getDate()) },
        classification: classify(cell, d, todayDate),
      })
    }
    return out
  }, [weekStart, myRow, today])

  const stats = useMemo(() => computeStats(days), [days])

  // ── Check-in widget ────────────────────────────────────────────────────
  const todayInfo = useMemo(() => {
    const t = toISODate(today)
    return days.find((d) => d.iso === t) ?? null
  }, [days, today])
  const checkIn = useCheckIn()
  const checkOut = useCheckOut()
  const isCheckedIn = !!todayInfo?.cell?.checkIn && !todayInfo?.cell?.checkOut

  const handleCheckIn = () => {
    if (!employeeId) return
    checkIn.mutate(employeeId)
  }
  const handleCheckOut = () => {
    if (!employeeId) return
    checkOut.mutate(employeeId)
  }

  const liveTimer = useLiveDuration(todayInfo?.cell?.checkIn, todayInfo?.cell?.checkOut)

  return (
    <PageWrapper>
      <PageHeader title="My Attendance" />

      {/* Tab + week navigator */}
      <div className="mt-2 flex flex-wrap items-center gap-3 border-b">
        <button
          type="button"
          className="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary"
        >
          Attendance Summary
        </button>
        <Link
          to={ROUTES.myProfile}
          className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Shift
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        {/* Week navigator */}
        <div className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1 shadow-sm">
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
            aria-label="Previous week"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" aria-label="Pick week" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            <Calendar className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
            aria-label="Next week"
          >
            <ChevronRight className="size-4" />
          </Button>
          <span className="px-2 text-sm font-medium tabular-nums">
            {formatDayLabel(weekStart)} – {formatDayLabel(weekEnd)}
          </span>
        </div>

        {/* View switcher */}
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1 shadow-sm">
          <Button
            size="icon"
            variant={view === 'timeline' ? 'secondary' : 'ghost'}
            className="size-7"
            onClick={() => setView('timeline')}
            aria-label="Timeline view"
            title="Timeline view"
          >
            <LayoutGrid className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant={view === 'list' ? 'secondary' : 'ghost'}
            className="size-7"
            onClick={() => setView('list')}
            aria-label="List view"
            title="List view"
          >
            <ListIcon className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant={view === 'calendar' ? 'secondary' : 'ghost'}
            className="size-7"
            onClick={() => setView('calendar')}
            aria-label="Calendar view"
            title="Calendar view"
          >
            <CalendarDays className="size-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" className="size-8" aria-label="Filter">
            <Filter className="size-3.5" />
          </Button>
          <Button size="icon" variant="outline" className="size-8" aria-label="More">
            <MoreHorizontal className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Today check-in / check-out + shift band */}
      <div className="mt-4 flex flex-wrap items-stretch justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold">
            {myShift?.name ?? 'General'}{' '}
            <span className="text-muted-foreground font-normal">
              [ {myShift?.startTime ?? '09:00'} – {myShift?.endTime ?? '18:00'} ]
            </span>
          </p>
        </div>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={isCheckedIn ? 'Add notes for check-out' : 'Add notes for check-in'}
          className="flex-[2] min-w-[180px] h-9"
        />
        {isCheckedIn ? (
          <Button
            onClick={handleCheckOut}
            loading={checkOut.isPending}
            className="bg-rose-600 hover:bg-rose-700 text-white"
          >
            <LogOut className="size-4 me-1" />
            <div className="flex flex-col items-start">
              <span className="text-xs leading-none">Check-out</span>
              <span className="text-xs leading-none tabular-nums">{liveTimer}</span>
            </div>
          </Button>
        ) : (
          <Button
            onClick={handleCheckIn}
            loading={checkIn.isPending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <LogIn className="size-4 me-1" />
            <div className="flex flex-col items-start">
              <span className="text-xs leading-none">Check-in</span>
              <span className="text-xs leading-none tabular-nums">{liveTimer}</span>
            </div>
          </Button>
        )}
      </div>

      {/* Body */}
      <div className="mt-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : view === 'timeline' ? (
          <TimelineView days={days} shiftStart={myShift?.startTime ?? '09:00'} shiftEnd={myShift?.endTime ?? '18:00'} onPick={setDetailDate} today={today} />
        ) : view === 'list' ? (
          <ListView days={days} />
        ) : (
          <CalendarView month={monthQuery} myRow={myRow} />
        )}
      </div>

      {/* Footer stats */}
      <FooterStats stats={stats} shift={myShift ? `${myShift.name} [ ${myShift.startTime} – ${myShift.endTime} ]` : 'General [ 09:00 – 18:00 ]'} />

      {/* Day detail panel */}
      <DayDetailSheet
        info={detailDate}
        shift={myShift ? `${myShift.name} [${myShift.startTime} – ${myShift.endTime}]` : 'General'}
        onClose={() => setDetailDate(null)}
        onOpenAudit={() => setAuditOpen(true)}
      />

      <AuditHistoryDialog
        open={auditOpen && !!detailDate}
        onOpenChange={(o) => !o && setAuditOpen(false)}
        info={detailDate}
      />
    </PageWrapper>
  )
}

// ─── Timeline view ──────────────────────────────────────────────────────────

function TimelineView({
  days, shiftStart, shiftEnd, onPick, today,
}: {
  days: DayInfo[]
  shiftStart: string
  shiftEnd: string
  onPick: (d: DayInfo) => void
  today: Date
}) {
  // Timeline x-axis spans 1h before shiftStart to 1h after shiftEnd, in HH-aligned slots.
  const startMin = Math.max(0, hhmmToMinutes(shiftStart) - 60)
  const endMin = Math.min(24 * 60, hhmmToMinutes(shiftEnd) + 60)
  const span = Math.max(60, endMin - startMin)

  const slots: string[] = []
  for (let m = startMin - (startMin % 60); m <= endMin; m += 60) {
    if (m < 0 || m > 24 * 60) continue
    const h = Math.floor(m / 60)
    slots.push(`${String(h).padStart(2, '0')}:00`)
  }

  const isToday = (d: Date) =>
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate()

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      {days.map((d) => {
        const tone = statusTone(d.classification)
        const checkInPct = d.cell?.checkIn
          ? ((new Date(d.cell.checkIn).getHours() * 60 + new Date(d.cell.checkIn).getMinutes()) - startMin) / span * 100
          : null
        const checkOutPct = d.cell?.checkOut
          ? ((new Date(d.cell.checkOut).getHours() * 60 + new Date(d.cell.checkOut).getMinutes()) - startMin) / span * 100
          : null
        return (
          <button
            key={d.iso}
            type="button"
            onClick={() => onPick(d)}
            className={cn(
              'group grid grid-cols-[3.5rem_8rem_1fr_8rem_5rem] sm:grid-cols-[4rem_9rem_1fr_9rem_5.5rem] items-center gap-2 sm:gap-3 px-3 py-3 border-b last:border-b-0 hover:bg-muted/30 transition-colors text-left w-full',
              isToday(d.date) && 'bg-primary/5',
            )}
          >
            {/* Day label */}
            <div>
              <p className="text-xs text-muted-foreground">{d.label.weekday}</p>
              <p className={cn('text-base font-semibold tabular-nums', isToday(d.date) && 'text-primary')}>{d.label.day}</p>
            </div>
            {/* Check-in */}
            <div className="text-left">
              {d.cell?.checkIn ? (
                <>
                  <p className="text-sm font-medium tabular-nums">{formatTime(d.cell.checkIn)}</p>
                  {/* (lateness hint — could be derived if we had shift start; skipping for brevity) */}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
            {/* Bar */}
            <div className="relative h-5">
              {/* slot ticks for orientation */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border" />
              {/* status pill (centered) */}
              {d.classification !== 'future' && (
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
                  <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-medium', tone.pill)}>
                    {statusLabel(d.classification)}
                  </span>
                </div>
              )}
              {/* check-in dot */}
              {checkInPct != null && checkInPct >= 0 && checkInPct <= 100 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background"
                  style={{ left: `${checkInPct}%` }}
                />
              )}
              {checkOutPct != null && checkOutPct >= 0 && checkOutPct <= 100 && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-rose-500 ring-2 ring-background"
                  style={{ left: `${checkOutPct}%` }}
                />
              )}
            </div>
            {/* Check-out */}
            <div className="text-right">
              {d.cell?.checkOut ? (
                <p className="text-sm font-medium tabular-nums">{formatTime(d.cell.checkOut)}</p>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
            {/* Hours */}
            <div className="text-right">
              <p className="text-sm font-semibold tabular-nums">{d.cell?.hoursWorked ?? '00:00'}</p>
              <p className="text-[10px] text-muted-foreground">Hrs worked</p>
            </div>
          </button>
        )
      })}
      {/* Slot axis */}
      <div className="grid grid-cols-[3.5rem_8rem_1fr_8rem_5rem] sm:grid-cols-[4rem_9rem_1fr_9rem_5.5rem] items-center gap-2 sm:gap-3 px-3 py-2 border-t bg-muted/40">
        <span />
        <span />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          {slots.map((s) => <span key={s} className="tabular-nums">{s}</span>)}
        </div>
        <span />
        <span />
      </div>
    </div>
  )
}

// ─── List view ──────────────────────────────────────────────────────────────

function ListView({ days }: { days: DayInfo[] }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Date</th>
            <th className="px-4 py-2.5 font-medium">First In</th>
            <th className="px-4 py-2.5 font-medium">Last Out</th>
            <th className="px-4 py-2.5 font-medium">Total Hours</th>
            <th className="px-4 py-2.5 font-medium">Payable Hours</th>
            <th className="px-4 py-2.5 font-medium">Overtime / Deviation</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Shift(s)</th>
            <th className="px-4 py-2.5 font-medium">Regularization</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {days.map((d) => {
            const tone = statusTone(d.classification)
            const hours = d.cell?.hoursWorked ?? '—'
            return (
              <tr key={d.iso} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {d.label.weekday}, {formatDayLabel(d.date)}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{d.cell?.checkIn ? formatTime(d.cell.checkIn) : '—'}</td>
                <td className="px-4 py-2.5 tabular-nums">{d.cell?.checkOut ? formatTime(d.cell.checkOut) : '—'}</td>
                <td className="px-4 py-2.5 tabular-nums">{hours}</td>
                <td className="px-4 py-2.5 tabular-nums">{hours}</td>
                <td className={cn('px-4 py-2.5 tabular-nums', d.classification === 'absent' && 'text-rose-600 dark:text-rose-400')}>
                  {d.classification === 'absent' ? '08:00' : d.classification === 'present' ? '00:00' : '—'}
                </td>
                <td className="px-4 py-2.5">
                  {d.classification !== 'future' && (
                    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium', tone.pill)}>
                      <span className={cn('size-2 rounded-sm', tone.bar)} aria-hidden />
                      {statusLabel(d.classification)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5">General</td>
                <td className="px-4 py-2.5 text-muted-foreground">—</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Calendar view ──────────────────────────────────────────────────────────

function CalendarView({ month, myRow }: { month: string; myRow: CalendarEmployee | null }) {
  // Lightweight 7×N grid — reuses the calendar response we already loaded.
  // (Full-featured `AttendanceMonthCalendar` lives in components but expects
  // a multi-employee matrix; we just render the single row inline here.)
  const [year, mon] = month.split('-').map(Number) as [number, number]
  const firstDay = new Date(year, mon - 1, 1)
  const daysInMonth = new Date(year, mon, 0).getDate()
  const cells: Array<{ day: number; cell: CalendarCell | null } | null> = []
  for (let i = 0; i < firstDay.getDay(); i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, cell: myRow?.cells[d - 1] ?? null })
  }
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-7 gap-1 mb-2">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-center text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} />
          const klass = classify(c.cell, new Date(year, mon - 1, c.day), new Date())
          const tone = statusTone(klass)
          return (
            <div
              key={i}
              className={cn(
                'aspect-square rounded-md border flex flex-col items-center justify-center gap-0.5 p-1 text-xs',
                tone.bar,
              )}
            >
              <span className="font-medium tabular-nums">{c.day}</span>
              {c.cell?.hoursWorked && <span className="text-[9px] text-muted-foreground tabular-nums">{c.cell.hoursWorked}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Stats footer ───────────────────────────────────────────────────────────

interface Stats {
  payable: number
  present: number
  onDuty: number
  paidLeave: number
  holidays: number
  weekend: number
  hoursWorked: number
}

function computeStats(days: DayInfo[]): Stats {
  const s: Stats = { payable: 0, present: 0, onDuty: 0, paidLeave: 0, holidays: 0, weekend: 0, hoursWorked: 0 }
  for (const d of days) {
    if (d.classification === 'future') continue
    if (d.classification === 'present' || d.classification === 'late' || d.classification === 'short') { s.present++; s.payable++; s.onDuty++ }
    if (d.classification === 'wfh') { s.present++; s.payable++; s.onDuty++ }
    if (d.classification === 'on_leave') { s.paidLeave++; s.payable++ }
    if (d.classification === 'holiday') { s.holidays++; s.payable++ }
    if (d.classification === 'weekend') s.weekend++
    const hw = d.cell?.hoursWorked
    if (hw && /^\d{2}:\d{2}/.test(hw)) {
      const [h, m] = hw.split(':').map(Number)
      s.hoursWorked += (h ?? 0) * 60 + (m ?? 0)
    }
  }
  return s
}

function FooterStats({ stats, shift }: { stats: Stats; shift: string }) {
  const entries: Array<{ label: string; value: string; sub: string; tone: string }> = [
    { label: 'Payable Days', value: String(stats.payable), sub: 'Day', tone: 'bg-emerald-500' },
    { label: 'Present', value: String(stats.present), sub: 'Day', tone: 'bg-green-500' },
    { label: 'On Duty', value: String(stats.onDuty), sub: 'Day', tone: 'bg-violet-500' },
    { label: 'Paid leave', value: String(stats.paidLeave), sub: 'Day', tone: 'bg-amber-500' },
    { label: 'Holidays', value: String(stats.holidays), sub: 'Day', tone: 'bg-sky-500' },
    { label: 'Weekend', value: String(stats.weekend), sub: 'Day', tone: 'bg-blue-400' },
  ]
  return (
    <div className="mt-4 rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-stretch gap-4 px-4 py-3">
        <div className="flex flex-col text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          <span className="border-l-2 border-blue-500 ps-2 text-foreground">Days</span>
          <span className="border-l-2 border-transparent ps-2 mt-1">Hours</span>
        </div>
        {entries.map((e) => (
          <div key={e.label} className="flex items-center gap-2 border-l border-border/60 ps-3">
            <span className={cn('w-1 h-8 rounded-full', e.tone)} />
            <div>
              <p className="text-xs font-medium text-muted-foreground">{e.label}</p>
              <p className="text-sm font-semibold tabular-nums">
                {e.value}{' '}<span className="text-xs text-muted-foreground font-normal">{e.sub}</span>
              </p>
            </div>
          </div>
        ))}
        <div className="ms-auto self-center text-xs text-muted-foreground">{shift}</div>
      </div>
    </div>
  )
}

// ─── Day detail side panel ──────────────────────────────────────────────────

function DayDetailSheet({
  info, shift, onClose, onOpenAudit,
}: {
  info: DayInfo | null
  shift: string
  onClose: () => void
  onOpenAudit: () => void
}) {
  if (!info) return null
  const cell = info.cell
  const klass = info.classification
  const headerDate = `${info.label.weekday}, ${formatDayLabel(info.date)}`

  return (
    <Sheet open={!!info} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-5 py-4 border-b">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-base">{headerDate}</SheetTitle>
            <button
              type="button"
              onClick={onOpenAudit}
              className="text-xs font-medium text-primary hover:underline"
            >
              Audit History
            </button>
          </div>
          <SheetDescription className="text-xs">
            {shift}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Check-in / check-out card */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-emerald-600">{cell?.checkIn ? formatTime(cell.checkIn) : '—'}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <MonitorSmartphone className="size-3" />
                  {cell?.checkIn ? 'Check-in' : 'Not checked in'}
                </p>
              </div>
              <div className="flex-1 border-t-2 border-dashed border-border h-0 mx-2 self-center" />
              <div className="text-right">
                <p className="text-sm font-medium text-rose-600">{cell?.checkOut ? formatTime(cell.checkOut) : '—'}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 justify-end">
                  <MonitorSmartphone className="size-3" />
                  {cell?.checkOut ? 'Check-out' : 'Not checked out'}
                </p>
              </div>
            </div>
          </div>

          {/* Add entry button */}
          <Button variant="link" className="text-primary p-0 h-auto text-sm font-medium" disabled>
            Add Check-in / Check-out Entry
          </Button>

          {/* Status hero */}
          <div className="flex flex-col items-center justify-center py-8 text-center">
            {klass === 'absent' && (
              <>
                <p className="text-sm text-muted-foreground mb-3">You were marked absent for the day</p>
                <Button asChild variant="outline" size="sm">
                  <Link to={ROUTES.myLeave}>Apply Leave</Link>
                </Button>
              </>
            )}
            {klass === 'weekend' && <p className="text-sm text-muted-foreground">Weekend</p>}
            {klass === 'holiday' && <p className="text-sm text-muted-foreground">Public holiday</p>}
            {klass === 'on_leave' && <p className="text-sm text-muted-foreground">Approved leave</p>}
            {klass === 'future' && <p className="text-sm text-muted-foreground">Future date</p>}
            {(klass === 'present' || klass === 'late' || klass === 'short') && (
              <p className="text-sm font-medium text-emerald-600">{statusLabel(klass)}</p>
            )}
          </div>
        </div>

        {/* Footer summary */}
        <div className="border-t px-5 py-3 grid grid-cols-3 gap-2 bg-muted/30">
          <div className="border-l-2 border-emerald-500 ps-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">First Check-In</p>
            <p className="text-sm font-medium tabular-nums">{cell?.checkIn ? formatTime(cell.checkIn) : '—'}</p>
          </div>
          <div className="border-l-2 border-rose-500 ps-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Last Check-Out</p>
            <p className="text-sm font-medium tabular-nums">{cell?.checkOut ? formatTime(cell.checkOut) : '—'}</p>
          </div>
          <div className="border-l-2 border-blue-500 ps-2 text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Hours</p>
            <p className="text-sm font-medium tabular-nums">{cell?.hoursWorked ?? '00:00'}</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Audit history modal ────────────────────────────────────────────────────
//
// The full audit_logs feed is HR-only on the backend, so we synthesise an
// "audit-like" timeline from the attendance row itself: one event per
// check-in and one per check-out. When a backend `/attendance/audit?date=`
// endpoint exists for employees, swap this for that data.

function AuditHistoryDialog({
  open, onOpenChange, info,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  info: DayInfo | null
}) {
  const user = useAuthStore((s) => s.user)
  const fullName = user?.name ?? user?.email ?? 'You'
  const events: Array<{ time: string; action: 'check_in' | 'check_out' }> = []
  if (info?.cell?.checkIn) events.push({ time: info.cell.checkIn, action: 'check_in' })
  if (info?.cell?.checkOut) events.push({ time: info.cell.checkOut, action: 'check_out' })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="max-h-[80vh] flex flex-col">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center justify-between gap-2">
            <DialogTitle>Audit History</DialogTitle>
            <Button size="icon" variant="ghost" className="size-7" onClick={() => onOpenChange(false)}>
              <X className="size-3.5" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground pt-2">
            Audit history for date {info ? formatDayLabel(info.date) : ''}
          </p>
        </DialogHeader>
        <DialogBody className="overflow-y-auto">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <FileClock className="size-8 mb-2 opacity-40" />
              <p className="text-sm">No events recorded for this day.</p>
            </div>
          ) : (
            <ol className="relative border-l-2 border-border ms-4 pt-2 space-y-5">
              {events.map((e, i) => (
                <li key={i} className="ms-6 relative">
                  <span className="absolute -start-[2.05rem] top-0.5 size-7 rounded-full bg-background border-2 border-border flex items-center justify-center">
                    {e.action === 'check_in' ? <LogIn className="size-3 text-emerald-600" /> : <LogOut className="size-3 text-rose-600" />}
                  </span>
                  <p className="text-xs tabular-nums text-muted-foreground">{formatTime(e.time)}</p>
                  <p className="text-sm mt-0.5">
                    <span className="text-primary font-medium">{fullName}</span>{' '}
                    {e.action === 'check_in' ? 'checked in' : 'checked out'}{' '}
                    <MonitorSmartphone className="inline size-3 text-muted-foreground ms-1 align-middle" />
                  </p>
                </li>
              ))}
            </ol>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}


/** Ticks every second so the check-in / check-out button can show a live
 *  H:MM:SS timer. When `endIso` is set, the duration is frozen at end−start;
 *  when only `startIso` is set, it counts up from now. */
function useLiveDuration(startIso: string | null | undefined, endIso: string | null | undefined): string {
    const [now, setNow] = useState(() => Date.now())
    const running = !!startIso && !endIso
    useEffect(() => {
        if (!running) return
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [running])
    if (!startIso) return '0:00:00'
    const startMs = Date.parse(startIso)
    if (Number.isNaN(startMs)) return '0:00:00'
    const endMs = endIso ? Date.parse(endIso) : now
    const secs = Math.max(0, Math.floor((endMs - startMs) / 1000))
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
