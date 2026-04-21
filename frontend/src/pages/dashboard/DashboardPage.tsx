import React from 'react'
import {
  Users, Briefcase, FileText, AlertTriangle, TrendingUp, ArrowUpRight,
  Clock, CheckCircle2, Plane,
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, Area, AreaChart
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { KpiCard } from '@/components/ui/kpi-card'
import type { KpiColor } from '@/components/ui/kpi-card'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { cn, formatCurrency } from '@/lib/utils'
import { useDashboardKPIs, useNotifications } from '@/hooks/useDashboard'
import { useVisas } from '@/hooks/useVisa'

const payrollTrend = [
  { month: 'Nov', amount: 4.62 },
  { month: 'Dec', amount: 4.71 },
  { month: 'Jan', amount: 4.75 },
  { month: 'Feb', amount: 4.80 },
  { month: 'Mar', amount: 4.82 },
  { month: 'Apr', amount: 4.89 },
]

const nationalityData = [
  { name: 'Indian', value: 102, color: '#3b82f6' },
  { name: 'Emirati', value: 46, color: '#10b981' },
  { name: 'Filipino', value: 38, color: '#f59e0b' },
  { name: 'British', value: 22, color: '#8b5cf6' },
  { name: 'Others', value: 45, color: '#94a3b8' },
]

const departmentData = [
  { dept: 'Sales', count: 68 },
  { dept: 'Operations', count: 52 },
  { dept: 'Finance', count: 31 },
  { dept: 'Marketing', count: 24 },
  { dept: 'HR', count: 18 },
  { dept: 'IT', count: 15 },
  { dept: 'Legal', count: 12 },
]

const kpiCards: Array<{
  label: string
  key: string
  sub: string
  icon: React.ElementType
  color: KpiColor
  change?: number
}> = [
    { label: 'Total Employees', key: 'totalEmployees', sub: 'Active workforce', icon: Users, color: 'blue', change: 1.2 },
    { label: 'Active Visas', key: 'activeVisas', sub: 'Processing now', icon: Plane, color: 'purple' },
    { label: 'Open Jobs', key: 'openJobs', sub: 'In pipeline', icon: Briefcase, color: 'amber' },
    { label: 'Expiring Visas', key: 'expiringVisas', sub: 'Next 90 days', icon: FileText, color: 'red' },
    { label: 'Pending Leave', key: 'pendingLeave', sub: 'Awaiting approval', icon: CheckCircle2, color: 'green' },
  ]

const TooltipStyle = {
  borderRadius: 8,
  border: '1px solid hsl(220 13% 90%)',
  fontSize: 12,
  boxShadow: '0 4px 16px -4px rgb(0 0 0 / 0.1)',
}

export function DashboardPage() {
  const { data: kpis } = useDashboardKPIs()
  const { data: notifications } = useNotifications(20)
  const { data: visaData } = useVisas({ limit: 10 })

  const notifList = (notifications as any[]) ?? []
  const urgentAlerts = notifList.filter((n: any) => !n.isRead && (n.type === 'warning' || n.type === 'error'))
  const visaList = (visaData?.data as any[]) ?? []

  return (
    <PageWrapper>
      {/* ── Alert banner ── */}
      {urgentAlerts.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 animate-fade-fast">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{urgentAlerts.length} action{urgentAlerts.length > 1 ? 's' : ''} required: </span>
            {urgentAlerts[0]?.title}
            {urgentAlerts.length > 1 && <span className="text-amber-700"> and {urgentAlerts.length - 1} more</span>}
          </p>
          <button className="ml-auto text-xs font-medium text-amber-700 hover:text-amber-900 shrink-0 transition-colors">
            View all
          </button>
        </div>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map(({ label, key, sub, icon, color, change }) => (
          <KpiCard
            key={key}
            label={label}
            value={(kpis as any)?.[key]}
            sub={sub}
            icon={icon}
            color={color}
            trend={change}
          />
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Payroll Area Chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Payroll Cost Trend</CardTitle>
                <CardDescription>Monthly total payroll in AED millions</CardDescription>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold font-display">AED 4.89M</p>
                <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1 justify-end">
                  <TrendingUp className="h-3 w-3" /> +1.4% this month
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={payrollTrend} margin={{ top: 8, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="payrollGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 93%)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'hsl(220 10% 55%)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(220 10% 55%)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}M`} />
                <Tooltip
                  formatter={(v: any) => [`AED ${v}M`, 'Payroll']}
                  contentStyle={TooltipStyle}
                  cursor={{ stroke: '#3b82f6', strokeWidth: 1, strokeDasharray: '3 3' }}
                />
                <Area
                  type="monotone"
                  dataKey="amount"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  fill="url(#payrollGrad)"
                  dot={{ r: 3, fill: '#fff', stroke: '#3b82f6', strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: '#3b82f6' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Nationality Donut */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Workforce Nationality</CardTitle>
            <CardDescription>{nationalityData.reduce((a, d) => a + d.value, 0)} total employees</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center mb-3">
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie
                    data={nationalityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={38}
                    outerRadius={60}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {nationalityData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v, 'Employees']} contentStyle={TooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {nationalityData.map(d => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  <span className="flex-1 text-foreground">{d.name}</span>
                  <span className="font-semibold text-foreground">{d.value}</span>
                  <span className="text-muted-foreground w-8 text-right">
                    {Math.round(d.value / 253 * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Bottom row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Department bar chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Headcount by Department</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={departmentData} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(220 10% 55%)' }} axisLine={false} tickLine={false} />
                <YAxis dataKey="dept" type="category" tick={{ fontSize: 11, fill: 'hsl(220 10% 45%)' }} axisLine={false} tickLine={false} width={64} />
                <Tooltip contentStyle={TooltipStyle} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={14}>
                  {departmentData.map((_, i) => (
                    <Cell key={i} fill={i === 0 ? '#3b82f6' : '#bfdbfe'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Visa pipeline */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Active Visa Cases</CardTitle>
                <CardDescription>Current processing status</CardDescription>
              </div>
              <button className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 transition-colors">
                View all <ArrowUpRight className="h-3 w-3" />
              </button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3.5 pt-0">
            {visaList.slice(0, 5).map((v: any) => {
              const name = v.employee
                ? `${v.employee.firstName ?? ''} ${v.employee.lastName ?? ''}`.trim()
                : v.employeeName ?? 'Unknown'
              const pct = v.totalSteps ? Math.round((v.currentStep / v.totalSteps) * 100) : 0
              const barColor = v.urgencyLevel === 'critical' ? 'bg-red-500' : v.urgencyLevel === 'urgent' ? 'bg-amber-500' : 'bg-blue-500'
              return (
                <div key={v.id} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-foreground">{name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {(v.visaType ?? '').replace(/_/g, ' ')}
                      </p>
                    </div>
                    <Badge
                      variant={v.urgencyLevel === 'critical' ? 'destructive' : v.urgencyLevel === 'urgent' ? 'warning' : 'info'}
                      className="text-[10px] h-5"
                    >
                      {v.urgencyLevel}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 w-8 text-right">{pct}%</span>
                  </div>
                </div>
              )
            })}
            {visaList.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No active visa cases</p>
            )}
          </CardContent>
        </Card>

        {/* Emiratisation */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Emiratisation Status</CardTitle>
            <CardDescription>MOHRE compliance tracking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="text-center pb-1">
              <p className="text-4xl font-bold font-display">1.8%</p>
              <p className="text-xs text-muted-foreground mt-0.5">Current Emirati ratio</p>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Progress to 2% target</span>
                <span className="font-semibold">90%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: '90%' }} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-muted">
                <p className="text-base font-bold text-emerald-600 font-display">3</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Emiratis</p>
              </div>
              <div className="p-2.5 rounded-xl bg-muted">
                <p className="text-base font-bold font-display">2.0%</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Target</p>
              </div>
              <div className="p-2.5 rounded-xl bg-red-50">
                <p className="text-base font-bold text-red-600" style={{ fontFamily: 'var(--font-display)' }}>-0.2%</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">Gap</p>
              </div>
            </div>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl p-3">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Below 2% target. Penalty risk: AED 1,000/month per missing Emirati hire.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageWrapper>
  )
}
