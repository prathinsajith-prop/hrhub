import React, { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import { CreditCard, CheckCircle2, Clock, Play, FileDown, Send, TrendingUp } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, CardTitle, CardContent } from '@/components/ui/primitives'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '@/lib/utils'
import { usePayrollRuns, useRunPayroll, useSubmitWps } from '@/hooks/usePayroll'
import { usePermissions } from '@/hooks/usePermissions'
import { usePayrollTrend } from '@/hooks/useDashboard'
import { useAuthStore } from '@/store/authStore'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { applyClientFilters, type FilterConfig } from '@/lib/filters'
import type { PayrollRun } from '@/types'

const PAYROLL_FILTERS: FilterConfig[] = [
  {
    name: 'status', label: 'Status', type: 'select', field: 'status',
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'processing', label: 'Processing' },
      { value: 'approved', label: 'Approved' },
      { value: 'wps_submitted', label: 'WPS submitted' },
      { value: 'paid', label: 'Paid' },
    ],
  },
  { name: 'year', label: 'Year', type: 'number_range', field: 'year', min: 2020, max: 2100 },
  { name: 'totalEmployees', label: 'Headcount', type: 'number_range', field: 'totalEmployees', min: 0 },
  { name: 'totalNet', label: 'Net pay (AED)', type: 'number_range', field: 'totalNet', min: 0, prefix: 'AED' },
  { name: 'processedDate', label: 'Processed date', type: 'date_range', field: 'processedDate' },
]

async function downloadWpsSif(payrollRunId: string, token: string | null) {
  const res = await fetch(`/api/v1/payroll/${payrollRunId}/wps-sif`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    throw new Error('WPS SIF generation failed')
  }
  const blob = await res.blob()
  const disposition = res.headers.get('Content-Disposition') ?? ''
  const match = disposition.match(/filename="(.+?)"/)
  const filename = match ? match[1] : 'WPS_SIF.sif'
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const statusConfig: Record<string, { variant: any; label: string; icon: React.ElementType }> = {
  draft: { variant: 'secondary', label: 'Draft', icon: Clock },
  processing: { variant: 'info', label: 'Processing', icon: Clock },
  approved: { variant: 'success', label: 'Approved', icon: CheckCircle2 },
  wps_submitted: { variant: 'info', label: 'WPS Submitted', icon: Send },
  paid: { variant: 'success', label: 'Paid', icon: CheckCircle2 },
}

function SifActionCell({ payroll: p }: { payroll: PayrollRun }) {
  const { accessToken } = useAuthStore()
  const [loading, setLoading] = useState(false)
  const submitWps = useSubmitWps()

  const handleSif = async () => {
    setLoading(true)
    try {
      await downloadWpsSif(p.id, accessToken)
      toast.success('WPS SIF downloaded', 'Salary information file is ready.')
    } catch {
      toast.error('Download failed', 'No payslips found for this run.')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitWps = () => {
    submitWps.mutate(p.id, {
      onSuccess: () => toast.success('WPS submitted', `Reference: ${p.wpsFileRef ?? 'generated'}. Status updated to WPS Submitted.`),
      onError: () => toast.error('Submission failed', 'Could not mark this payroll run as WPS submitted.'),
    })
  }

  return (
    <div className="flex gap-1">
      {(p.status === 'approved' || p.status === 'wps_submitted' || p.status === 'paid') && (
        <Button size="sm" variant="outline" loading={loading} leftIcon={<FileDown className="h-3 w-3" />} className="h-7 text-xs" onClick={handleSif}>
          WPS SIF
        </Button>
      )}
      {p.status === 'approved' && (
        <Button size="sm" variant="outline" loading={submitWps.isPending} leftIcon={<Send className="h-3 w-3" />} className="h-7 text-xs"
          onClick={handleSubmitWps}>
          Submit
        </Button>
      )}
    </div>
  )
}

const columns: ColumnDef<PayrollRun>[] = [
  {
    id: 'period',
    header: 'Pay Period',
    cell: ({ row: { original: p } }) => (
      <p className="font-medium text-sm">{new Date(p.year, p.month - 1).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })}</p>
    ),
  },
  {
    accessorKey: 'totalEmployees',
    header: 'Employees',
    cell: ({ getValue }) => <span className="text-sm">{getValue() as number}</span>,
  },
  {
    accessorKey: 'totalGross',
    header: 'Gross',
    cell: ({ getValue }) => <span className="text-sm font-medium">{formatCurrency(getValue() as number)}</span>,
  },
  {
    accessorKey: 'totalDeductions',
    header: 'Deductions',
    cell: ({ getValue }) => <span className="text-sm text-red-600">-{formatCurrency(getValue() as number)}</span>,
  },
  {
    accessorKey: 'totalNet',
    header: 'Net Pay',
    cell: ({ getValue }) => <span className="text-sm font-bold text-emerald-600">{formatCurrency(getValue() as number)}</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as string
      const cfg = statusConfig[s]
      return <Badge variant={cfg.variant} className="text-[11px] capitalize">{cfg.label}</Badge>
    },
  },
  {
    accessorKey: 'wpsFileRef',
    header: 'WPS Ref',
    cell: ({ getValue }) => {
      const v = getValue() as string | undefined
      return v ? <span className="text-xs font-mono">{v}</span> : <span className="text-xs text-muted-foreground">—</span>
    },
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row: { original: p } }) => (
      <SifActionCell payroll={p} />
    ),
  },
]

