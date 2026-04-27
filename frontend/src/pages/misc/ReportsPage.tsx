import { memo, useMemo } from 'react'
import type { CellContext } from '@tanstack/react-table'
import { useTranslation } from 'react-i18next'
import { labelFor } from '@/lib/enums'
import { Calendar, Clock, CheckCircle2, XCircle, Download, BarChart3, Users, Shield, AlertTriangle, UserPlus, UserMinus, PauseCircle } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge, Card } from '@/components/ui/primitives'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useHeadcountReport, usePayrollSummaryReport, useVisaExpiryReport } from '@/hooks/useReports'
import type { PayrollTrendRow, VisaExpiryEmployee } from '@/hooks/useReports'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { applyClientFilters, type FilterConfig } from '@/lib/filters'
import { InitialsAvatar } from '@/components/shared/Avatar'

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
    { name: 'department', label: 'Department', type: 'text', field: 'department' },
    { name: 'nationality', label: 'Nationality', type: 'text', field: 'nationality' },
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
    { variant: 'success' | 'warning' | 'destructive' | 'info' | 'secondary'; Icon: typeof CheckCircle2 }
> = {
    active: { variant: 'success', Icon: CheckCircle2 },
    probation: { variant: 'warning', Icon: Clock },
    onboarding: { variant: 'info', Icon: UserPlus },
    suspended: { variant: 'destructive', Icon: PauseCircle },
    terminated: { variant: 'secondary', Icon: UserMinus },
    visa_expired: { variant: 'destructive', Icon: AlertTriangle },
}

const EmployeeStatusBadge = memo(function EmployeeStatusBadge({ status }: { status: string }) {
    const meta = EMPLOYEE_STATUS_META[status] ?? { variant: 'secondary' as const, Icon: CheckCircle2 }
    const { variant, Icon } = meta
    return (
        <Badge variant={variant} className="capitalize text-[11px] gap-1 inline-flex items-center">
            <Icon className="h-3 w-3" />
            {labelFor(status)}
        </Badge>
    )
})

