import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  CalendarRange, Calendar, ChevronLeft, ChevronRight, LayoutGrid, List as ListIcon,
  CalendarDays, X, MonitorSmartphone, LogIn, LogOut,
  MapPin, Plus, Trash2,
} from 'lucide-react'

import {
  useAttendanceCalendar, useCheckIn, useCheckOut,
  usePunchesForDay, useAddManualPunch, useDeletePunch,
  type CalendarEmployee, type AttendancePunch, type PunchBody,
} from '@/hooks/useAttendance'
import { useAuthStore } from '@/store/authStore'
import { useAccountFlags } from '@/hooks/useMe'
import { PageHeader } from '@/components/shared/PageHeader'
import { AttendanceMonthCalendar } from '@/components/shared/AttendanceMonthCalendar'
import { MonthPicker } from '@/components/shared/MonthPicker'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { AlertModal } from '@/components/shared/AlertModal'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/routes'
import { formatTime, formatDayLabel, toISODate, toISOMonth } from '@/lib/datetime'
import {
  classify, statusLabel, statusTone, computeStats,
  type DayInfo, type DayClassification, type AttendanceWeekStats,
} from '@/lib/attendance/calendar'
import { useLiveDuration } from '@/hooks/useLiveDuration'

// ─── Local helpers ────────────────────────────────────────────────────
// Calendar window arithmetic — kept local because they're only used by
// this page and the parent week selector. The day-format / ISO helpers
// live in lib/datetime.ts and are imported above.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function startOfWeek(d: Date): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() - out.getDay())
  return out
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  out.setDate(out.getDate() + n)
  return out
}
/** Try to read the browser's current geolocation, but never block the
 *  punch — we resolve with `null` after 6s if the user hasn't granted
 *  permission so check-in still goes through on a kiosk / desktop. */
function readGeolocation(): Promise<{ latitude: number; longitude: number } | null> {
    return new Promise((resolve) => {
        if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null)
        let settled = false
        const timer = setTimeout(() => {
            if (settled) return
            settled = true
            resolve(null)
        }, 6_000)
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude })
            },
            () => {
                if (settled) return
                settled = true
                clearTimeout(timer)
                resolve(null)
            },
            { enableHighAccuracy: false, maximumAge: 60_000, timeout: 5_000 },
        )
    })
}

// ─── Page ────────────────────────────────────────────────────────────────

type ViewMode = 'timeline' | 'list' | 'calendar'