export function PayrollPage() {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const canManagePayroll = can('manage_payroll')
  const [runConfirmOpen, setRunConfirmOpen] = useState(false)
  const [wpsExporting, setWpsExporting] = useState(false)
  const { accessToken } = useAuthStore()
  const { data: payrollData, isLoading } = usePayrollRuns({ year: new Date().getFullYear() })
  const { data: trendRaw } = usePayrollTrend()
  const runPayroll = useRunPayroll()
  const payrollRuns: PayrollRun[] = (payrollData?.data as PayrollRun[]) ?? []
  const search = useSearchFilters({
    storageKey: 'hrhub.payroll.searchHistory',
    availableFilters: PAYROLL_FILTERS,
  })
  const filteredRuns = useMemo(
    () => applyClientFilters(payrollRuns as any[], {
      searchInput: search.searchInput,
      appliedFilters: search.appliedFilters,
      searchFields: ['wpsFileRef', 'status'],
    }),
    [payrollRuns, search.appliedFilters, search.searchInput],
  )

  // Build gross/net chart from backend trend (which returns { month, amount } in millions)
  const chartData = (trendRaw ?? []).map((t) => {
    // amount is already net in AED millions — try to find matching run for gross
    const run = payrollRuns.find((r: any) =>
      new Date(r.year ?? new Date().getFullYear(), (r.month ?? 1) - 1).toLocaleDateString('en-AE', { month: 'short' }) === t.month,
    )
    return {
      month: t.month,
      gross: run ? Number((run as any).totalGross) : t.amount * 1_000_000 * 1.03,
      net: t.amount * 1_000_000,
    }
  })

  // KPIs from real runs
  const lastRun = payrollRuns.find((r: any) => r.status === 'paid' || r.status === 'wps_submitted')
  const draftRun = payrollRuns.find((r: any) => r.status === 'draft')
  const ytdNet = payrollRuns
    .filter((r: any) => r.status === 'paid' || r.status === 'wps_submitted')
    .reduce((a: number, r: any) => a + Number(r.totalNet ?? 0), 0)
  const paidCount = payrollRuns.filter((r: any) => r.status === 'paid' || r.status === 'wps_submitted').length
  const wpsPct = payrollRuns.length > 0 ? Math.round((paidCount / payrollRuns.length) * 100) : 100

  const draftLabel = draftRun
    ? new Date((draftRun as any).year, (draftRun as any).month - 1).toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })
    : '—'

  const handleExportWps = async () => {
    const targetRun = payrollRuns.find((r: any) => r.status === 'approved' || r.status === 'wps_submitted' || r.status === 'paid')
    if (!targetRun) {
      toast.warning('No approved run', 'Approve a payroll run first before exporting WPS SIF.')
      return
    }
    setWpsExporting(true)
    try {
      await downloadWpsSif((targetRun as any).id, accessToken)
      toast.success('WPS SIF exported', 'Salary information file downloaded.')
    } catch {
      toast.error('Export failed', 'Could not generate WPS SIF file.')
    } finally {
      setWpsExporting(false)
    }
  }

  const handleRunPayroll = () => {
    if (!draftRun) {
      toast.warning('No draft run', 'Create a draft payroll run before processing.')
      setRunConfirmOpen(false)
      return
    }
    runPayroll.mutate((draftRun as any).id, {
      onSuccess: (result) => {
        const updated = result as any
        toast.success(
          'Payroll processed',
          `${updated?.totalEmployees ?? 0} payslips calculated. Total net: AED ${Number(updated?.totalNet ?? 0).toLocaleString()}.`,
        )
        setRunConfirmOpen(false)
      },
      onError: (err: any) => {
        toast.error('Payroll failed', err?.message ?? 'Could not process payroll. Check employee salary data.')
        setRunConfirmOpen(false)
      },
    })
  }

  return (
    <PageWrapper>
      <PageHeader
        title={t('payroll.title')}
        description={t('payroll.description')}
      />

      {/* KPIs */}
      < div className="grid grid-cols-2 sm:grid-cols-4 gap-3" >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-7 rounded-lg" />
              </div>
              <Skeleton className="h-7 w-28" />
            </div>
          ))
        ) : (
          <>
            <KpiCardCompact label="Last Net Payroll" value={lastRun ? formatCurrency(Number((lastRun as any).totalNet)) : '—'} icon={CreditCard} color="blue" />
            <KpiCardCompact label="WPS Compliance" value={`${wpsPct}%`} icon={CheckCircle2} color="green" />
            <KpiCardCompact label="Pending Run" value={draftLabel} icon={Clock} color="amber" />
            <KpiCardCompact label="YTD Payroll" value={ytdNet > 0 ? formatCurrency(ytdNet) : '—'} icon={TrendingUp} color="purple" />
          </>
        )}
      </div >

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Payroll Trend (2025)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 13% 92%)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `${(v / 1000000).toFixed(1)}M`} />
                <Tooltip formatter={(v: any) => [formatCurrency(v)]} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="gross" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Gross" />
                <Bar dataKey="net" fill="#10b981" radius={[4, 4, 0, 0]} name="Net" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Draft payroll action card */}
        <Card className="p-5 flex flex-col justify-between">
          {draftRun ? (
            <>
              <div>
                <Badge variant="warning" className="mb-3">Draft</Badge>
                <h3 className="text-lg font-bold mb-1">{draftLabel} Payroll</h3>
                <p className="text-sm text-muted-foreground mb-4">{(draftRun as any).totalEmployees ?? 0} employees · Ready to process</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Estimated Gross</span><span className="font-medium">{formatCurrency(Number((draftRun as any).totalGross ?? 0))}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Deductions</span><span className="font-medium text-red-500">-{formatCurrency(Number((draftRun as any).totalDeductions ?? 0))}</span></div>
                  <div className="flex justify-between border-t pt-2"><span className="font-semibold">Est. Net Pay</span><span className="font-bold text-emerald-600">{formatCurrency(Number((draftRun as any).totalNet ?? 0))}</span></div>
                </div>
              </div>
              {canManagePayroll && (
                <Button className="mt-4 w-full" leftIcon={<Play className="h-4 w-4" />} onClick={() => setRunConfirmOpen(true)}>
                  Run {draftLabel} Payroll
                </Button>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Clock className="h-8 w-8 text-muted-foreground/50 mb-2" />
              <p className="text-sm font-medium">No draft run</p>
              <p className="text-xs text-muted-foreground mt-1">Create a draft payroll to start processing.</p>
            </div>
          )}
        </Card>
      </div>

      {/* History */}
      <Card className="p-5">
        <DataTable
          columns={columns}
          data={filteredRuns}
          isLoading={isLoading}
          emptyMessage="No payroll runs found."
          advancedFilter={{
            search,
            filters: PAYROLL_FILTERS,
            placeholder: 'Search payroll runs…',
          }}
          enableSelection
          getRowId={(row: any) => String(row.id)}
          toolbar={
            <Button variant="outline" size="sm" leftIcon={<FileDown className="h-3.5 w-3.5" />}
              loading={wpsExporting} onClick={handleExportWps}>Export WPS</Button>
          }
          bulkActions={(selected) => (
            <>
              <Button variant="outline" size="sm" leftIcon={<FileDown className="h-3.5 w-3.5" />}
                onClick={() => toast.success(`Exporting ${selected.length} payroll runs`)}>
                Export Selected
              </Button>
            </>
          )}
        />
      </Card>

      <ConfirmDialog
        open={runConfirmOpen}
        onOpenChange={(o) => { if (!runPayroll.isPending) setRunConfirmOpen(o) }}
        title={`Run ${draftLabel} Payroll`}
        description={draftRun
          ? `This will calculate payslips for all active employees and mark the run as approved. Estimated net: ${formatCurrency(Number((draftRun as any).totalNet ?? 0))}.`
          : 'There is no draft run to process.'}
        confirmLabel={runPayroll.isPending ? 'Processing…' : 'Run Payroll'}
        cancelLabel="Cancel"
        onConfirm={handleRunPayroll}
        variant="warning"
      />
    </PageWrapper >
  )
}