export function ReportsPage() {
    const { t } = useTranslation()
    const { data: headcount, isLoading: hcLoading } = useHeadcountReport()
    const { data: payrollSummary, isLoading: prLoading } = usePayrollSummaryReport()
    const { data: visaExpiry, isLoading: veLoading } = useVisaExpiryReport(90)

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
            />

            <Tabs defaultValue="headcount">
                <TabsList className="inline-flex h-auto rounded-xl border bg-card p-1 shadow-sm gap-1 mb-5">
                    <TabsTrigger
                        value="headcount"
                        className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm transition-colors"
                    >
                        <Users className="h-4 w-4" /> Headcount
                    </TabsTrigger>
                    <TabsTrigger
                        value="payroll"
                        className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm transition-colors"
                    >
                        <BarChart3 className="h-4 w-4" /> Payroll Summary
                    </TabsTrigger>
                    <TabsTrigger
                        value="visa"
                        className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-sm transition-colors"
                    >
                        <Shield className="h-4 w-4" /> Visa Expiry
                    </TabsTrigger>
                </TabsList>

                {/* ── Headcount ── */}
                <TabsContent value="headcount" className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <KpiCardCompact label="Total" value={headcount?.total ?? 0} icon={Users} color="blue" loading={hcLoading} />
                        <KpiCardCompact label="Active" value={headcount?.byStatus.find(s => s.label === 'active')?.count ?? 0} icon={CheckCircle2} color="green" loading={hcLoading} />
                        <KpiCardCompact label="Onboarding" value={headcount?.byStatus.find(s => s.label === 'onboarding')?.count ?? 0} icon={Clock} color="amber" loading={hcLoading} />
                        <KpiCardCompact label="Departments" value={headcount?.byDepartment.length ?? 0} icon={BarChart3} color="cyan" loading={hcLoading} />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">By Department</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="h-3.5 w-3.5" />}
                                    onClick={() => exportCsv(headcount?.byDepartment ?? [], 'headcount-by-dept.csv')}>
                                    Export
                                </Button>
                            </div>
                            {hcLoading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {(headcount?.byDepartment ?? []).map((d) => (
                                        <div key={d.label} className="flex items-center gap-3">
                                            <span className="text-xs w-32 truncate text-muted-foreground">{d.label}</span>
                                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary rounded-full transition-all"
                                                    style={{ width: `${Math.round((d.count / (headcount?.total || 1)) * 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-semibold w-8 text-right">{d.count}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>

                        <Card className="p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-semibold text-sm">By Nationality (Top 15)</h3>
                                <Button size="sm" variant="outline" leftIcon={<Download className="h-3.5 w-3.5" />}
                                    onClick={() => exportCsv(headcount?.byNationality ?? [], 'headcount-by-nationality.csv')}>
                                    Export
                                </Button>
                            </div>
                            {hcLoading ? (
                                <div className="space-y-3">
                                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {(headcount?.byNationality ?? []).map((n) => (
                                        <div key={n.label} className="flex items-center gap-3">
                                            <span className="text-xs w-32 truncate text-muted-foreground">{n.label}</span>
                                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 rounded-full transition-all"
                                                    style={{ width: `${Math.round((n.count / (headcount?.total || 1)) * 100)}%` }}
                                                />
                                            </div>
                                            <span className="text-xs font-semibold w-8 text-right">{n.count}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>

                    <Card className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-sm">By Status</h3>
                        </div>
                        {hcLoading ? (
                            <div className="space-y-3">
                                {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full rounded-lg" />)}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {(headcount?.byStatus ?? []).map((s) => (
                                    <div key={s.label} className="flex items-center gap-3">
                                        <EmployeeStatusBadge status={s.label} />
                                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary rounded-full transition-all"
                                                style={{ width: `${Math.round((s.count / (headcount?.total || 1)) * 100)}%` }}
                                            />
                                        </div>
                                        <span className="text-xs font-semibold w-8 text-right">{s.count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </TabsContent>

                {/* ── Payroll Summary ── */}
                <TabsContent value="payroll" className="space-y-4">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <KpiCardCompact label="YTD Gross" value={formatCurrency(payrollSummary?.ytdGross ?? 0)} icon={BarChart3} color="blue" loading={prLoading} />
                        <KpiCardCompact label="YTD Net" value={formatCurrency(payrollSummary?.ytdNet ?? 0)} icon={CheckCircle2} color="green" loading={prLoading} />
                        <KpiCardCompact label="Payroll Runs" value={payrollSummary?.totalRuns ?? 0} icon={Calendar} color="amber" loading={prLoading} />
                        <KpiCardCompact label="Avg Net/Run" value={formatCurrency(payrollSummary && payrollSummary.totalRuns > 0 ? payrollSummary.ytdNet / payrollSummary.totalRuns : 0)} icon={Users} color="cyan" loading={prLoading} />
                    </div>

                    <Card className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-sm">Monthly Payroll History</h3>
                            <Button size="sm" variant="outline" leftIcon={<Download className="h-3.5 w-3.5" />}
                                onClick={() => exportCsv(payrollSummary?.trend ?? [], 'payroll-summary.csv')}>
                                Export CSV
                            </Button>
                        </div>
                        <DataTable
                            isLoading={prLoading}
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
                        <KpiCardCompact label="Expired" value={visaExpiry?.expired ?? 0} icon={XCircle} color="red" loading={veLoading} />
                        <KpiCardCompact label="Critical (≤30d)" value={visaExpiry?.critical ?? 0} icon={Shield} color="red" loading={veLoading} />
                        <KpiCardCompact label="Urgent (31–60d)" value={visaExpiry?.urgent ?? 0} icon={Clock} color="amber" loading={veLoading} />
                        <KpiCardCompact label="Normal (61–90d)" value={visaExpiry?.normal ?? 0} icon={CheckCircle2} color="green" loading={veLoading} />
                    </div>

                    <Card className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-sm">Expiring within 90 days</h3>
                            <Button size="sm" variant="outline" leftIcon={<Download className="h-3.5 w-3.5" />}
                                onClick={() => exportCsv(visaExpiry?.employees ?? [], 'visa-expiry.csv')}>
                                Export CSV
                            </Button>
                        </div>
                        <DataTable
                            isLoading={veLoading}
                            columns={[
                                {
                                    id: 'employee',
                                    accessorKey: 'fullName',
                                    header: 'Employee',
                                    cell: ({ row: { original: e } }: CellContext<VisaExpiryEmployee, unknown>) => (
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <InitialsAvatar name={e.fullName || '—'} size="sm" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">{e.fullName}</p>
                                                <p className="text-[11px] text-muted-foreground truncate">
                                                    {e.designation}
                                                </p>
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
                                    }
                                },
                                {
                                    accessorKey: 'urgency', header: 'Urgency',
                                    cell: ({ getValue }: CellContext<VisaExpiryEmployee, unknown>) => {
                                        const u = getValue() as string
                                        const v: 'destructive' | 'warning' | 'success' = u === 'expired' ? 'destructive' : u === 'critical' ? 'destructive' : u === 'urgent' ? 'warning' : 'success'
                                        return <Badge variant={v} className="capitalize text-[11px]">{u}</Badge>
                                    }
                                },
                            ]}
                            data={visaReportRows as unknown as VisaExpiryEmployee[]}
                            pageSize={10}
                            advancedFilter={{
                                search: visaReportSearch,
                                filters: VISA_REPORT_FILTERS,
                                placeholder: 'Search employees…',
                            }}
                        />
                    </Card>
                </TabsContent>
            </Tabs>
        </PageWrapper>
    )
}
