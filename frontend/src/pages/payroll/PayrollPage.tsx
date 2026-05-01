import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import {
  CreditCard, CheckCircle2, Clock, Play, FileDown, Send,
  TrendingUp, RefreshCcw, Plus, Calculator, DollarSign,
  CircleDot, ArrowRight, Banknote, Users, BarChart3,
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/primitives'
import type { badgeVariants } from '@/components/ui/badge'
import type { VariantProps } from 'class-variance-authority'
type BadgeVariant = VariantProps<typeof badgeVariants>['variant']
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { NumericInput } from '@/components/ui/numeric-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { formatCurrency, cn } from '@/lib/utils'
import {
  usePayrollRuns, useRunPayroll, useSubmitWps,
  useCreatePayrollRun, useUpdatePayrollRun, usePayslips, useGratuityCalc,
} from '@/hooks/usePayroll'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import type { PayrollRun, Payslip } from '@/types'

// ─── constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i).toLocaleDateString('en-AE', { month: 'long' }),
)
const MONTH_SHORT = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i).toLocaleDateString('en-AE', { month: 'short' }),
)

function periodLabel(month: number, year: number) {
  return new Date(year, month - 1).toLocaleDateString('en-AE', { month: 'long', year: 'numeric' })
}

const STATUS_CFG: Record<string, { variant: BadgeVariant; label: string; step: number }> = {
  draft:         { variant: 'secondary', label: 'Draft',         step: 0 },
  processing:    { variant: 'info',      label: 'Processing',    step: 1 },
  approved:      { variant: 'success',   label: 'Approved',      step: 2 },
  wps_submitted: { variant: 'info',      label: 'WPS Submitted', step: 3 },
  paid:          { variant: 'success',   label: 'Paid',          step: 4 },
}

const WORKFLOW_STEPS = ['Draft', 'Processing', 'Approved', 'WPS Submitted', 'Paid']

const PIE_COLORS = ['#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444']

// ─── download helpers ─────────────────────────────────────────────────────────

