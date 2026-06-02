import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import {
  CreditCard, CheckCircle2, Clock, Play, FileDown, Send,
  TrendingUp, RefreshCcw, Plus, Calculator, DollarSign,
  CircleDot, ArrowRight, Banknote, Users, BarChart3,
  Sparkles, Trash2, Lock, AlertTriangle, AlertCircle, ExternalLink,
  Upload, FileSpreadsheet, X, XCircle, Loader2, ChevronRight,
  Copy, Info, PencilLine, MinusCircle,
} from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { InitialsAvatar } from '@/components/shared/Avatar'
import type { PayrollReadinessEmployee } from '@/hooks/usePayroll'
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
  useAdjustments, useCreateAdjustment, useDeleteAdjustment, useSyncAdjustments,
  useBulkCreateAdjustments, useValidateBulkAdjustments,
  useBulkImportHistory, useDownloadImportFile,
  useAdjustmentCategories, useCreateAdjustmentCategory,
  useDeletePayrollRun, useReadiness,
  type BulkAdjustmentRow, type BulkCreateAdjustmentsResult, type BulkValidateRow,
  type BulkRowAction, type RowChanges,
  type BulkImportHistoryRow, type AdjustmentCategoryOption,
} from '@/hooks/usePayroll'
import { api } from '@/lib/api'
import { EmployeeSelect } from '@/components/shared/EmployeeSelect'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/authStore'
import { Link } from 'react-router-dom'
import type { PayrollRun, Payslip, PayrollAdjustment, PayrollAdjustmentCategory } from '@/types'

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
  draft: { variant: 'secondary', label: 'Draft', step: 0 },
  processing: { variant: 'info', label: 'Processing', step: 1 },
  approved: { variant: 'success', label: 'Approved', step: 2 },
  wps_submitted: { variant: 'info', label: 'WPS Submitted', step: 3 },
  paid: { variant: 'success', label: 'Paid', step: 4 },
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

// ─── Readiness row ─────────────────────────────────────────────────────────
// Renders a single blocker/warning line. When the line is associated with a
// list of employees (missing salary / missing IBAN), the message becomes a
// popover trigger that lists names + employee_no with a link to the employee
// detail page so HR can jump straight to the fix.

function inferReadinessEmployees(
  msg: string,
  readiness: { missingSalaryEmployees: PayrollReadinessEmployee[]; missingIbanEmployees: PayrollReadinessEmployee[] },
): PayrollReadinessEmployee[] | null {
  // The backend writes the human messages, but the *association* is implicit.
  // Match by substring — the readiness messages have stable phrasing.
  if (msg.includes('no basic salary')) return readiness.missingSalaryEmployees
  if (msg.includes('missing an IBAN')) return readiness.missingIbanEmployees
  return null
}

