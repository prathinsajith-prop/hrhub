import React, { useState } from 'react'
import { labelFor } from '@/lib/enums'
import {
  Users, Briefcase, FileText, AlertTriangle, TrendingUp,
  ArrowUpRight, CheckCircle2, Plane, Cake, Award,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Area, AreaChart, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import type { KpiColor } from '@/components/shared/KpiCard'
import { EmployeeLink } from '@/components/shared/EmployeeLink'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { useDashboardSummary, useNotifications, useAnniversaries } from '@/hooks/useDashboard'
import { useOrgPolicy } from '@/hooks/useSettings'
import type { BirthdayEntry, AnniversaryEntry, BreakdownPoint } from '@/hooks/useDashboard'
import { useVisas } from '@/hooks/useVisa'
import { useNavigate } from 'react-router-dom'
import { CHART_COLORS, NAT_FILLS, tooltipStyle } from './_shared'

function buildMonthNames(locale: string) {
  return Array.from({ length: 12 }, (_, i) =>
    new Date(2000, i, 1).toLocaleString(locale, { month: 'long' })
  )
}

// ─── KPI card config ──────────────────────────────────────────────────────────
const kpiCards: Array<{
  labelKey: string; labelFallback: string
  key: string; subKey: string; subFallback: string
  icon: React.ElementType; color: KpiColor
}> = [
  { labelKey: 'dashboard.totalEmployees', labelFallback: 'Total Employees', key: 'totalEmployees', subKey: 'dashboard.subActiveWorkforce', subFallback: 'Active workforce', icon: Users, color: 'blue' },
  { labelKey: 'dashboard.activeVisas', labelFallback: 'Active Visas', key: 'activeVisas', subKey: 'dashboard.subProcessingNow', subFallback: 'Processing now', icon: Plane, color: 'cyan' },
  { labelKey: 'dashboard.openJobs', labelFallback: 'Open Jobs', key: 'openJobs', subKey: 'dashboard.subInPipeline', subFallback: 'In pipeline', icon: Briefcase, color: 'amber' },
  { labelKey: 'dashboard.expiringVisas', labelFallback: 'Expiring Visas', key: 'expiringVisas', subKey: 'dashboard.subNext90Days', subFallback: 'Next 90 days', icon: FileText, color: 'red' },
  { labelKey: 'dashboard.pendingLeave', labelFallback: 'Pending Leave', key: 'pendingLeave', subKey: 'dashboard.subAwaitingApproval', subFallback: 'Awaiting approval', icon: CheckCircle2, color: 'green' },
]

// ─── Reusable demographic pie card ───────────────────────────────────────────
function DemoPieCard({ title, data, loading }: { title: string; data: BreakdownPoint[]; loading: boolean }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-[140px] w-full rounded-xl" />
            {[1, 2, 3].map(i => <Skeleton key={`skeleton-${i}`} className="h-3 w-full" />)}
          </div>
        ) : (
          <>
            <div className="flex justify-center mb-3">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={data} cx="50%" cy="50%" innerRadius={44} outerRadius={66} paddingAngle={3} dataKey="value">
                    {data.map((d) => <Cell key={d.name} fill={d.color} stroke="none" />)}
                  </Pie>
                  <Tooltip formatter={(v) => [v, 'Employees']} contentStyle={tooltipStyle} />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span style={{ fontSize: 12 }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-2">
              {data.map(d => (
                <li key={d.name} className="flex items-center gap-2 text-xs">
                  <span className="size-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="flex-1 text-foreground">{d.name}</span>
                  <span className="font-semibold">{d.value}</span>
                  {total > 0 && <span className="text-muted-foreground w-9 text-right">{Math.round((d.value / total) * 100)}%</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── HR / Super-admin dashboard ───────────────────────────────────────────────
export function HRDashboard() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const { data: summary, isLoading: dashLoading } = useDashboardSummary()
  const { data: notifications } = useNotifications(20)
  const { data: visaData, isLoading: visasLoading } = useVisas({ limit: 10 })
  // Organization Policy gates the birthday and anniversary widgets — when
  // HR turns the toggle off in Settings → Organization Policy, the widget
  // disappears from the dashboard entirely (backend also returns []).
  const { data: orgPolicy } = useOrgPolicy()
  const showBirthdayWidget = orgPolicy?.privacyPolicy.showBirthday ?? true
  const showAnniversaryWidget = orgPolicy?.privacyPolicy.showWorkAnniversary ?? true

  const currentMonth = new Date().getMonth() + 1
  // Birthday picker was removed (we only show today's). Anniversary still
  // supports month selection.
  const [anniversaryMonth, setAnniversaryMonth] = useState(currentMonth)
  const monthNames = buildMonthNames(i18n.language)

  // Anniversary's dedicated endpoint is still needed when HR picks a non-current month.
  const useAnniversaryDedicated = anniversaryMonth !== currentMonth
  const { data: anniversariesDedicated, isLoading: annivLoading } = useAnniversaries(useAnniversaryDedicated ? anniversaryMonth : undefined)

  const kpis = summary?.kpis
  const payrollTrendRaw = summary?.payrollTrend
  const nationalityRaw = summary?.nationalityBreakdown
  const deptRaw = summary?.deptHeadcount
  const emiratisation = summary?.emiratisation
  const onboardingSummary = summary?.onboardingSummary

  const kpisLoading = dashLoading
  const trendLoading = dashLoading
  const natLoading = dashLoading
  const deptLoading = dashLoading
  const emirLoading = dashLoading
  const onboardingLoading = dashLoading

  const payrollTrend = payrollTrendRaw ?? []
  const nationalityData = (nationalityRaw ?? []).map((d, i) => ({ ...d, fill: NAT_FILLS[i] ?? CHART_COLORS.muted }))
  const departmentData = deptRaw ?? []
  const genderData: BreakdownPoint[] = (summary?.genderBreakdown ?? []).map(d => ({
    ...d,
    name: t(`employee.genderValues.${d.name || 'unknown'}`, { defaultValue: d.name || 'Not specified' }),
  }))
  const maritalData: BreakdownPoint[] = (summary?.maritalBreakdown ?? []).map(d => ({
    ...d,
    name: t(`employee.maritalValues.${d.name || 'unknown'}`, { defaultValue: d.name || 'Not specified' }),
  }))
  // Birthdays always come from the BFF summary (current month) — we filter
  // client-side to today's only in the render block below.
  const birthdayData: BirthdayEntry[] = summary?.birthdays ?? []
  const anniversaryData: AnniversaryEntry[] = useAnniversaryDedicated ? (anniversariesDedicated ?? []) : (summary?.anniversaries ?? [])
  const bdLoadingFinal = dashLoading
  const annivLoadingFinal = useAnniversaryDedicated ? annivLoading : dashLoading

  type NotifItem = { isRead?: boolean; type?: string; title?: string }
  const urgentAlerts = ((notifications as NotifItem[] | undefined) ?? []).filter(n => !n.isRead && (n.type === 'warning' || n.type === 'error'))

  type VisaItem = { id?: string; employeeId?: string; employee?: { firstName?: string; lastName?: string }; employeeName?: string; visaType?: string; urgencyLevel?: string; totalSteps?: number; currentStep?: number }
  const visaList = (visaData?.data as VisaItem[] | undefined) ?? []
  const totalNat = nationalityData.reduce((a, d) => a + d.value, 0)

  return (
    <PageWrapper>
      <PageHeader title={t('dashboard.title')} description={t('dashboard.description')} />

      {/* Urgent alerts */}
      {urgentAlerts.length > 0 && (
        <div role="status" className="flex items-center gap-3 px-4 py-3 rounded-xl border border-warning/30 bg-warning/10 animate-fade-fast">
          <AlertTriangle className="size-4 text-warning shrink-0" />
          <p className="text-sm text-warning-foreground flex-1" dir="auto">
            <span className="font-semibold">
              {t('dashboard.alertsRequired', { count: urgentAlerts.length, defaultValue: `${urgentAlerts.length} action${urgentAlerts.length > 1 ? 's' : ''} required:` })}
            </span>
            {' '}<span dir="auto">{urgentAlerts[0]?.title}</span>
            {urgentAlerts.length > 1 && (
              <span className="text-warning-foreground/80">
                {' '}{t('dashboard.alertsMore', { count: urgentAlerts.length - 1, defaultValue: `and ${urgentAlerts.length - 1} more` })}
              </span>
            )}
          </p>
          <button onClick={() => navigate('/visa')} className="ms-auto text-xs font-medium text-warning-foreground hover:underline shrink-0">
            {t('common.viewAll', { defaultValue: 'View all' })}
          </button>
        </div>
      )}

      {/* KPI Cards — five tiles.
          The previous `grid-cols-2 md:grid-cols-3 xl:grid-cols-5` left the
          5th card orphaned on its own row at md/lg (768-1280px, the most
          common laptop width). The lg:grid-cols-5 step keeps all five
          tiles on one row above 1024px; below that, two evenly-balanced
          rows (2+3 on sm, 2+2+1 → 3+2 on md) read better than 3+2 with a
          half-width stub. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {kpiCards.map(({ labelKey, labelFallback, key, subKey, subFallback, icon, color }) => (
          <KpiCardCompact
            key={key}
            label={t(labelKey, { defaultValue: labelFallback })}
            value={((kpis as unknown as Record<string, string | number | null | undefined>)?.[key]) ?? '—'}
            hint={t(subKey, { defaultValue: subFallback })}
            icon={icon}
            color={color}
            loading={kpisLoading}
          />
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Payroll trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>{t('dashboard.payrollTrend', { defaultValue: 'Payroll Cost Trend' })}</CardTitle>
                <CardDescription>{t('dashboard.payrollTrendDesc', { defaultValue: 'Monthly total payroll in AED millions' })}</CardDescription>
              </div>
              <div className="text-right">
                {trendLoading ? <Skeleton className="h-7 w-24" /> : (
                  <p className="text-xl font-bold font-display">
                    {payrollTrend.length > 0 ? `AED ${payrollTrend[payrollTrend.length - 1].amount}M` : '—'}
                  </p>
                )}
                <p className="text-[11px] text-success font-medium flex items-center gap-1 justify-end">
                  <TrendingUp className="size-3" /> {t('dashboard.latestMonth', { defaultValue: 'Latest month' })}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {trendLoading ? (
              <div className="h-[220px] flex flex-col gap-3 pt-4">
                {[100, 83, 67, 83, 100, 67].map((w, i) => <Skeleton key={`skeleton-${i}`} className="h-3 rounded" style={{ width: `${w}%` }} />)}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={payrollTrend} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="payrollGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} tickFormatter={v => `${v}M`} />
                  <Tooltip formatter={(v: string | number | readonly (string | number)[] | undefined) => [`AED ${v}M`, 'Payroll']} contentStyle={tooltipStyle} cursor={{ stroke: CHART_COLORS.primary, strokeWidth: 1, strokeDasharray: '3 3' }} />
                  <Area type="monotone" dataKey="amount" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#payrollGrad)" dot={{ r: 3, fill: 'hsl(var(--card))', stroke: CHART_COLORS.primary, strokeWidth: 2 }} activeDot={{ r: 5, fill: CHART_COLORS.primary }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Nationality donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t('dashboard.workforceNationality', { defaultValue: 'Workforce Nationality' })}</CardTitle>
            <CardDescription>{natLoading ? ' ' : t('dashboard.totalEmployeesCount', { count: totalNat, defaultValue: `${totalNat} total employees` })}</CardDescription>
          </CardHeader>
          <CardContent>
            {natLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-[140px] w-full rounded-xl" />
                {[1, 2, 3].map(i => <Skeleton key={`skeleton-${i}`} className="h-3 w-full" />)}
              </div>
            ) : (
              <>
                <div className="flex justify-center mb-3">
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie data={nationalityData} cx="50%" cy="50%" innerRadius={42} outerRadius={64} paddingAngle={3} dataKey="value">
                        {nationalityData.map((entry, i) => <Cell key={`cell-${i}`} fill={entry.fill} stroke="none" />)}
                      </Pie>
                      <Tooltip formatter={(v: string | number | readonly (string | number)[] | undefined) => [v, 'Employees']} contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-2">
                  {nationalityData.map(d => (
                    <li key={d.name} className="flex items-center gap-2 text-xs">
                      <span className="size-2.5 rounded-full shrink-0" style={{ background: d.fill }} />
                      <span className="flex-1 text-foreground">{d.name}</span>
                      <span className="font-semibold">{d.value}</span>
                      <span className="text-muted-foreground w-8 text-right">{Math.round((d.value / totalNat) * 100)}%</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Dept headcount bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t('dashboard.headcountByDept', { defaultValue: 'Headcount by Department' })}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {deptLoading ? (
              <div className="space-y-3 pt-2">
                {[80, 60, 45, 70, 55, 40].map((w, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-3 w-16 shrink-0" />
                    <Skeleton className="h-4 rounded" style={{ width: `${w}%` }} />
                  </div>
                ))}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={departmentData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="dept" type="category" tick={{ fontSize: 11, fill: CHART_COLORS.axis }} axisLine={false} tickLine={false} width={72} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={14}>
                    {departmentData.map((_, i) => <Cell key={`cell-${i}`} fill={i === 0 ? CHART_COLORS.primary : 'hsl(var(--primary) / 0.25)'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Visa pipeline */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t('dashboard.activeVisaCases', { defaultValue: 'Active Visa Cases' })}</CardTitle>
                <CardDescription>{t('dashboard.currentProcessingStatus', { defaultValue: 'Current processing status' })}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-primary h-auto px-2 py-1 text-xs" onClick={() => navigate('/visa')}>
                View all <ArrowUpRight className="size-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5 pt-0">
            {visasLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between"><Skeleton className="h-3 w-28" /><Skeleton className="h-4 w-14 rounded-full" /></div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))
            ) : (
              <>
                {visaList.slice(0, 5).map((v) => {
                  const name = v.employee
                    ? `${v.employee.firstName ?? ''} ${v.employee.lastName ?? ''}`.trim()
                    : v.employeeName ?? 'Unknown'
                  const pct = v.totalSteps ? Math.round(((v.currentStep ?? 0) / v.totalSteps) * 100) : 0
                  const barClass = v.urgencyLevel === 'critical' ? 'bg-destructive' : v.urgencyLevel === 'urgent' ? 'bg-warning' : 'bg-primary'
                  return (
                    <div key={v.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          {v.employeeId
                            ? <EmployeeLink id={v.employeeId} name={name} className="text-xs font-semibold" />
                            : <p className="text-xs font-semibold truncate">{name}</p>}
                          <p className="text-[10px] text-muted-foreground capitalize">{labelFor(v.visaType ?? '')}</p>
                        </div>
                        <Badge variant={v.urgencyLevel === 'critical' ? 'destructive' : v.urgencyLevel === 'urgent' ? 'warning' : 'info'} className="text-[10px] h-5 capitalize shrink-0">
                          {v.urgencyLevel}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={cn('h-full rounded-full transition-all', barClass)} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 w-8 text-right">{pct}%</span>
                      </div>
                    </div>
                  )
                })}
                {visaList.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">No active visa cases</p>}
              </>
            )}
          </CardContent>
        </Card>

        {/* Emiratisation */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t('dashboard.emiratisationStatus', { defaultValue: 'Emiratisation Status' })}</CardTitle>
            <CardDescription>{t('dashboard.mohreCompliance', { defaultValue: 'MOHRE compliance tracking' })}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            {emirLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-12 w-24 mx-auto rounded-xl" />
                <Skeleton className="h-2 w-full rounded-full" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{[1, 2, 3].map(i => <Skeleton key={`skeleton-${i}`} className="h-16 rounded-xl" />)}</div>
              </div>
            ) : (
              <>
                <div className="text-center pb-1">
                  <p className="text-4xl font-bold font-display">{emiratisation ? `${emiratisation.currentRatio}%` : '—'}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Current Emirati ratio</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Progress to {emiratisation?.targetRatio ?? 2}% target</span>
                    <span className="font-semibold">{emiratisation?.progress ?? 0}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', (emiratisation?.progress ?? 0) >= 100 ? 'bg-success' : 'bg-warning')}
                      style={{ width: `${Math.min(100, emiratisation?.progress ?? 0)}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2.5 rounded-xl bg-muted">
                    <p className="text-base font-bold text-success font-display">{emiratisation?.emiratis ?? 0}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Emiratis</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-muted">
                    <p className="text-base font-bold font-display">{emiratisation?.targetRatio ?? 2}%</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Target</p>
                  </div>
                  <div className={cn('p-2.5 rounded-xl', (emiratisation?.gap ?? 0) < 0 ? 'bg-destructive/10' : 'bg-success/10')}>
                    <p className={cn('text-base font-bold font-display', (emiratisation?.gap ?? 0) < 0 ? 'text-destructive' : 'text-success')}>
                      {emiratisation ? `${emiratisation.gap > 0 ? '+' : ''}${emiratisation.gap}%` : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Gap</p>
                  </div>
                </div>
                {emiratisation && emiratisation.gap < 0 && (
                  <div className="flex items-start gap-2 bg-warning/10 border border-warning/20 rounded-xl p-3">
                    <AlertTriangle className="size-3.5 text-warning shrink-0 mt-0.5" />
                    <p className="text-[11px] text-warning-foreground leading-relaxed">
                      Below {emiratisation.targetRatio}% target.{' '}
                      {emiratisation.required > 0 && `Hire ${emiratisation.required} more Emirati${emiratisation.required > 1 ? 's' : ''} to comply.`}{' '}
                      Penalty risk: AED 1,000/month per missing Emirati hire.
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Onboarding summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('dashboard.onboarding', { defaultValue: 'Onboarding' })}</CardTitle>
              <CardDescription>{t('dashboard.onboardingDesc', { defaultValue: 'Employee onboarding status' })}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-primary h-auto px-2 py-1 text-xs" onClick={() => navigate('/onboarding')}>
              View all <ArrowUpRight className="size-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {onboardingLoading ? (
            <div className="flex gap-4"><Skeleton className="h-16 flex-1 rounded-xl" /><Skeleton className="h-16 flex-1 rounded-xl" /></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 text-center">
                <p className="text-3xl font-bold font-display text-primary">{onboardingSummary?.active ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Active Checklists</p>
              </div>
              <div className={cn('rounded-xl border p-4 text-center', (onboardingSummary?.overdue ?? 0) > 0 ? 'bg-destructive/5 border-destructive/20' : 'bg-muted border-transparent')}>
                <p className={cn('text-3xl font-bold font-display', (onboardingSummary?.overdue ?? 0) > 0 ? 'text-destructive' : 'text-foreground')}>
                  {onboardingSummary?.overdue ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Overdue Steps</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Birthdays & Work Anniversaries — entire section hidden when BOTH
          Organization Policy toggles are off. Individual cards hide
          themselves below when their respective toggle is off. */}
      {(showBirthdayWidget || showAnniversaryWidget) && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Birthdays — today only.
            The dashboard summary endpoint returns the whole current month, so
            we filter client-side rather than re-fetching. The month picker
            was removed: HR asked for "today only" so a calendar picker is
            misleading. If they ever need a historical view, restore the
            picker + the dedicated /dashboard/birthdays?month=X path. */}
        {showBirthdayWidget && (() => {
          const todays = birthdayData.filter((b) => b.isToday)
          return (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Cake className="size-4 text-pink-500" />
                    <CardTitle>{t('dashboard.birthdaysToday', { defaultValue: "Today's birthdays" })}</CardTitle>
                  </div>
                  {todays.length > 0 && (
                    <span className="rounded-full bg-pink-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                      {todays.length} {todays.length === 1 ? 'person' : 'people'}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {bdLoadingFinal ? (
                  <div className="space-y-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={`skeleton-${i}`} className="h-9 w-full rounded-lg" />)}</div>
                ) : todays.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    {t('dashboard.noBirthdaysToday', { defaultValue: 'No birthdays today — check back tomorrow.' })}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {todays.map((b, i) => {
                      // Initials fallback when no avatar is on file. Two chars,
                      // first letters of first + last name.
                      const initials = b.name
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((s) => s[0]?.toUpperCase() ?? '')
                        .join('')
                      return (
                        <li
                          key={i}
                          className="flex items-center justify-between gap-3 rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 dark:border-pink-900/60 dark:bg-pink-950/30"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            {b.avatarUrl ? (
                              <img
                                src={b.avatarUrl}
                                alt={b.name}
                                className="size-10 shrink-0 rounded-full object-cover ring-2 ring-pink-300 dark:ring-pink-700"
                              />
                            ) : (
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-300 to-rose-300 text-sm font-bold text-pink-800 ring-2 ring-pink-200 dark:from-pink-900 dark:to-rose-900 dark:text-pink-100">
                                {initials || '?'}
                              </span>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{b.name}</p>
                              <p className="truncate text-[11px] text-muted-foreground">{b.department || '—'}</p>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-pink-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                            Today
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
          )
        })()}

        {/* Work Anniversaries */}
        {showAnniversaryWidget && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Award className="size-4 text-amber-500" />
                <CardTitle>{t('dashboard.workAnniversaries', { defaultValue: 'Years Completed' })}</CardTitle>
              </div>
              <Select value={String(anniversaryMonth)} onValueChange={v => setAnniversaryMonth(Number(v))}>
                <SelectTrigger className="h-7 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthNames.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)} className="text-xs">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {annivLoadingFinal ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={`skeleton-${i}`} className="h-9 w-full rounded-lg" />)}</div>
            ) : anniversaryData.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">{t('dashboard.noAnniversaries', { defaultValue: 'No anniversaries this month' })}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground">{t('dashboard.birthdayName', { defaultValue: 'Name' })}</th>
                      <th className="text-right py-2 px-3 font-medium text-muted-foreground">{t('dashboard.anniversaryJoiningYear', { defaultValue: 'Joining Year' })}</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">{t('dashboard.anniversaryYears', { defaultValue: 'Years' })}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anniversaryData.map((a, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="py-2.5 font-medium">{a.name}</td>
                        <td className="py-2.5 px-3 text-right text-muted-foreground">{a.joinYear}</td>
                        <td className="py-2.5 text-right">
                          <Badge variant="secondary" className="text-[10px] font-semibold">{a.years} yr{a.years !== 1 ? 's' : ''}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        )}
      </div>
      )}

      {/* Gender & Marital Status breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DemoPieCard
          title={t('dashboard.genderBreakdown', { defaultValue: 'Employees by Gender' })}
          data={genderData}
          loading={dashLoading}
        />
        <DemoPieCard
          title={t('dashboard.maritalBreakdown', { defaultValue: 'Employees by Marital Status' })}
          data={maritalData}
          loading={dashLoading}
        />
      </div>
    </PageWrapper>
  )
}
