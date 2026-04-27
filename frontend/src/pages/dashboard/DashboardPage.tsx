import React from 'react'
import {
  Users,
  Briefcase,
  FileText,
  AlertTriangle,
  TrendingUp,
  ArrowUpRight,
  CheckCircle2,
  Plane,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
} from 'recharts'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import type { KpiColor } from '@/components/ui/kpi-card'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { useDashboardKPIs, useNotifications, usePayrollTrend, useNationalityBreakdown, useDeptHeadcount, useEmiratisation, useOnboardingSummary } from '@/hooks/useDashboard'
import { useVisas } from '@/hooks/useVisa'
import { useNavigate } from 'react-router-dom'

/* Token-driven chart palette — keep chart colors in sync with globals.css. */
const CHART_COLORS = {
  primary: 'hsl(var(--primary))',
  info: 'hsl(var(--info))',
  accent: 'hsl(var(--accent))',
  success: 'hsl(var(--success))',
  destructive: 'hsl(var(--destructive))',
  muted: 'hsl(var(--muted-foreground) / 0.4)',
  grid: 'hsl(var(--border))',
  axis: 'hsl(var(--muted-foreground))',
}

// Chart fill palette: must stay in same order as backend NationalityBreakdown colors
const NAT_FILLS = [
  CHART_COLORS.primary,
  CHART_COLORS.success,
  CHART_COLORS.accent,
  CHART_COLORS.info,
  CHART_COLORS.muted,
]

const kpiCards: Array<{
  labelKey: string
  labelFallback: string
  key: string
  subKey: string
  subFallback: string
  icon: React.ElementType
  color: KpiColor
  change?: number
}> = [
    {
      labelKey: 'dashboard.totalEmployees',
      labelFallback: 'Total Employees',
      key: 'totalEmployees',
      subKey: 'dashboard.subActiveWorkforce',
      subFallback: 'Active workforce',
      icon: Users,
      color: 'blue',
      change: 1.2,
    },
    { labelKey: 'dashboard.activeVisas', labelFallback: 'Active Visas', key: 'activeVisas', subKey: 'dashboard.subProcessingNow', subFallback: 'Processing now', icon: Plane, color: 'cyan' },
    { labelKey: 'dashboard.openJobs', labelFallback: 'Open Jobs', key: 'openJobs', subKey: 'dashboard.subInPipeline', subFallback: 'In pipeline', icon: Briefcase, color: 'amber' },
    {
      labelKey: 'dashboard.expiringVisas',
      labelFallback: 'Expiring Visas',
      key: 'expiringVisas',
      subKey: 'dashboard.subNext90Days',
      subFallback: 'Next 90 days',
      icon: FileText,
      color: 'red',
    },
    {
      labelKey: 'dashboard.pendingLeave',
      labelFallback: 'Pending Leave',
      key: 'pendingLeave',
      subKey: 'dashboard.subAwaitingApproval',
      subFallback: 'Awaiting approval',
      icon: CheckCircle2,
      color: 'green',
    },
  ]

const tooltipStyle: React.CSSProperties = {
  borderRadius: 8,
  border: '1px solid hsl(var(--border))',
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  fontSize: 12,
  boxShadow: '0 4px 16px -4px hsl(var(--foreground) / 0.1)',
}

