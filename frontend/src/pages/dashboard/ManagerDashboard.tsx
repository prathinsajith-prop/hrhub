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
import { KpiCardCompact } from '@/components/ui/kpi-card'
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
const ATTENDANCE_ROWS: Array<{ field: keyof AttendanceSummary; label: string; cls: string }> = [
  { field: 'totalPresent',  label: 'Present',  cls: 'bg-success' },
  { field: 'totalAbsent',   label: 'Absent',   cls: 'bg-destructive' },
  { field: 'totalLate',     label: 'Late',     cls: 'bg-warning' },
  { field: 'totalWfh',      label: 'WFH',      cls: 'bg-info' },
  { field: 'totalOnLeave',  label: 'On Leave', cls: 'bg-muted-foreground' },
  { field: 'totalHalfDay',  label: 'Half Day', cls: 'bg-amber-500' },
]

export function ManagerDashboard() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const department = user?.department ?? ''

  // Scope leave and employee queries to this manager's department.
  // The backend also enforces this for dept_head regardless of what params are sent,
  // but passing it explicitly makes the query key stable and avoids a double-render.
  const { data: leaveData, isLoading: leaveLoading } = useLeaveRequests({ status: 'pending', department: department || undefined, limit: 10 })
  const { data: attendanceSummary, isLoading: attLoading } = useAttendanceSummary()
  const { data: employeesData, isLoading: empLoading } = useEmployees({ department: department || undefined, limit: 100 })
  const { data: onboarding, isLoading: onboardingLoading } = useOnboardingSummary()
  const approveLeave = useApproveLeave()

  const pendingLeave = (Array.isArray(leaveData?.data) ? leaveData.data : []) as LeaveRequest[]
  const employees = Array.isArray(employeesData?.data) ? employeesData.data : []
  const activeCount = employees.filter((e: { status?: string }) => e.status === 'active').length

  const today = new Date().toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <PageWrapper>
      <PageHeader
        title={`Good ${getTimeOfDay()}, ${user?.name?.split(' ')[0] ?? 'Manager'}`}
        description={`${department ? `${department} · ` : ''}${today}`}
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCardCompact
          label="Team Size"
          value={empLoading ? undefined : employees.length}
          icon={Users}
          color="blue"
          loading={empLoading}
          hint={empLoading ? undefined : `${activeCount} active`}
        />
        <KpiCardCompact
          label="Pending Leave"
          value={leaveLoading ? undefined : pendingLeave.length}
          icon={CalendarCheck}
          color={pendingLeave.length > 0 ? 'amber' : 'green'}
          loading={leaveLoading}
          hint="Awaiting approval"
        />
        <KpiCardCompact
          label="Onboarding"
          value={onboardingLoading ? undefined : onboarding?.active ?? 0}
          icon={ClipboardList}
          color="purple"
          loading={onboardingLoading}
          hint={onboarding?.overdue ? `${onboarding.overdue} overdue` : 'Active checklists'}
        />
        <KpiCardCompact
          label="This Month Present"
          value={attLoading ? undefined : attendanceSummary?.totalPresent ?? '—'}
          icon={UserCheck}
          color="green"
          loading={attLoading}
          hint={attLoading ? undefined : `${attendanceSummary?.totalAbsent ?? 0} absent`}
        />
      </div>

      {/* Overdue onboarding warning */}
      {!onboardingLoading && (onboarding?.overdue ?? 0) > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-warning/30 bg-warning/8 px-4 py-3 animate-fade-fast">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <p className="text-sm text-warning-foreground flex-1">
            <span className="font-semibold">{onboarding!.overdue} overdue onboarding step{onboarding!.overdue > 1 ? 's' : ''}</span>
            {' '}— action required to keep new hires on track.
          </p>
          <Button size="sm" variant="ghost" className="text-warning-foreground h-auto px-2 py-1 text-xs shrink-0" onClick={() => navigate('/onboarding')}>
            Review <ArrowUpRight className="h-3 w-3 ml-1" />
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
                <CardTitle>Leave Requests</CardTitle>
                <CardDescription>Pending your approval</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-primary h-auto px-2 py-1 text-xs" onClick={() => navigate('/leave')}>
                View all <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {leaveLoading ? (
              <SkeletonRows count={4} />
            ) : pendingLeave.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="h-8 w-8 text-success/60 mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">All caught up</p>
                <p className="text-xs text-muted-foreground mt-0.5">No leave requests pending approval</p>
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
                        <p className="text-sm font-semibold text-foreground truncate">{name}</p>
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
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          onClick={() => approveLeave.mutate({ id: req.id, approved: false })}
                          disabled={approveLeave.isPending}
                        >
                          <XCircle className="h-3 w-3 mr-1" /> Decline
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
                <CardTitle>Today's Attendance</CardTitle>
                <CardDescription>
                  {attLoading ? ' ' : new Date().toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-primary h-auto px-2 py-1 text-xs" onClick={() => navigate('/attendance')}>
                Full report <ArrowUpRight className="h-3 w-3 ml-1" />
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
                    {ATTENDANCE_ROWS.map(({ field, label, cls }) => {
                      const count = attendanceSummary[field] as number ?? 0
                      if (count === 0) return null
                      const pct = Math.round((count / total) * 100)
                      return (
                        <div key={field} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-muted-foreground font-medium">{label}</span>
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
              <p className="text-xs text-muted-foreground text-center py-6">No attendance data this month</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <SectionHeading title="Quick Actions" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <QuickAction icon={CalendarCheck} label="Leave Requests" onClick={() => navigate('/leave')} />
          <QuickAction icon={Users} label="My Team" onClick={() => navigate('/employees')} />
          <QuickAction icon={CalendarDays} label="Attendance" onClick={() => navigate('/attendance')} />
          <QuickAction icon={BarChart3} label="Performance" onClick={() => navigate('/performance')} />
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