function ReadinessRow({
  tone, message, employees,
}: {
  tone: 'blocker' | 'warning'
  message: string
  employees: PayrollReadinessEmployee[] | null
}) {
  const Icon = tone === 'blocker' ? AlertCircle : AlertTriangle
  const wrapperClass = tone === 'blocker'
    ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200'
    : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200'
  const linkClass = tone === 'blocker'
    ? 'underline decoration-rose-400 underline-offset-2 hover:text-rose-900 dark:hover:text-rose-100'
    : 'underline decoration-amber-400 underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100'

  if (!employees || employees.length === 0) {
    return (
      <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', wrapperClass)}>
        <Icon className="mt-0.5 size-3.5 shrink-0" />
        <span>{message}</span>
      </div>
    )
  }

  return (
    <div className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', wrapperClass)}>
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      <div>
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={cn('text-left', linkClass)}>
              {message}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" sideOffset={6} className="w-80 p-0">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className="text-xs font-medium text-foreground">Affected employees</span>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
                {employees.length}
              </span>
            </div>
            <ul className="max-h-64 divide-y overflow-y-auto">
              {employees.map((e) => (
                <li key={e.id}>
                  <Link
                    to={`/employees/${e.id}`}
                    className="group flex items-center gap-3 px-3 py-2 hover:bg-muted/60"
                  >
                    <InitialsAvatar name={e.name || e.employeeNo} src={e.avatarUrl} size="sm" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-xs font-medium text-foreground">
                        {e.name || e.employeeNo}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">{e.employeeNo}</span>
                    </span>
                    <ExternalLink className="size-3.5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
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
                'size-7 rounded-full flex items-center justify-center border-2 transition-all text-xs font-semibold',
                done ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm' :
                  active ? 'border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20' :
                    'border-border bg-background text-muted-foreground',
              )}>
                {done ? <CheckCircle2 className="size-3.5" /> :
                  active ? <CircleDot className="size-3.5" /> :
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
                  {statusData.map((d, i) => (
                    <Cell key={d.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 w-full">
              {statusData.map((d, i) => (
                <div key={d.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="size-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
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

/**
 * Grouped payslip breakdown: Earnings → Additions → Deductions → Net.
 *
 *   - Earnings: contractual base + the three allowance lines that are part of
 *     the monthly gross.
 *   - Additions: overtime + commission. These are the variable positive
 *     adjustments; rendered in green and as a subtotal so the user can tell
 *     at a glance how much extra was added on top of the base.
 *   - Deductions: leave-based deductions + any future manual deductions —
 *     today this is the single `deductions` total from the schema.
 *   - Net: the formula explainer line + the bold total at the bottom.
 *
 * Lines stay visible at 0 only for the section subtotals (so the user can
 * confirm "no overtime this month" rather than wondering if the row is hidden).
 * Per-line items hide at 0 to keep things tight.
 */
function PayslipBreakdown({ ps }: { ps: Payslip }) {
  const basic = Number(ps.basicSalary)
  const housing = Number(ps.housingAllowance)
  const transport = Number(ps.transportAllowance)
  const other = Number(ps.otherAllowances)
  // Catalog snapshot persisted alongside the payslip — when present, every
  // earning line gets its real component name. Legacy payslips (pre-0048)
  // have an empty array and fall through to the 4 named columns below.
  // Order mirrors Add/Edit Employee Step 3 + Payroll Summary so HR sees the
  // same shape everywhere.
  const breakdown = (ps.earningsBreakdown ?? [])
    .map((b) => ({ ...b, amount: Number(b.amount) }))
    .filter((b) => b.amount > 0)
    .sort((a, b) => {
      const rank: Record<string, number> = { basic: 0, housing: 1, transport: 2, cost_of_living: 3, custom_allowance: 4, social: 5 }
      const ra = rank[a.category] ?? 99
      const rb = rank[b.category] ?? 99
      if (ra !== rb) return ra - rb
      return a.name.localeCompare(b.name)
    })
  const overtime = Number(ps.overtime)
  const commission = Number(ps.commission ?? 0)
  const additions = overtime + commission
  const gross = Number(ps.grossSalary)
  const deductions = Number(ps.deductions)
  const net = Number(ps.netSalary)
  // Itemised leave-driven deduction lines. `lopAmount + sickAmount` should
  // equal `deductions` for any payslip generated after migration 0037; for
  // older payslips the itemised columns default to 0 and we surface the
  // entire amount on a fallback "Other deductions" row so net math still
  // matches what was paid.
  const lopDays = Number(ps.unpaidLeaveDays ?? 0)
  const lopAmount = Number(ps.unpaidLeaveDeduction ?? 0)
  const sickDays = Number(ps.sickHalfPayDays ?? 0)
  const sickAmount = Number(ps.sickHalfPayDeduction ?? 0)
  const loanAmount = Number(ps.loanDeduction ?? 0)
  const otherAmount = Number(ps.otherDeduction ?? 0)
  const itemisedDeductions = lopAmount + sickAmount + loanAmount + otherAmount
  // Residual catches deductions that pre-date the per-category columns (older
  // payslips before the adjustments engine landed). For new payslips the
  // categories sum to `deductions` exactly and residual is 0.
  const residualDeductions = Math.max(0, deductions - itemisedDeductions)
  // Earnings subtotal: gross minus any additions already folded in. Keeps
  // the math transparent: Earnings + Additions − Deductions = Net.
  const earningsSubtotal = Math.max(0, gross - additions)

  return (
    <div className="space-y-4 pt-3">
      <div className="rounded-lg border bg-card/60">
        <p className="px-3 pt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Earnings
        </p>
        <div className="px-3 pb-1">
          {breakdown.length > 0 ? (
            breakdown.map((b) => (
              <PayslipRow key={b.componentId} label={b.name} value={b.amount} sub />
            ))
          ) : (
            <>
              {basic > 0 && <PayslipRow label="Basic Salary" value={basic} sub />}
              {housing > 0 && <PayslipRow label="Housing Allowance" value={housing} sub />}
              {transport > 0 && <PayslipRow label="Transport Allowance" value={transport} sub />}
              {other > 0 && <PayslipRow label="Other Allowances" value={other} sub />}
            </>
          )}
          <PayslipRow label="Earnings subtotal" value={earningsSubtotal} bold />
        </div>
      </div>

      <div className="rounded-lg border bg-emerald-50/40 dark:bg-emerald-950/15">
        <p className="px-3 pt-3 text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-300">
          Additions
        </p>
        <div className="px-3 pb-1">
          <PayslipRow label="Overtime" value={overtime} sub green={overtime > 0} />
          <PayslipRow label="Commission / Bonus" value={commission} sub green={commission > 0} />
          <PayslipRow label="Additions subtotal" value={additions} bold green={additions > 0} />
        </div>
      </div>

      <div className="rounded-lg border bg-rose-50/40 dark:bg-rose-950/15">
        <p className="px-3 pt-3 text-[10px] font-bold uppercase tracking-widest text-rose-700 dark:text-rose-300">
          Deductions
        </p>
        <div className="px-3 pb-1">
          {lopAmount > 0 && (
            <PayslipRow
              label={`Loss of pay (${lopDays} day${lopDays === 1 ? '' : 's'} unpaid leave)`}
              value={lopAmount}
              sub
              red
            />
          )}
          {sickAmount > 0 && (
            <PayslipRow
              label={`Sick leave half-pay (${sickDays} day${sickDays === 1 ? '' : 's'} after first 15)`}
              value={sickAmount}
              sub
              red
            />
          )}
          {loanAmount > 0 && (
            <PayslipRow label="Loan repayment" value={loanAmount} sub red />
          )}
          {otherAmount > 0 && (
            <PayslipRow label="Other manual deductions" value={otherAmount} sub red />
          )}
          {residualDeductions > 0 && (
            <PayslipRow label="Uncategorised (pre-migration)" value={residualDeductions} sub red />
          )}
          {deductions === 0 && (
            <PayslipRow label="No deductions this month" value={0} sub />
          )}
          <PayslipRow label="Deductions subtotal" value={deductions} bold red={deductions > 0} />
        </div>
      </div>

      <div className="rounded-lg border-2 border-emerald-500/40 bg-emerald-50 px-4 py-3 dark:bg-emerald-950/30">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Net Salary</span>
          <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
            {formatCurrency(net)}
          </span>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          Earnings {formatCurrency(earningsSubtotal)} + Additions {formatCurrency(additions)} − Deductions {formatCurrency(deductions)} = Net {formatCurrency(net)}
        </p>
      </div>
    </div>
  )
}

/** Small KPI tile used in the PayslipsSheet header. Tonal background keeps
 *  Total Net visually anchored as the "headline" number HR cares about. */
function SheetStat({ label, value, tone, prominent }: {
  label: string
  value: string
  tone: 'muted' | 'blue' | 'emerald'
  prominent?: boolean
}) {
  const toneClass = tone === 'emerald'
    ? 'bg-emerald-50 border-emerald-200/70 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-300'
    : tone === 'blue'
      ? 'bg-sky-50 border-sky-200/70 text-sky-700 dark:bg-sky-950/30 dark:border-sky-900/40 dark:text-sky-300'
      : 'bg-muted/40 border-border text-foreground'
  return (
    <div className={cn('rounded-lg border px-3 py-1.5 min-w-[110px]', toneClass)}>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className={cn('tabular-nums font-semibold leading-tight', prominent ? 'text-base' : 'text-sm')}>{value}</p>
    </div>
  )
}

function PayslipsSheet({ run, open, onClose }: { run: PayrollRun | null; open: boolean; onClose: () => void }) {
  const { accessToken } = useAuthStore()
  const { data, isLoading } = usePayslips(run?.id ?? '')
  const [downloading, setDownloading] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const rawData = data
  const payslips = useMemo(() => (rawData ?? []) as Payslip[], [rawData])
  // Draft preview vs. real payslips: rows are marked `isDraft` server-side.
  // Used to hide download + show a banner explaining "Process the run to lock in".
  const isDraftPreview = run?.status === 'draft'

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

  // Header KPIs — derived once so they stay in sync with the row list, even
  // for draft runs where the run.totalNet column hasn't been written yet.
  const headerKpis = useMemo(() => {
    const totalGross = payslips.reduce((s, p) => s + Number(p.grossSalary), 0)
    const totalNet = payslips.reduce((s, p) => s + Number(p.netSalary), 0)
    const totalDeductions = payslips.reduce((s, p) => s + Number(p.deductions ?? 0), 0)
    return { totalGross, totalNet, totalDeductions, count: payslips.length }
  }, [payslips])

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      {/* Full-screen on every viewport - the previous sm:max-w-lg cap felt
          cramped for the side-by-side payslip breakdown. */}
      <SheetContent className="w-screen sm:max-w-none flex flex-col p-0">
        <SheetHeader className="border-b shrink-0 px-6 py-4 bg-gradient-to-br from-background to-muted/30">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg font-semibold tracking-tight">
                  {run ? periodLabel(run.month, run.year) : 'Payslips'}
                </SheetTitle>
                {run && (
                  <Badge
                    variant={isDraftPreview ? 'warning' : run.status === 'paid' ? 'success' : 'secondary'}
                    className="capitalize text-[10px]"
                  >
                    {isDraftPreview ? 'Draft' : (run.status ?? '').replace('_', ' ')}
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Payroll run — {headerKpis.count} payslips</p>
            </div>
            {payslips.length > 0 && (
              // 1 col below 420px, 3 cols once we have room. The previous
              // hard `grid-cols-3` jammed three currency strings together
              // inside a side sheet that shrinks on small viewports — at
              // ~420px and below "Total Gross"/"Total Net" collided.
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5">
                <SheetStat label="Employees" value={String(headerKpis.count)} tone="muted" />
                <SheetStat label="Total Gross" value={formatCurrency(headerKpis.totalGross)} tone="blue" />
                <SheetStat label="Total Net" value={formatCurrency(headerKpis.totalNet)} tone="emerald" prominent />
              </div>
            )}
          </div>
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
              <div className="size-12 rounded-xl bg-muted flex items-center justify-center">
                <DollarSign className="size-5 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-medium">No payslips yet</p>
                <p className="text-xs text-muted-foreground mt-1">No payable employees for this period.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Draft preview banner — explains why downloads aren't available
                  yet and what the user needs to do to lock the numbers in. */}
              {isDraftPreview && (
                <div className="border-b border-amber-200/70 bg-amber-50/70 px-5 py-3 text-xs dark:border-amber-900/40 dark:bg-amber-950/30">
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 size-3.5 shrink-0 text-amber-700 dark:text-amber-300" />
                    <div className="min-w-0">
                      <p className="font-semibold text-amber-900 dark:text-amber-200">
                        Draft preview — numbers are live, payslips not generated yet
                      </p>
                      <p className="mt-0.5 text-amber-800/80 dark:text-amber-300/80">
                        Process the run to finalise totals and unlock PDF download.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Mini bar chart — top earners at a glance. Two-tone legend so HR
                  can tell Gross from Net without hovering. */}
              {chartData.length > 0 && (
                <div className="px-5 py-4 border-b bg-muted/20">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                      <BarChart3 className="size-3.5 text-muted-foreground" />
                      <p className="text-xs font-semibold text-foreground/80">Salary Overview</p>
                      <span className="text-[10px] text-muted-foreground">· Top {chartData.length}</span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <span className="size-2 rounded-sm bg-sky-300" />Gross
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <span className="size-2 rounded-sm bg-emerald-500" />Net
                      </span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={140}>
                    <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} tickMargin={4} axisLine={false} tickLine={false} />
                      <YAxis hide tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                        formatter={(v: unknown) => formatCurrency(Number(v ?? 0))}
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))', padding: '6px 10px' }}
                        labelStyle={{ fontWeight: 600, fontSize: 11 }}
                      />
                      <Bar dataKey="Gross" fill="#93c5fd" radius={[3, 3, 0, 0]} maxBarSize={22} />
                      <Bar dataKey="Net" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={22} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              {payslips.map((ps) => {
                const isExp = expanded === ps.id
                const gross = Number(ps.grossSalary)
                const net = Number(ps.netSalary)
                const ded = Number(ps.deductions ?? 0)
                return (
                  <div key={ps.id} className={cn('transition-colors', isExp ? 'bg-muted/30' : 'hover:bg-muted/20')}>
                    <button
                      type="button"
                      className="w-full flex items-center gap-3 px-5 py-3.5 text-left"
                      onClick={() => setExpanded(isExp ? null : ps.id)}
                    >
                      <InitialsAvatar name={ps.employeeName ?? '?'} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold truncate">{ps.employeeName}</p>
                          {ps.employeeNo && (
                            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">#{ps.employeeNo}</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {ps.department ?? '—'}
                          {ps.designation ? ` · ${ps.designation}` : ''}
                          {typeof ps.daysWorked === 'number' ? ` · ${ps.daysWorked}d` : ''}
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center gap-4 shrink-0 text-right">
                        <div>
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Gross</p>
                          <p className="text-xs font-medium tabular-nums">{formatCurrency(gross)}</p>
                        </div>
                        {ded > 0 && (
                          <div>
                            <p className="text-[10px] uppercase tracking-wider text-rose-600/80">Deductions</p>
                            <p className="text-xs font-medium tabular-nums text-rose-700 dark:text-rose-400">− {formatCurrency(ded)}</p>
                          </div>
                        )}
                      </div>
                      <div className="shrink-0 text-right min-w-[100px]">
                        <p className="text-[10px] uppercase tracking-wider text-emerald-700/80 dark:text-emerald-300/80">Net Pay</p>
                        <p className="text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{formatCurrency(net)}</p>
                      </div>
                      <ArrowRight className={cn('size-3.5 text-muted-foreground shrink-0 transition-transform', isExp && 'rotate-90')} />
                    </button>

                    {isExp && (
                      <div className="bg-muted/10 border-t">
                        {/* Sticky identifier strip - keeps the employee name +
                            number visible while the user scrolls a long breakdown.
                            Previously the name was only in the collapsed row above. */}
                        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-background/95 px-5 py-2.5 backdrop-blur">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold">{ps.employeeName}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {ps.employeeNo ? `#${ps.employeeNo}` : ''}
                              {ps.department ? ` · ${ps.department}` : ''}
                              {typeof ps.daysWorked === 'number' ? ` · ${ps.daysWorked} days worked` : ''}
                            </p>
                          </div>
                          {ps.isDraft ? (
                            <span
                              className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-300/70 bg-amber-50 px-2 text-[11px] font-medium text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-200"
                              title="Process the run to enable download"
                            >
                              <Clock className="size-3" />
                              Preview only
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              loading={downloading === ps.id}
                              leftIcon={<FileDown className="size-3" />}
                              onClick={() => handleDownload(ps)}
                            >
                              Download PDF
                            </Button>
                          )}
                        </div>

                        <div className="px-5 pb-5">
                          <PayslipBreakdown ps={ps} />
                        </div>
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
          <Calculator className="size-4 text-muted-foreground" />
          End-of-Service Gratuity Calculator
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Based on UAE Labour Law - 21 days/year for first 5 years, 30 days/year thereafter.
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
          <Calculator className="size-8 text-muted-foreground/30 mx-auto mb-2" />
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
      onError: () => toast.error('WPS submission failed', 'Could not submit this payroll run to WPS. Please try again.'),
    })
  }

  const handleMarkPaid = (e: React.MouseEvent) => {
    e.stopPropagation()
    markPaid.mutate({ status: 'paid' }, {
      onSuccess: () => toast.success('Payroll marked as paid'),
      onError: () => toast.error('Mark-as-paid failed', 'Could not update the payroll status. Please try again.'),
    })
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      {['approved', 'wps_submitted', 'paid'].includes(run.status) && (
        <Button size="sm" variant="ghost" loading={sifLoading}
          leftIcon={<FileDown className="size-3" />} className="h-7 text-xs"
          onClick={handleSif}>
          SIF
        </Button>
      )}
      {run.status === 'approved' && canManage && (
        <Button size="sm" variant="ghost" loading={submitWps.isPending}
          leftIcon={<Send className="size-3" />} className="h-7 text-xs"
          onClick={handleSubmitWps}>
          Submit WPS
        </Button>
      )}
      {run.status === 'wps_submitted' && canManage && (
        <Button size="sm" variant="ghost" loading={markPaid.isPending}
          leftIcon={<CheckCircle2 className="size-3 text-emerald-600" />}
          className="h-7 text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
          onClick={handleMarkPaid}>
          Mark Paid
        </Button>
      )}
    </div>
  )
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function firstAvailableMonth(runs: PayrollRun[], maxMonth: number): number {
  const taken = new Set(runs.map(r => r.month))
  return Array.from({ length: maxMonth }, (_, i) => i + 1).find(m => !taken.has(m)) ?? 1
}

// Loans section was removed from the Payroll page — loan management lives
// on the dedicated `/loans` page (sidebar > Loans & Advances). Active loans
// still feed payroll automatically via the adjustments sync (LoanDeduction
// rows in PayrollAdjustments), so removing this UI surface doesn't affect
// any payroll math. Reinstate from git history if it ever needs to come
// back as a tab.

// ─── Adjustments section ──────────────────────────────────────────────────────
//
// Ledger of per-month additions (overtime, commission, bonus) and deductions
// (salary advance, manual) that runPayroll consumes. Leave-driven (LOP /
// sick-half-pay) and loan-installment rows are imported automatically by the
// Sync button. See backend/src/modules/payroll/adjustments.service.ts.

const CATEGORY_LABELS: Record<string, string> = {
  overtime: 'Overtime',
  commission: 'Commission',
  bonus: 'Bonus',
  loan_repayment: 'Loan repayment',
  salary_advance: 'Salary advance',
  unpaid_leave: 'Loss of pay',
  sick_half_pay: 'Sick half-pay',
  manual: 'Manual deduction',
}

/** Display label for any category — built-in via CATEGORY_LABELS, else titlecase
 *  the slug so a custom "site_allowance" renders as "Site Allowance". */
function categoryLabel(value: string): string {
  if (CATEGORY_LABELS[value]) return CATEGORY_LABELS[value]
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function AdjustmentsSection() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(() => currentYear)
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)
  const [addOpen, setAddOpen] = useState(false)

  const { data, isLoading } = useAdjustments(year, month)
  // Stable identity for the array so useMemo doesn't re-compute every render.
  const adjustments = useMemo(() => data?.data ?? [], [data])
  const locked = data?.locked ?? false

  const sync = useSyncAdjustments()
  const del = useDeleteAdjustment(year, month)

  const additions = useMemo(() => adjustments.filter((a) => a.kind === 'addition'), [adjustments])
  const deductions = useMemo(() => adjustments.filter((a) => a.kind === 'deduction'), [adjustments])
  const totalAdditions = useMemo(() => additions.reduce((sum, a) => sum + Number(a.amount), 0), [additions])
  const totalDeductions = useMemo(() => deductions.reduce((sum, a) => sum + Number(a.amount), 0), [deductions])

  const handleSync = () => {
    sync.mutate({ year, month }, {
      onSuccess: (res) => {
        toast.success('Sync complete', `${res.leaveRows} leave + ${res.loanRows} loan rows refreshed.`)
      },
    })
  }

  return (
    <div className="space-y-4">
      {/* Period picker + actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="text-sm font-semibold">Payroll adjustments - {MONTH_NAMES[month - 1]} {year}</CardTitle>
              <p className="text-xs text-muted-foreground">
                Itemised additions and deductions. Leave & loan rows are imported by the Sync button; everything else is HR-entered.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="h-9 w-[100px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear].map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                <SelectTrigger className="h-9 w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES.map((name, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSync}
                disabled={locked || sync.isPending}
                loading={sync.isPending}
              >
                <Sparkles className="size-3.5" />
                Auto-sync leave & loans
              </Button>
              <Button size="sm" onClick={() => setAddOpen(true)} disabled={locked}>
                <Plus className="size-3.5" />
                Add adjustment
              </Button>
            </div>
          </div>
          {locked && (
            <div className="mt-3 flex items-center gap-2 rounded-md border border-amber-300/50 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/50 dark:bg-amber-950/40 dark:text-amber-200">
              <Lock className="size-3.5" />
              Payroll for this period has been processed - adjustments are locked.
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <KpiCardCompact
              label="Total additions"
              value={formatCurrency(totalAdditions)}
              icon={TrendingUp}
              color="green"
            />
            <KpiCardCompact
              label="Total deductions"
              value={formatCurrency(totalDeductions)}
              icon={DollarSign}
              color="red"
            />
          </div>

          {/* Additions table */}
          <AdjustmentsTable
            title="Additions"
            tone="emerald"
            rows={additions}
            isLoading={isLoading}
            emptyMsg="No additions for this month yet."
            locked={locked}
            onDelete={(id) => del.mutate(id)}
          />

          {/* Deductions table */}
          <AdjustmentsTable
            title="Deductions"
            tone="rose"
            rows={deductions}
            isLoading={isLoading}
            emptyMsg="No deductions for this month yet. Use Auto-sync to import leave & loan deductions."
            locked={locked}
            onDelete={(id) => del.mutate(id)}
          />
        </CardContent>
      </Card>

      <AddAdjustmentDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        year={year}
        month={month}
      />
    </div>
  )
}

function AdjustmentsTable({
  title, tone, rows, isLoading, emptyMsg, locked, onDelete,
}: {
  title: string
  tone: 'emerald' | 'rose'
  rows: PayrollAdjustment[]
  isLoading: boolean
  emptyMsg: string
  locked: boolean
  onDelete: (id: string) => void
}) {
  const accent =
    tone === 'emerald'
      ? 'border-emerald-200/60 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-950/15'
      : 'border-rose-200/60 bg-rose-50/30 dark:border-rose-900/40 dark:bg-rose-950/15'
  const labelColor = tone === 'emerald' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-300'

  return (
    <div className={cn('rounded-lg border', accent)}>
      <div className={cn('px-3 py-2 border-b text-[10px] font-bold uppercase tracking-widest', labelColor)}>
        {title}
        <span className="ms-1 font-normal text-muted-foreground normal-case tracking-normal">({rows.length})</span>
      </div>
      {isLoading ? (
        <div className="space-y-1 p-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={`skeleton-${i}`} className="h-10 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyMsg}</p>
      ) : (
        <ul className="divide-y">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {row.firstName} {row.lastName}
                  <span className="ms-1.5 text-[11px] text-muted-foreground">{row.employeeNo ?? ''}</span>
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Badge variant="outline" className="text-[10px]">
                    {categoryLabel(row.category)}
                  </Badge>
                  {row.source !== 'manual' && (
                    <Badge variant="secondary" className="text-[10px]">
                      auto · {row.source.replace('_engine', '')}
                    </Badge>
                  )}
                  {row.notes && <span className="truncate">— {row.notes}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-bold tabular-nums', tone === 'emerald' ? 'text-emerald-700' : 'text-rose-700')}>
                  {tone === 'rose' && '-'}{formatCurrency(Number(row.amount))}
                </span>
                {row.source === 'manual' && !locked && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 text-muted-foreground hover:text-rose-600"
                    onClick={() => onDelete(row.id)}
                    aria-label="Delete adjustment"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// Spreadsheet columns. Category is NOT a column — it lives at the dialog level
// so HR's import sheet stays focused on per-employee fields.
const TEMPLATE_HEADERS = ['employee_no', 'employee_name', 'employee_email', 'employee_phone', 'amount', 'note'] as const

interface ParsedRow {
  rowNumber: number
  employeeNo: string
  employeeName: string
  employeeEmail: string
  employeePhone: string
  amount: number
  notes: string
  error: string | null
}

// ─── Category picker (with inline add) ───────────────────────────────────────
//
// Replaces the locked shadcn Select. Built-in + tenant-custom categories
// stream from the server; when the typed text doesn't match any existing
// label, two "Create new category" entries appear so HR can add additions or
// deductions without leaving the dialog.

function AdjustmentCategoryPicker({
  value, onValueChange, allowAutoCategories = false,
}: {
  value: string
  onValueChange: (v: string) => void
  /** If true, also show auto-driven categories (loan_repayment, unpaid_leave,
   *  sick_half_pay). Default false — HR can't manually create those. */
  allowAutoCategories?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const { data: catalog, isLoading } = useAdjustmentCategories()
  const create = useCreateAdjustmentCategory()

  const allCategories = catalog ?? []
  const pickable = allowAutoCategories ? allCategories : allCategories.filter((c) => c.manual)
  const selected = pickable.find((c) => c.value === value) ?? null

  // Server-side slug normalisation — keep it identical so the "exists" check
  // matches what createCategory() does.
  const slug = search.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const trimmed = search.trim()
  const matchesAny = trimmed.length > 0 && pickable.some(
    (c) => c.value === slug || c.label.toLowerCase() === trimmed.toLowerCase(),
  )
  const canCreate = trimmed.length > 0 && !matchesAny && !isLoading

  const filtered = trimmed
    ? pickable.filter((c) =>
      c.label.toLowerCase().includes(trimmed.toLowerCase())
      || c.value.toLowerCase().includes(trimmed.toLowerCase()),
    )
    : pickable

  const additions = filtered.filter((c) => c.kind === 'addition')
  const deductions = filtered.filter((c) => c.kind === 'deduction')

  function handleCreate(kind: 'addition' | 'deduction') {
    create.mutate({ label: trimmed, kind }, {
      onSuccess: (res) => {
        onValueChange(res.data.value)
        setSearch('')
        setOpen(false)
        if (res.created) toast.success('Category added', `"${res.data.label}" is now available for everyone in this tenant.`)
      },
    })
  }

  function handleSelect(option: AdjustmentCategoryOption) {
    onValueChange(option.value)
    setSearch('')
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch('') }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls="payroll-category-combobox-list"
          aria-haspopup="listbox"
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border bg-background px-3 py-2 text-sm transition-colors',
            open ? 'border-ring ring-2 ring-ring/20' : 'border-input hover:border-input/80',
            'focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <span className="flex items-center gap-2 truncate text-left">
            {selected ? (
              <>
                <span>{selected.label}</span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[9px] py-0 px-1.5',
                    selected.kind === 'addition' ? 'text-emerald-700 border-emerald-300/60' : 'text-rose-700 border-rose-300/60',
                  )}
                >
                  {selected.kind}
                </Badge>
                {!selected.builtin && <span className="text-[10px] text-muted-foreground">· custom</span>}
              </>
            ) : (
              <span className="text-muted-foreground">Pick or create a category…</span>
            )}
          </span>
          <ChevronRight className={cn('size-4 text-muted-foreground/60 transition-transform', open && 'rotate-90')} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="p-0 overflow-hidden border border-border shadow-lg"
        align="start"
        sideOffset={2}
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or type a new category…"
            value={search}
            onValueChange={setSearch}
            className="h-9 text-sm"
          />
          <CommandList id="payroll-category-combobox-list" className="max-h-72 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Loading…
              </div>
            ) : filtered.length === 0 && !canCreate ? (
              <CommandEmpty className="py-6 text-xs text-muted-foreground text-center">
                No categories found.
              </CommandEmpty>
            ) : null}

            {additions.length > 0 && (
              <CommandGroup heading="Additions" className="p-1">
                {additions.map((c) => (
                  <CommandItem
                    key={c.value}
                    value={c.value}
                    onSelect={() => handleSelect(c)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                  >
                    <CheckCircle2 className={cn('size-3.5 shrink-0 text-emerald-600 transition-opacity', value === c.value ? 'opacity-100' : 'opacity-30')} />
                    <span className="flex-1 truncate">{c.label}</span>
                    {!c.builtin && <span className="text-[10px] text-muted-foreground">custom</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {deductions.length > 0 && (
              <CommandGroup heading="Deductions" className="p-1">
                {deductions.map((c) => (
                  <CommandItem
                    key={c.value}
                    value={c.value}
                    onSelect={() => handleSelect(c)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                  >
                    <CheckCircle2 className={cn('size-3.5 shrink-0 text-rose-600 transition-opacity', value === c.value ? 'opacity-100' : 'opacity-30')} />
                    <span className="flex-1 truncate">{c.label}</span>
                    {!c.builtin && <span className="text-[10px] text-muted-foreground">custom</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {canCreate && (
              <>
                <CommandSeparator />
                <CommandGroup heading={`Create "${trimmed}"`} className="p-1">
                  <CommandItem
                    value={`__create_addition_${slug}`}
                    onSelect={() => handleCreate('addition')}
                    disabled={create.isPending}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                  >
                    <Plus className="size-3.5 shrink-0 text-emerald-600" />
                    <span className="flex-1 truncate">Add as <strong>addition</strong></span>
                    {create.isPending && create.variables?.kind === 'addition' && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                  </CommandItem>
                  <CommandItem
                    value={`__create_deduction_${slug}`}
                    onSelect={() => handleCreate('deduction')}
                    disabled={create.isPending}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer"
                  >
                    <Plus className="size-3.5 shrink-0 text-rose-600" />
                    <span className="flex-1 truncate">Add as <strong>deduction</strong></span>
                    {create.isPending && create.variables?.kind === 'deduction' && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

// Stages for the bulk-import workflow. Each transition is one-way (or back to
// idle via Replace), so the UI state stays predictable.
type BulkStage =
  | 'idle'         // No file picked yet
  | 'parsing'      // Reading the .xlsx in the browser
  | 'parsed'       // Local validation done, no server roundtrip yet
  | 'validating'   // Server is resolving employees + tenant ownership
  | 'ready'        // Validation finished, preview is up to date
  | 'submitting'   // Server is inserting rows
  | 'submitted'    // Done, dialog about to close

interface MergedRow extends ParsedRow {
  serverStatus: 'pending' | 'valid' | 'invalid'
  serverError: string | null
  /** Non-blocking warning from the validator (e.g. duplicate-in-batch). */
  serverWarning: string | null
  resolvedName: string | null
  resolvedEmployeeNo: string | null
  /** Verdict from the row-level comparison engine. `pending` covers the
   *  window between local parse and the server's response. */
  action: BulkRowAction | 'pending'
  /** Field-level diff when action === 'updated'. */
  changes: RowChanges | null
  /** Snapshot of the existing DB row when action === 'updated' or 'unchanged'. */
  existing: { id: string; amount: number; notes: string | null } | null
}

/** Filter chips on the preview table — let HR focus on a single bucket. */
type RowFilter = 'all' | 'new' | 'updated' | 'unchanged' | 'duplicate' | 'invalid'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StepBadge({ active, done, label, num }: { active: boolean; done: boolean; label: string; num: number }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className={cn(
          'flex size-6 items-center justify-center rounded-full text-[11px] font-bold shrink-0 transition-colors',
          done ? 'bg-emerald-500 text-white'
            : active ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground',
        )}
      >
        {done ? <CheckCircle2 className="size-3.5" /> : num}
      </div>
      <span
        className={cn(
          'text-xs font-medium truncate transition-colors',
          active || done ? 'text-foreground' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
    </div>
  )
}

// ─── Bulk-import row visuals (action badges + diff rendering) ───────────────

/** Visual config keyed by action — keeps every consumer (badge, card, row
 *  styling) in lock-step. Adding a new action means adding one entry here. */
const ACTION_VISUAL: Record<BulkRowAction, {
  label: string
  badgeClass: string
  rowClass: string
  Icon: typeof CheckCircle2
}> = {
  new: {
    label: 'New',
    badgeClass: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-300/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-800/60',
    rowClass: '',
    Icon: Sparkles,
  },
  updated: {
    label: 'Updated',
    badgeClass: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300/60 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-800/60',
    rowClass: 'bg-amber-50/30 dark:bg-amber-950/10',
    Icon: PencilLine,
  },
  unchanged: {
    label: 'No change',
    badgeClass: 'bg-muted text-muted-foreground ring-1 ring-border',
    rowClass: 'opacity-70',
    Icon: MinusCircle,
  },
  duplicate: {
    label: 'Duplicate',
    badgeClass: 'bg-slate-200 text-slate-600 ring-1 ring-slate-300/60 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700/60',
    rowClass: 'bg-muted/40 text-muted-foreground line-through decoration-muted-foreground/40',
    Icon: Copy,
  },
  invalid: {
    label: 'Invalid',
    badgeClass: 'bg-rose-100 text-rose-700 ring-1 ring-rose-300/60 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60',
    rowClass: 'bg-rose-50/60 dark:bg-rose-950/20',
    Icon: XCircle,
  },
}

/** Pill badge used in the row table + summary headers. */
function ActionBadge({ action }: { action: BulkRowAction }) {
  const v = ACTION_VISUAL[action]
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide', v.badgeClass)}>
      <v.Icon className="size-3" />
      {v.label}
    </span>
  )
}

/** Clickable summary card — one per action bucket. Clicking filters the table.
 *  The active card is highlighted with a darker ring. */
function ActionSummary({
  total, buckets, active, onFilter,
}: {
  total: number
  buckets: Record<'new' | 'updated' | 'unchanged' | 'duplicate' | 'invalid', number>
  active: RowFilter
  onFilter: (f: RowFilter) => void
}) {
  // Total card sits separately on the left — clicking it resets the filter.
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
      <SummaryCard label="Total" value={total} active={active === 'all'} onClick={() => onFilter('all')} tone="neutral" />
      <SummaryCard label="New" value={buckets.new} active={active === 'new'} onClick={() => onFilter('new')} tone="emerald" disabled={buckets.new === 0} />
      <SummaryCard label="Updated" value={buckets.updated} active={active === 'updated'} onClick={() => onFilter('updated')} tone="amber" disabled={buckets.updated === 0} />
      <SummaryCard label="No change" value={buckets.unchanged} active={active === 'unchanged'} onClick={() => onFilter('unchanged')} tone="muted" disabled={buckets.unchanged === 0} />
      <SummaryCard label="Duplicate" value={buckets.duplicate} active={active === 'duplicate'} onClick={() => onFilter('duplicate')} tone="slate" disabled={buckets.duplicate === 0} />
      <SummaryCard label="Invalid" value={buckets.invalid} active={active === 'invalid'} onClick={() => onFilter('invalid')} tone="rose" disabled={buckets.invalid === 0} />
    </div>
  )
}

function SummaryCard({
  label, value, active, onClick, tone, disabled,
}: {
  label: string
  value: number
  active: boolean
  onClick: () => void
  tone: 'neutral' | 'emerald' | 'amber' | 'muted' | 'slate' | 'rose'
  disabled?: boolean
}) {
  const toneClass = {
    neutral: 'border-border bg-card text-foreground',
    emerald: 'border-emerald-200/60 bg-emerald-50/40 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/15 dark:text-emerald-300',
    amber: 'border-amber-200/60 bg-amber-50/40 text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/15 dark:text-amber-300',
    muted: 'border-border bg-muted/20 text-muted-foreground',
    slate: 'border-slate-200/60 bg-slate-50/60 text-slate-700 dark:border-slate-800/40 dark:bg-slate-900/30 dark:text-slate-300',
    rose: 'border-rose-200/60 bg-rose-50/40 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/15 dark:text-rose-300',
  }[tone]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-lg border p-2.5 text-left transition-all',
        toneClass,
        active && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
        disabled ? 'opacity-50 cursor-default' : 'hover:shadow-sm cursor-pointer',
      )}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums leading-none">{value}</p>
    </button>
  )
}

/** Single row in the preview table. Renders amount as a red→green diff when
 *  the action is `updated`. */
function BulkRowItem({
  row, action, statusMessage, pending,
}: {
  row: MergedRow
  action: BulkRowAction
  statusMessage: string | null
  pending: boolean
}) {
  const v = ACTION_VISUAL[action]
  const employeeLine = row.resolvedName ?? row.employeeName ?? row.employeeNo ?? row.employeeEmail ?? '—'
  const subLine = row.resolvedEmployeeNo ?? row.employeeNo ?? null

  // Detail line under the row: prefer error, then warning, then notes.
  const detail: { tone: 'error' | 'warn' | 'muted'; text: string } | null = action === 'invalid' && statusMessage
    ? { tone: 'error', text: statusMessage }
    : row.serverWarning
      ? { tone: 'warn', text: row.serverWarning }
      : row.notes
        ? { tone: 'muted', text: row.notes }
        : null

  return (
    <tr className={cn(v.rowClass)}>
      <td className="p-2 text-muted-foreground tabular-nums align-top">{row.rowNumber}</td>
      <td className="p-2 align-top">
        {pending
          ? <Loader2 className="size-3.5 text-muted-foreground animate-spin" />
          : <ActionBadge action={action} />}
      </td>
      <td className="p-2 align-top">
        <p className="truncate font-medium">{employeeLine}</p>
        {subLine && <p className="text-[10px] text-muted-foreground truncate">{subLine}</p>}
      </td>
      <td className="p-2 text-right tabular-nums align-top">
        <AmountCell row={row} action={action} />
      </td>
      <td className="p-2 align-top">
        {detail ? (
          <span className={cn(
            detail.tone === 'error' && 'text-rose-600 dark:text-rose-400',
            detail.tone === 'warn' && 'text-amber-700 dark:text-amber-400',
            detail.tone === 'muted' && 'text-muted-foreground',
          )}>{detail.text}</span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
        {action === 'updated' && row.changes?.notes && (
          <NotesDiff change={row.changes.notes} />
        )}
      </td>
    </tr>
  )
}

/** Amount cell: shows red strike-through old → bold green new on `updated`,
 *  plain value otherwise. */
function AmountCell({ row, action }: { row: MergedRow; action: BulkRowAction }) {
  if (!Number.isFinite(row.amount) || row.amount <= 0) {
    return <span className="text-rose-600">—</span>
  }
  if (action === 'updated' && row.changes?.amount) {
    const { old, new: next } = row.changes.amount
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <span className="text-rose-600 dark:text-rose-400 line-through text-[11px]">
          {formatCurrency(old)}
        </span>
        <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
          {formatCurrency(next)}
        </span>
      </span>
    )
  }
  // Unchanged + same-amount-updated (only notes differ): single value, neutral.
  return <span>{formatCurrency(row.amount)}</span>
}

/** Inline notes diff rendered under the row's detail line when notes change. */
function NotesDiff({ change }: { change: { old: string | null; new: string | null } }) {
  return (
    <div className="mt-1 space-y-0.5 text-[10px]">
      {change.old && (
        <div className="text-rose-600 dark:text-rose-400 line-through">
          {change.old}
        </div>
      )}
      {change.new && (
        <div className="text-emerald-700 dark:text-emerald-400">
          {change.new}
        </div>
      )}
    </div>
  )
}

/**
 * Renders after a successful bulk-create. Mirrors the layout of the live
 * ActionSummary cards but pulls counts from the server's response so HR sees
 * the *committed* numbers (not the previewed ones — which can drift if any
 * row was duplicate-skipped server-side).
 *
 * The parent PayrollPage's "Total additions" KPI has already refreshed by
 * the time this renders — see useBulkCreateAdjustments.onSuccess which
 * invalidates ['payroll-adjustments', y, m] and the broader ['payroll']
 * prefix. The header copy here confirms that for the user.
 */
function ImportResultPanel({
  result,
  category,
}: {
  result: BulkCreateAdjustmentsResult
  category: PayrollAdjustmentCategory
}) {
  const committed = result.created + result.updated
  const headline = committed > 0
    ? `${committed} ${category} adjustment${committed === 1 ? '' : 's'} committed`
    : 'Nothing changed'
  return (
    <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/40 p-3 dark:border-emerald-900/40 dark:bg-emerald-950/15">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="size-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
            Import complete — {headline}
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-800/80 dark:text-emerald-200/80">
            Total additions / deductions on the payroll page have refreshed to reflect this import.
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <ResultStat label="Created" value={result.created} tone="emerald" />
        <ResultStat label="Updated" value={result.updated} tone="amber" />
        <ResultStat label="Unchanged" value={result.unchanged} tone="muted" />
        <ResultStat label="Skipped (duplicate)" value={result.duplicate} tone="slate" />
        <ResultStat label="Failed" value={result.failed} tone="rose" />
      </div>
    </div>
  )
}

function ResultStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'emerald' | 'amber' | 'muted' | 'slate' | 'rose'
}) {
  // Faded out when zero so the eye lands on the buckets that actually changed.
  const dim = value === 0
  const toneClass = {
    emerald: 'text-emerald-700 dark:text-emerald-300',
    amber: 'text-amber-700 dark:text-amber-300',
    muted: 'text-muted-foreground',
    slate: 'text-slate-700 dark:text-slate-300',
    rose: 'text-rose-700 dark:text-rose-300',
  }[tone]
  return (
    <div className={cn('rounded-md border bg-card p-2', dim && 'opacity-50')}>
      <p className={cn('text-[10px] font-bold uppercase tracking-widest', toneClass)}>{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums leading-none">{value}</p>
    </div>
  )
}

function AddAdjustmentDialog({
  open, onOpenChange, year, month,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  year: number
  month: number
}) {
  // Mode is local UI state; the period + category are shared across both modes
  // so switching tabs doesn't lose context HR has already chosen.
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [category, setCategory] = useState<PayrollAdjustmentCategory>('overtime')

  // Single-mode state
  const [employeeId, setEmployeeId] = useState('')
  const [amount, setAmount] = useState<number | ''>('' as const)
  const [notes, setNotes] = useState('')

  // Bulk-mode state
  const [stage, setStage] = useState<BulkStage>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<MergedRow[]>([])
  /** Filter chip selection — drives which rows render in the preview table. */
  const [rowFilter, setRowFilter] = useState<RowFilter>('all')
  const [parseError, setParseError] = useState<string | null>(null)
  // Submit-time error from the server (vs parseError which covers client-side
  // .xlsx issues). Rendered inline at the bottom of the bulk tab so HR can
  // see the exact failure reason without hunting the toast.
  const [submitError, setSubmitError] = useState<string | null>(null)
  // Result returned by the bulk-create mutation. We render this in the dialog
  // after a successful import so HR sees exactly what changed (created /
  // updated / unchanged / skipped) before closing — instead of the dialog
  // disappearing and forcing them to hunt for a toast.
  const [submittedResult, setSubmittedResult] = useState<BulkCreateAdjustmentsResult | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const create = useCreateAdjustment()
  const bulk = useBulkCreateAdjustments()
  const validate = useValidateBulkAdjustments()
  const submitting = create.isPending || bulk.isPending

  const reset = () => {
    setMode('single')
    setCategory('overtime')
    setEmployeeId('')
    setAmount('' as const)
    setNotes('')
    setStage('idle')
    setFile(null)
    setRows([])
    setRowFilter('all')
    setParseError(null)
    setSubmitError(null)
    setSubmittedResult(null)
    setDragOver(false)
  }

  const handleOpenChange = (v: boolean) => {
    if (submitting || stage === 'parsing' || stage === 'validating') return
    onOpenChange(v)
    if (!v) reset()
  }

  const handleSingleSubmit = () => {
    if (!employeeId || !amount || Number(amount) <= 0) return
    create.mutate(
      { employeeId, periodYear: year, periodMonth: month, category, amount: Number(amount), notes: notes || null },
      {
        onSuccess: () => {
          toast.success('Adjustment added')
          reset()
          onOpenChange(false)
        },
      },
    )
  }

  const handleDownloadTemplate = async () => {
    setDownloading(true)
    try {
      const blob = await api.download('/payroll/adjustments/bulk-template')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'payroll-adjustments-template.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error('Could not download template', err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setDownloading(false)
    }
  }

  // Period-locked flag from the last validation pass — surfaced as a
  // blocker in the dialog so HR sees the issue before clicking Submit.
  const [periodLocked, setPeriodLocked] = useState(false)

  const validateOnServer = async (parsed: MergedRow[]) => {
    setStage('validating')
    try {
      const result = await validate.mutateAsync({
        rows: parsed.map<BulkAdjustmentRow>((r) => ({
          rowNumber: r.rowNumber,
          employeeNo: r.employeeNo || null,
          employeeName: r.employeeName || null,
          employeeEmail: r.employeeEmail || null,
          employeePhone: r.employeePhone || null,
          amount: r.amount,
          notes: r.notes || null,
        })),
        // Period + category anchor the comparison engine — without all three
        // every row falls back to action='new', which would hide updates.
        periodYear: year,
        periodMonth: month,
        category,
      })
      const byRow = new Map<number, BulkValidateRow>(result.rows.map((r) => [r.rowNumber, r]))
      setRows((prev) =>
        prev.map((r) => {
          const v = byRow.get(r.rowNumber)
          if (!v) return r
          return {
            ...r,
            serverStatus: v.status,
            serverError: v.error,
            serverWarning: v.warning,
            resolvedName: v.resolvedName,
            resolvedEmployeeNo: v.resolvedEmployeeNo,
            action: v.action,
            changes: v.changes,
            existing: v.existing,
          }
        }),
      )
      setPeriodLocked(result.periodLocked)
      setStage('ready')
    } catch (err) {
      toast.error('Validation failed', err instanceof Error ? err.message : 'Could not validate file')
      setStage('parsed')
    }
  }

  // Cap the upload at 5 MB. A typical 500-row .xlsx is well under 200 KB,
  // so anything larger is almost always wrong (full HR export, embedded
  // images, corrupted file) and would hang the browser when we call
  // `arrayBuffer()` on it.
  const MAX_BULK_BYTES = 5 * 1024 * 1024

  const handleFile = async (picked: File) => {
    setParseError(null)
    if (picked.size > MAX_BULK_BYTES) {
      setParseError(`File is too large (${(picked.size / 1024 / 1024).toFixed(1)} MB). Maximum 5 MB — typical templates are under 200 KB.`)
      setStage('idle')
      return
    }
    setStage('parsing')

    let buffer: ArrayBuffer
    try {
      buffer = await picked.arrayBuffer()
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not read file.')
      setStage('idle')
      return
    }

    // No hash-based dedupe: re-uploading the same file is now an explicit
    // action HR may want (re-confirming state, after a manual DB edit).
    // The comparison engine will mark each row as new/updated/unchanged
    // so the user sees exactly what the upload changes.
    setFile(picked)
    setRowFilter('all')

    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.read(buffer, { type: 'array' })
      const firstSheet = wb.Sheets[wb.SheetNames[0]]
      if (!firstSheet) {
        setParseError('Workbook contains no sheets.')
        setRows([])
        setStage('idle')
        return
      }
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: '', raw: true })
      if (json.length === 0) {
        setParseError('Sheet is empty. Download the template for the correct format.')
        setRows([])
        setStage('idle')
        return
      }
      const sample = json[0]
      const haveExpectedHeader = TEMPLATE_HEADERS.some((h) => h in sample)
      if (!haveExpectedHeader) {
        setParseError(`Headers must match: ${TEMPLATE_HEADERS.join(', ')}.`)
        setRows([])
        setStage('idle')
        return
      }
      // The template ships pre-populated with the full employee roster so HR
      // doesn't have to look up employee numbers. Rows where amount is left
      // blank are "HR didn't want to adjust this employee this run" — skip
      // them silently rather than flagging every untouched row as invalid.
      // A row with a corrupt amount (e.g. "abc", -100) still errors so HR
      // sees the typo.
      const parsed: MergedRow[] = json.reduce<MergedRow[]>((acc, row, idx) => {
        const employeeNo = String(row.employee_no ?? '').trim()
        const employeeName = String(row.employee_name ?? '').trim()
        const employeeEmail = String(row.employee_email ?? '').trim()
        const employeePhone = String(row.employee_phone ?? '').trim()
        const amountRaw = row.amount
        const amountStr = typeof amountRaw === 'number' ? String(amountRaw) : String(amountRaw ?? '').trim()
        const n = String(row.note ?? '').trim()
        // rowNumber refers to the spreadsheet line (header is row 1).
        const rowNumber = idx + 2

        // Skip rows the user left blank — empty amount + empty note means
        // "no adjustment for this employee". This keeps the preview focused
        // on rows that actually carry a change.
        if (amountStr === '' && n === '') return acc

        const am = Number(amountStr)
        let error: string | null = null
        if (!employeeNo && !employeeEmail && !employeePhone) {
          error = 'one of employee_no, employee_email, or employee_phone is required'
        } else if (!Number.isFinite(am) || am <= 0) {
          error = 'amount must be a positive number'
        }

        acc.push({
          rowNumber, employeeNo, employeeName, employeeEmail, employeePhone, amount: am, notes: n, error,
          serverStatus: 'pending' as const,
          serverError: null,
          serverWarning: null,
          resolvedName: null,
          resolvedEmployeeNo: null,
          action: error ? ('invalid' as const) : ('pending' as const),
          changes: null,
          existing: null,
        })
        return acc
      }, [])
      // The template ships with every employee but most rows will be
      // blank. If HR uploaded without filling any cell, give a specific
      // hint instead of a silent "nothing to import" state.
      if (parsed.length === 0) {
        setParseError('No rows with an amount were found. Fill the amount column for at least one employee before uploading.')
        setRows([])
        setStage('idle')
        return
      }
      setRows(parsed)
      setStage('parsed')
      // Auto-validate server-side. Skip the network call if every row already
      // failed local checks — there's nothing the server can resolve.
      if (parsed.some((r) => !r.error)) {
        await validateOnServer(parsed)
      } else {
        setStage('ready')
      }
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Could not parse file.')
      setRows([])
      setStage('idle')
    }
  }

  const clearFile = () => {
    setFile(null)
    setRows([])
    setRowFilter('all')
    setParseError(null)
    setStage('idle')
  }

  // Combine local + server validation into a single per-row truth.
  const rowStatus = (r: MergedRow): { invalid: boolean; message: string | null } => {
    if (r.error) return { invalid: true, message: r.error }
    if (r.serverStatus === 'invalid') return { invalid: true, message: r.serverError }
    return { invalid: false, message: null }
  }
  // Derive per-action buckets in one pass so the summary cards + filter chips
  // share the same source of truth.
  const buckets = useMemo(() => {
    const out = { new: [] as MergedRow[], updated: [] as MergedRow[], unchanged: [] as MergedRow[], duplicate: [] as MergedRow[], invalid: [] as MergedRow[] }
    for (const r of rows) {
      if (rowStatus(r).invalid) { out.invalid.push(r); continue }
      const a = r.action
      if (a === 'new') out.new.push(r)
      else if (a === 'updated') out.updated.push(r)
      else if (a === 'unchanged') out.unchanged.push(r)
      else if (a === 'duplicate') out.duplicate.push(r)
    }
    return out
  }, [rows])
  const validRows = useMemo(() => [...buckets.new, ...buckets.updated], [buckets])
  const invalidRows = buckets.invalid
  const totalRows = rows.length
  // Rows currently visible in the preview table — filtered by the active chip.
  const visibleRows = useMemo(() => {
    if (rowFilter === 'all') return rows
    return buckets[rowFilter] ?? []
  }, [rowFilter, rows, buckets])

  const handleBulkSubmit = () => {
    if (validRows.length === 0 || invalidRows.length > 0) return
    setSubmitError(null)
    setStage('submitting')
    bulk.mutate(
      {
        periodYear: year,
        periodMonth: month,
        category,
        rows: validRows.map<BulkAdjustmentRow>((r) => ({
          rowNumber: r.rowNumber,
          employeeNo: r.employeeNo || null,
          employeeName: r.employeeName || null,
          employeeEmail: r.employeeEmail || null,
          employeePhone: r.employeePhone || null,
          amount: r.amount,
          notes: r.notes || null,
        })),
        // Send the original .xlsx alongside the rows so the server can keep
        // it in S3 + the import history. Optional — server falls back to
        // JSON-only when file is omitted.
        file: file ?? undefined,
      },
      {
        onSuccess: (res: BulkCreateAdjustmentsResult) => {
          // Park the result in dialog state so the success panel can render
          // the per-action breakdown. The dialog does NOT auto-close — HR
          // needs a moment to read the result against the period totals
          // refreshing behind the dialog (cache-invalidated by the hook).
          setStage('submitted')
          setSubmittedResult(res)
          const parts: string[] = []
          if (res.created > 0) parts.push(`${res.created} created`)
          if (res.updated > 0) parts.push(`${res.updated} updated`)
          if (res.unchanged > 0) parts.push(`${res.unchanged} unchanged`)
          if (res.duplicate > 0) parts.push(`${res.duplicate} duplicates skipped`)
          const detail = parts.length > 0 ? parts.join(' · ') : 'Nothing to import.'
          toast.success('Import complete', detail)
        },
        onError: (err: unknown) => {
          // ApiError shape: { statusCode, message, data: <server body> }
          const e = err as {
            statusCode?: number
            message?: string
            data?: BulkCreateAdjustmentsResult & { error?: string; statusCode?: number }
          }
          // Per-row validation failure (400 with errors array): paint each
          // bad row inline so HR sees exactly which lines to fix.
          if (e?.data?.errors && Array.isArray(e.data.errors) && e.data.errors.length > 0) {
            const byRow = new Map(e.data.errors.map((er) => [er.row, er.error]))
            setRows((prev) => prev.map((r) => {
              const msg = byRow.get(r.rowNumber)
              return msg ? { ...r, serverStatus: 'invalid' as const, serverError: msg } : r
            }))
            setSubmitError(`${e.data.errors.length} row${e.data.errors.length === 1 ? '' : 's'} rejected by the server. See the preview table for details.`)
            setStage('ready')
            return
          }
          // Top-level failure (period locked, duplicate file, bad multipart,
          // category invalid, etc.). The server's `message` field carries the
          // human-readable reason — surface it inline AND as a toast so it's
          // impossible to miss.
          const reason = e?.message
            || (typeof e?.data?.error === 'string' ? e.data.error : null)
            || 'The server rejected the upload. Please try again.'
          setSubmitError(reason)
          toast.error('Import failed', reason)
          setStage('ready')
        },
      },
    )
  }

  const singleCanSubmit = !!employeeId && !!amount && Number(amount) > 0
  // Surface period-locked as a blocker on the dialog (same contract as
  // bulk-create — better to fail validation than to fail the submit).
  const bulkCanSubmit = stage === 'ready' && validRows.length > 0 && invalidRows.length === 0 && !periodLocked

  // The comparison engine is anchored on category — when HR flips the category
  // chip the existing per-row verdicts are stale. Re-validate so the badges
  // reflect the new comparison. State-during-render avoids a flicker.
  const [lastValidatedCategory, setLastValidatedCategory] = useState<PayrollAdjustmentCategory>(category)
  if (lastValidatedCategory !== category) {
    setLastValidatedCategory(category)
    if (stage === 'ready' && rows.some((r) => !r.error)) {
      // Fire-and-forget — validateOnServer updates stage internally.
      void validateOnServer(rows)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={cn(
        'max-h-[90vh] flex flex-col',
        mode === 'single' ? 'sm:max-w-lg' : 'sm:max-w-5xl',
      )}>
        <DialogHeader>
          <DialogTitle>New adjustment - {MONTH_NAMES[month - 1]} {year}</DialogTitle>
          <DialogDescription>
            {mode === 'single'
              ? 'Add a single addition or deduction that will apply when payroll runs.'
              : 'Upload an Excel file to add many adjustments at once. The category applies to every row.'}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'bulk')} className="mt-1">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="single" disabled={submitting || stage === 'parsing' || stage === 'validating'}>
              <Plus className="size-3.5 me-1.5" />
              Single entry
            </TabsTrigger>
            <TabsTrigger value="bulk" disabled={submitting}>
              <Upload className="size-3.5 me-1.5" />
              Bulk import
            </TabsTrigger>
          </TabsList>

          {/* Category - shared between both modes so switching tabs preserves intent.
              HR can pick a built-in, a previously-created tenant custom category,
              or type a new name and add it from the picker itself. */}
          <div className="space-y-1.5 pt-4">
            <Label>Category {mode === 'bulk' && <span className="text-[10px] font-normal text-muted-foreground">(applies to every row)</span>}</Label>
            <AdjustmentCategoryPicker
              value={category}
              onValueChange={(v) => setCategory(v as PayrollAdjustmentCategory)}
            />
          </div>

          <TabsContent value="single" className="mt-4 space-y-3 focus-visible:outline-none">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <EmployeeSelect
                value={employeeId}
                onValueChange={setEmployeeId}
                placeholder="Pick an employee"
                clearable
              />
            </div>
            <div className="space-y-1.5">
              <Label>Amount (AED)</Label>
              <NumericInput
                value={amount === '' ? '' : String(amount)}
                onChange={(e) => {
                  const raw = e.target.value
                  setAmount(raw === '' ? '' : Number(raw))
                }}
                placeholder="0.00"
                maxDecimals={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <input
                aria-label="Notes"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Q2 sales commission"
              />
            </div>
          </TabsContent>

          <TabsContent value="bulk" className="mt-4 space-y-4 focus-visible:outline-none overflow-y-auto">
            {/* Workflow stepper */}
            <div className="grid grid-cols-3 gap-1 rounded-lg border bg-muted/30 p-2">
              <StepBadge
                num={1}
                label="Upload file"
                active={stage === 'idle' || stage === 'parsing'}
                done={stage !== 'idle' && stage !== 'parsing'}
              />
              <StepBadge
                num={2}
                label="Validate"
                active={stage === 'parsed' || stage === 'validating'}
                done={stage === 'ready' || stage === 'submitting' || stage === 'submitted'}
              />
              <StepBadge
                num={3}
                label="Import"
                active={stage === 'ready' || stage === 'submitting'}
                done={stage === 'submitted'}
              />
            </div>

            {/* Upload area */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label>Excel file</Label>
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 text-xs font-medium"
                  onClick={handleDownloadTemplate}
                  loading={downloading}
                >
                  <FileDown className="size-3" />
                  Download template
                </Button>
              </div>

              {!file ? (
                <label
                  htmlFor="bulk-adjustment-file"
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragOver(false)
                    const f = e.dataTransfer.files?.[0]
                    if (f) handleFile(f)
                  }}
                  className={cn(
                    'group relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 cursor-pointer transition-all',
                    dragOver
                      ? 'border-primary bg-primary/5 scale-[1.005]'
                      : 'border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/40',
                  )}
                >
                  <div className={cn(
                    'flex size-12 items-center justify-center rounded-full transition-colors',
                    dragOver ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground group-hover:text-foreground',
                  )}>
                    <FileSpreadsheet className="size-6" />
                  </div>
                  <div className="text-center space-y-0.5">
                    <p className="text-sm font-medium text-foreground">
                      {dragOver ? 'Drop to upload' : 'Drag and drop or click to browse'}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      .xlsx · columns: {TEMPLATE_HEADERS.join(', ')}
                    </p>
                  </div>
                  <input
                    id="bulk-adjustment-file"
                    type="file"
                    accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFile(f)
                      e.target.value = ''
                    }}
                  />
                </label>
              ) : (
                <div className="flex items-center gap-3 rounded-xl border bg-card p-3">
                  <div className={cn(
                    'flex size-10 items-center justify-center rounded-lg shrink-0',
                    invalidRows.length === 0 && stage === 'ready'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                  )}>
                    {stage === 'parsing' || stage === 'validating'
                      ? <Loader2 className="size-5 animate-spin" />
                      : <FileSpreadsheet className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatBytes(file.size)}
                      {stage === 'parsing' && ' · parsing…'}
                      {stage === 'validating' && ' · validating with server…'}
                      {(stage === 'ready' || stage === 'parsed') && ` · ${totalRows} row${totalRows === 1 ? '' : 's'}`}
                      {stage === 'submitting' && ' · importing…'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearFile}
                    disabled={stage === 'parsing' || stage === 'validating' || stage === 'submitting'}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5 me-1" />
                    Replace
                  </Button>
                </div>
              )}
              {parseError && (
                <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                  <AlertCircle className="size-3" />
                  {parseError}
                </p>
              )}
            </div>

            {/* Validation summary — one card per action bucket. Click a card
                to filter the preview table to just that bucket. */}
            {totalRows > 0 && (
              <ActionSummary
                total={totalRows}
                buckets={{
                  new: buckets.new.length,
                  updated: buckets.updated.length,
                  unchanged: buckets.unchanged.length,
                  duplicate: buckets.duplicate.length,
                  invalid: buckets.invalid.length,
                }}
                active={rowFilter}
                onFilter={setRowFilter}
              />
            )}

            {/* Preview table — rows filtered by the active chip; styling
                varies per action (gray duplicate, red→green updated, etc.). */}
            {totalRows > 0 && (
              <div className="space-y-2">
                <div className="rounded-lg border overflow-hidden">
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0 z-10">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium w-8">#</th>
                          <th className="px-2 py-1.5 text-left font-medium w-24">Status</th>
                          <th className="px-2 py-1.5 text-left font-medium">Employee</th>
                          <th className="px-2 py-1.5 text-right font-medium w-44">Amount</th>
                          <th className="px-2 py-1.5 text-left font-medium">Note / Issue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {visibleRows.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-2 py-6 text-center text-muted-foreground">
                              No rows match this filter.
                            </td>
                          </tr>
                        ) : (
                          visibleRows.map((r) => {
                            const status = rowStatus(r)
                            const action: BulkRowAction = status.invalid
                              ? 'invalid'
                              : (r.action === 'pending' ? 'new' : r.action)
                            return (
                              <BulkRowItem
                                key={r.rowNumber}
                                row={r}
                                action={action}
                                statusMessage={status.message}
                                pending={r.serverStatus === 'pending' && !status.invalid}
                              />
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {invalidRows.length > 0 && stage === 'ready' && (
                  <p className="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                    <AlertCircle className="size-3 mt-0.5 shrink-0" />
                    Fix the {invalidRows.length} highlighted row{invalidRows.length === 1 ? '' : 's'} in your spreadsheet, then re-upload. Imports run all-or-nothing.
                  </p>
                )}
                {periodLocked && stage === 'ready' && (
                  <p className="flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                    <AlertCircle className="size-3 mt-0.5 shrink-0" />
                    Payroll for this period has already been processed — adjustments are locked. Pick an open period to import into.
                  </p>
                )}
                {buckets.duplicate.length > 0 && stage === 'ready' && invalidRows.length === 0 && !periodLocked && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <AlertCircle className="size-3 mt-0.5 shrink-0" />
                    {buckets.duplicate.length} duplicate row{buckets.duplicate.length === 1 ? '' : 's'} will be skipped — only the first occurrence of each employee imports.
                  </p>
                )}
                {buckets.unchanged.length > 0 && stage === 'ready' && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Info className="size-3 mt-0.5 shrink-0" />
                    {buckets.unchanged.length} row{buckets.unchanged.length === 1 ? '' : 's'} already match the existing values — skipped on import.
                  </p>
                )}
              </div>
            )}

            {/* Top-level submit failure (period locked, dupe file, etc.).
                Lives outside the rows-preview block so it shows even when
                the failure happened before any rows were validated. */}
            {submitError && stage === 'ready' && (
              <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertCircle className="size-3.5 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">Import failed</p>
                  <p className="text-rose-600/90 dark:text-rose-300/80 break-words">{submitError}</p>
                </div>
              </div>
            )}

            {/* Post-import result panel — renders after the bulk-create
                mutation resolves successfully. Lays out exactly which
                action buckets committed so HR sees what changed before
                hitting Done. The Total additions KPI behind the dialog
                has already refreshed by the time this is shown (the hook
                invalidates ['payroll-adjustments', year, month] in its
                onSuccess and active queries refetch in the same tick). */}
            {stage === 'submitted' && submittedResult && (
              <ImportResultPanel result={submittedResult} category={category} />
            )}

            <ImportHistorySection year={year} month={month} />
          </TabsContent>
        </Tabs>

        <Separator />
        <div className="flex justify-end gap-2 pt-1">
          {/* After a successful import the dialog stays open with the result
              panel rendered — collapse the footer to a single "Done" button
              so HR can read the breakdown then dismiss explicitly. */}
          {stage === 'submitted' && submittedResult ? (
            <Button onClick={() => handleOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting || stage === 'parsing' || stage === 'validating'}>
                Cancel
              </Button>
              {mode === 'single' ? (
                <Button
                  onClick={handleSingleSubmit}
                  loading={create.isPending}
                  disabled={!singleCanSubmit || submitting}
                >
                  Save adjustment
                </Button>
              ) : (
                <Button
                  onClick={handleBulkSubmit}
                  loading={bulk.isPending}
                  disabled={!bulkCanSubmit || submitting}
                >
                  {(() => {
                    const n = buckets.new.length, u = buckets.updated.length
                    if (n === 0 && u === 0) return 'Import rows'
                    if (u === 0) return `Import ${n} new row${n === 1 ? '' : 's'}`
                    if (n === 0) return `Apply ${u} update${u === 1 ? '' : 's'}`
                    return `Import ${n} new + ${u} update${u === 1 ? '' : 's'}`
                  })()}
                </Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Import history (lives inside the bulk tab) ─────────────────────────────

const CATEGORY_LABELS_FOR_IMPORT: Record<string, string> = {
  overtime: 'Overtime',
  commission: 'Commission',
  bonus: 'Bonus',
  salary_advance: 'Salary advance',
  manual: 'Manual deduction',
  loan_repayment: 'Loan repayment',
  unpaid_leave: 'Loss of pay',
  sick_half_pay: 'Sick half-pay',
}

function formatImportBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function formatImportDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit', hour12: false })
}

function ImportHistorySection({ year, month }: { year: number; month: number }) {
  const { data, isLoading } = useBulkImportHistory({ year, month })
  const download = useDownloadImportFile()
  const rows = data ?? []

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">Recent imports</p>
          <p className="text-[11px] text-muted-foreground">Past uploads for {MONTH_NAMES[month - 1]} {year} — re-download the original file anytime.</p>
        </div>
        {rows.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">{rows.length}</Badge>
        )}
      </div>
      {isLoading ? (
        <div className="space-y-1.5">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={`hist-skeleton-${i}`} className="h-12 rounded-md" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-md border bg-muted/20 px-3 py-4 text-center text-[11px] text-muted-foreground">
          No bulk imports yet for this period.
        </p>
      ) : (
        <ul className="rounded-lg border divide-y overflow-hidden">
          {rows.map((row: BulkImportHistoryRow) => (
            <li key={row.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors">
              <div className="flex size-8 items-center justify-center rounded-md bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 shrink-0">
                <FileSpreadsheet className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium truncate">{row.fileName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {CATEGORY_LABELS_FOR_IMPORT[row.category] ?? categoryLabel(row.category)}
                  {' · '}{row.rowsCreated} row{row.rowsCreated === 1 ? '' : 's'}
                  {' · '}{formatImportBytes(row.fileSize)}
                  {row.createdByName && ` · by ${row.createdByName}`}
                </p>
                <p className="text-[10px] text-muted-foreground/80">{formatImportDate(row.createdAt)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => download.mutate(row.id)}
                loading={download.isPending && download.variables === row.id}
                className="shrink-0"
              >
                <FileDown className="size-3.5" />
                Download
              </Button>
            </li>
          ))}
        </ul>
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

  const [createOpen, setCreateOpen] = useState(false)
  const [runConfirmOpen, setRunConfirmOpen] = useState(false)
  const [selectedRun, setSelectedRun] = useState<PayrollRun | null>(null)
  const [payslipsOpen, setPayslipsOpen] = useState(false)

  const [createMonth, setCreateMonth] = useState(currentMonth)
  const [createYear, setCreateYear] = useState(currentYear)

  const { data: payrollData, isLoading, isFetching, refetch } = usePayrollRuns({ year: currentYear })
  const { data: prevYearData } = usePayrollRuns({ year: currentYear - 1, enabled: createOpen })
  const payrollRuns = useMemo<PayrollRun[]>(() => (payrollData?.data as PayrollRun[]) ?? [], [payrollData?.data])
  const prevYearRuns = useMemo<PayrollRun[]>(() => (prevYearData?.data as PayrollRun[]) ?? [], [prevYearData?.data])

  const runPayroll = useRunPayroll()
  const createRun = useCreatePayrollRun()

  // Disable months in the future when selected year = current year
  const maxSelectableMonth = createYear === currentYear ? currentMonth : 12

  const existingRunMonths = useMemo(() => {
    const runs = createYear === currentYear ? payrollRuns : prevYearRuns
    return new Set(runs.map(r => r.month))
  }, [createYear, currentYear, payrollRuns, prevYearRuns])

  const draftRun = payrollRuns.find(r => r.status === 'draft')
  // Readiness checklist for the draft (returns null for non-draft, gated by hook)
  const { data: readiness } = useReadiness(draftRun?.id)
  const deleteDraft = useDeletePayrollRun()
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
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

  const handleDeleteDraft = () => {
    if (!draftRun) return
    deleteDraft.mutate(draftRun.id, {
      onSuccess: () => {
        toast.success('Draft deleted', `${draftLabel} payroll draft removed.`)
        setDeleteConfirmOpen(false)
      },
      onError: () => setDeleteConfirmOpen(false),
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
              leftIcon={<RefreshCcw className={cn('size-3.5', isFetching && 'animate-spin')} />}
              onClick={() => refetch()} disabled={isFetching}>
              Refresh
            </Button>
            {canManagePayroll && (
              <Button size="sm" leftIcon={<Plus className="size-3.5" />}
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
        <Card className="border border-amber-200 bg-gradient-to-r from-amber-50/70 to-background overflow-hidden">
          <CardContent className="p-5">

            {/* Row 1: identity + action */}
            <div className="flex items-start justify-between gap-4 mb-5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-9 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0">
                  <Banknote className="size-4.5 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{draftLabel} Payroll Run</p>
                    <Badge variant="warning" className="text-[10px]">Draft</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    Ready to process - review employee records before running
                  </p>
                </div>
              </div>
              {canManagePayroll && (
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Trash2 className="size-3.5" />}
                    onClick={() => setDeleteConfirmOpen(true)}
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/40"
                  >
                    Delete
                  </Button>
                  <Button
                    leftIcon={<Play className="size-4" />}
                    onClick={() => setRunConfirmOpen(true)}
                    // Server-side validation runs anyway; this prevents the
                    // obvious "no payable employees / no basic salary" mistakes
                    // so HR sees the checklist banner before they click.
                    disabled={readiness ? !readiness.canProcess : false}
                    title={readiness && !readiness.canProcess ? 'Resolve blockers before processing' : undefined}
                  >
                    Process Payroll
                  </Button>
                </div>
              )}
            </div>

            {/* Row 1.5: readiness checklist — only renders when there's at
                least one finding. Blockers (rose) gate the Process button;
                warnings (amber) are informational. Rows tied to a specific
                employee list (missing salary, missing IBAN) render with a
                popover so HR can jump straight to the offending record. */}
            {readiness && (readiness.blockers.length > 0 || readiness.warnings.length > 0) && (
              <div className="mb-5 space-y-2">
                {readiness.blockers.map((msg) => {
                  const emps = inferReadinessEmployees(msg, readiness)
                  return (
                    <ReadinessRow
                      key={`b:${msg}`}
                      tone="blocker"
                      message={msg}
                      employees={emps}
                    />
                  )
                })}
                {readiness.warnings.map((msg) => {
                  const emps = inferReadinessEmployees(msg, readiness)
                  return (
                    <ReadinessRow
                      key={`w:${msg}`}
                      tone="warning"
                      message={msg}
                      employees={emps}
                    />
                  )
                })}
              </div>
            )}

            {/* Row 2: stepper */}
            <WorkflowBar status={draftRun.status} />

            {/* Row 3: stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 mt-5 pt-4 border-t border-amber-100 w-full">
              <div className="flex items-center gap-2 px-5 first:pl-0 border-r border-border">
                <Users className="size-4 text-muted-foreground shrink-0" />
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
            <TrendingUp className="size-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5 text-sm">
            <BarChart3 className="size-3.5" />
            History
          </TabsTrigger>
          <TabsTrigger value="adjustments" className="gap-1.5 text-sm">
            <Sparkles className="size-3.5" />
            Adjustments
          </TabsTrigger>
          {/* Loans tab intentionally removed from Payroll — loan management
              lives on the dedicated Loans & Advances page (sidebar > Loans).
              Auto-deduction continues to feed payroll via the adjustments
              sync; HR doesn't need a duplicate surface inside Payroll. */}
          <TabsTrigger value="tools" className="gap-1.5 text-sm">
            <Calculator className="size-3.5" />
            Gratuity Calculator
          </TabsTrigger>
        </TabsList>

        {/* Overview tab - charts */}
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
              <BarChart3 className="size-10 text-muted-foreground/30" />
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
              <CardTitle className="text-sm font-semibold">Payroll Runs - {currentYear}</CardTitle>
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

        <TabsContent value="adjustments" className="mt-4">
          <AdjustmentsSection />
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
      <Dialog open={createOpen} onOpenChange={(v) => {
        if (!createRun.isPending) {
          if (v) {
            setCreateMonth(firstAvailableMonth(payrollRuns, currentMonth))
            setCreateYear(currentYear)
          }
          setCreateOpen(v)
        }
      }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>New Payroll Run</DialogTitle>
            <DialogDescription>Select the pay period. Only past or current months are allowed.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Year</Label>
                <Select
                  value={String(createYear)}
                  onValueChange={v => {
                    const y = Number(v)
                    setCreateYear(y)
                    const max = y === currentYear ? currentMonth : 12
                    const runs = y === currentYear ? payrollRuns : prevYearRuns
                    setCreateMonth(firstAvailableMonth(runs, max))
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
                      const hasRun = existingRunMonths.has(monthNum)
                      const isDisabled = isFuture || hasRun
                      return (
                        <SelectItem key={monthNum} value={String(monthNum)} disabled={isDisabled}>
                          <span className={cn(isDisabled && 'text-muted-foreground')}>{name}</span>
                          {isFuture && <span className="ml-1.5 text-[10px] text-muted-foreground">(future)</span>}
                          {!isFuture && hasRun && <span className="ml-1.5 text-[10px] text-muted-foreground">(exists)</span>}
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
              <Button onClick={handleCreateRun} loading={createRun.isPending} disabled={existingRunMonths.has(createMonth)}>Create Draft</Button>
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

      {/* Delete-draft confirmation. Only fired for draft runs (the button is
          hidden otherwise) and the server enforces the same rule — this dialog
          is for the obvious "I clicked the wrong month" recovery flow. */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={(o) => { if (!deleteDraft.isPending) setDeleteConfirmOpen(o) }}
        title={`Delete ${draftLabel} draft?`}
        description={draftRun
          ? `This removes the draft payroll run for ${draftLabel}. Manual adjustments (overtime, bonuses) you entered for this period stay — they'll apply when you create a new run for the same period.`
          : 'No draft run to delete.'}
        confirmLabel={deleteDraft.isPending ? 'Deleting…' : 'Delete draft'}
        cancelLabel="Cancel"
        onConfirm={handleDeleteDraft}
        variant="destructive"
      />
    </PageWrapper>
  )
}