export function DashboardPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: kpis, isLoading: kpisLoading } = useDashboardKPIs()
  const { data: notifications } = useNotifications(20)
  const { data: visaData, isLoading: visasLoading } = useVisas({ limit: 10 })
  const { data: payrollTrendRaw, isLoading: trendLoading } = usePayrollTrend()
  const { data: nationalityRaw, isLoading: natLoading } = useNationalityBreakdown()
  const { data: deptRaw, isLoading: deptLoading } = useDeptHeadcount()
  const { data: emiratisation, isLoading: emirLoading } = useEmiratisation()
  const { data: onboardingSummary, isLoading: onboardingLoading } = useOnboardingSummary()

  const payrollTrend = payrollTrendRaw ?? []
  const nationalityData = (nationalityRaw ?? []).map((d, i) => ({
    ...d,
    fill: NAT_FILLS[i] ?? CHART_COLORS.muted,
  }))
  const departmentData = deptRaw ?? []

  type NotifItem = { isRead?: boolean; type?: string; title?: string }
  const notifList = (notifications as NotifItem[] | undefined) ?? []
  const urgentAlerts = notifList.filter(
    (n) => !n.isRead && (n.type === 'warning' || n.type === 'error'),
  )
  type VisaItem = { id?: string; employee?: { firstName?: string; lastName?: string }; employeeName?: string; visaType?: string; urgencyLevel?: string; totalSteps?: number; currentStep?: number }
  const visaList = (visaData?.data as VisaItem[] | undefined) ?? []
  const totalNat = nationalityData.reduce((a, d) => a + d.value, 0)

  return (
    <PageWrapper>
      <PageHeader
        title={t('dashboard.title')}
        description={t('dashboard.description')}
      />

      {/* Urgent alerts banner */}
      {urgentAlerts.length > 0 && (
        <div
          role="status"
          className="flex items-center gap-3 px-4 py-3 rounded-xl border border-warning/30 bg-warning/10 animate-fade-fast"
        >
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <p className="text-sm text-warning-foreground" dir="auto">
            <span className="font-semibold">
              {t('dashboard.alertsRequired', { count: urgentAlerts.length, defaultValue: `${urgentAlerts.length} action${urgentAlerts.length > 1 ? 's' : ''} required:` })}
            </span>
            {' '}
            <span dir="auto">{urgentAlerts[0]?.title}</span>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
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
        {/* Payroll Area Chart */}
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
                    {payrollTrend.length > 0
                      ? `AED ${payrollTrend[payrollTrend.length - 1].amount}M`
                      : '—'}
                  </p>
                )}
                <p className="text-[11px] text-success font-medium flex items-center gap-1 justify-end">
                  <TrendingUp className="h-3 w-3" /> {t('dashboard.latestMonth', { defaultValue: 'Latest month' })}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {trendLoading ? (
              <div className="h-[220px] flex flex-col gap-3 pt-4">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-4/6" />
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/6" />
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
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v}M`}
                  />
                  <Tooltip
                    formatter={(v: string | number | readonly (string | number)[] | undefined) => [`AED ${v}M`, 'Payroll']}
                    contentStyle={tooltipStyle}
                    cursor={{ stroke: CHART_COLORS.primary, strokeWidth: 1, strokeDasharray: '3 3' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="amount"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    fill="url(#payrollGrad)"
                    dot={{ r: 3, fill: 'hsl(var(--card))', stroke: CHART_COLORS.primary, strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: CHART_COLORS.primary }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Nationality Donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>{t('dashboard.workforceNationality', { defaultValue: 'Workforce Nationality' })}</CardTitle>
            <CardDescription>{natLoading ? ' ' : t('dashboard.totalEmployeesCount', { count: totalNat, defaultValue: `${totalNat} total employees` })}</CardDescription>
          </CardHeader>
          <CardContent>
            {natLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-[140px] w-full rounded-xl" />
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-3 w-full" />)}
              </div>
            ) : (
              <>
                <div className="flex justify-center mb-3">
                  <ResponsiveContainer width="100%" height={140}>
                    <PieChart>
                      <Pie
                        data={nationalityData}
                        cx="50%"
                        cy="50%"
                        innerRadius={42}
                        outerRadius={64}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {nationalityData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: string | number | readonly (string | number)[] | undefined) => [v, 'Employees']} contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <ul className="space-y-2">
                  {nationalityData.map((d) => (
                    <li key={d.name} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ background: d.fill }}
                      />
                      <span className="flex-1 text-foreground">{d.name}</span>
                      <span className="font-semibold text-foreground">{d.value}</span>
                      <span className="text-muted-foreground w-8 text-right">
                        {Math.round((d.value / totalNat) * 100)}%
                      </span>
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
        {/* Department bar chart */}
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
                <BarChart
                  data={departmentData}
                  layout="vertical"
                  margin={{ left: 0, right: 8, top: 0, bottom: 0 }}
                >
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10, fill: CHART_COLORS.axis }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="dept"
                    type="category"
                    tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={14}>
                    {departmentData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={i === 0 ? CHART_COLORS.primary : 'hsl(var(--primary) / 0.25)'}
                      />
                    ))}
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
                View all
                <ArrowUpRight className="h-3 w-3 ml-1" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5 pt-0">
            {visasLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-4 w-14 rounded-full" />
                  </div>
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
                  const barClass =
                    v.urgencyLevel === 'critical'
                      ? 'bg-destructive'
                      : v.urgencyLevel === 'urgent'
                        ? 'bg-warning'
                        : 'bg-primary'
                  return (
                    <div key={v.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{name}</p>
                          <p className="text-[10px] text-muted-foreground capitalize">
                            {(v.visaType ?? '').replace(/_/g, ' ')}
                          </p>
                        </div>
                        <Badge
                          variant={
                            v.urgencyLevel === 'critical'
                              ? 'destructive'
                              : v.urgencyLevel === 'urgent'
                                ? 'warning'
                                : 'info'
                          }
                          className="text-[10px] h-5 capitalize shrink-0"
                        >
                          {v.urgencyLevel}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={cn('h-full rounded-full transition-all', barClass)}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0 w-8 text-right">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  )
                })}
                {visaList.length === 0 && !visasLoading && (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    No active visa cases
                  </p>
                )}
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
                <div className="grid grid-cols-3 gap-2">
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                  <Skeleton className="h-16 rounded-xl" />
                </div>
              </div>
            ) : (
              <>
                <div className="text-center pb-1">
                  <p className="text-4xl font-bold font-display text-foreground">
                    {emiratisation ? `${emiratisation.currentRatio}%` : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Current Emirati ratio</p>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Progress to {emiratisation?.targetRatio ?? 2}% target</span>
                    <span className="font-semibold">{emiratisation?.progress ?? 0}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all',
                        (emiratisation?.progress ?? 0) >= 100 ? 'bg-success' : 'bg-warning',
                      )}
                      style={{ width: `${Math.min(100, emiratisation?.progress ?? 0)}%` }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
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
                    <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
                    <p className="text-[11px] text-warning-foreground leading-relaxed">
                      Below {emiratisation.targetRatio}% target. {emiratisation.required > 0 && `Hire ${emiratisation.required} more Emirati${emiratisation.required > 1 ? 's' : ''} to comply.`} Penalty risk: AED 1,000/month per missing Emirati hire.
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Onboarding Summary */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('dashboard.onboarding', { defaultValue: 'Onboarding' })}</CardTitle>
              <CardDescription>{t('dashboard.onboardingDesc', { defaultValue: 'Employee onboarding status' })}</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-primary h-auto px-2 py-1 text-xs" onClick={() => navigate('/onboarding')}>
              View all
              <ArrowUpRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {onboardingLoading ? (
            <div className="flex gap-4">
              <Skeleton className="h-16 flex-1 rounded-xl" />
              <Skeleton className="h-16 flex-1 rounded-xl" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-primary/5 border border-primary/10 p-4 text-center">
                <p className="text-3xl font-bold font-display text-primary">{onboardingSummary?.active ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Active Checklists</p>
              </div>
              <div className={cn('rounded-xl border p-4 text-center',
                (onboardingSummary?.overdue ?? 0) > 0
                  ? 'bg-destructive/5 border-destructive/20'
                  : 'bg-muted border-transparent'
              )}>
                <p className={cn('text-3xl font-bold font-display',
                  (onboardingSummary?.overdue ?? 0) > 0 ? 'text-destructive' : 'text-foreground'
                )}>
                  {onboardingSummary?.overdue ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Overdue Steps</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  )
}