export function EmployeeAttendancePage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const employeeId = user?.employeeId ?? undefined

  const today = useMemo(() => new Date(), [])
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(today))
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart])
  const [view, setView] = useState<ViewMode>('timeline')
  const [detail, setDetail] = useState<DayInfo | null>(null)
  const [note, setNote] = useState('')

  const monthQuery = toISOMonth(weekStart)
  const { data: calendar, isLoading } = useAttendanceCalendar(monthQuery, 'me')
  const myRow = (calendar?.employees?.[0] ?? null) as CalendarEmployee | null

  const days: DayInfo[] = useMemo(() => {
    const out: DayInfo[] = []
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i)
      const iso = toISODate(d)
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

  const checkIn = useCheckIn()
  const checkOut = useCheckOut()
  // HR-controlled overrides — when off, the relevant UI is removed entirely
  // from this page. Defaults to "everything enabled" so first paint matches
  // the historical behavior even before the /auth/me call lands.
  const accountFlags = useAccountFlags()
  const punchAllowed = accountFlags.attendancePunchEnabled
  const manualEntryAllowed = accountFlags.attendanceManualEntryEnabled

  // Live geolocation preview for the check-in band. We resolve once on mount
  // (and on demand via a "Refresh" click) so the employee can SEE the
  // coordinates that will be recorded with their punch — both for trust
  // ("this is where my check-in will be tagged") and policy compliance.
  // Permission state: 'pending' (asking) | 'ok' (resolved) | 'denied' (user
  // blocked or device has no GPS).
  const [geo, setGeo] = useState<{ latitude: number; longitude: number } | null>(null)
  const [geoState, setGeoState] = useState<'pending' | 'ok' | 'denied'>('pending')
  // Returns the latest reading so callers can chain a punch on success
  // without waiting for a re-render. State is still updated for the UI.
  const refreshGeo = useMemo(() => async (): Promise<{ latitude: number; longitude: number } | null> => {
    setGeoState('pending')
    const result = await readGeolocation()
    if (result) {
      setGeo(result)
      setGeoState('ok')
      return result
    }
    setGeo(null)
    setGeoState('denied')
    return null
  }, [])
  useEffect(() => {
    if (!punchAllowed) return
    void refreshGeo()

    // Listen for permission changes — when the user toggles location at the
    // OS / browser / site level (often in a separate window) we want the
    // strip to flip from "off" to "on" without requiring a page reload.
    let permStatus: PermissionStatus | null = null
    const handlePermChange = () => { void refreshGeo() }
    if (typeof navigator !== 'undefined' && 'permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName })
        .then((s) => {
          permStatus = s
          s.addEventListener('change', handlePermChange)
        })
        .catch(() => { /* Permissions API not supported — fall back to visibility */ })
    }

    // Also re-query when the tab regains focus: the user might have fixed
    // their permission in a different tab and switched back.
    const onVisible = () => { if (!document.hidden) void refreshGeo() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)

    return () => {
      permStatus?.removeEventListener('change', handlePermChange)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [punchAllowed, refreshGeo])
  // Source of truth for the check-in band — derive directly from the raw
  // punches list for today, not from the calendar's rollup row. The rollup
  // is a derived projection that can briefly lag a refetch; the punches list
  // is invalidated on every mutation and updates immediately. Two wins:
  //   - The button label flips Check-in → Check-out the moment the new punch
  //     lands, even before the calendar query returns.
  //   - The live timer starts ticking from the just-recorded check-in, not
  //     from a stale rollup that might still carry yesterday's checkOut.
  const todayPunchesQuery = usePunchesForDay(toISODate(today), employeeId)
  const lastPunchToday = useMemo(() => {
    const list = todayPunchesQuery.data ?? []
    if (list.length === 0) return null
    return list.toSorted((a, b) =>
      new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
    )[0]
  }, [todayPunchesQuery.data])
  const lastInBeforeCurrent = useMemo(() => {
    const list = todayPunchesQuery.data ?? []
    // Walk from the end backward to find the most recent 'in' that hasn't
    // been closed by a later 'out' — that's the open session's start.
    const sorted = list.toSorted((a, b) =>
      new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
    )
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i]!
      if (p.punchType === 'in') return p
      if (p.punchType === 'out') return null
    }
    return null
  }, [todayPunchesQuery.data])
  const isCheckedIn = lastPunchToday?.punchType === 'in'
  const liveTimer = useLiveDuration(
    lastInBeforeCurrent?.recordedAt ?? null,
    isCheckedIn ? null : lastPunchToday?.recordedAt ?? null,
  )

  const shiftBand = `General [ 09:00 AM – 06:00 PM ]`

  return (
    <div className="space-y-4">
      <PageHeader title={t('attendance.title')} />

      {/* Tabs row + week navigator + view switcher */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-2">
        <div className="flex gap-4">
          <button type="button" className="p-1 text-sm font-semibold border-b-2 border-primary text-primary">
            Attendance Summary
          </button>
        </div>
      </div>

      {/* Stats strip — at-a-glance counters for the visible week. Moved
          above the calendar/list so the headline numbers land in the
          natural scan path before the per-day rows. */}
      <FooterStats stats={stats} shift={shiftBand} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1 shadow-sm">
          <Button size="icon" variant="ghost" className="size-7" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" onClick={() => setWeekStart(startOfWeek(new Date()))} aria-label="Pick week">
            <Calendar className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-7" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
            <ChevronRight className="size-4" />
          </Button>
          <span className="px-2 text-sm font-medium tabular-nums">
            {formatDayLabel(weekStart)} – {formatDayLabel(weekEnd)}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-lg border bg-card p-1 shadow-sm">
          <Button size="icon" variant={view === 'timeline' ? 'secondary' : 'ghost'} className="size-7" onClick={() => setView('timeline')} aria-label="Timeline view">
            <LayoutGrid className="size-3.5" />
          </Button>
          <Button size="icon" variant={view === 'list' ? 'secondary' : 'ghost'} className="size-7" onClick={() => setView('list')} aria-label="List view">
            <ListIcon className="size-3.5" />
          </Button>
          <Button size="icon" variant={view === 'calendar' ? 'secondary' : 'ghost'} className="size-7" onClick={() => setView('calendar')} aria-label="Calendar view">
            <CalendarDays className="size-3.5" />
          </Button>
        </div>

        {/* Employees see only the view switcher up here. Bulk import is an
            HR-only flow (lives in the main HR app's Attendance tab); the
            Filter / More icons were inert placeholders inherited from the
            HR layout. Removed so the row matches the actual feature set:
            check-in / check-out + manual entry. */}
      </div>

      {/* Check-in band — only rendered when HR has not revoked self-punch.
          When location is denied the action button no longer silently submits
          without coordinates; clicking it pops a friendly explanation card
          with "Enable location" and "Continue anyway" actions so the user
          knows exactly what will happen. */}
      {punchAllowed && (
        <div className="rounded-xl border bg-card p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-stretch justify-between gap-3">
            <div className="flex-1 min-w-[200px] self-center">
              <p className="text-sm font-semibold">{shiftBand}</p>
            </div>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={isCheckedIn ? 'Add notes for check-out' : 'Add notes for check-in'}
              className="flex-[2] min-w-[180px] h-9"
            />
            <PunchActionButton
              isCheckedIn={isCheckedIn}
              liveTimer={liveTimer}
              geo={geo}
              onPunch={(coords) => {
                const body: PunchBody = {
                  employeeId,
                  notes: note || null,
                  ...(coords ?? {}),
                }
                const mutation = isCheckedIn ? checkOut : checkIn
                const successLabel = isCheckedIn ? t('attendance.checkOut') : t('attendance.checkIn')
                mutation.mutate(body, {
                  onSuccess: () => { toast.success(successLabel); setNote(''); void refreshGeo() },
                  onError: (err: unknown) => toast.error((err as Error)?.message ?? `Could not ${isCheckedIn ? 'check out' : 'check in'}`),
                })
              }}
              loading={checkOut.isPending || checkIn.isPending}
              onEnableLocation={refreshGeo}
            />
          </div>
          {/* Location strip — read-only preview of where the punch will be
              tagged. Renders coordinates as a Maps link so the employee can
              verify the GPS reading. Refresh re-queries the device. */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <MapPin className={cn(
                'size-3.5',
                geoState === 'ok' ? 'text-emerald-600' : geoState === 'denied' ? 'text-rose-500' : 'text-muted-foreground',
              )} />
              {geoState === 'pending' && <span>Resolving your location…</span>}
              {geoState === 'denied' && (
                <span>Location access is off — enable it to tag your punch with coordinates.</span>
              )}
              {geoState === 'ok' && geo && (
                <>
                  <span>Location:</span>
                  <a
                    href={`https://maps.google.com/?q=${geo.latitude},${geo.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono tabular-nums text-foreground hover:text-primary hover:underline"
                    title="Open in Google Maps"
                  >
                    {geo.latitude.toFixed(4)}, {geo.longitude.toFixed(4)}
                  </a>
                </>
              )}
            </span>
            <button
              type="button"
              onClick={() => void refreshGeo()}
              className="text-primary hover:underline disabled:opacity-50"
              disabled={geoState === 'pending'}
            >
              {geoState === 'pending' ? 'Refreshing…' : geoState === 'denied' ? 'Enable location' : 'Refresh'}
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : view === 'timeline' ? (
        <TimelineView days={days} onPick={setDetail} today={today} />
      ) : view === 'list' ? (
        <ListView days={days} />
      ) : (
        <MonthCalendar month={monthQuery} setMonth={(m) => {
          const [y, mm] = m.split('-').map(Number)
          setWeekStart(startOfWeek(new Date(y!, (mm! - 1), 1)))
        }} />
      )}

      {detail && (
        <DayDetailDialog
          info={detail}
          shift={shiftBand}
          employeeId={employeeId}
          manualEntryAllowed={manualEntryAllowed}
          onClose={() => setDetail(null)}
        />
      )}

    </div>
  )
}

// ─── Timeline view ────────────────────────────────────────────────────────

function TimelineView({ days, onPick, today }: { days: DayInfo[]; onPick: (d: DayInfo) => void; today: Date }) {
  const startMin = 8 * 60
  const endMin = 19 * 60
  const span = endMin - startMin

  const slots: string[] = []
  for (let m = startMin; m <= endMin; m += 60) {
    const h = Math.floor(m / 60)
    slots.push(`${String(h).padStart(2, '0')}AM`.replace(/^(\d{2})AM$/, (_, hh) => Number(hh) >= 12 ? `${Number(hh) === 12 ? 12 : Number(hh) - 12}PM` : `${Number(hh)}AM`))
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
            <div>
              <p className="text-xs text-muted-foreground">{d.label.weekday}</p>
              <p className={cn('text-base font-semibold tabular-nums', isToday(d.date) && 'text-primary')}>{d.label.day}</p>
            </div>
            <div className="text-left">
              {d.cell?.checkIn ? (
                <p className="text-sm font-medium tabular-nums">{formatTime(d.cell.checkIn)}</p>
              ) : (
                <p className="text-sm text-muted-foreground">–</p>
              )}
            </div>
            <div className="relative h-5">
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border" />
              {d.classification !== 'future' && (
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
                  <span className={cn('rounded-md border px-2 py-0.5 text-[10px] font-medium', tone.pill)}>
                    {statusLabel(d.classification)}
                  </span>
                </div>
              )}
              {checkInPct != null && checkInPct >= 0 && checkInPct <= 100 && (
                <div className="absolute top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-emerald-500 ring-2 ring-background" style={{ left: `${checkInPct}%` }} />
              )}
              {checkOutPct != null && checkOutPct >= 0 && checkOutPct <= 100 && (
                <div className="absolute top-1/2 -translate-y-1/2 size-2.5 rounded-full bg-rose-500 ring-2 ring-background" style={{ left: `${checkOutPct}%` }} />
              )}
            </div>
            <div className="text-right">
              {d.cell?.checkOut ? (
                <p className="text-sm font-medium tabular-nums">{formatTime(d.cell.checkOut)}</p>
              ) : (
                <p className="text-sm text-muted-foreground">–</p>
              )}
            </div>
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

// ─── List view ────────────────────────────────────────────────────────────

function ListView({ days }: { days: DayInfo[] }) {
  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden overflow-x-auto">
      <table className="w-full text-sm min-w-[800px]">
        <thead className="bg-muted/50">
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Date</th>
            <th className="px-4 py-2.5 font-medium">First In</th>
            <th className="px-4 py-2.5 font-medium">Last Out</th>
            <th className="px-4 py-2.5 font-medium">Total Hours</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 font-medium">Shift(s)</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {days.map((d) => {
            const tone = statusTone(d.classification)
            return (
              <tr key={d.iso} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-2.5 whitespace-nowrap">
                  {d.label.weekday}, {formatDayLabel(d.date)}
                </td>
                <td className="px-4 py-2.5 tabular-nums">{d.cell?.checkIn ? formatTime(d.cell.checkIn) : '—'}</td>
                <td className="px-4 py-2.5 tabular-nums">{d.cell?.checkOut ? formatTime(d.cell.checkOut) : '—'}</td>
                <td className="px-4 py-2.5 tabular-nums">{d.cell?.hoursWorked ?? '—'}</td>
                <td className="px-4 py-2.5">
                  {d.classification !== 'future' && (
                    <span className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-medium', tone.pill)}>
                      <span className={cn('size-2 rounded-sm', tone.bar)} aria-hidden />
                      {statusLabel(d.classification)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">General</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Month calendar ───────────────────────────────────────────────────────

function MonthCalendar({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const { data, isLoading } = useAttendanceCalendar(month, 'me')
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
      <MonthPicker value={month} onChange={setMonth} />
      <AttendanceMonthCalendar data={data} loading={isLoading} />
    </div>
  )
}

// ─── Footer stats ─────────────────────────────────────────────────────────

function FooterStats({ stats, shift }: { stats: AttendanceWeekStats; shift: string }) {
  const entries = [
    // Alphabetical by label — mirrors the order used in the main HR app so
    // employees see the same arrangement everywhere.
    { label: 'Holidays', value: stats.holidays, tone: 'bg-sky-500' },
    { label: 'On Duty', value: stats.onDuty, tone: 'bg-violet-500' },
    { label: 'Paid leave', value: stats.paidLeave, tone: 'bg-amber-500' },
    { label: 'Payable Days', value: stats.payable, tone: 'bg-emerald-500' },
    { label: 'Present', value: stats.present, tone: 'bg-green-500' },
    { label: 'Weekend', value: stats.weekend, tone: 'bg-blue-400' },
  ]
  return (
    <div className="rounded-xl border bg-card shadow-sm">
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
                {e.value}{' '}<span className="text-xs text-muted-foreground font-normal">Day</span>
              </p>
            </div>
          </div>
        ))}
        <div className="ms-auto self-center text-xs text-muted-foreground">{shift}</div>
      </div>
    </div>
  )
}

// ─── Day detail dialog ────────────────────────────────────────────────────

// Hero icons + tone for the centered status panel. Keeps the body of the
// modal from feeling empty when there are no punches to show.
function statusHero(klass: DayClassification): {
  icon: typeof Calendar
  tone: string
  title: string
  body: string
} {
  switch (klass) {
    case 'weekend': return { icon: CalendarDays, tone: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30', title: 'Weekend', body: 'No work scheduled for this day.' }
    case 'holiday': return { icon: CalendarDays, tone: 'text-sky-600 bg-sky-50 dark:bg-sky-950/30', title: 'Public holiday', body: 'Office is closed today.' }
    case 'on_leave': return { icon: CalendarRange, tone: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30', title: 'On leave', body: 'You are on an approved leave.' }
    case 'future': return { icon: Calendar, tone: 'text-muted-foreground bg-muted/40', title: 'Future date', body: 'Attendance not recorded yet.' }
    case 'absent': return { icon: X, tone: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30', title: 'Marked absent', body: 'You were marked absent for the day.' }
    case 'present':
    case 'late':
    case 'short':
    case 'wfh':
      return { icon: LogIn, tone: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30', title: statusLabel(klass), body: '' }
  }
}

// ─── Punch action button — SweetAlert-style modal when location is off ────
//
// Three states the button has to handle:
//   1. location ok       → button submits the punch directly with coords
//   2. location pending  → button keeps the live timer; submits without
//                          coords if the user is impatient (strip refreshes
//                          on the next success)
//   3. location denied   → click opens a centered AlertModal explaining
//                          the situation, with two paths forward:
//                          "Enable location" (re-prompts the browser) and
//                          "Continue without" (submits coordinate-less)
//
// Replaces the previous silent-submit-without-coords behaviour with
// explicit consent.
function PunchActionButton({
  isCheckedIn,
  liveTimer,
  geo,
  loading,
  onPunch,
  onEnableLocation,
}: {
  isCheckedIn: boolean
  liveTimer: string
  geo: { latitude: number; longitude: number } | null
  loading: boolean
  onPunch: (coords: { latitude: number; longitude: number } | null) => void
  onEnableLocation: () => Promise<{ latitude: number; longitude: number } | null>
}) {
  const [alertOpen, setAlertOpen] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const label = isCheckedIn ? 'Check-out' : 'Check-in'
  const colorClass = isCheckedIn
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
  const Icon = isCheckedIn ? LogOut : LogIn

  // Click handling — location is REQUIRED for every punch. The flow:
  //   1. Have coords already → submit with them.
  //   2. Otherwise re-query the browser once (the user may have JUST
  //      enabled location after the initial denial).
  //   3. Still no coords → open the alert. The alert has no "submit
  //      anyway" escape hatch any more — the only forward path is
  //      "Try again" once the user has fixed their browser permission.
  const handleClick = async () => {
    if (geo) {
      onPunch(geo)
      return
    }
    setRetrying(true)
    try {
      const fresh = await onEnableLocation()
      if (fresh) {
        onPunch(fresh)
        return
      }
    } finally {
      setRetrying(false)
    }
    setAlertOpen(true)
  }

  return (
    <>
      <Button
        onClick={handleClick}
        loading={loading || retrying}
        className={colorClass}
      >
        <Icon className="size-4 me-2" />
        <div className="flex flex-col items-start leading-tight">
          <span className="text-xs">{label}</span>
          <span className="text-xs tabular-nums">{liveTimer}</span>
        </div>
      </Button>
      <AlertModal
        open={alertOpen}
        onOpenChange={setAlertOpen}
        variant="warning"
        title="Location is required"
        description={(
          <>
            We couldn&rsquo;t read your GPS, so we can&rsquo;t record this{' '}
            <span className="font-medium text-foreground">{label.toLowerCase()}</span>{' '}
            yet — every punch is tagged with where it happened.
            <br />
            Open your browser&rsquo;s site settings, allow location for this
            site, then try again.
          </>
        )}
        cancelLabel="Cancel"
        onCancel={() => { /* just close */ }}
        confirmLabel="Try again"
        onConfirm={async () => {
          const fresh = await onEnableLocation()
          if (fresh) onPunch(fresh)
        }}
      />
    </>
  )
}

function DayDetailDialog({
  info, shift, employeeId, manualEntryAllowed, onClose,
}: {
  info: DayInfo
  shift: string
  employeeId: string | undefined
  manualEntryAllowed: boolean
  onClose: () => void
}) {
  const cell = info.cell
  const klass = info.classification
  const hero = statusHero(klass)
  const HeroIcon = hero.icon
  const headerDate = `${info.label.weekday}, ${formatDayLabel(info.date)}`

  const punchesQuery = usePunchesForDay(info.iso, employeeId)
  const pairs = useMemo(() => pairPunches(punchesQuery.data ?? []), [punchesQuery.data])
  const totalHours = useMemo(() => sumPairHours(pairs), [pairs])
  const firstIn = pairs[0]?.inPunch?.recordedAt ?? null
  const lastOut = pairs.slice().reverse().find((p) => p.outPunch)?.outPunch?.recordedAt ?? null

  const addManual = useAddManualPunch()
  const deletePunch = useDeletePunch()

  const [manualOpen, setManualOpen] = useState(false)
  const [mIn, setMIn] = useState('')
  const [mInOffset, setMInOffset] = useState<'0' | '1'>('0')
  const [mInNotes, setMInNotes] = useState('')
  const [mOut, setMOut] = useState('')
  const [mOutOffset, setMOutOffset] = useState<'0' | '1'>('0')
  const [mOutNotes, setMOutNotes] = useState('')

  function resetManual() {
    setManualOpen(false)
    setMIn(''); setMInOffset('0'); setMInNotes('')
    setMOut(''); setMOutOffset('0'); setMOutNotes('')
  }

  const submitManual = () => {
    if (!/^\d{2}:\d{2}$/.test(mIn)) {
      toast.error('Enter check-in time as HH:MM')
      return
    }
    if (mOut && !/^\d{2}:\d{2}$/.test(mOut)) {
      toast.error('Enter check-out time as HH:MM')
      return
    }
    addManual.mutate(
      {
        employeeId,
        date: info.iso,
        inTime: mIn,
        outTime: mOut || undefined,
        inDayOffset: Number(mInOffset),
        outDayOffset: mOut ? Number(mOutOffset) : undefined,
        inNotes: mInNotes || undefined,
        outNotes: mOutNotes || undefined,
      },
      {
        onSuccess: () => { toast.success('Entry added'); resetManual() },
        onError: (err: unknown) => toast.error((err as Error)?.message ?? 'Could not add entry'),
      },
    )
  }

  // Is this day in a "special" classification (leave / holiday / weekend /
  // absent / future)? When it is we always surface a banner so the employee
  // sees the day's context — even when they ALSO have punches (e.g. a
  // half-day leave with a partial check-in). The visual differs by intensity:
  //  - no punches → big centered hero (the original card)
  //  - has punches → slim banner with icon + status badge above the list
  const isSpecial = klass === 'weekend' || klass === 'holiday'
    || klass === 'on_leave' || klass === 'absent' || klass === 'future'
  const showHero = isSpecial && pairs.length === 0
  const showSlimBanner = isSpecial && pairs.length > 0

  // Optional context the calendar API attaches to special days. Showing
  // these makes the banner self-explanatory ("Sick leave" vs. just "On leave").
  const leaveType = cell?.leaveType
  const holidayName = cell?.holidayName

  return (
    <Dialog open={true} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl flex flex-col p-0 gap-0 overflow-hidden max-h-[92vh]">
        <DialogHeader className="px-6 pt-5 pb-4 border-b bg-muted/30">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-lg font-semibold leading-tight">{headerDate}</DialogTitle>
                {isSpecial && (
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                    hero.tone,
                  )}>
                    <HeroIcon className="size-3" />
                    {hero.title}
                  </span>
                )}
              </div>
              <DialogDescription className="mt-1 text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar className="size-3 shrink-0" />
                <span className="truncate">{shift}</span>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Slim status banner — shown alongside punches when the day is
              also marked as leave / holiday / weekend so the context is
              never hidden by the punch list. */}
          {showSlimBanner && (
            <div className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-2.5',
              hero.tone,
            )}>
              <div className="size-8 rounded-full bg-background/80 flex items-center justify-center shrink-0">
                <HeroIcon className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight">
                  {leaveType ? `${hero.title} · ${leaveType}` : holidayName ? `${hero.title} · ${holidayName}` : hero.title}
                </p>
                {hero.body && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">{hero.body}</p>
                )}
              </div>
              {klass === 'absent' && (
                <Button asChild size="sm" variant="outline" className="shrink-0">
                  <Link to={ROUTES.employeeLeave}>Apply Leave</Link>
                </Button>
              )}
            </div>
          )}

          {showHero && (
            <div className={cn('rounded-xl px-4 py-6 flex flex-col items-center gap-2 text-center border', hero.tone)}>
              <div className="size-11 rounded-full bg-background flex items-center justify-center shadow-sm">
                <HeroIcon className="size-5" />
              </div>
              <p className="text-base font-semibold">
                {leaveType ? `${hero.title} · ${leaveType}` : holidayName ? `${hero.title} · ${holidayName}` : hero.title}
              </p>
              {hero.body && <p className="text-xs text-muted-foreground max-w-[320px]">{hero.body}</p>}
              {klass === 'absent' && (
                <Button asChild variant="outline" size="sm" className="mt-2">
                  <Link to={ROUTES.employeeLeave}>Apply Leave</Link>
                </Button>
              )}
            </div>
          )}

          {/* Punch pair list (screenshot 10 style) */}
          {pairs.length > 0 && (
            <ul className="space-y-2">
              {pairs.map((p, idx) => (
                <li
                  key={p.inPunch?.id ?? p.outPunch?.id ?? idx}
                  className="rounded-xl border bg-card overflow-hidden"
                >
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-3 gap-3">
                    {/* IN */}
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                        Check-in
                      </span>
                      {p.inPunch ? (
                        <>
                          <span className="text-base font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {formatTime(p.inPunch.recordedAt)}
                          </span>
                          <PunchMeta punch={p.inPunch} />
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground/70">–</span>
                      )}
                    </div>

                    {/* Connector */}
                    <span className="hidden sm:block border-t border-dashed border-muted-foreground/40 w-12" />

                    {/* OUT */}
                    <div className="flex flex-col items-end text-right">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-rose-700 dark:text-rose-400">
                        Check-out
                      </span>
                      {p.outPunch ? (
                        <>
                          <span className="text-base font-semibold text-rose-700 dark:text-rose-400 tabular-nums">
                            {formatTime(p.outPunch.recordedAt)}
                          </span>
                          <PunchMeta punch={p.outPunch} align="end" />
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground/70 italic">In progress</span>
                      )}
                    </div>
                  </div>

                  {/* Per-pair actions */}
                  <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Pair {idx + 1} · {p.duration}
                    </span>
                    <div className="flex items-center gap-1">
                      {p.inPunch && (
                        <button
                          type="button"
                          onClick={() => deletePunch.mutate({ id: p.inPunch!.id, employeeId }, {
                            onSuccess: () => toast.success('Check-in removed'),
                            onError: (err: unknown) => toast.error((err as Error)?.message ?? 'Could not remove'),
                          })}
                          className="text-[10px] text-rose-600 hover:underline flex items-center gap-1 px-1.5 py-0.5"
                          aria-label="Delete check-in"
                        >
                          <Trash2 className="size-3" /> In
                        </button>
                      )}
                      {p.outPunch && (
                        <button
                          type="button"
                          onClick={() => deletePunch.mutate({ id: p.outPunch!.id, employeeId }, {
                            onSuccess: () => toast.success('Check-out removed'),
                            onError: (err: unknown) => toast.error((err as Error)?.message ?? 'Could not remove'),
                          })}
                          className="text-[10px] text-rose-600 hover:underline flex items-center gap-1 px-1.5 py-0.5"
                          aria-label="Delete check-out"
                        >
                          <Trash2 className="size-3" /> Out
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* Empty-pairs state for working days */}
          {pairs.length === 0 && !showHero && (
            <div className="rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
              No check-ins recorded for this day.
            </div>
          )}

          {/* Manual entry expandable — only when HR has not revoked the
              "Manual entry" switch for this user. */}
          {manualEntryAllowed && (!manualOpen ? (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="w-full rounded-xl border border-dashed py-2.5 text-xs font-medium text-primary hover:bg-muted/40 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="size-3.5" />
              Add Check-in / Check-out Entry
            </button>
          ) : (
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <p className="text-sm font-semibold">Add manual entry</p>
              <div className="grid grid-cols-2 gap-3">
                <ManualTimeField
                  label="Check-in"
                  value={mIn} onChange={setMIn}
                  offset={mInOffset} onOffsetChange={setMInOffset}
                  notes={mInNotes} onNotesChange={setMInNotes}
                  tone="emerald"
                />
                <ManualTimeField
                  label="Check-out"
                  value={mOut} onChange={setMOut}
                  offset={mOutOffset} onOffsetChange={setMOutOffset}
                  notes={mOutNotes} onNotesChange={setMOutNotes}
                  tone="rose"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={resetManual}>Cancel</Button>
                <Button size="sm" onClick={submitManual} loading={addManual.isPending}>
                  Save entry
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t bg-muted/30 px-6 py-4 grid grid-cols-3 gap-3">
          <div className="border-l-2 border-emerald-500 ps-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">First Check-In</p>
            <p className="text-sm font-semibold tabular-nums mt-1">{firstIn ? formatTime(firstIn) : (cell?.checkIn ? formatTime(cell.checkIn) : '—')}</p>
          </div>
          <div className="border-l-2 border-rose-500 ps-2.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Last Check-Out</p>
            <p className="text-sm font-semibold tabular-nums mt-1">{lastOut ? formatTime(lastOut) : (cell?.checkOut ? formatTime(cell.checkOut) : '—')}</p>
          </div>
          <div className="border-l-2 border-blue-500 ps-2.5 text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Total Hours</p>
            <p className="text-sm font-semibold tabular-nums mt-1">{totalHours || cell?.hoursWorked || '00:00'}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface PunchPair {
  inPunch: AttendancePunch | null
  outPunch: AttendancePunch | null
  duration: string
}

function pairPunches(punches: AttendancePunch[]): PunchPair[] {
  const sorted = punches.toSorted((a, b) =>
    new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
  )
  const out: PunchPair[] = []
  let pending: AttendancePunch | null = null
  for (const p of sorted) {
    if (p.punchType === 'in') {
      if (pending) out.push({ inPunch: pending, outPunch: null, duration: '—' })
      pending = p
    } else {
      if (pending) {
        const ms = new Date(p.recordedAt).getTime() - new Date(pending.recordedAt).getTime()
        out.push({ inPunch: pending, outPunch: p, duration: formatDuration(ms) })
        pending = null
      } else {
        out.push({ inPunch: null, outPunch: p, duration: '—' })
      }
    }
  }
  if (pending) out.push({ inPunch: pending, outPunch: null, duration: '—' })
  return out
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '—'
  const total = Math.round(ms / 60000)
  const h = Math.floor(total / 60).toString().padStart(2, '0')
  const m = (total % 60).toString().padStart(2, '0')
  return `${h}h ${m}m`
}

function sumPairHours(pairs: PunchPair[]): string {
  let totalMin = 0
  for (const p of pairs) {
    if (p.inPunch && p.outPunch) {
      totalMin += Math.max(
        0,
        Math.round(
          (new Date(p.outPunch.recordedAt).getTime() - new Date(p.inPunch.recordedAt).getTime()) / 60000,
        ),
      )
    }
  }
  if (totalMin === 0) return ''
  const h = Math.floor(totalMin / 60).toString().padStart(2, '0')
  const m = (totalMin % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

function PunchMeta({ punch, align = 'start' }: { punch: AttendancePunch; align?: 'start' | 'end' }) {
  const items: ReactNode[] = []
  // Prefer the human-readable location label. When only coordinates exist,
  // render them as a tappable Maps link so HR can verify the punch site
  // without copy-pasting the lat/lng pair.
  if (punch.locationName) {
    items.push(
      <span key="loc" className="inline-flex items-center gap-1 text-foreground/70">
        <MapPin className="size-3" />
        <span className="truncate max-w-[140px]">{punch.locationName}</span>
      </span>,
    )
  } else if (punch.latitude && punch.longitude) {
    items.push(
      <a
        key="latlng"
        href={`https://maps.google.com/?q=${punch.latitude},${punch.longitude}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 tabular-nums text-foreground/70 hover:text-primary hover:underline"
        title="Open in Maps"
      >
        <MapPin className="size-3" />
        {Number(punch.latitude).toFixed(3)}, {Number(punch.longitude).toFixed(3)}
      </a>,
    )
  }
  items.push(
    <span key="src" className="inline-flex items-center gap-1 capitalize">
      <MonitorSmartphone className="size-3" />
      {punch.source}
    </span>,
  )
  return (
    <p
      className={cn(
        'mt-0.5 text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-0.5',
        align === 'end' && 'justify-end',
      )}
    >
      {items}
    </p>
  )
}

function ManualTimeField({
  label, value, onChange, offset, onOffsetChange, notes, onNotesChange, tone,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  offset: '0' | '1'
  onOffsetChange: (v: '0' | '1') => void
  notes: string
  onNotesChange: (v: string) => void
  tone: 'emerald' | 'rose'
}) {
  const toneClass = tone === 'emerald'
    ? 'text-emerald-700 dark:text-emerald-400'
    : 'text-rose-700 dark:text-rose-400'
  return (
    <div className="space-y-1.5">
      <p className={cn('text-[10px] font-medium uppercase tracking-wider', toneClass)}>{label}</p>
      <div className="flex items-center gap-1.5">
        <Input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-8 text-xs"
        />
        <select
          value={offset}
          onChange={(e) => onOffsetChange(e.target.value as '0' | '1')}
          className="h-8 rounded-md border bg-background px-1.5 text-xs"
          aria-label={`${label} day offset`}
        >
          <option value="0">Same Day</option>
          <option value="1">Next Day</option>
        </select>
      </div>
      <Input
        value={notes}
        onChange={(e) => onNotesChange(e.target.value)}
        placeholder="Notes (optional)"
        className="h-7 text-xs"
      />
    </div>
  )
}

