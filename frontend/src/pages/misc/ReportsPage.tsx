import { useMemo } from 'react'
import type { CellContext } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { labelFor } from '@/lib/enums'
import {
    Calendar, Clock, CheckCircle2, XCircle, Download, BarChart3, Users,
    Shield, AlertTriangle, UserPlus, UserMinus, PauseCircle, Receipt, TrendingUp, RefreshCcw,
    CalendarCheck, Plane, Timer, Hourglass, GitCommit, ClipboardCheck, Star, AlertOctagon,
} from 'lucide-react'
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/primitives'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useReportsSummary } from '@/hooks/useReports'
import { usePermissions } from '@/hooks/usePermissions'
import type {
    PayrollTrendRow, VisaExpiryEmployee,
    AttendanceByDepartment, AttendanceLeader,
    LeaveTopTaker,
    StalledChecklist, OnboardingByDepartment,
    PerformanceDeptRow, RecentReview,
} from '@/hooks/useReports'
import { COST_CATEGORY_LABELS } from '@/hooks/useVisaCosts'
import type { CostReportEmployee } from '@/hooks/useVisaCosts'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { applyClientFilters, type FilterConfig } from '@/lib/filters'
import { searchDepartments, searchNationalities } from '@/lib/filters/filter-loaders'
import { InitialsAvatar } from '@/components/shared/Avatar'
import { EmployeeLink } from '@/components/shared/EmployeeLink'

// ─── constants ────────────────────────────────────────────────────────────────

const URGENCY_COLORS: Record<string, string> = {
    expired: '#ef4444',
    critical: '#f97316',
    urgent: '#f59e0b',
    normal: '#10b981',
}

const PAYROLL_REPORT_FILTERS: FilterConfig[] = [
    { name: 'period', label: 'Period', type: 'text', field: 'period' },
    {
        name: 'status', label: 'Status', type: 'select', field: 'status',
        options: [
            { value: 'draft', label: 'Draft' },
            { value: 'approved', label: 'Approved' },
            { value: 'paid', label: 'Paid' },
        ],
    },
    { name: 'headcount', label: 'Employee count', type: 'number_range', field: 'headcount', min: 0 },
    { name: 'net', label: 'Net pay (AED)', type: 'number_range', field: 'net', min: 0, prefix: 'AED' },
    { name: 'gross', label: 'Gross pay (AED)', type: 'number_range', field: 'gross', min: 0, prefix: 'AED' },
]

const VISA_REPORT_FILTERS: FilterConfig[] = [
    { name: 'fullName', label: 'Employee name', type: 'text', field: 'fullName' },
    { name: 'department', label: 'Department', type: 'autocomplete', field: 'department', onSearch: searchDepartments, placeholder: 'Search departments…' },
    { name: 'nationality', label: 'Nationality', type: 'autocomplete', field: 'nationality', onSearch: searchNationalities, placeholder: 'Search nationalities…' },
    {
        name: 'urgency', label: 'Urgency', type: 'select', field: 'urgency',
        options: [
            { value: 'expired', label: 'Expired' },
            { value: 'critical', label: 'Critical' },
            { value: 'urgent', label: 'Urgent' },
            { value: 'normal', label: 'Normal' },
        ],
    },
    { name: 'visaExpiry', label: 'Visa expiry', type: 'date_range', field: 'visaExpiry' },
    { name: 'daysLeft', label: 'Days remaining', type: 'number_range', field: 'daysLeft', min: -9999, max: 365 },
    { name: 'visaType', label: 'Visa type', type: 'text', field: 'visaType' },
]

const EMPLOYEE_STATUS_META: Record<
    string,
    { variant: 'success' | 'warning' | 'destructive' | 'info' | 'secondary'; Icon: typeof CheckCircle2; color: string }
> = {
    active:      { variant: 'success',     Icon: CheckCircle2,  color: '#10b981' },
    probation:   { variant: 'warning',     Icon: Clock,         color: '#f59e0b' },
    onboarding:  { variant: 'info',        Icon: UserPlus,      color: '#3b82f6' },
    suspended:   { variant: 'destructive', Icon: PauseCircle,   color: '#ef4444' },
    terminated:  { variant: 'secondary',   Icon: UserMinus,     color: '#6b7280' },
    visa_expired: { variant: 'destructive', Icon: AlertTriangle, color: '#dc2626' },
}

// ─── Chart helpers ─────────────────────────────────────────────────────────────

function ChartSkeleton({ height = 200 }: { height?: number }) {
    return <Skeleton className="w-full rounded-xl" style={{ height }} />
}