async function downloadBlob(url: string, filename: string, token: string | null) {
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
  if (!res.ok) throw new Error('Download failed')
  const blob = await res.blob()
  const match = (res.headers.get('Content-Disposition') ?? '').match(/filename="(.+?)"/)
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = match?.[1] ?? filename
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Workflow progress bar ─────────────────────────────────────────────────────

function WorkflowBar({ status }: { status: string }) {
  const current = STATUS_CFG[status]?.step ?? 0
  return (
    <div className="flex items-center w-full">
      {WORKFLOW_STEPS.map((step, i) => {
        const done = i < current
        const active = i === current
        const isLast = i === WORKFLOW_STEPS.length - 1
        return (
          <div key={step} className={cn('flex items-center', !isLast && 'flex-1 min-w-0')}>
            <div className="flex flex-col items-center gap-1 shrink-0">
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all text-xs font-semibold',
                done  ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' :
                active ? 'border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20' :
                         'border-border bg-background text-muted-foreground',
              )}>
                {done   ? <CheckCircle2 className="h-3.5 w-3.5" /> :
                 active ? <CircleDot className="h-3.5 w-3.5" /> :
                          <span>{i + 1}</span>}
              </div>
              <span className={cn(
                'text-[10px] font-medium whitespace-nowrap',
                active ? 'text-primary font-semibold' : done ? 'text-emerald-600' : 'text-muted-foreground',
              )}>{step}</span>
            </div>
            {!isLast && (
              <div className={cn('h-px flex-1 mx-2 mb-4', done ? 'bg-emerald-400' : 'bg-border')} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Payroll Charts ────────────────────────────────────────────────────────────

function PayrollCharts({ runs }: { runs: PayrollRun[] }) {
  const areaData = useMemo(() => {
    const paid = runs
      .filter(r => ['approved', 'wps_submitted', 'paid'].includes(r.status))
      .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
    return paid.map(r => ({
      name: MONTH_SHORT[r.month - 1],
      Gross: Number(r.totalGross ?? 0),
      Net: Number(r.totalNet ?? 0),
      Deductions: Number(r.totalDeductions ?? 0),
    }))
  }, [runs])

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {}
    runs.forEach(r => { counts[r.status] = (counts[r.status] ?? 0) + 1 })
    return Object.entries(counts).map(([name, value]) => ({
      name: STATUS_CFG[name]?.label ?? name,
      value,
    }))
  }, [runs])

  if (runs.length === 0) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Area chart: Gross vs Net trend */}
      <Card className="lg:col-span-2 p-4">
        <h3 className="text-sm font-semibold mb-4">Gross vs Net Payroll Trend</h3>
        {areaData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">
            No processed runs yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={areaData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis
                tickFormatter={v => `${(v / 1000).toFixed(0)}k`}
                tick={{ fontSize: 11 }}
                width={48}
              />
              <Tooltip
                formatter={(value: unknown, name: unknown) => [formatCurrency(Number(value ?? 0)), String(name ?? "")]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="Gross" stroke="#3b82f6" fill="url(#gradGross)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="Net" stroke="#10b981" fill="url(#gradNet)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Pie chart: Run status distribution */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-4">Runs by Status</h3>
        {statusData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">No data</div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 w-full">
              {statusData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-muted-foreground">{d.name}</span>
                  </div>
                  <span className="font-semibold">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Bar chart: deductions breakdown */}
      {areaData.length > 0 && (
        <Card className="lg:col-span-3 p-4">
          <h3 className="text-sm font-semibold mb-4">Deductions per Month</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={areaData} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} width={48} />
              <Tooltip
                formatter={(value: unknown) => [formatCurrency(Number(value ?? 0)), "Deductions"]}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
              />
              <Bar dataKey="Deductions" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  )
}

// ─── Payslip breakdown sheet ──────────────────────────────────────────────────

function PayslipRow({ label, value, sub, bold, red, green }: {
  label: string; value: number; sub?: boolean; bold?: boolean; red?: boolean; green?: boolean
}) {
  return (
    <div className={cn('flex justify-between items-center py-2', sub ? 'pl-3' : '')}>
      <span className={cn('text-sm', bold ? 'font-semibold' : 'text-muted-foreground', sub && 'text-xs')}>{label}</span>
      <span className={cn(
        'text-sm tabular-nums',
        bold ? 'font-bold' : '',
        red ? 'text-red-600' : green ? 'text-emerald-600' : '',
      )}>
        {red ? '-' : ''}{formatCurrency(Math.abs(value))}
      </span>
    </div>
  )
}

function PayslipsSheet({ run, open, onClose }: { run: PayrollRun | null; open: boolean; onClose: () => void }) {
  const { accessToken } = useAuthStore()
  const { data, isLoading } = usePayslips(run?.id ?? '')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const payslips = (data ?? []) as Payslip[]

  const chartData = useMemo(() => payslips.slice(0, 10).map(ps => ({
    name: (ps.employeeName ?? '').split(' ')[0],
    Net: Number(ps.netSalary),
    Gross: Number(ps.grossSalary),
  })), [payslips])

  const handleDownload = async (ps: Payslip) => {
    setDownloading(ps.id)
    try {
      await downloadBlob(`/api/v1/payroll/payslips/${ps.id}/download`, `payslip-${ps.id}.pdf`, accessToken)
      toast.success('Payslip downloaded')
    } catch {
      toast.error('Download failed', 'Could not generate payslip PDF.')
    } finally {
      setDownloading(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col p-0">
        <SheetHeader className="px-6 py-5 border-b shrink-0">
          <SheetTitle>{run ? `${periodLabel(run.month, run.year)} — Payslips` : 'Payslips'}</SheetTitle>
          {run && (
            <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{run.totalEmployees ?? 0} employees</span>
              <span className="flex items-center gap-1 text-emerald-600 font-medium"><Banknote className="h-3 w-3" />Net {formatCurrency(Number(run.totalNet ?? 0))}</span>
            </div>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto divide-y">
          {isLoading ? (
            <div className="p-5 space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex justify-between p-3 rounded-lg border">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : payslips.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-24 text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-medium">No payslips yet</p>
                <p className="text-xs text-muted-foreground mt-1">Process the payroll run to generate payslips.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Mini bar chart inside sheet */}
              {chartData.length > 0 && (
                <div className="px-5 py-4 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground mb-3">Salary Overview (top {chartData.length})</p>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                      <YAxis hide tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip formatter={(v: unknown) => formatCurrency(Number(v ?? 0))} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                      <Bar dataKey="Gross" fill="#93c5fd" radius={[2, 2, 0, 0]} maxBarSize={20} />
                      <Bar dataKey="Net" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={20} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {payslips.map((ps) => {
                const isExp = expanded === ps.id
                return (
                  <div key={ps.id} className="hover:bg-muted/20 transition-colors">
                    <button
                      type="button"
                      className="w-full flex items-center justify-between px-5 py-3.5 text-left"
                      onClick={() => setExpanded(isExp ? null : ps.id)}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{ps.employeeName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Gross {formatCurrency(Number(ps.grossSalary))} · Net <span className="text-emerald-600 font-semibold">{formatCurrency(Number(ps.netSalary))}</span>
                        </p>
                      </div>
                      <ArrowRight className={cn('h-3.5 w-3.5 text-muted-foreground shrink-0 ml-3 transition-transform', isExp && 'rotate-90')} />
                    </button>

                    {isExp && (
                      <div className="px-5 pb-4 bg-muted/10 border-t">
                        <div className="divide-y divide-border/60">
                          <div className="py-1">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-2 pb-1">Earnings</p>
                            {Number(ps.basicSalary) > 0 && <PayslipRow label="Basic Salary" value={Number(ps.basicSalary)} sub />}
                            {Number(ps.housingAllowance) > 0 && <PayslipRow label="Housing Allowance" value={Number(ps.housingAllowance)} sub />}
                            {Number(ps.transportAllowance) > 0 && <PayslipRow label="Transport Allowance" value={Number(ps.transportAllowance)} sub />}
                            {Number(ps.otherAllowances) > 0 && <PayslipRow label="Other Allowances" value={Number(ps.otherAllowances)} sub />}
                            {Number(ps.overtime) > 0 && <PayslipRow label="Overtime" value={Number(ps.overtime)} sub />}
                            <PayslipRow label="Total Gross" value={Number(ps.grossSalary)} bold />
                          </div>
                          {Number(ps.deductions) > 0 && (
                            <div className="py-1">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground pt-2 pb-1">Deductions</p>
                              <PayslipRow label="Total Deductions" value={Number(ps.deductions)} red sub />
                            </div>
                          )}
                          <div className="flex justify-between items-center py-3">
                            <span className="text-sm font-bold">Net Salary</span>
                            <span className="text-base font-bold text-emerald-600">{formatCurrency(Number(ps.netSalary))}</span>
                          </div>
                        </div>
                        <Button
                          size="sm" variant="outline" className="w-full mt-2 h-8 text-xs"
                          loading={downloading === ps.id}
                          leftIcon={<FileDown className="h-3 w-3" />}
                          onClick={() => handleDownload(ps)}
                        >
                          Download PDF Payslip
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

// ─── Gratuity Calculator ───────────────────────────────────────────────────────

function GratuityCalculator() {
  const [basic, setBasic] = useState('')
  const [years, setYears] = useState('')
  const basicNum = Number(basic)
  const yearsNum = Number(years)
  const { data } = useGratuityCalc(basicNum, yearsNum)
  const hasResult = data?.gratuity != null && basicNum > 0 && yearsNum >= 1

  const uaeRules = yearsNum < 1 ? null :
    yearsNum < 5 ? '21 days per year of service' : '30 days per year of service'

  // Breakdown bar data
  const barData = useMemo(() => {
    if (!hasResult || !data) return []
    const phase1Years = Math.min(yearsNum, 5)
    const phase2Years = Math.max(0, yearsNum - 5)
    const dailyRate = basicNum / 30
    return [
      { phase: 'First 5 yrs (21d)', amount: dailyRate * 21 * phase1Years },
      ...(phase2Years > 0 ? [{ phase: 'After 5 yrs (30d)', amount: dailyRate * 30 * phase2Years }] : []),
    ]
  }, [hasResult, data, basicNum, yearsNum])

  return (
    <div className="space-y-5 max-w-xl">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Calculator className="h-4 w-4 text-muted-foreground" />
          End-of-Service Gratuity Calculator
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Based on UAE Labour Law — 21 days/year for first 5 years, 30 days/year thereafter.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Basic Monthly Salary (AED)</Label>
          <NumericInput maxDecimals={2} placeholder="e.g. 10,000" value={basic} onChange={e => setBasic(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Years of Service</Label>
          <NumericInput maxDecimals={1} placeholder="e.g. 3" value={years} onChange={e => setYears(e.target.value)} />
        </div>
      </div>

      {hasResult ? (
        <div className="space-y-4">
          <div className="rounded-xl border bg-emerald-50/60 border-emerald-100 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-emerald-800">Estimated Gratuity</span>
              <span className="text-2xl font-bold text-emerald-700">{formatCurrency(data!.gratuity)}</span>
            </div>
            <Separator className="bg-emerald-100" />
            <div className="space-y-1.5 text-xs text-emerald-700">
              <div className="flex justify-between">
                <span>Calculation basis</span>
                <span className="font-medium">{uaeRules}</span>
              </div>
              <div className="flex justify-between">
                <span>Daily basic rate</span>
                <span className="font-medium">{formatCurrency(basicNum / 30)} / day</span>
              </div>
            </div>
          </div>

          {/* Breakdown bar chart */}
          {barData.length > 0 && (
            <div className="rounded-xl border p-4">
              <p className="text-xs font-medium text-muted-foreground mb-3">Gratuity Breakdown</p>
              <ResponsiveContainer width="100%" height={100}>
                <BarChart data={barData} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="phase" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(v: unknown) => formatCurrency(Number(v ?? 0))} contentStyle={{ fontSize: 11, borderRadius: 6 }} />
                  <Bar dataKey="amount" fill="#10b981" radius={[0, 4, 4, 0]} label={{ position: 'right', fontSize: 11, formatter: (v: unknown) => formatCurrency(Number(v ?? 0)) }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <Calculator className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Enter basic salary and years of service to calculate.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Minimum 1 year service required for gratuity.</p>
        </div>
      )}
    </div>
  )
}

// ─── Row action cell ───────────────────────────────────────────────────────────

function RunActions({ run, canManage }: { run: PayrollRun; canManage: boolean }) {
  const { accessToken } = useAuthStore()
  const [sifLoading, setSifLoading] = useState(false)
  const submitWps = useSubmitWps()
  const markPaid = useUpdatePayrollRun(run.id)

  const handleSif = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setSifLoading(true)
    try {
      await downloadBlob(`/api/v1/payroll/${run.id}/wps-sif`, 'WPS_SIF.sif', accessToken)
      toast.success('WPS SIF downloaded')
    } catch {
      toast.error('Download failed', 'No payslips found for this run.')
    } finally { setSifLoading(false) }
  }

  const handleSubmitWps = (e: React.MouseEvent) => {
    e.stopPropagation()
    submitWps.mutate(run.id, {
      onSuccess: () => toast.success('WPS submitted', 'Status updated to WPS Submitted.'),
      onError: () => toast.error('Submission failed'),
    })
  }

  const handleMarkPaid = (e: React.MouseEvent) => {
    e.stopPropagation()
    markPaid.mutate({ status: 'paid' }, {
      onSuccess: () => toast.success('Payroll marked as paid'),
      onError: () => toast.error('Update failed'),
    })
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      {['approved', 'wps_submitted', 'paid'].includes(run.status) && (
        <Button size="sm" variant="ghost" loading={sifLoading}
          leftIcon={<FileDown className="h-3 w-3" />} className="h-7 text-xs"
          onClick={handleSif}>
          SIF
        </Button>
      )}
      {run.status === 'approved' && canManage && (
        <Button size="sm" variant="ghost" loading={submitWps.isPending}
          leftIcon={<Send className="h-3 w-3" />} className="h-7 text-xs"
          onClick={handleSubmitWps}>
          Submit WPS
        </Button>
      )}
      {run.status === 'wps_submitted' && canManage && (
        <Button size="sm" variant="ghost" loading={markPaid.isPending}
          leftIcon={<CheckCircle2 className="h-3 w-3 text-emerald-600" />}
          className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
          onClick={handleMarkPaid}>
          Mark Paid
        </Button>
      )}
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function PayrollPage() {
  const { t } = useTranslation()
  const { can } = usePermissions()
  const canManagePayroll = can('manage_payroll')

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  const { data: payrollData, isLoading, isFetching, refetch } = usePayrollRuns({ year: currentYear })
  const payrollRuns = useMemo<PayrollRun[]>(() => (payrollData?.data as PayrollRun[]) ?? [], [payrollData?.data])

  const runPayroll = useRunPayroll()
  const createRun = useCreatePayrollRun()

  const [createOpen, setCreateOpen] = useState(false)
  const [runConfirmOpen, setRunConfirmOpen] = useState(false)
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null)
  const [payslipsOpen, setPayslipsOpen] = useState(false)

  const [createMonth, setCreateMonth] = useState(currentMonth)
  const [createYear, setCreateYear] = useState(currentYear)

  // Disable months in the future when selected year = current year
  const maxSelectableMonth = createYear === currentYear ? currentMonth : 12

  const draftRun = payrollRuns.find(r => r.status === 'draft')
  const latestPaidRun = payrollRuns.find(r => r.status === 'paid' || r.status === 'wps_submitted')
  const ytdNet = payrollRuns
    .filter(r => r.status === 'paid' || r.status === 'wps_submitted')
    .reduce((a, r) => a + Number(r.totalNet ?? 0), 0)
  const paidCount = payrollRuns.filter(r => r.status === 'paid' || r.status === 'wps_submitted').length
  const wpsPct = payrollRuns.length > 0 ? Math.round((paidCount / payrollRuns.length) * 100) : 100
  const draftLabel = draftRun ? periodLabel(draftRun.month, draftRun.year) : '—'

  const columns = useMemo<ColumnDef<PayrollRun>[]>(() => [
    {
      id: 'period',
      header: 'Pay Period',
      cell: ({ row: { original: p } }) => (
        <div>
          <p className="text-sm font-medium">{periodLabel(p.month, p.year)}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{p.totalEmployees ?? 0} employees</p>
        </div>
      ),
    },
    {
      accessorKey: 'totalGross',
      header: 'Gross',
      cell: ({ getValue }) => <span className="text-sm tabular-nums">{formatCurrency(getValue() as number)}</span>,
    },
    {
      accessorKey: 'totalDeductions',
      header: 'Deductions',
      cell: ({ getValue }) => (
        <span className="text-sm tabular-nums text-red-500">-{formatCurrency(getValue() as number)}</span>
      ),
    },
    {
      accessorKey: 'totalNet',
      header: 'Net Pay',
      cell: ({ getValue }) => (
        <span className="text-sm font-bold tabular-nums text-emerald-600">{formatCurrency(getValue() as number)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as string
        const cfg = STATUS_CFG[s] ?? { variant: 'secondary' as BadgeVariant, label: s }
        return <Badge variant={cfg.variant} className="text-[11px]">{cfg.label}</Badge>
      },
    },
    {
      accessorKey: 'wpsFileRef',
      header: 'WPS Ref',
      cell: ({ getValue }) => {
        const v = getValue() as string | undefined
        return v
          ? <span className="text-[11px] font-mono text-muted-foreground">{v}</span>
          : <span className="text-muted-foreground/30 text-xs">—</span>
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row: { original: p } }) => <RunActions run={p} canManage={canManagePayroll} />,
    },
  ], [canManagePayroll])

  const handleCreateRun = () => {
    createRun.mutate({ month: createMonth, year: createYear }, {
      onSuccess: () => {
        toast.success('Draft created', `${MONTH_NAMES[createMonth - 1]} ${createYear} payroll is ready to process.`)
        setCreateOpen(false)
      },
    })
  }

  const handleRunPayroll = () => {
    if (!draftRun) return
    runPayroll.mutate(draftRun.id, {
      onSuccess: (result) => {
        const r = result as { totalEmployees?: number; totalNet?: number }
        toast.success('Payroll approved', `${r?.totalEmployees ?? 0} payslips · Net ${formatCurrency(Number(r?.totalNet ?? 0))}`)
        setRunConfirmOpen(false)
      },
      onError: (err: unknown) => {
        toast.error('Payroll failed', (err as { message?: string })?.message ?? 'Check employee salary data.')
        setRunConfirmOpen(false)
      },
    })
  }

  return (
    <PageWrapper>
      <PageHeader
        title={t('payroll.title')}
        description={t('payroll.description')}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm"
              leftIcon={<RefreshCcw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />}
              onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
            {canManagePayroll && (
              <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}
                onClick={() => setCreateOpen(true)} disabled={!!draftRun}>
                New Payroll Run
              </Button>
            )}
          </div>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCardCompact label="Last Net Payroll" value={latestPaidRun ? formatCurrency(Number(latestPaidRun.totalNet)) : '—'} icon={CreditCard} color="blue" loading={isLoading} />
        <KpiCardCompact label="WPS Compliance" value={isLoading ? undefined : `${wpsPct}%`} icon={CheckCircle2} color="green" loading={isLoading} />
        <KpiCardCompact label="Pending Run" value={isLoading ? undefined : draftLabel} icon={Clock} color="amber" loading={isLoading} />
        <KpiCardCompact label="YTD Payroll" value={isLoading ? undefined : (ytdNet > 0 ? formatCurrency(ytdNet) : '—')} icon={TrendingUp} color="purple" loading={isLoading} />
      </div>

      {/* Draft run action banner */}
      {draftRun && !isLoading && (
        <Card className="border-l-4 border-l-amber-400 border border-amber-200 bg-gradient-to-r from-amber-50/70 to-background overflow-hidden">
          <CardContent className="p-5">

            {/* Row 1: identity + action */}
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                  <Banknote className="h-4.5 w-4.5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{draftLabel} Payroll Run</p>
                    <Badge variant="warning" className="text-[10px]">Draft</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    Ready to process — review employee records before running
                  </p>
                </div>
              </div>
              {canManagePayroll && (
                <Button leftIcon={<Play className="h-4 w-4" />} onClick={() => setRunConfirmOpen(true)} className="shrink-0">
                  Process Payroll
                </Button>
              )}
            </div>

            {/* Row 2: stepper */}
            <WorkflowBar status={draftRun.status} />

            {/* Row 3: stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 mt-5 pt-4 border-t border-amber-100 w-full">
              <div className="flex items-center gap-2 px-5 first:pl-0 border-r border-border">
                <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">Employees</p>
                  <p className="text-sm font-semibold">{draftRun.totalEmployees ?? 0}</p>
                </div>
              </div>
              <div className="px-5 border-r border-border sm:border-r">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">Gross Pay</p>
                <p className="text-sm font-semibold">{formatCurrency(Number(draftRun.totalGross ?? 0))}</p>
              </div>
              <div className="px-5 border-r border-border mt-3 sm:mt-0 border-t sm:border-t-0 pt-3 sm:pt-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">Deductions</p>
                <p className="text-sm font-semibold text-red-500">−{formatCurrency(Number(draftRun.totalDeductions ?? 0))}</p>
              </div>
              <div className="px-5 mt-3 sm:mt-0 border-t sm:border-t-0 pt-3 sm:pt-0">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground leading-none mb-0.5">Net Pay</p>
                <p className="text-sm font-bold text-emerald-600">{formatCurrency(Number(draftRun.totalNet ?? 0))}</p>
              </div>
            </div>

          </CardContent>
        </Card>
      )}

      {/* Main tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="bg-muted/60">
          <TabsTrigger value="overview" className="gap-1.5 text-sm">
            <TrendingUp className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-sm">
            <BarChart3 className="h-3.5 w-3.5" />
            History
          </TabsTrigger>
          <TabsTrigger value="tools" className="gap-1.5 text-sm">
            <Calculator className="h-3.5 w-3.5" />
            Gratuity Calculator
          </TabsTrigger>
        </TabsList>

        {/* Overview tab — charts */}
        <TabsContent value="overview" className="mt-4">
          {isLoading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className={cn('rounded-xl border bg-card p-4', i === 0 && 'lg:col-span-2')}>
                  <Skeleton className="h-4 w-40 mb-4" />
                  <Skeleton className="h-48 w-full" />
                </div>
              ))}
            </div>
          ) : payrollRuns.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium text-muted-foreground">No payroll data yet</p>
              <p className="text-xs text-muted-foreground/70">Create and process a payroll run to see charts here.</p>
            </div>
          ) : (
            <PayrollCharts runs={payrollRuns} />
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Payroll Runs — {currentYear}</CardTitle>
              <p className="text-xs text-muted-foreground">Click any row to view individual payslips.</p>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={columns}
                data={payrollRuns}
                isLoading={isLoading}
                emptyMessage="No payroll runs yet for this year. Use 'New Payroll Run' to get started."
                onRowClick={(run) => { setSelectedRun(run); setPayslipsOpen(true) }}
                getRowId={(row) => String(row.id)}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tools" className="mt-4">
          <Card className="p-6">
            <GratuityCalculator />
          </Card>
        </TabsContent>
      </Tabs>

      {/* Payslips sheet */}
      <PayslipsSheet run={selectedRun} open={payslipsOpen} onClose={() => setPayslipsOpen(false)} />

      {/* Create run dialog */}
      <Dialog open={createOpen} onOpenChange={(v) => { if (!createRun.isPending) setCreateOpen(v) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Payroll Run</DialogTitle>
            <DialogDescription>Select the pay period. Only past or current months are allowed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Select
                  value={String(createYear)}
                  onValueChange={v => {
                    const y = Number(v)
                    setCreateYear(y)
                    // clamp month when switching to current year
                    if (y === currentYear && createMonth > currentMonth) {
                      setCreateMonth(currentMonth)
                    }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[currentYear - 1, currentYear].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Month</Label>
                <Select value={String(createMonth)} onValueChange={v => setCreateMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTH_NAMES.map((name, i) => {
                      const monthNum = i + 1
                      const isFuture = monthNum > maxSelectableMonth
                      return (
                        <SelectItem key={monthNum} value={String(monthNum)} disabled={isFuture}>
                          <span className={cn(isFuture && 'text-muted-foreground')}>{name}</span>
                          {isFuture && <span className="ml-1.5 text-[10px] text-muted-foreground">(future)</span>}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Period preview */}
            <div className="rounded-lg bg-muted/40 border px-3 py-2.5 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Pay period</span>
              <span className="text-sm font-semibold">{MONTH_NAMES[createMonth - 1]} {createYear}</span>
            </div>

            <Separator />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={createRun.isPending}>Cancel</Button>
              <Button onClick={handleCreateRun} loading={createRun.isPending}>Create Draft</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Process confirm */}
      <ConfirmDialog
        open={runConfirmOpen}
        onOpenChange={o => { if (!runPayroll.isPending) setRunConfirmOpen(o) }}
        title={`Process ${draftLabel} Payroll`}
        description={draftRun
          ? `Payslips will be calculated for all ${draftRun.totalEmployees ?? 0} active employees. Estimated net pay: ${formatCurrency(Number(draftRun.totalNet ?? 0))}. This action marks the run as Approved.`
          : 'No draft run to process.'}
        confirmLabel={runPayroll.isPending ? 'Processing…' : 'Process Payroll'}
        cancelLabel="Cancel"
        onConfirm={handleRunPayroll}
        variant="warning"
      />
    </PageWrapper>
  )
}
