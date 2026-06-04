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
  LogIn, LogOut, MapPin, MapPinOff, Loader2,
} from 'lucide-react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, toast,
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
import { useGeolocationPermission } from '@/hooks/useGeolocationPermission'
import { useAccountFlags } from '@/hooks/useAccountFlags'
import { formatTime, formatDayLabel, toISODate, toISOMonth, startOfWeek, addDays, formatHoursWorked } from '@/lib/datetime'
import {
  classify, statusLabel, statusTone, computeStats,
  type DayInfo, type AttendanceWeekStats,
} from '@/lib/attendance/calendar'
import { useLiveDuration } from '@/hooks/useLiveDuration'
import { EmptyState } from '@/components/shared/EmptyState'

// ─── Helpers ────────────────────────────────────────────────────────────────
// The day-format / ISO helpers (`formatTime`, `formatDayLabel`,
// `toISODate`, `toISOMonth`) live in `lib/datetime.ts` and are imported
// alongside the other modules. Only the week-window arithmetic stays
// local since it is unique to this page's calendar header.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']



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
  const monthQuery = toISOMonth(weekStart)
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

  const stats = useMemo(() => computeStatsLocal(days), [days])

  // ── Check-in widget ────────────────────────────────────────────────────
  const todayInfo = useMemo(() => {
    const t = toISODate(today)
    return days.find((d) => d.iso === t) ?? null
  }, [days, today])
  const checkIn = useCheckIn()
  const checkOut = useCheckOut()
  const isCheckedIn = !!todayInfo?.cell?.checkIn && !todayInfo?.cell?.checkOut

  // HR-controlled per-user override (Users → Manage Access → "Attendance
  // check-in / check-out"). When false, the buttons disappear entirely —
  // the only way to punch is via a biometric device or HR's External Punch
  // widget. We read this through useAccountFlags (which hits /auth/me with
  // proper cache-busting) rather than the auth store, because the auth
  // store only loads at login and would never reflect mid-session HR
  // toggles otherwise.
  const accountFlags = useAccountFlags()
  const punchAllowed = accountFlags.attendancePunchEnabled

  // Geolocation gate — employee can only check in when the device's location
  // permission is granted. Mirrors the policy on physical biometric devices
  // (you can't punch in without being at the reader). Check-out is still
  // allowed without location since the user is already on premises.
  //
  // We treat the Permissions API as a *hint*, not a hard gate. Some browsers
  // (older Safari, in-app webviews, embedded WebKit) stall at `'checking'`
  // or return `'prompt'` even when the underlying OS already granted the
  // permission. So instead of disabling check-in until we see `'granted'`,
  // we always attempt the geolocation read on click and react to what
  // actually comes back.
  const geo = useGeolocationPermission()
  const locationDenied = geo.status === 'denied'
  const locationUnsupported = geo.status === 'unsupported'
  const locationGranted = geo.status === 'granted'

  // Eagerly resolve the position on mount when the permission is already
  // granted, so the inline preview strip can show actual coordinates
  // without making the user click first. We don't trigger a fresh
  // permission prompt here — `request()` against a granted permission
  // just reads the current position. When the user later changes the
  // browser permission (e.g. from blocked to granted), the Permissions
  // API change handler flips `status` to 'granted' and we run again.
  useEffect(() => {
    if (!punchAllowed) return
    if (locationGranted && !geo.position) {
      void geo.request()
    }
    // We intentionally depend on `locationGranted` (not the whole `geo`
    // object) so this fires once when status transitions to granted,
    // not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [punchAllowed, locationGranted])

  const handleCheckIn = async () => {
    if (!employeeId) {
      toast.error(
        'Could not find your employee record',
        'Refresh the page or contact HR if this keeps happening.',
      )
      return
    }
    if (locationUnsupported) {
      toast.error(
        'Location not available',
        'This device does not provide geolocation, so attendance check-in is unavailable here.',
      )
      return
    }

    // Prefer the cached position when we already have a recent one — the
    // preview strip eagerly resolves on mount, so by the time HR clicks
    // Check-in we usually have coords ready. Only fall back to a fresh
    // request() when there's no cached fix yet (first interaction, or the
    // initial read failed).
    //
    // `request()` resolves with `null` on failure (denied / timeout /
    // unavailable) — we treat that as the signal to surface a toast and
    // bail instead of silently no-op'ing.
    const pos = geo.position ?? await geo.request()
    if (!pos) {
      if (geo.status === 'denied') {
        toast.error(
          'Location is blocked',
          'Enable location for this site in your browser settings, then try again.',
        )
      } else {
        toast.error(
          'Could not read your location',
          'Make sure location is on and try once more.',
        )
      }
      return
    }
    // Send the coords we just collected (and the note typed in the
    // sibling input). Backend stores both — without this, the punch
    // would land geo-anonymous even though we just asked the browser
    // for a position, which defeats the whole gate.
    checkIn.mutate(
      {
        employeeId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        notes: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success('Checked in')
          setNote('')
        },
        onError: (err: unknown) => {
          toast.error(
            'Check-in failed',
            err instanceof Error ? err.message : 'Please try again in a moment.',
          )
        },
      },
    )
  }
  const handleCheckOut = async () => {
    if (!employeeId) {
      toast.error('Could not find your employee record')
      return
    }
    // Best-effort geolocation on check-out too — same business logic
    // (we want to know where the punch happened) but we don't *gate*
    // check-out on it: if the user left the building and lost location,
    // they should still be able to close their shift.
    let coords: { latitude: number; longitude: number } | null = null
    if (!locationUnsupported) {
      const pos = await geo.request().catch(() => null)
      if (pos) coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
    }
    checkOut.mutate(
      {
        employeeId,
        latitude: coords?.latitude ?? null,
        longitude: coords?.longitude ?? null,
        notes: note.trim() || null,
      },
      {
        onSuccess: () => {
          toast.success('Checked out')
          setNote('')
        },
        onError: (err: unknown) => {
          toast.error(
            'Check-out failed',
            err instanceof Error ? err.message : 'Please try again in a moment.',
          )
        },
      },
    )
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

      {/* Today check-in / check-out + shift band — the entire row collapses
          to just the shift band when HR has revoked the punch privilege. */}
      <div className="mt-4 flex flex-wrap items-stretch justify-between gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex-1 min-w-[200px]">
          <p className="text-sm font-semibold">
            {myShift?.name ?? 'General'}{' '}
            <span className="text-muted-foreground font-normal">
              [ {myShift?.startTime ?? '09:00'} – {myShift?.endTime ?? '18:00'} ]
            </span>
          </p>
          {!punchAllowed && (
            <p className="text-[11px] text-muted-foreground mt-1">
              Self check-in is disabled for your account. Attendance is recorded by your biometric device or HR.
            </p>
          )}
        </div>
        {punchAllowed && (
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={isCheckedIn ? 'Add notes for check-out' : 'Add notes for check-in'}
            className="flex-[2] min-w-[180px] h-9"
          />
        )}
        {punchAllowed && (isCheckedIn ? (
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
          // The check-in button is always clickable (unless geolocation is
          // entirely unsupported by the device). Clicking attempts a fresh
          // geolocation read — if the browser hasn't asked yet it'll prompt,
          // if it's denied the handler surfaces a clear toast, and if the
          // device has no API at all the button is disabled with a hint.
          //
          // Previous behaviour disabled the button on `geo.status !== 'granted'`,
          // which left the button frozen during the Permissions API's
          // `'checking'` window AND in browsers that report `'prompt'` even
          // when the OS-level permission is already granted. That created
          // the "location is on but check-in is impossible" bug — fixed
          // by trusting the click + the geolocation result, not the
          // cached permission state.
          <Button
            onClick={handleCheckIn}
            loading={checkIn.isPending}
            disabled={locationUnsupported}
            className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
            title={locationUnsupported
              ? 'This device does not provide geolocation, so check-in is unavailable here.'
              : locationDenied
                ? 'Location is blocked. We will ask you to re-enable it on click.'
                : 'Click to check in. We will ask for location if needed.'}
          >
            <LogIn className="size-4 me-1" />
            <div className="flex flex-col items-start">
              <span className="text-xs leading-none">Check-in</span>
              <span className="text-xs leading-none tabular-nums">{liveTimer}</span>
            </div>
          </Button>
        ))}
      </div>
      {/* Live location strip — shown whenever punching is allowed so HR
          can see at a glance where the punch will be tagged. Mirrors the
          portal pattern: pending → resolved (with Maps link) → blocked.
          The coords come from `useGeolocationPermission`, which we
          eagerly read on mount. */}
      {punchAllowed && !isCheckedIn && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-1.5 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            {locationUnsupported ? (
              <>
                <MapPinOff className="size-3.5 text-rose-500" />
                <span>Your device does not provide geolocation, so check-in is unavailable here.</span>
              </>
            ) : locationDenied ? (
              <>
                <MapPinOff className="size-3.5 text-rose-500" />
                <span>Location is blocked. Enable it in your browser settings to record your punch location.</span>
              </>
            ) : geo.position ? (
              <>
                <MapPin className="size-3.5 text-emerald-600" />
                <span>Location:</span>
                <a
                  href={`https://maps.google.com/?q=${geo.position.coords.latitude},${geo.position.coords.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono tabular-nums text-foreground hover:text-primary hover:underline"
                  title="Open in Google Maps"
                >
                  {geo.position.coords.latitude.toFixed(4)}, {geo.position.coords.longitude.toFixed(4)}
                </a>
              </>
            ) : (
              <>
                <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
                <span>Resolving your location…</span>
              </>
            )}
          </span>
          {/* Action affordance on the right — refresh when we have a fix,
              enable-prompt when blocked, hidden when unsupported. Keeps
              the strip compact when nothing's wrong. */}
          {!locationUnsupported && (
            <button
              type="button"
              onClick={() => { void geo.request() }}
              className="text-primary hover:underline"
            >
              {locationDenied
                ? 'Enable location'
                : geo.position
                  ? 'Refresh'
                  : 'Retry'}
            </button>
          )}
        </div>
      )}

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
              <p className="text-sm font-semibold tabular-nums">{formatHoursWorked(d.cell?.hoursWorked, d.cell?.checkIn, d.cell?.checkOut)}</p>
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
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-sm">
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
            const hours = d.cell?.checkIn ? formatHoursWorked(d.cell?.hoursWorked, d.cell?.checkIn, d.cell?.checkOut) : '—'
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
          if (!c) return <div key={`empty-${i}`} />
          const klass = classify(c.cell, new Date(year, mon - 1, c.day), new Date())
          const tone = statusTone(klass)
          return (
            <div
              key={`day-${c.day}`}
              className={cn(
                'aspect-square rounded-md border flex flex-col items-center justify-center gap-0.5 p-1 text-xs',
                tone.bar,
              )}
            >
              <span className="font-medium tabular-nums">{c.day}</span>
              {c.cell?.hoursWorked && <span className="text-[9px] text-muted-foreground tabular-nums">{formatHoursWorked(c.cell?.hoursWorked, c.cell?.checkIn, c.cell?.checkOut)}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Stats footer ───────────────────────────────────────────────────────────
// Day counts come from the shared computeStats helper in
// lib/attendance/calendar.ts. We extend with `hoursWorked` (total minutes)
// since the main-app footer also surfaces total worked time, which the
// portal doesn't.

interface Stats extends AttendanceWeekStats {
  hoursWorked: number
}

function computeStatsLocal(days: DayInfo[]): Stats {
  const base = computeStats(days)
  let hoursWorked = 0
  for (const d of days) {
    if (d.classification === 'future') continue
    const hw = d.cell?.hoursWorked
    if (hw && /^\d{2}:\d{2}/.test(hw)) {
      const [h, m] = hw.split(':').map(Number)
      hoursWorked += (h ?? 0) * 60 + (m ?? 0)
    }
  }
  return { ...base, hoursWorked }
}

function FooterStats({ stats, shift }: { stats: Stats; shift: string }) {
  const entries: Array<{ label: string; value: string; sub: string; tone: string }> = [
    // Alphabetical by label — keeps the legend strip predictable across the
    // app (employee portal mirrors this order).
    { label: 'Holidays', value: String(stats.holidays), sub: 'Day', tone: 'bg-sky-500' },
    { label: 'On Duty', value: String(stats.onDuty), sub: 'Day', tone: 'bg-violet-500' },
    { label: 'Paid leave', value: String(stats.paidLeave), sub: 'Day', tone: 'bg-amber-500' },
    { label: 'Payable Days', value: String(stats.payable), sub: 'Day', tone: 'bg-emerald-500' },
    { label: 'Present', value: String(stats.present), sub: 'Day', tone: 'bg-green-500' },
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
            <p className="text-sm font-medium tabular-nums">{formatHoursWorked(cell?.hoursWorked, cell?.checkIn, cell?.checkOut)}</p>
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
            <EmptyState icon={FileClock} title="No events recorded for this day." size="sm" />
          ) : (
            <ol className="relative border-l-2 border-border ms-4 pt-2 space-y-5">
              {events.map((e, i) => (
                <li key={`${i}-${e.time}-${e.action}`} className="ms-6 relative">
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


