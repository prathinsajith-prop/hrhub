import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
  Users, CalendarCheck, ClipboardList, BarChart3,
  CheckCircle2, XCircle, ArrowUpRight, UserCheck,
  AlertTriangle, CalendarDays,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn, formatDate } from '@/lib/utils'
import { labelFor } from '@/lib/enums'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { EmployeeLink } from '@/components/shared/EmployeeLink'
import { useAuthStore } from '@/store/authStore'
import { useLeaveRequests } from '@/hooks/useLeave'
import { useAttendanceSummary } from '@/hooks/useAttendance'
import { useEmployees } from '@/hooks/useEmployees'
import { useOnboardingSummary } from '@/hooks/useDashboard'
import { useApproveLeave } from '@/hooks/useLeave'
import { QuickAction, SectionHeading, SkeletonRows } from './_shared'

// ─── Types ────────────────────────────────────────────────────────────────────
interface LeaveRequest {
  id: string
  employeeId?: string
  employeeName?: string
  employee?: { firstName?: string; lastName?: string }
  leaveType: string
  startDate: string
  endDate: string
  days: number
  status: string
  reason?: string
}

import type { AttendanceSummary } from '@/hooks/useAttendance'

// ─── Attendance rows config — maps AttendanceSummary fields → display ─────────
const ATTENDANCE_ROWS: Array<{ field: keyof AttendanceSummary; labelKey: string; cls: string }> = [
  { field: 'totalPresent',  labelKey: 'dashboard.present',     cls: 'bg-success' },
  { field: 'totalAbsent',   labelKey: 'dashboard.absent',      cls: 'bg-destructive' },
  { field: 'totalLate',     labelKey: 'dashboard.late',        cls: 'bg-warning' },
  { field: 'totalWfh',      labelKey: 'dashboard.wfh',         cls: 'bg-info' },
  { field: 'totalOnLeave',  labelKey: 'dashboard.onLeaveLabel', cls: 'bg-muted-foreground' },
  { field: 'totalHalfDay',  labelKey: 'dashboard.halfDay',     cls: 'bg-amber-500' },
]