function EmptyChart({ message = 'No data available' }: { message?: string }) {
    return (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">{message}</div>
    )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function ReportsPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { can } = usePermissions()
    const canViewPayroll = can('view_payroll')
    const canViewVisa = can('view_visa')

    const { data: reportsSummary, isLoading: summaryLoading, isFetching: summaryFetching, refetch: refetchSummary } = useReportsSummary(90)
    const headcount = reportsSummary?.headcount
    const payrollSummary = reportsSummary?.payrollSummary
    const visaExpiry = reportsSummary?.visaExpiry
    const proCosts = reportsSummary?.proCosts
    const attendanceSummary = reportsSummary?.attendanceSummary
    const leaveSummary = reportsSummary?.leaveSummary
    const turnover = reportsSummary?.turnover
    const onboarding = reportsSummary?.onboarding
    const performance = reportsSummary?.performance
    const isLoading = summaryLoading
    const isRefreshing = summaryFetching

    // ─── Permission gates for the new tabs ─────────────────────────────
    // No dedicated `view_attendance` / `view_leave` permission yet — fall
    // back to the `manage_*` versions every HR/PRO role already holds.
    // dept_head sees their subtree scoping server-side in the BFF.
    const canViewAttendance = can('manage_attendance')
    const canViewLeave = can('manage_leave')
    const canViewTurnover = can('view_employees')
    const canViewOnboarding = can('view_employees')
    const canViewPerformance = can('view_employees')

    const payrollSearch = useSearchFilters({
        storageKey: 'hrhub.reports.payroll.searchHistory',
        availableFilters: PAYROLL_REPORT_FILTERS,
    })
    const visaReportSearch = useSearchFilters({
        storageKey: 'hrhub.reports.visa.searchHistory',
        availableFilters: VISA_REPORT_FILTERS,
    })

    const payrollTrend = useMemo<PayrollTrendRow[]>(() => payrollSummary?.trend ?? [], [payrollSummary?.trend])
    const visaEmployees = useMemo<VisaExpiryEmployee[]>(() => visaExpiry?.employees ?? [], [visaExpiry?.employees])

    const payrollRows = useMemo(
        () => applyClientFilters(payrollTrend as unknown as Record<string, unknown>[], {
            searchInput: payrollSearch.searchInput,
            appliedFilters: payrollSearch.appliedFilters,
            searchFields: ['period', 'status'],
        }),
        [payrollTrend, payrollSearch.appliedFilters, payrollSearch.searchInput],
    )
    const visaReportRows = useMemo(
        () => applyClientFilters(visaEmployees as unknown as Record<string, unknown>[], {
            searchInput: visaReportSearch.searchInput,
            appliedFilters: visaReportSearch.appliedFilters,
            searchFields: ['fullName', 'employeeNo', 'department', 'visaType'],
        }),
        [visaEmployees, visaReportSearch.appliedFilters, visaReportSearch.searchInput],
    )

    // Derived chart data
    const deptChartData = useMemo(
        () => (headcount?.byDepartment ?? []).slice(0, 12).map(d => ({ name: d.label, count: d.count })),
        [headcount],
    )
    const statusPieData = useMemo(
        () => (headcount?.byStatus ?? []).map(s => ({
            name: labelFor(s.label),
            value: s.count,
            color: EMPLOYEE_STATUS_META[s.label]?.color ?? '#6b7280',
        })),
        [headcount],
    )
    const payrollAreaData = useMemo(
        () => payrollTrend.map(r => ({
            name: r.period,
            Gross: r.gross,
            Net: r.net,
            Deductions: r.deductions,
        })),
        [payrollTrend],
    )
    const visaUrgencyData = useMemo(() => [
        { name: 'Expired', value: visaExpiry?.expired ?? 0, color: URGENCY_COLORS.expired },
        { name: 'Critical', value: visaExpiry?.critical ?? 0, color: URGENCY_COLORS.critical },
        { name: 'Urgent', value: visaExpiry?.urgent ?? 0, color: URGENCY_COLORS.urgent },
        { name: 'Normal', value: visaExpiry?.normal ?? 0, color: URGENCY_COLORS.normal },
    ].filter(d => d.value > 0), [visaExpiry])
    const proCatData = useMemo(
        () => (proCosts?.byCategory ?? []).map(c => ({
            name: COST_CATEGORY_LABELS[c.label as keyof typeof COST_CATEGORY_LABELS] ?? c.label,
            total: c.total,
            count: c.count,
        })),
        [proCosts],
    )
    const proMonthData = useMemo(
        () => (proCosts?.byMonth ?? []).map(m => ({ name: m.period, total: m.total })),
        [proCosts],
    )

    const exportCsv = (rows: object[], filename: string) => {
        if (!rows.length) return
        const keys = Object.keys(rows[0] as Record<string, unknown>)
        const lines = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify((r as Record<string, unknown>)[k] ?? '')).join(','))]
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = filename; a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <PageWrapper>
            <PageHeader
                title={t('reports.title')}
                description={t('reports.description')}
                actions={
                    <Button variant="outline" size="sm"
                        leftIcon={<RefreshCcw className={isRefreshing ? 'size-3.5 animate-spin' : 'size-3.5'} />}
                        onClick={() => void refetchSummary()} disabled={isRefreshing}>
                        Refresh
                    </Button>
                }
            />

            <Tabs defaultValue="headcount">
                {/* Tab navigation — config-driven so we don't repeat trigger
                    classes 9 times. Each tab knows its category and accent
                    colour; the bar renders in a single horizontally-scrollable
                    row with subtle category-coloured icon halos so the
                    People / Time / Compensation / Compliance grouping reads
                    visually without separator chips that broke onto a second
                    row on narrow widths. */}
                {(() => {
                    type Category = 'people' | 'time' | 'comp' | 'compliance'
                    const CATEGORY_TONE: Record<Category, { tint: string; text: string; ring: string }> = {
                        people:     { tint: 'bg-blue-50 dark:bg-blue-950/40',     text: 'text-blue-600 dark:text-blue-400',     ring: 'data-[state=active]:ring-blue-200 dark:data-[state=active]:ring-blue-900/60' },
                        time:       { tint: 'bg-emerald-50 dark:bg-emerald-950/40', text: 'text-emerald-600 dark:text-emerald-400', ring: 'data-[state=active]:ring-emerald-200 dark:data-[state=active]:ring-emerald-900/60' },
                        comp:       { tint: 'bg-amber-50 dark:bg-amber-950/40',   text: 'text-amber-600 dark:text-amber-400',   ring: 'data-[state=active]:ring-amber-200 dark:data-[state=active]:ring-amber-900/60' },
                        compliance: { tint: 'bg-rose-50 dark:bg-rose-950/40',     text: 'text-rose-600 dark:text-rose-400',     ring: 'data-[state=active]:ring-rose-200 dark:data-[state=active]:ring-rose-900/60' },
                    }
                    interface TabSpec { value: string; label: string; icon: typeof Users; category: Category; visible: boolean }
                    const tabs: TabSpec[] = [
                        { value: 'headcount',   label: 'Headcount',       icon: Users,            category: 'people',     visible: true },
                        { value: 'turnover',    label: 'Turnover',        icon: GitCommit,        category: 'people',     visible: canViewTurnover },
                        { value: 'onboarding',  label: 'Onboarding',      icon: ClipboardCheck,   category: 'people',     visible: canViewOnboarding },
                        { value: 'performance', label: 'Performance',     icon: Star,             category: 'people',     visible: canViewPerformance },
                        { value: 'attendance',  label: 'Attendance',      icon: CalendarCheck,    category: 'time',       visible: canViewAttendance },
                        { value: 'leave',       label: 'Leave',           icon: Plane,            category: 'time',       visible: canViewLeave },
                        { value: 'payroll',     label: 'Payroll',         icon: BarChart3,        category: 'comp',       visible: canViewPayroll },
                        { value: 'visa',        label: 'Visa Expiry',     icon: Shield,           category: 'compliance', visible: canViewVisa },
                        { value: 'pro-costs',   label: 'PRO Costs',       icon: Receipt,          category: 'compliance', visible: canViewPayroll },
                    ]
                    return (
                        <div className="mb-5 -mx-1 overflow-x-auto scrollbar-thin">
                            <TabsList className="inline-flex h-auto items-center rounded-xl border bg-card p-1 shadow-sm gap-0.5 mx-1 min-w-fit">
                                {tabs.filter((t) => t.visible).map((tab) => {
                                    const tone = CATEGORY_TONE[tab.category]
                                    const Icon = tab.icon
                                    return (
                                        <TabsTrigger
                                            key={tab.value}
                                            value={tab.value}
                                            className={cn(
                                                'group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted-foreground hover:text-foreground transition-colors',
                                                'data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=active]:ring-1',
                                                tone.ring,
                                            )}
                                        >
                                            <span className={cn(
                                                'inline-flex items-center justify-center size-6 rounded-md transition-colors',
                                                tone.tint, tone.text,
                                                'group-data-[state=active]:scale-105',
                                            )}>
                                                <Icon className="size-3.5" />
                                            </span>
                                            {tab.label}
                                        </TabsTrigger>
                                    )
                                })}
                            </TabsList>
                        </div>
                    )
                })()}

                {/* ── Headcount ── */}
                <TabsContent value="headcount" className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <KpiCardCompact label="Total" value={headcount?.total ?? 0} icon={Users} color="blue" loading={isLoading} />
                        <KpiCardCompact label="Active" value={headcount?.byStatus.find(s => s.label === 'active')?.count ?? 0} icon={CheckCircle2} color="green" loading={isLoading} />
                        <KpiCardCompact label="Onboarding" value={headcount?.byStatus.find(s => s.label === 'onboarding')?.count ?? 0} icon={Clock} color="amber" loading={isLoading} />
                        <KpiCardCompact label="Departments" value={headcount?.byDepartment.length ?? 0} icon={BarChart3} color="cyan" loading={isLoading} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Department bar chart */}
                        <Card className="lg:col-span-2 p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">Headcount by Department</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                    onClick={() => exportCsv(headcount?.byDepartment ?? [], 'headcount-by-dept.csv')}>
                                    Export
                                </Button>
                            </div>
                            {isLoading ? <ChartSkeleton height={220} /> : deptChartData.length === 0 ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <BarChart data={deptChartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                        <Bar dataKey="count" name="Employees" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarSize={18}
                                            label={{ position: 'right', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </Card>

                        {/* Status pie chart */}
                        <Card className="p-4">
                            <h3 className="font-semibold text-sm mb-4">By Status</h3>
                            {isLoading ? <ChartSkeleton height={220} /> : statusPieData.length === 0 ? <EmptyChart /> : (
                                <div className="flex flex-col items-center gap-3">
                                    <ResponsiveContainer width="100%" height={160}>
                                        <PieChart>
                                            <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={44} outerRadius={68}
                                                paddingAngle={3} dataKey="value">
                                                {statusPieData.map((d, i) => (
                                                    <Cell key={i} fill={d.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(v: unknown, name: unknown) => [Number(v ?? 0), String(name ?? '')]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="space-y-1.5 w-full">
                                        {statusPieData.map(d => (
                                            <div key={d.name} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="size-2.5 rounded-full" style={{ background: d.color }} />
                                                    <span className="text-muted-foreground">{d.name}</span>
                                                </div>
                                                <span className="font-semibold">{d.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Nationality bar chart */}
                    <Card className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-sm">By Nationality (Top 15)</h3>
                            <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                onClick={() => exportCsv(headcount?.byNationality ?? [], 'headcount-by-nationality.csv')}>
                                Export
                            </Button>
                        </div>
                        {isLoading ? <ChartSkeleton height={180} /> : (headcount?.byNationality ?? []).length === 0 ? <EmptyChart /> : (
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={(headcount?.byNationality ?? []).slice(0, 15).map(n => ({ name: n.label, count: n.count }))}
                                    margin={{ top: 0, right: 10, left: 0, bottom: 40 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-35} textAnchor="end" interval={0} />
                                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                    <Bar dataKey="count" name="Employees" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={28} />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </Card>
                </TabsContent>

                {/* ── Turnover & Attrition ──
                    Joins vs exits trend, turnover rate, by-department exits,
                    tenure distribution of the current workforce, exit-type pie. */}
                {canViewTurnover && (
                    <TabsContent value="turnover" className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <KpiCardCompact label="Turnover Rate" value={`${turnover?.turnoverRate ?? 0}%`} icon={TrendingUp} color={(turnover?.turnoverRate ?? 0) > 15 ? 'red' : (turnover?.turnoverRate ?? 0) > 8 ? 'amber' : 'green'} loading={isLoading} />
                            <KpiCardCompact label="Joins" value={turnover?.totalJoins ?? 0} icon={UserPlus} color="green" loading={isLoading} />
                            <KpiCardCompact label="Exits" value={turnover?.totalExits ?? 0} icon={UserMinus} color="red" loading={isLoading} />
                            <KpiCardCompact label="Net Change" value={`${(turnover?.netChange ?? 0) >= 0 ? '+' : ''}${turnover?.netChange ?? 0}`} icon={BarChart3} color={(turnover?.netChange ?? 0) >= 0 ? 'green' : 'red'} loading={isLoading} />
                        </div>

                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">Monthly Joins vs Exits (last 12 months)</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                    onClick={() => exportCsv(turnover?.trend ?? [], 'turnover-trend.csv')}>
                                    Export
                                </Button>
                            </div>
                            {isLoading ? <ChartSkeleton height={240} /> : (turnover?.trend ?? []).length === 0 ? <EmptyChart /> : (
                                <ResponsiveContainer width="100%" height={240}>
                                    <BarChart data={turnover?.trend ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        <Bar dataKey="joins" name="Joins" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={22} />
                                        <Bar dataKey="exits" name="Exits" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={22} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </Card>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <Card className="p-4">
                                <h3 className="font-semibold text-sm mb-4">Tenure of Current Workforce</h3>
                                {isLoading ? <ChartSkeleton height={180} /> : (turnover?.tenureDistribution ?? []).length === 0 ? <EmptyChart /> : (
                                    <ResponsiveContainer width="100%" height={180}>
                                        <BarChart data={turnover?.tenureDistribution ?? []} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                                            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                            <Bar dataKey="count" name="Employees" fill="#0ea5e9" radius={[4, 4, 0, 0]} maxBarSize={56} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </Card>

                            <Card className="p-4">
                                <h3 className="font-semibold text-sm mb-4">Exits by Type</h3>
                                {isLoading ? <ChartSkeleton height={180} /> : (turnover?.byExitType ?? []).length === 0 ? <EmptyChart message="No exits in this window" /> : (
                                    <div className="flex flex-col items-center gap-3">
                                        <ResponsiveContainer width="100%" height={140}>
                                            <PieChart>
                                                <Pie data={(turnover?.byExitType ?? []).map((d, i) => ({ name: labelFor(d.label), value: d.count, color: ['#ef4444', '#f59e0b', '#8b5cf6', '#6b7280'][i % 4] }))} cx="50%" cy="50%" innerRadius={36} outerRadius={56} paddingAngle={3} dataKey="value">
                                                    {(turnover?.byExitType ?? []).map((_, i) => (
                                                        <Cell key={i} fill={['#ef4444', '#f59e0b', '#8b5cf6', '#6b7280'][i % 4]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="space-y-1.5 w-full">
                                            {(turnover?.byExitType ?? []).map((d, i) => (
                                                <div key={d.label} className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="size-2.5 rounded-full" style={{ background: ['#ef4444', '#f59e0b', '#8b5cf6', '#6b7280'][i % 4] }} />
                                                        <span className="text-muted-foreground capitalize">{labelFor(d.label)}</span>
                                                    </div>
                                                    <span className="font-semibold">{d.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </Card>
                        </div>

                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">Exits by Department</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                    onClick={() => exportCsv(turnover?.byDepartment ?? [], 'turnover-by-dept.csv')}>
                                    Export
                                </Button>
                            </div>
                            {isLoading ? <ChartSkeleton height={200} /> : (turnover?.byDepartment ?? []).length === 0 ? <EmptyChart message="No exits in this window" /> : (
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={turnover?.byDepartment ?? []} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                                        <YAxis type="category" dataKey="department" tick={{ fontSize: 10 }} width={110} />
                                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                        <Bar dataKey="exits" name="Exits" fill="#ef4444" radius={[0, 4, 4, 0]} maxBarSize={18}
                                            label={{ position: 'right', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </Card>
                    </TabsContent>
                )}

                {/* ── Onboarding Completion ──
                    Completion rate KPI, in-progress vs done, stalled checklists,
                    by-department breakdown. */}
                {canViewOnboarding && (
                    <TabsContent value="onboarding" className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <KpiCardCompact label="Completion Rate" value={`${onboarding?.completionRate ?? 0}%`} icon={CheckCircle2} color="green" loading={isLoading} />
                            <KpiCardCompact label="In Progress" value={onboarding?.inProgress ?? 0} icon={Clock} color="amber" loading={isLoading} />
                            <KpiCardCompact label="Stalled (>30d)" value={onboarding?.stalled ?? 0} icon={AlertOctagon} color="red" loading={isLoading} />
                            <KpiCardCompact label="Avg Days to Complete" value={(onboarding?.avgDaysToComplete ?? 0).toFixed(1)} icon={Hourglass} color="blue" loading={isLoading} />
                        </div>

                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">Completion Rate by Department</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                    onClick={() => exportCsv(onboarding?.byDepartment ?? [], 'onboarding-by-dept.csv')}>
                                    Export
                                </Button>
                            </div>
                            <DataTable
                                isLoading={isLoading}
                                columns={[
                                    { accessorKey: 'department', header: 'Department', cell: ({ getValue }: CellContext<OnboardingByDepartment, unknown>) => <span className="text-sm font-medium">{getValue() as string}</span> },
                                    { accessorKey: 'total', header: 'Total', cell: ({ getValue }: CellContext<OnboardingByDepartment, unknown>) => <span className="text-sm tabular-nums">{getValue() as number}</span> },
                                    { accessorKey: 'completed', header: 'Completed', cell: ({ getValue }: CellContext<OnboardingByDepartment, unknown>) => <span className="text-sm text-success tabular-nums">{getValue() as number}</span> },
                                    { accessorKey: 'inProgress', header: 'In Progress', cell: ({ getValue }: CellContext<OnboardingByDepartment, unknown>) => <span className="text-sm text-amber-600 tabular-nums">{getValue() as number}</span> },
                                    { accessorKey: 'completionRate', header: 'Rate', cell: ({ getValue }: CellContext<OnboardingByDepartment, unknown>) => <span className={cn('text-sm font-semibold', (getValue() as number) >= 80 ? 'text-success' : (getValue() as number) >= 50 ? 'text-amber-600' : 'text-destructive')}>{`${getValue() as number}%`}</span> },
                                ]}
                                data={(onboarding?.byDepartment ?? []) as unknown as OnboardingByDepartment[]}
                                pageSize={12}
                            />
                        </Card>

                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">Stalled Checklists (no progress &gt; 30 days)</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                    onClick={() => exportCsv(onboarding?.stalledList ?? [], 'onboarding-stalled.csv')}>
                                    Export
                                </Button>
                            </div>
                            <DataTable
                                isLoading={isLoading}
                                columns={[
                                    { accessorKey: 'fullName', header: 'Employee', cell: ({ row }: CellContext<StalledChecklist, unknown>) => (
                                        <div className="flex items-center gap-2">
                                            <InitialsAvatar name={row.original.fullName} size="sm" />
                                            <div className="min-w-0">
                                                <EmployeeLink id={row.original.employeeId} name={row.original.fullName} className="text-sm font-medium truncate block" />
                                                <span className="text-[11px] text-muted-foreground truncate block">{row.original.designation ?? '—'}</span>
                                            </div>
                                        </div>
                                    ) },
                                    { accessorKey: 'department', header: 'Department', cell: ({ getValue }: CellContext<StalledChecklist, unknown>) => <span className="text-xs text-muted-foreground">{(getValue() as string) || '—'}</span> },
                                    { accessorKey: 'progress', header: 'Progress', cell: ({ getValue }: CellContext<StalledChecklist, unknown>) => <Badge variant="secondary" className="tabular-nums">{`${getValue() as number}%`}</Badge> },
                                    { accessorKey: 'stalledDays', header: 'Stalled', cell: ({ getValue }: CellContext<StalledChecklist, unknown>) => <span className="text-sm font-semibold text-destructive">{`${getValue() as number}d`}</span> },
                                    { accessorKey: 'dueDate', header: 'Due', cell: ({ getValue }: CellContext<StalledChecklist, unknown>) => <span className="text-xs text-muted-foreground">{(getValue() as string) ? formatDate(getValue() as string) : '—'}</span> },
                                ]}
                                data={(onboarding?.stalledList ?? []) as unknown as StalledChecklist[]}
                                pageSize={10}
                            />
                        </Card>
                    </TabsContent>
                )}

                {/* ── Performance Reviews ──
                    Status counts, rating distribution, per-department averages,
                    recent submitted/completed reviews. */}
                {canViewPerformance && (
                    <TabsContent value="performance" className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <KpiCardCompact label="Avg Rating" value={(performance?.avgRating ?? 0).toFixed(2)} icon={Star} color={(performance?.avgRating ?? 0) >= 4 ? 'green' : (performance?.avgRating ?? 0) >= 3 ? 'amber' : 'red'} loading={isLoading} />
                            <KpiCardCompact label="Completion Rate" value={`${performance?.completionRate ?? 0}%`} icon={TrendingUp} color="green" loading={isLoading} />
                            <KpiCardCompact label="Total Reviews" value={performance?.total ?? 0} icon={BarChart3} color="blue" loading={isLoading} />
                            <KpiCardCompact label="In Draft" value={performance?.draft ?? 0} icon={Clock} color="amber" loading={isLoading} />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <Card className="lg:col-span-1 p-4">
                                <h3 className="font-semibold text-sm mb-4">Rating Distribution</h3>
                                {isLoading ? <ChartSkeleton height={200} /> : (performance?.ratingDistribution ?? []).length === 0 ? <EmptyChart message="No ratings yet" /> : (
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={(performance?.ratingDistribution ?? []).map((r) => ({ name: `${r.rating} ★`, count: r.count }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={30} />
                                            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                            <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={36} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </Card>

                            <Card className="lg:col-span-2 p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-sm">Average Rating by Department</h3>
                                    <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                        onClick={() => exportCsv(performance?.byDepartment ?? [], 'performance-by-dept.csv')}>
                                        Export
                                    </Button>
                                </div>
                                <DataTable
                                    isLoading={isLoading}
                                    columns={[
                                        { accessorKey: 'department', header: 'Department', cell: ({ getValue }: CellContext<PerformanceDeptRow, unknown>) => <span className="text-sm font-medium">{getValue() as string}</span> },
                                        { accessorKey: 'avgRating', header: 'Avg Rating', cell: ({ getValue }: CellContext<PerformanceDeptRow, unknown>) => <span className={cn('text-sm font-semibold tabular-nums', (getValue() as number) >= 4 ? 'text-success' : (getValue() as number) >= 3 ? 'text-amber-600' : 'text-destructive')}>{(getValue() as number).toFixed(2)} ★</span> },
                                        { accessorKey: 'count', header: 'Reviews', cell: ({ getValue }: CellContext<PerformanceDeptRow, unknown>) => <span className="text-sm tabular-nums">{getValue() as number}</span> },
                                    ]}
                                    data={(performance?.byDepartment ?? []) as unknown as PerformanceDeptRow[]}
                                    pageSize={12}
                                />
                            </Card>
                        </div>

                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">Recent Reviews</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                    onClick={() => exportCsv(performance?.recent ?? [], 'performance-recent.csv')}>
                                    Export
                                </Button>
                            </div>
                            <DataTable
                                isLoading={isLoading}
                                columns={[
                                    { accessorKey: 'fullName', header: 'Employee', cell: ({ row }: CellContext<RecentReview, unknown>) => (
                                        <div className="flex items-center gap-2">
                                            <InitialsAvatar name={row.original.fullName} size="sm" />
                                            <div className="min-w-0">
                                                <EmployeeLink id={row.original.employeeId} name={row.original.fullName} className="text-sm font-medium truncate block" />
                                                <span className="text-[11px] text-muted-foreground truncate block">{row.original.designation ?? '—'}</span>
                                            </div>
                                        </div>
                                    ) },
                                    { accessorKey: 'department', header: 'Department', cell: ({ getValue }: CellContext<RecentReview, unknown>) => <span className="text-xs text-muted-foreground">{(getValue() as string) || '—'}</span> },
                                    { accessorKey: 'period', header: 'Period', cell: ({ getValue }: CellContext<RecentReview, unknown>) => <span className="text-sm">{getValue() as string}</span> },
                                    { accessorKey: 'overallRating', header: 'Rating', cell: ({ getValue }: CellContext<RecentReview, unknown>) => {
                                        const v = getValue() as number | null
                                        if (v == null) return <span className="text-xs text-muted-foreground">—</span>
                                        return <span className={cn('text-sm font-semibold tabular-nums', v >= 4 ? 'text-success' : v >= 3 ? 'text-amber-600' : 'text-destructive')}>{v} ★</span>
                                    } },
                                    { accessorKey: 'status', header: 'Status', cell: ({ getValue }: CellContext<RecentReview, unknown>) => <Badge variant="secondary" className="capitalize text-[11px]">{labelFor(getValue() as string)}</Badge> },
                                ]}
                                data={(performance?.recent ?? []) as unknown as RecentReview[]}
                                pageSize={10}
                            />
                        </Card>
                    </TabsContent>
                )}

                {/* ── Attendance Summary ──
                    KPI strip + monthly attendance-rate trend + per-department
                    breakdown + late-arrivals leaderboard. Window matches the
                    visa report's 90-day default. */}
                {canViewAttendance && (
                    <TabsContent value="attendance" className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <KpiCardCompact label="Attendance Rate" value={`${attendanceSummary?.attendanceRate ?? 0}%`} icon={TrendingUp} color="green" loading={isLoading} />
                            <KpiCardCompact label="Late Arrivals" value={attendanceSummary?.late ?? 0} icon={Timer} color="amber" loading={isLoading} />
                            <KpiCardCompact label="Absences" value={attendanceSummary?.absent ?? 0} icon={XCircle} color="red" loading={isLoading} />
                            <KpiCardCompact label="Avg Hrs / Day" value={(attendanceSummary?.avgHoursPerDay ?? 0).toFixed(1)} icon={Hourglass} color="blue" loading={isLoading} />
                        </div>

                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">Monthly Attendance Rate</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                    onClick={() => exportCsv(attendanceSummary?.trend ?? [], 'attendance-trend.csv')}>
                                    Export
                                </Button>
                            </div>
                            {isLoading ? <ChartSkeleton height={220} /> : (attendanceSummary?.trend ?? []).length === 0 ? <EmptyChart message="No attendance data in this window" /> : (
                                <ResponsiveContainer width="100%" height={220}>
                                    <AreaChart data={attendanceSummary?.trend ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="gradAttRate" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} domain={[0, 100]} width={42} />
                                        <Tooltip formatter={(v: unknown) => [`${Number(v ?? 0)}%`, 'Rate']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                        <Area type="monotone" dataKey="rate" stroke="#10b981" fill="url(#gradAttRate)" strokeWidth={2} dot={{ r: 3 }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </Card>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <Card className="p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-sm">By Department</h3>
                                    <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                        onClick={() => exportCsv(attendanceSummary?.byDepartment ?? [], 'attendance-by-dept.csv')}>
                                        Export
                                    </Button>
                                </div>
                                <DataTable
                                    isLoading={isLoading}
                                    columns={[
                                        { accessorKey: 'department', header: 'Department', cell: ({ getValue }: CellContext<AttendanceByDepartment, unknown>) => <span className="text-sm font-medium">{getValue() as string}</span> },
                                        { accessorKey: 'rate', header: 'Rate', cell: ({ getValue }: CellContext<AttendanceByDepartment, unknown>) => <span className={cn('text-sm font-semibold', (getValue() as number) >= 95 ? 'text-success' : (getValue() as number) >= 85 ? 'text-amber-600' : 'text-destructive')}>{`${getValue() as number}%`}</span> },
                                        { accessorKey: 'late', header: 'Late', cell: ({ getValue }: CellContext<AttendanceByDepartment, unknown>) => <span className="text-sm tabular-nums">{getValue() as number}</span> },
                                        { accessorKey: 'absent', header: 'Absent', cell: ({ getValue }: CellContext<AttendanceByDepartment, unknown>) => <span className="text-sm tabular-nums">{getValue() as number}</span> },
                                    ]}
                                    data={(attendanceSummary?.byDepartment ?? []) as unknown as AttendanceByDepartment[]}
                                    pageSize={12}
                                />
                            </Card>

                            <Card className="p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-sm">Top Late Arrivals</h3>
                                    <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                        onClick={() => exportCsv(attendanceSummary?.lateLeaderboard ?? [], 'attendance-late-leaders.csv')}>
                                        Export
                                    </Button>
                                </div>
                                <DataTable
                                    isLoading={isLoading}
                                    columns={[
                                        { accessorKey: 'fullName', header: 'Employee', cell: ({ row }: CellContext<AttendanceLeader, unknown>) => (
                                            <div className="flex items-center gap-2">
                                                <InitialsAvatar name={row.original.fullName} size="sm" />
                                                <div className="min-w-0">
                                                    <EmployeeLink id={row.original.employeeId} name={row.original.fullName} className="text-sm font-medium truncate block" />
                                                    <span className="text-[11px] text-muted-foreground truncate block">{row.original.designation ?? '—'}</span>
                                                </div>
                                            </div>
                                        ) },
                                        { accessorKey: 'department', header: 'Department', cell: ({ getValue }: CellContext<AttendanceLeader, unknown>) => <span className="text-xs text-muted-foreground">{(getValue() as string) || '—'}</span> },
                                        { accessorKey: 'lateCount', header: 'Late count', cell: ({ getValue }: CellContext<AttendanceLeader, unknown>) => <Badge variant="warning" className="tabular-nums">{getValue() as number}</Badge> },
                                    ]}
                                    data={(attendanceSummary?.lateLeaderboard ?? []) as unknown as AttendanceLeader[]}
                                    pageSize={10}
                                />
                            </Card>
                        </div>
                    </TabsContent>
                )}

                {/* ── Leave Summary ──
                    YTD breakdown of leave requests: status KPIs, by-type pie,
                    by-department days-taken table, top-takers leaderboard. */}
                {canViewLeave && (
                    <TabsContent value="leave" className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <KpiCardCompact label="Approved Days" value={leaveSummary?.approvedDays ?? 0} icon={CheckCircle2} color="green" loading={isLoading} />
                            <KpiCardCompact label="Pending Requests" value={leaveSummary?.pendingRequests ?? 0} icon={Clock} color="amber" loading={isLoading} />
                            <KpiCardCompact label="Approved Requests" value={leaveSummary?.approvedRequests ?? 0} icon={UserPlus} color="blue" loading={isLoading} />
                            <KpiCardCompact label="Rejected / Cancelled" value={(leaveSummary?.rejectedRequests ?? 0) + (leaveSummary?.cancelledRequests ?? 0)} icon={XCircle} color="red" loading={isLoading} />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <Card className="lg:col-span-2 p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-sm">Approved Days by Department</h3>
                                    <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                        onClick={() => exportCsv(leaveSummary?.byDepartment ?? [], 'leave-by-dept.csv')}>
                                        Export
                                    </Button>
                                </div>
                                {isLoading ? <ChartSkeleton height={220} /> : (leaveSummary?.byDepartment ?? []).length === 0 ? <EmptyChart /> : (
                                    <ResponsiveContainer width="100%" height={220}>
                                        <BarChart data={(leaveSummary?.byDepartment ?? []).map((d) => ({ name: d.department, days: d.days }))} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                                            <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                                            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                            <Bar dataKey="days" name="Days" fill="#6366f1" radius={[0, 4, 4, 0]} maxBarSize={18}
                                                label={{ position: 'right', fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                )}
                            </Card>

                            <Card className="p-4">
                                <h3 className="font-semibold text-sm mb-4">By Leave Type</h3>
                                {isLoading ? <ChartSkeleton height={220} /> : (leaveSummary?.byType ?? []).length === 0 ? <EmptyChart /> : (
                                    <div className="flex flex-col items-center gap-3">
                                        <ResponsiveContainer width="100%" height={160}>
                                            <PieChart>
                                                <Pie data={(leaveSummary?.byType ?? []).map((tp, i) => ({ name: labelFor(tp.leaveType), value: tp.days, color: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6b7280'][i % 8] }))} cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3} dataKey="value">
                                                    {(leaveSummary?.byType ?? []).map((_, i) => (
                                                        <Cell key={i} fill={['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6b7280'][i % 8]} />
                                                    ))}
                                                </Pie>
                                                <Tooltip formatter={(v: unknown, name: unknown) => [`${Number(v ?? 0)} d`, String(name ?? '')]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                            </PieChart>
                                        </ResponsiveContainer>
                                        <div className="space-y-1.5 w-full">
                                            {(leaveSummary?.byType ?? []).map((tp, i) => (
                                                <div key={tp.leaveType} className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <div className="size-2.5 rounded-full shrink-0" style={{ background: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#6b7280'][i % 8] }} />
                                                        <span className="text-muted-foreground truncate">{labelFor(tp.leaveType)}</span>
                                                    </div>
                                                    <span className="font-semibold tabular-nums">{tp.days} d</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </Card>
                        </div>

                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">Top Leave Takers</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                    onClick={() => exportCsv(leaveSummary?.topTakers ?? [], 'leave-top-takers.csv')}>
                                    Export
                                </Button>
                            </div>
                            <DataTable
                                isLoading={isLoading}
                                columns={[
                                    { accessorKey: 'fullName', header: 'Employee', cell: ({ row }: CellContext<LeaveTopTaker, unknown>) => (
                                        <div className="flex items-center gap-2">
                                            <InitialsAvatar name={row.original.fullName} size="sm" />
                                            <div className="min-w-0">
                                                <EmployeeLink id={row.original.employeeId} name={row.original.fullName} className="text-sm font-medium truncate block" />
                                                <span className="text-[11px] text-muted-foreground truncate block">{row.original.designation ?? '—'}</span>
                                            </div>
                                        </div>
                                    ) },
                                    { accessorKey: 'department', header: 'Department', cell: ({ getValue }: CellContext<LeaveTopTaker, unknown>) => <span className="text-xs text-muted-foreground">{(getValue() as string) || '—'}</span> },
                                    { accessorKey: 'days', header: 'Days taken', cell: ({ getValue }: CellContext<LeaveTopTaker, unknown>) => <span className="text-sm font-bold tabular-nums">{getValue() as number}</span> },
                                    { accessorKey: 'requests', header: 'Requests', cell: ({ getValue }: CellContext<LeaveTopTaker, unknown>) => <span className="text-sm tabular-nums">{getValue() as number}</span> },
                                ]}
                                data={(leaveSummary?.topTakers ?? []) as unknown as LeaveTopTaker[]}
                                pageSize={10}
                            />
                        </Card>
                    </TabsContent>
                )}

                {/* ── Payroll Summary ── */}
                <TabsContent value="payroll" className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <KpiCardCompact label="YTD Gross" value={formatCurrency(payrollSummary?.ytdGross ?? 0)} icon={BarChart3} color="blue" loading={isLoading} />
                        <KpiCardCompact label="YTD Net" value={formatCurrency(payrollSummary?.ytdNet ?? 0)} icon={CheckCircle2} color="green" loading={isLoading} />
                        <KpiCardCompact label="Payroll Runs" value={payrollSummary?.totalRuns ?? 0} icon={Calendar} color="amber" loading={isLoading} />
                        <KpiCardCompact label="Avg Net/Run" value={formatCurrency(payrollSummary && payrollSummary.totalRuns > 0 ? payrollSummary.ytdNet / payrollSummary.totalRuns : 0)} icon={Users} color="cyan" loading={isLoading} />
                    </div>

                    {/* Area chart: Gross vs Net trend */}
                    <Card className="p-4">
                        <h3 className="font-semibold text-sm mb-4">Monthly Payroll Trend - Gross vs Net</h3>
                        {isLoading ? <ChartSkeleton height={240} /> : payrollAreaData.length === 0 ? <EmptyChart message="No payroll data yet" /> : (
                            <ResponsiveContainer width="100%" height={240}>
                                <AreaChart data={payrollAreaData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gradGrossR" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gradNetR" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={52} />
                                    <Tooltip formatter={(v: unknown, name: unknown) => [formatCurrency(Number(v ?? 0)), String(name ?? '')]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                    <Legend wrapperStyle={{ fontSize: 12 }} />
                                    <Area type="monotone" dataKey="Gross" stroke="#3b82f6" fill="url(#gradGrossR)" strokeWidth={2} dot={{ r: 3 }} />
                                    <Area type="monotone" dataKey="Net" stroke="#10b981" fill="url(#gradNetR)" strokeWidth={2} dot={{ r: 3 }} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </Card>

                    {/* Deductions bar chart */}
                    {payrollAreaData.length > 0 && (
                        <Card className="p-4">
                            <h3 className="font-semibold text-sm mb-4">Monthly Deductions</h3>
                            <ResponsiveContainer width="100%" height={160}>
                                <BarChart data={payrollAreaData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={52} />
                                    <Tooltip formatter={(v: unknown) => [formatCurrency(Number(v ?? 0)), 'Deductions']} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                                    <Bar dataKey="Deductions" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={36} />
                                </BarChart>
                            </ResponsiveContainer>
                        </Card>
                    )}

                    {/* Detailed table */}
                    <Card className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-sm">Monthly Payroll History</h3>
                            <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                onClick={() => exportCsv(payrollSummary?.trend ?? [], 'payroll-summary.csv')}>
                                Export CSV
                            </Button>
                        </div>
                        <DataTable
                            isLoading={isLoading}
                            columns={[
                                { accessorKey: 'period', header: 'Period', cell: ({ getValue }: CellContext<PayrollTrendRow, unknown>) => <span className="font-medium text-sm">{getValue() as string}</span> },
                                { accessorKey: 'headcount', header: 'Employees', cell: ({ getValue }: CellContext<PayrollTrendRow, unknown>) => <span className="text-sm">{getValue() as number}</span> },
                                { accessorKey: 'gross', header: 'Gross (AED)', cell: ({ getValue }: CellContext<PayrollTrendRow, unknown>) => <span className="text-sm font-semibold">{formatCurrency(getValue() as number)}</span> },
                                { accessorKey: 'deductions', header: 'Deductions (AED)', cell: ({ getValue }: CellContext<PayrollTrendRow, unknown>) => <span className="text-sm text-destructive">{formatCurrency(getValue() as number)}</span> },
                                { accessorKey: 'net', header: 'Net (AED)', cell: ({ getValue }: CellContext<PayrollTrendRow, unknown>) => <span className="text-sm font-bold text-success">{formatCurrency(getValue() as number)}</span> },
                                { accessorKey: 'status', header: 'Status', cell: ({ getValue }: CellContext<PayrollTrendRow, unknown>) => <Badge variant="secondary" className="capitalize text-[11px]">{labelFor(getValue() as string)}</Badge> },
                            ]}
                            data={payrollRows as unknown as PayrollTrendRow[]}
                            pageSize={12}
                            advancedFilter={{
                                search: payrollSearch,
                                filters: PAYROLL_REPORT_FILTERS,
                                placeholder: 'Search payroll periods…',
                            }}
                        />
                    </Card>
                </TabsContent>

                {/* ── Visa Expiry ── */}
                <TabsContent value="visa" className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <KpiCardCompact label="Expired" value={visaExpiry?.expired ?? 0} icon={XCircle} color="red" loading={isLoading} />
                        <KpiCardCompact label="Critical (≤30d)" value={visaExpiry?.critical ?? 0} icon={Shield} color="red" loading={isLoading} />
                        <KpiCardCompact label="Urgent (31–60d)" value={visaExpiry?.urgent ?? 0} icon={Clock} color="amber" loading={isLoading} />
                        <KpiCardCompact label="Normal (61–90d)" value={visaExpiry?.normal ?? 0} icon={CheckCircle2} color="green" loading={isLoading} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* Urgency donut */}
                        <Card className="p-4">
                            <h3 className="font-semibold text-sm mb-4">Urgency Breakdown</h3>
                            {isLoading ? <ChartSkeleton height={200} /> : visaUrgencyData.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-10 text-center">
                                    <CheckCircle2 className="size-8 text-emerald-400" />
                                    <p className="text-sm text-muted-foreground">No visas expiring soon</p>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center gap-3">
                                    <ResponsiveContainer width="100%" height={160}>
                                        <PieChart>
                                            <Pie data={visaUrgencyData} cx="50%" cy="50%" innerRadius={44} outerRadius={68}
                                                paddingAngle={3} dataKey="value">
                                                {visaUrgencyData.map((d, i) => (
                                                    <Cell key={i} fill={d.color} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="space-y-1.5 w-full">
                                        {visaUrgencyData.map(d => (
                                            <div key={d.name} className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <div className="size-2.5 rounded-full" style={{ background: d.color }} />
                                                    <span className="text-muted-foreground">{d.name}</span>
                                                </div>
                                                <span className="font-semibold">{d.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Card>

                        {/* Days-left distribution horizontal bar */}
                        <Card className="lg:col-span-2 p-4">
                            <h3 className="font-semibold text-sm mb-4">Expiry Risk Summary</h3>
                            {isLoading ? <ChartSkeleton height={200} /> : visaUrgencyData.length === 0 ? <EmptyChart message="No expiring visas within 90 days" /> : (
                                <div className="space-y-4">
                                    {visaUrgencyData.map(d => {
                                        const total = visaUrgencyData.reduce((s, x) => s + x.value, 0)
                                        const pct = total > 0 ? (d.value / total) * 100 : 0
                                        return (
                                            <div key={d.name} className="space-y-1.5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="size-2.5 rounded-full" style={{ background: d.color }} />
                                                        <span className="font-medium">{d.name}</span>
                                                    </div>
                                                    <span className="text-muted-foreground tabular-nums">{d.value} employee{d.value !== 1 ? 's' : ''} · {pct.toFixed(0)}%</span>
                                                </div>
                                                <div className="h-3 w-full rounded-full bg-muted overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full transition-all"
                                                        style={{ width: `${pct}%`, background: d.color }}
                                                    />
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </Card>
                    </div>

                    {/* Employee table */}
                    <Card className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-sm">Expiring within 90 days</h3>
                            <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                onClick={() => exportCsv(visaExpiry?.employees ?? [], 'visa-expiry.csv')}>
                                Export CSV
                            </Button>
                        </div>
                        <DataTable
                            isLoading={isLoading}
                            columns={[
                                {
                                    id: 'employee',
                                    accessorKey: 'fullName',
                                    header: 'Employee',
                                    cell: ({ row: { original: e } }: CellContext<VisaExpiryEmployee, unknown>) => (
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <InitialsAvatar name={e.fullName || '—'} size="sm" />
                                            <div className="min-w-0">
                                                <EmployeeLink id={e.id} name={e.fullName || '—'} className="text-sm font-medium truncate block" />
                                                <p className="text-[11px] text-muted-foreground truncate">{e.designation}</p>
                                            </div>
                                        </div>
                                    ),
                                },
                                { accessorKey: 'department', header: 'Department', cell: ({ getValue }: CellContext<VisaExpiryEmployee, unknown>) => <span className="text-sm">{(getValue() as string | null) ?? '—'}</span> },
                                { accessorKey: 'nationality', header: 'Nationality', cell: ({ getValue }: CellContext<VisaExpiryEmployee, unknown>) => <span className="text-sm">{(getValue() as string | null) ?? '—'}</span> },
                                { accessorKey: 'visaExpiry', header: 'Visa Expiry', cell: ({ getValue }: CellContext<VisaExpiryEmployee, unknown>) => <span className="text-sm">{formatDate(getValue() as string)}</span> },
                                {
                                    accessorKey: 'daysLeft', header: 'Days Left',
                                    cell: ({ getValue }: CellContext<VisaExpiryEmployee, unknown>) => {
                                        const d = getValue() as number | null
                                        if (d === null) return <span className="text-muted-foreground text-sm">—</span>
                                        return (
                                            <span className={cn('text-sm font-semibold',
                                                d < 0 ? 'text-destructive' : d <= 30 ? 'text-destructive' : d <= 60 ? 'text-warning' : 'text-success'
                                            )}>
                                                {d < 0 ? 'Expired' : `${d}d`}
                                            </span>
                                        )
                                    },
                                },
                                {
                                    accessorKey: 'urgency', header: 'Urgency',
                                    cell: ({ getValue }: CellContext<VisaExpiryEmployee, unknown>) => {
                                        const u = getValue() as string
                                        const v: 'destructive' | 'warning' | 'success' = u === 'expired' ? 'destructive' : u === 'critical' ? 'destructive' : u === 'urgent' ? 'warning' : 'success'
                                        return <Badge variant={v} className="text-[11px]">{labelFor(u)}</Badge>
                                    },
                                },
                            ]}
                            data={visaReportRows as unknown as VisaExpiryEmployee[]}
                            pageSize={10}
                            onRowClick={(row) => navigate(`/employees/${row.id}`)}
                            advancedFilter={{
                                search: visaReportSearch,
                                filters: VISA_REPORT_FILTERS,
                                placeholder: 'Search employees…',
                            }}
                        />
                    </Card>
                </TabsContent>

                {/* ── PRO Costs ── */}
                <TabsContent value="pro-costs" className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <KpiCardCompact label="YTD Total" value={formatCurrency(proCosts?.ytdTotal ?? 0)} icon={Receipt} color="blue" loading={isLoading} hint="All categories" />
                        <KpiCardCompact label="Avg/Employee" value={formatCurrency(proCosts?.avgPerEmployee ?? 0)} icon={TrendingUp} color="purple" loading={isLoading} hint="This year" />
                        <KpiCardCompact label="Transactions" value={proCosts?.totalTransactions ?? 0} icon={BarChart3} color="amber" loading={isLoading} hint="YTD records" />
                        <KpiCardCompact label="Employees" value={proCosts?.byEmployee.length ?? 0} icon={Users} color="green" loading={isLoading} hint="With costs recorded" />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Category horizontal bar chart */}
                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">By Category</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                    onClick={() => exportCsv(proCosts?.byCategory ?? [], 'pro-costs-by-category.csv')}>
                                    Export
                                </Button>
                            </div>
                            {isLoading ? <ChartSkeleton height={200} /> : proCatData.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-6">No costs recorded this year</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={Math.max(160, proCatData.length * 36)}>
                                    <BarChart data={proCatData} layout="vertical" margin={{ top: 0, right: 70, left: 0, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                                        <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                                        <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
                                        <Tooltip
                                            formatter={(v: unknown, n: unknown) => [formatCurrency(Number(v ?? 0)), String(n ?? '')]}
                                            contentStyle={{ fontSize: 11, borderRadius: 8 }}
                                        />
                                        <Bar dataKey="total" name="Total (AED)" fill="#8b5cf6" radius={[0, 4, 4, 0]} maxBarSize={18}
                                            label={{ position: 'right', fontSize: 10, fill: 'hsl(var(--muted-foreground))', formatter: (v: unknown) => formatCurrency(Number(v ?? 0)) }} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </Card>

                        {/* Monthly trend area chart */}
                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">Monthly Trend (YTD)</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                    onClick={() => exportCsv(proCosts?.byMonth ?? [], 'pro-costs-by-month.csv')}>
                                    Export
                                </Button>
                            </div>
                            {isLoading ? <ChartSkeleton height={200} /> : proMonthData.length === 0 ? (
                                <p className="text-xs text-muted-foreground text-center py-6">No monthly data available</p>
                            ) : (
                                <ResponsiveContainer width="100%" height={200}>
                                    <AreaChart data={proMonthData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="gradPRO" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                                                <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                        <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} width={46} />
                                        <Tooltip formatter={(v: unknown) => [formatCurrency(Number(v ?? 0)), 'Total']} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                                        <Area type="monotone" dataKey="total" stroke="#f59e0b" fill="url(#gradPRO)" strokeWidth={2} dot={{ r: 3 }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </Card>
                    </div>

                    {/* Per-employee cost table */}
                    <Card className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-sm">Per Employee</h3>
                            <Button size="sm" variant="outline" leftIcon={<Download className="size-3.5" />}
                                onClick={() => exportCsv(
                                    (proCosts?.byEmployee ?? []).map(e => ({ name: e.employeeName, total: e.total, count: e.count })),
                                    'pro-costs-by-employee.csv',
                                )}>
                                Export
                            </Button>
                        </div>
                        {isLoading ? (
                            <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={`skeleton-${i}`} className="h-12 w-full rounded-lg" />)}</div>
                        ) : (proCosts?.byEmployee ?? []).length === 0 ? (
                            <div className="py-10 text-center">
                                <Receipt className="size-8 text-muted-foreground/40 mx-auto mb-2" />
                                <p className="text-sm text-muted-foreground">No cost records for this year</p>
                                <p className="text-xs text-muted-foreground mt-0.5">Add costs via the Visa detail page</p>
                            </div>
                        ) : (
                            <DataTable
                                isLoading={isLoading}
                                columns={[
                                    {
                                        id: 'employee',
                                        accessorKey: 'employeeName',
                                        header: 'Employee',
                                        cell: ({ row: { original: e } }: CellContext<CostReportEmployee, unknown>) => (
                                            <div className="flex items-center gap-2.5">
                                                <InitialsAvatar name={e.employeeName || '—'} size="sm" />
                                                <span className="text-sm font-medium">{e.employeeName}</span>
                                            </div>
                                        ),
                                    },
                                    {
                                        accessorKey: 'count',
                                        header: 'Transactions',
                                        cell: ({ getValue }: CellContext<CostReportEmployee, unknown>) => (
                                            <span className="text-sm">{getValue() as number}</span>
                                        ),
                                    },
                                    {
                                        accessorKey: 'total',
                                        header: 'Total Spent (AED)',
                                        cell: ({ getValue }: CellContext<CostReportEmployee, unknown>) => (
                                            <span className="text-sm font-bold">{formatCurrency(getValue() as number)}</span>
                                        ),
                                    },
                                ]}
                                data={proCosts?.byEmployee ?? []}
                                pageSize={10}
                            />
                        )}
                    </Card>
                </TabsContent>
            </Tabs>
        </PageWrapper>
    )
}
