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
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/routes'
import { formatTime, formatDayLabel, toISODate, toISOMonth, startOfWeek, addDays, formatHoursWorked } from '@/lib/datetime'
import {
  classify, statusLabel, statusTone, computeStats,
  type DayInfo, type DayClassification, type AttendanceWeekStats,
} from '@/lib/attendance/calendar'
import { useLiveDuration } from '@/hooks/useLiveDuration'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
// Geolocation acquisition lives in `lib/geolocation.ts` now — it
// surfaces the actual failure reason ('denied' / 'timeout' / 'unavailable'
// / 'unsupported') so the UI can be honest about what went wrong instead
// of telling permission-granted users "location is off".
import { acquireLocation, reverseGeocodeClient, type GeolocationFailureReason } from '@/lib/geolocation'

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

  // Live geolocation preview for the check-in band. The strip uses the
  // *preview* acquisition profile (fast, cached, low accuracy) — the
  // PunchActionButton uses the *punch* profile (longer timeout, high
  // accuracy, streamed first fix) on click. Decoupling these is what
  // killed the long-standing "location is on but check-in fails" bug:
  // the strip's quick read used to time out indoors and report 'denied',
  // and the click path would inherit that broken state.
  //
  // geoState carries the actual failure reason now ('denied' is strictly
  // a user permission block; 'unavailable' is the device giving up on
  // a fix; 'timeout' is "we waited 10s and got nothing"). The UI shows
  // a different message per reason so users aren't gaslit.
  const [geo, setGeo] = useState<{ latitude: number; longitude: number } | null>(null)
  const [geoState, setGeoState] = useState<'pending' | 'ok' | GeolocationFailureReason>('pending')
  // Human-readable place name resolved from coords via reverseGeocodeClient.
  // Independent state from `geo` because Nominatim is best-effort: we show
  // the name when it's available, but the strip still works (showing coords)
  // even if the geocode lookup fails or is slow.
  const [geoName, setGeoName] = useState<string | null>(null)
  const refreshGeo = useMemo(() => async (): Promise<{ latitude: number; longitude: number } | null> => {
    setGeoState('pending')
    const result = await acquireLocation({ purpose: 'preview' })
    if (result.ok) {
      const coords = { latitude: result.coords.latitude, longitude: result.coords.longitude }
      setGeo(coords)
      setGeoState('ok')
      // Kick off reverse-geocode in the background. We don't await it —
      // the strip can render coords immediately and upgrade to the name
      // as soon as Nominatim returns. If it fails, geoName stays null
      // and the strip falls back to coords.
      void reverseGeocodeClient(coords.latitude, coords.longitude).then(setGeoName)
      return coords
    }
    setGeo(null)
    setGeoName(null)
    setGeoState(result.reason)
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
          <Button size="icon" variant="ghost" className="size-9 sm:size-8" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-9 sm:size-8" onClick={() => setWeekStart(startOfWeek(new Date()))} aria-label="Pick week">
            <Calendar className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-9 sm:size-8" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
            <ChevronRight className="size-4" />
          </Button>
          <span className="px-2 text-sm font-medium tabular-nums">
            {formatDayLabel(weekStart)} – {formatDayLabel(weekEnd)}
          </span>
        </div>

        <div className="flex items-center gap-1 rounded-lg border bg-card p-1 shadow-sm">
          <Button size="icon" variant={view === 'timeline' ? 'secondary' : 'ghost'} className="size-9 sm:size-8" onClick={() => setView('timeline')} aria-label="Timeline view">
            <LayoutGrid className="size-3.5" />
          </Button>
          <Button size="icon" variant={view === 'list' ? 'secondary' : 'ghost'} className="size-9 sm:size-8" onClick={() => setView('list')} aria-label="List view">
            <ListIcon className="size-3.5" />
          </Button>
          <Button size="icon" variant={view === 'calendar' ? 'secondary' : 'ghost'} className="size-9 sm:size-8" onClick={() => setView('calendar')} aria-label="Calendar view">
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
                  // Forward the already-resolved place name when we have one
                  // (the strip preview's reverseGeocodeClient call). Saves the
                  // backend a redundant Nominatim round-trip *and* guarantees
                  // the stored locationName matches what the user just saw on
                  // screen — no surprises in the punch log after the fact.
                  ...(coords && geoName ? { locationName: geoName } : {}),
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
                geoState === 'ok'
                  ? 'text-emerald-600'
                  : geoState === 'denied' || geoState === 'unsupported'
                    ? 'text-rose-500'
                    : geoState === 'timeout' || geoState === 'unavailable'
                      ? 'text-amber-500'
                      : 'text-muted-foreground',
              )} />
              {/* Distinct copy per failure reason — the old single
                  "Location access is off" message led HR to believe
                  there was a permissions bug when in fact the device
                  was still trying to get a fix. */}
              {geoState === 'pending' && <span>Resolving your location…</span>}
              {geoState === 'denied' && (
                <span>Location is blocked. Your punch will be recorded without location — allow it for accurate tagging.</span>
              )}
              {geoState === 'timeout' && (
                <span>GPS lock taking a while. Punch anyway — we&rsquo;ll try once more on the click.</span>
              )}
              {geoState === 'unavailable' && (
                <span>Location currently unavailable. Your punch will be recorded without location.</span>
              )}
              {geoState === 'unsupported' && (
                <span>This browser doesn&rsquo;t expose location. Your punch will be recorded without location.</span>
              )}
              {geoState === 'ok' && geo && (
                <>
                  <span>Location:</span>
                  {/* Show the resolved place-name when reverse-geocoding
                      lands; fall back to coords while the geocode is in
                      flight or if it fails. Both states link to Google
                      Maps so HR can verify the exact spot. The coords
                      live in the `title=` tooltip for the name case so
                      they're still discoverable without taking up
                      header space. */}
                  <a
                    href={`https://maps.google.com/?q=${geo.latitude},${geo.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cn(
                      'text-foreground hover:text-primary hover:underline',
                      geoName
                        ? 'font-medium max-w-[280px] truncate'
                        : 'font-mono tabular-nums',
                    )}
                    title={geoName
                      ? `${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)} — open in Google Maps`
                      : 'Open in Google Maps'}
                  >
                    {geoName ?? `${geo.latitude.toFixed(4)}, ${geo.longitude.toFixed(4)}`}
                  </a>
                </>
              )}
            </span>
            {geoState !== 'unsupported' && (
              <button
                type="button"
                onClick={() => void refreshGeo()}
                className="text-primary hover:underline disabled:opacity-50"
                disabled={geoState === 'pending'}
              >
                {geoState === 'pending'
                  ? 'Refreshing…'
                  : geoState === 'denied'
                    ? 'Enable location'
                    : geoState === 'timeout' || geoState === 'unavailable'
                      ? 'Try again'
                      : 'Refresh'}
              </button>
            )}
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

// ─── Helpers used only by TimelineView ──────────────────────────────────────

/**
 * Format hours-worked in a compact human-friendly form ("5h 17m") instead
 * of the HH:MM:SS the API helper returns. HR doesn't read milliseconds —
 * counting seconds on attendance is noise.
 */
function formatHrsCompact(
    rawHrs: string | null | undefined,
    checkIn: string | null | undefined,
    checkOut: string | null | undefined,
): string {
    const raw = formatHoursWorked(rawHrs, checkIn, checkOut)
    const m = raw.match(/^(\d+):(\d{2}):(\d{2})$/)
    if (!m) return raw
    const h = Number(m[1])
    const mm = Number(m[2])
    if (h === 0 && mm === 0) return '—'
    if (h === 0) return `${mm}m`
    return `${h}h ${String(mm).padStart(2, '0')}m`
}

/** Convert an ISO timestamp to a percentage along the 8 AM → 7 PM scale. */
function timeToPct(iso: string | null | undefined, startMin: number, span: number): number | null {
    if (!iso) return null
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return null
    const mins = d.getHours() * 60 + d.getMinutes()
    const pct = ((mins - startMin) / span) * 100
    // Clamp to [0, 100] so a punch that lands outside the visible scale
    // (e.g. an early-morning 7:30 AM check-in) still anchors to the edge
    // rather than disappearing off-screen.
    return Math.max(0, Math.min(100, pct))
}

/**
 * Weekly attendance timeline. Each row is one day with:
 *   • Day badge with "TODAY" indicator + left-edge primary stripe
 *   • In/Out times in the corners
 *   • Hours-worked counter in the right gutter
 *   • A horizontal scale (8 AM → 7 PM) with:
 *       – a soft "shift band" (9–6 by default) so HR can see late /
 *         early-out at a glance against the expected window
 *       – arrow icon-pills at the actual punch positions (hover for the
 *         exact time + location)
 *       – a centred status pill (Present / Late / Absent / On leave …)
 *         pulled straight from the legend's tone so what you see here
 *         matches what you see in the calendar.
 *
 * The previous version had three problems HR repeatedly flagged:
 *   1. Empty past weekdays looked identical to future days (both showed
 *      just "—"). HR couldn't tell absent from "haven't worked yet".
 *   2. The "Early out" pill didn't match any code in the legend
 *      popover — users couldn't reconcile what they saw here with what
 *      the rest of the app called it.
 *   3. Hours read "5:17:43" — minutes precision is plenty.
 * All three are addressed below.
 */
function TimelineView({ days, onPick, today }: { days: DayInfo[]; onPick: (d: DayInfo) => void; today: Date }) {
    const startMin = 8 * 60
    const endMin = 19 * 60
    const span = endMin - startMin

    // 9-to-6 expected shift band. Anchored as a percentage of the visible
    // scale so the rectangle slides with the row width.
    const shiftStartPct = ((9 * 60) - startMin) / span * 100
    const shiftEndPct = ((18 * 60) - startMin) / span * 100

    const slots: string[] = []
    for (let m = startMin; m <= endMin; m += 60) {
        const h = Math.floor(m / 60)
        const label = h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`
        slots.push(label)
    }

    const isToday = (d: Date) =>
        d.getFullYear() === today.getFullYear()
        && d.getMonth() === today.getMonth()
        && d.getDate() === today.getDate()

    return (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            {days.map((d) => {
                const tone = statusTone(d.classification)
                const checkInPct = timeToPct(d.cell?.checkIn, startMin, span)
                const checkOutPct = timeToPct(d.cell?.checkOut, startMin, span)
                const todayRow = isToday(d.date)
                const statusText = statusLabel(d.classification)

                return (
                    <button
                        key={d.iso}
                        type="button"
                        onClick={() => onPick(d)}
                        className={cn(
                            'relative group grid grid-cols-[3.75rem_5.5rem_1fr_5.5rem_5rem] sm:grid-cols-[4.5rem_6.5rem_1fr_6.5rem_5.5rem] items-center gap-2 sm:gap-3 px-3 py-3 border-b last:border-b-0 transition-colors text-left w-full',
                            todayRow ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-muted/30',
                        )}
                    >
                        {/* Today's row gets a left-edge accent stripe so the
                            current day pops without flooding the row with
                            colour. Replaces the old faint blue tint that was
                            easy to miss. */}
                        {todayRow && (
                            <span className="absolute left-0 inset-y-2 w-1 rounded-full bg-primary" aria-hidden />
                        )}

                        {/* ── Day badge ────────────────────────────────── */}
                        <div className="min-w-0">
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{d.label.weekday}</p>
                            <div className="flex items-center gap-1.5">
                                <p className={cn('text-base font-bold tabular-nums', todayRow && 'text-primary')}>
                                    {d.label.day}
                                </p>
                                {todayRow && (
                                    <span className="text-[9px] font-semibold uppercase tracking-wider text-primary/80 bg-primary/15 px-1 py-px rounded">
                                        Today
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* ── In time ─────────────────────────────────── */}
                        <div className="text-left">
                            {d.cell?.checkIn ? (
                                <>
                                    <p className="text-[10px] uppercase tracking-wider text-emerald-700/80 dark:text-emerald-400/80 font-medium">In</p>
                                    <p className="text-sm font-semibold tabular-nums">{formatTime(d.cell.checkIn)}</p>
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground">–</p>
                            )}
                        </div>

                        {/* ── Timeline ────────────────────────────────── */}
                        <div className="relative h-6 mx-1">
                            {/* Shift band — faint background rectangle marking
                                the expected 9 AM → 6 PM window. Punches that
                                fall inside the band visually look "on time";
                                punches outside it draw attention. */}
                            <div
                                className="absolute top-1/2 -translate-y-1/2 h-3 rounded-sm bg-muted/60 dark:bg-muted/30"
                                style={{ left: `${shiftStartPct}%`, right: `${100 - shiftEndPct}%` }}
                                aria-hidden
                            />
                            {/* Base connecting line */}
                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border" aria-hidden />

                            {/* Status pill — the centred label. Uses the
                                classification tone so what reads here lines up
                                with the legend popover. */}
                            {d.classification !== 'future' && (
                                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center pointer-events-none">
                                    <span className={cn(
                                        'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap',
                                        tone.pill,
                                    )}>
                                        {statusText || '–'}
                                    </span>
                                </div>
                            )}

                            {/* Punch chips with arrow icons + tooltip. The
                                tooltip carries the precise time + location so
                                hover gives HR everything without opening the
                                detail dialog. */}
                            {checkInPct != null && d.cell?.checkIn && (
                                <span
                                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 inline-flex items-center justify-center size-4 rounded-full bg-emerald-500 ring-2 ring-background shadow-sm text-white"
                                    style={{ left: `${checkInPct}%` }}
                                    title={`Check-in at ${formatTime(d.cell.checkIn)}`}
                                >
                                    <LogIn className="size-2.5" aria-hidden />
                                </span>
                            )}
                            {checkOutPct != null && d.cell?.checkOut && (
                                <span
                                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-10 inline-flex items-center justify-center size-4 rounded-full bg-rose-500 ring-2 ring-background shadow-sm text-white"
                                    style={{ left: `${checkOutPct}%` }}
                                    title={`Check-out at ${formatTime(d.cell.checkOut)}`}
                                >
                                    <LogOut className="size-2.5" aria-hidden />
                                </span>
                            )}
                        </div>

                        {/* ── Out time ────────────────────────────────── */}
                        <div className="text-right">
                            {d.cell?.checkOut ? (
                                <>
                                    <p className="text-[10px] uppercase tracking-wider text-rose-700/80 dark:text-rose-400/80 font-medium">Out</p>
                                    <p className="text-sm font-semibold tabular-nums">{formatTime(d.cell.checkOut)}</p>
                                </>
                            ) : (
                                <p className="text-sm text-muted-foreground">–</p>
                            )}
                        </div>

                        {/* ── Hours worked (compact) ──────────────────── */}
                        <div className="text-right">
                            <p className="text-base font-bold tabular-nums">
                                {formatHrsCompact(d.cell?.hoursWorked, d.cell?.checkIn, d.cell?.checkOut)}
                            </p>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Hours</p>
                        </div>
                    </button>
                )
            })}

            {/* Slot axis — labels aligned with the timeline column above.
                The tiny vertical ticks at each hour give HR a visual anchor
                so they can read where a punch dot falls without squinting. */}
            <div className="grid grid-cols-[3.75rem_5.5rem_1fr_5.5rem_5rem] sm:grid-cols-[4.5rem_6.5rem_1fr_6.5rem_5.5rem] items-center gap-2 sm:gap-3 px-3 pt-1.5 pb-2 border-t bg-muted/30">
                <span />
                <span />
                <div className="relative h-4 mx-1">
                    <div className="absolute inset-x-0 top-0 flex justify-between text-[10px] text-muted-foreground">
                        {slots.map((s) => (
                            <span key={s} className="tabular-nums leading-none">{s}</span>
                        ))}
                    </div>
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
                <td className="px-4 py-2.5 tabular-nums">{d.cell?.checkIn ? formatHoursWorked(d.cell?.hoursWorked, d.cell?.checkIn, d.cell?.checkOut) : '—'}</td>
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

// ─── Punch action button — best-effort location tagging ──────────────────
//
// The long-standing "check-in not possible" bug was caused by a hard
// dependency on a working GPS fix: when the device couldn't resolve a
// location (slow GPS, indoor, desktop without GPS hardware, in-app
// webview quirks), the punch never went through. The proper fix is to
// treat location as a best-effort audit field, not a gate.
//
// Click behaviour:
//   1. Cached coords present (strip resolved) → submit immediately.
//   2. No cached coords → run a 20-sec high-accuracy `watchPosition`
//      acquisition. On success, submit with coords. On failure (any
//      reason: denied / timeout / unavailable / unsupported), submit
//      WITHOUT coords. The strip already tells the user what state
//      location is in — they explicitly clicked the button, we honour
//      that intent.
//
// Server-side: the portal punch endpoint now accepts null lat/lng
// (range-validates when present). Coordinates are stored on the
// audit row when available.
function PunchActionButton({
  isCheckedIn,
  liveTimer,
  geo,
  loading,
  onPunch,
}: {
  isCheckedIn: boolean
  liveTimer: string
  geo: { latitude: number; longitude: number } | null
  loading: boolean
  onPunch: (coords: { latitude: number; longitude: number } | null) => void
  /** Kept in the parent's API but no longer used here — the click path
   *  always runs its own high-accuracy acquisition. */
  onEnableLocation?: () => Promise<{ latitude: number; longitude: number } | null>
}) {
  // While the click-time acquisition is in flight we count up the seconds
  // so users see *something is happening*. A silent button that loads for
  // 15 seconds reads as "broken" — a counting label reads as "working
  // on it". After ~20s the acquisition resolves (success or timeout) and
  // either way we submit the punch.
  const [acquiring, setAcquiring] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!acquiring) return
    setElapsed(0)
    const id = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [acquiring])

  const label = isCheckedIn ? 'Check-out' : 'Check-in'
  const colorClass = isCheckedIn
    ? 'bg-rose-600 hover:bg-rose-700 text-white'
    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
  const Icon = isCheckedIn ? LogOut : LogIn

  // Click handling — location is *best-effort*, not required. The flow:
  //   1. Use cached coords from the strip when present (fast path).
  //   2. Otherwise fire a fresh acquireLocation('punch') — high accuracy,
  //      20-sec budget, streamed first fix.
  //   3. If the acquisition succeeds → tag the punch with coords.
  //      If it fails (denied / timeout / unavailable / unsupported) →
  //      still submit the punch with `coords = null` so attendance is
  //      recorded. The audit row carries no location, which HR can see
  //      in the punch detail. Backend allows it.
  //
  // This is the long-standing fix users have been waiting for — every
  // honest punch goes through, even on devices where GPS is unreliable
  // or unavailable. The old behaviour blocked check-in entirely on those
  // devices, which is what stranded HR for months.
  const handleClick = async () => {
    if (geo) {
      onPunch(geo)
      return
    }
    setAcquiring(true)
    try {
      const result = await acquireLocation({ purpose: 'punch' })
      if (result.ok) {
        onPunch({ latitude: result.coords.latitude, longitude: result.coords.longitude })
      } else {
        // Best-effort: submit without coords. The button is the user's
        // explicit intent to punch in; we don't second-guess that just
        // because the GPS chip didn't return in time. The UI strip
        // already showed the location state so the user knows what
        // will be recorded.
        onPunch(null)
      }
    } finally {
      setAcquiring(false)
    }
  }

  const buttonLabel = acquiring
    ? `Locking GPS… ${elapsed}s`
    : label
  const buttonSubLabel = acquiring ? 'Up to 20 seconds' : liveTimer

  return (
    <Button
      onClick={handleClick}
      loading={loading}
      disabled={acquiring || loading}
      className={colorClass}
    >
      <Icon className="size-4 me-2" />
      <div className="flex flex-col items-start leading-tight">
        <span className="text-xs">{buttonLabel}</span>
        <span className="text-xs tabular-nums">{buttonSubLabel}</span>
      </div>
    </Button>
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
            <p className="text-sm font-semibold tabular-nums mt-1">{totalHours || formatHoursWorked(cell?.hoursWorked, cell?.checkIn, cell?.checkOut)}</p>
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
  let totalSec = 0
  for (const p of pairs) {
    if (p.inPunch && p.outPunch) {
      totalSec += Math.max(
        0,
        Math.floor(
          (new Date(p.outPunch.recordedAt).getTime() - new Date(p.inPunch.recordedAt).getTime()) / 1000,
        ),
      )
    }
  }
  if (totalSec === 0) return ''
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
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