export function ManagerDashboard() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const department = user?.department ?? ''

  // Scope leave and employee queries to this manager's department.
  // The backend also enforces this for dept_head regardless of what params are sent,
  // but passing it explicitly makes the query key stable and avoids a double-render.
  const { data: leaveData, isLoading: leaveLoading } = useLeaveRequests({ filters: { status: { operator: 'equals', value: 'pending' } }, department: department || undefined, limit: 10 })
  const { data: attendanceSummary, isLoading: attLoading } = useAttendanceSummary()
  const { data: employeesData, isLoading: empLoading } = useEmployees({ department: department || undefined, status: 'active', limit: 1 })
  const { data: totalEmployeesData } = useEmployees({ department: department || undefined, limit: 1 })
  const { data: onboarding, isLoading: onboardingLoading } = useOnboardingSummary()
  const approveLeave = useApproveLeave()

  const pendingLeave = (Array.isArray(leaveData?.data) ? leaveData.data : []) as LeaveRequest[]
  const activeCount = employeesData?.total ?? 0
  const totalCount = totalEmployeesData?.total ?? 0

  const today = new Date().toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <PageWrapper>
      <PageHeader
        title={t(`dashboard.greeting_${getTimeOfDay()}`, { name: user?.name?.split(' ')[0] ?? t('dashboard.managerFallback') })}
        description={`${department ? `${department} · ` : ''}${today}`}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCardCompact
          label={t('dashboard.teamSize')}
          value={empLoading ? undefined : totalCount}
          icon={Users}
          color="blue"
          loading={empLoading}
          hint={empLoading ? undefined : t('dashboard.activeCount', { count: activeCount })}
        />
        <KpiCardCompact
          label={t('dashboard.pendingLeave')}
          value={leaveLoading ? undefined : pendingLeave.length}
          icon={CalendarCheck}
          color={pendingLeave.length > 0 ? 'amber' : 'green'}
          loading={leaveLoading}
          hint={t('dashboard.awaitingApproval')}
        />
        <KpiCardCompact
          label={t('dashboard.onboarding')}
          value={onboardingLoading ? undefined : onboarding?.active ?? 0}
          icon={ClipboardList}
          color="purple"
          loading={onboardingLoading}
          hint={onboarding?.overdue ? t('dashboard.overdueCount', { count: onboarding.overdue }) : t('dashboard.activeChecklists')}
        />
        <KpiCardCompact
          label={t('dashboard.thisMonthPresent')}
          value={attLoading ? undefined : attendanceSummary?.totalPresent ?? '—'}
          icon={UserCheck}
          color="green"
          loading={attLoading}
          hint={attLoading ? undefined : t('dashboard.absentCount', { count: attendanceSummary?.totalAbsent ?? 0 })}
        />
      </div>

      {/* Overdue onboarding warning */}
      {!onboardingLoading && (onboarding?.overdue ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/8 px-4 py-3 animate-fade-fast">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <p className="text-sm text-warning-foreground flex-1">
            {t('dashboard.overdueOnboardingWarning', { count: onboarding!.overdue })}
          </p>
          <Button size="sm" variant="ghost" className="text-warning-foreground h-auto px-2 py-1 text-xs shrink-0" onClick={() => navigate('/onboarding')}>
            {t('dashboard.review')} <ArrowUpRight className="h-3 w-3 ml-1" />
          </Button>
        </div>
      )}

      {/* Main content: leave queue + attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

        {/* Leave approval queue (wider) */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('dashboard.leaveRequests')}</CardTitle>
                <CardDescription>{t('dashboard.pendingYourApproval')}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-primary h-auto px-2 py-1 text-xs" onClick={() => navigate('/leave')}>
                {t('dashboard.viewAll')} <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {leaveLoading ? (
              <SkeletonRows count={4} />
            ) : pendingLeave.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-success/60 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">{t('dashboard.allCaughtUp')}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t('dashboard.noLeaveRequestsPending')}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {pendingLeave.map((req) => {
                  const name = req.employee
                    ? `${req.employee.firstName ?? ''} ${req.employee.lastName ?? ''}`.trim()
                    : req.employeeName ?? 'Unknown'
                  return (
                    <div key={req.id} className="flex items-start gap-3 py-3.5">
                      {/* Avatar placeholder */}
                      <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                        {name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        {req.employeeId
                          ? <EmployeeLink id={req.employeeId} name={name} className="text-sm font-semibold text-foreground truncate" />
                          : <p className="text-sm font-semibold text-foreground truncate">{name}</p>}
                        <p className="text-xs text-muted-foreground">
                          {labelFor(req.leaveType)} · {req.days} day{req.days !== 1 ? 's' : ''}
                        </p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDate(req.startDate)} – {formatDate(req.endDate)}
                        </p>
                      </div>
                      <div className="flex gap-1.5 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs text-success border-success/30 hover:bg-success/10"
                          onClick={() => approveLeave.mutate({ id: req.id, approved: true })}
                          disabled={approveLeave.isPending}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" /> {t('dashboard.approve')}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => approveLeave.mutate({ id: req.id, approved: false })}
                          disabled={approveLeave.isPending}
                        >
                          <XCircle className="h-3 w-3 mr-1" /> {t('dashboard.decline')}
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Attendance summary (narrower) */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('dashboard.todaysAttendance')}</CardTitle>
                <CardDescription>
                  {attLoading ? ' ' : new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-primary h-auto px-2 py-1 text-xs" onClick={() => navigate('/attendance')}>
                {t('dashboard.fullReport')} <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {attLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="flex items-center justify-between gap-3">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-1.5 flex-1 rounded-full" />
                    <Skeleton className="h-3 w-6" />
                  </div>
                ))}
              </div>
            ) : attendanceSummary ? (() => {
                const total = ATTENDANCE_ROWS.reduce((s, r) => s + (attendanceSummary[r.field] as number ?? 0), 0) || 1
                return (
                  <div className="space-y-3">
                    {ATTENDANCE_ROWS.map(({ field, labelKey, cls }) => {
                      const count = attendanceSummary[field] as number ?? 0
                      if (count === 0) return null
                      const pct = Math.round((count / total) * 100)
                      return (
                        <div key={field} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground font-medium">{t(labelKey)}</span>
                            <span className="font-bold tabular-figures text-foreground">{count}</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all', cls)} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })() : (
              <p className="text-xs text-muted-foreground text-center py-6">{t('dashboard.noAttendanceData')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <SectionHeading title={t('dashboard.quickActions')} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction icon={CalendarCheck} label={t('dashboard.leaveRequests')} onClick={() => navigate('/leave')} />
          <QuickAction icon={Users} label={t('dashboard.myTeam')} onClick={() => navigate('/employees')} />
          <QuickAction icon={CalendarDays} label={t('dashboard.attendance')} onClick={() => navigate('/attendance')} />
          <QuickAction icon={BarChart3} label={t('dashboard.performance')} onClick={() => navigate('/performance')} />
        </div>
      </div>
    </PageWrapper>
  )
}

function getTimeOfDay() {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}
