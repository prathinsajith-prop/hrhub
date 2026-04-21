import React, { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { CreditCard, CheckCircle2, Clock, AlertTriangle, Play, FileDown, Send, TrendingUp } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge, Card, CardHeader, CardTitle, CardContent } from '@/components/ui/primitives'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { usePayrollRuns } from '@/hooks/usePayroll'
import type { PayrollRun } from '@/types'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
const chartData = months.map((m, i) => ({
  month: m,
  gross: 4600000 + i * 60000,
  deductions: 140000 + i * 2000,
  net: 4460000 + i * 58000,
}))

const statusConfig: Record<string, { variant: any; label: string; icon: React.ElementType }> = {
  draft: { variant: 'secondary', label: 'Draft', icon: Clock },
  processing: { variant: 'info', label: 'Processing', icon: Clock },
  approved: { variant: 'success', label: 'Approved', icon: CheckCircle2 },
  wps_submitted: { variant: 'info', label: 'WPS Submitted', icon: Send },
  paid: { variant: 'success', label: 'Paid', icon: CheckCircle2 },
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
      <div className="flex gap-1">
        {p.status === 'draft' && (
          <Button size="sm" leftIcon={<Play className="h-3 w-3" />} className="h-7 text-xs">Run Payroll</Button>
        )}
        {p.status === 'approved' && (
          <Button size="sm" variant="outline" leftIcon={<Send className="h-3 w-3" />} className="h-7 text-xs">Submit WPS</Button>
        )}
        <Button size="icon-sm" variant="ghost"><FileDown className="h-3.5 w-3.5" /></Button>
      </div>
    ),
  },
]

export function PayrollPage() {
  const [runConfirmOpen, setRunConfirmOpen] = useState(false)
  const { data: payrollData } = usePayrollRuns({ year: new Date().getFullYear() })
  const payrollRuns: PayrollRun[] = (payrollData?.data as PayrollRun[]) ?? []

  const handleRunPayroll = () => {
    toast.success('Payroll processing started', 'May 2025 payroll is being calculated for 253 employees.')
    setRunConfirmOpen(false)
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Payroll & WPS"
        description="Salary processing and WPS compliance"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCardCompact label="Last Net Payroll" value={formatCurrency(4742000)} icon={CreditCard} color="blue" />
        <KpiCardCompact label="WPS Compliance" value="100%" icon={CheckCircle2} color="green" />
        <KpiCardCompact label="Pending Run" value="May 2025" icon={Clock} color="amber" />
        <KpiCardCompact label="YTD Payroll" value={formatCurrency(23900000)} icon={TrendingUp} color="purple" />
      </div>

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

        {/* May 2025 action card */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <Badge variant="warning" className="mb-3">Draft</Badge>
            <h3 className="text-lg font-bold mb-1">May 2025 Payroll</h3>
            <p className="text-sm text-muted-foreground mb-4">253 employees · Ready to process</p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Estimated Gross</span><span className="font-medium">{formatCurrency(4920000)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Deductions</span><span className="font-medium text-red-500">-{formatCurrency(150000)}</span></div>
              <div className="flex justify-between border-t pt-2"><span className="font-semibold">Est. Net Pay</span><span className="font-bold text-emerald-600">{formatCurrency(4770000)}</span></div>
            </div>
          </div>
          <Button className="mt-4 w-full" leftIcon={<Play className="h-4 w-4" />} onClick={() => setRunConfirmOpen(true)}>
            Run May Payroll
          </Button>
        </Card>
      </div>

      {/* History */}
      <Card className="p-5">
        <DataTable
          columns={columns}
          data={payrollRuns}
          pageSize={5}
          emptyMessage="No payroll runs found."
          enableSelection
          getRowId={(row: any) => String(row.id)}
          toolbar={
            <Button variant="outline" size="sm" leftIcon={<FileDown className="h-3.5 w-3.5" />}>Export WPS</Button>
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
        onOpenChange={setRunConfirmOpen}
        title="Run May 2025 Payroll"
        description="This will calculate salaries for 253 employees totalling approximately AED 4,770,000 net. Confirm to proceed with payroll run."
        confirmLabel="Run Payroll"
        cancelLabel="Cancel"
        onConfirm={handleRunPayroll}
        variant="warning"
      />
    </PageWrapper>
  )
}
