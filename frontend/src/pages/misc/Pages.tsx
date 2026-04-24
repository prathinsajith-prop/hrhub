import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Calendar, Clock, CheckCircle2, XCircle, Plus, Download, BarChart3, Users, Shield, UserPlus, UserMinus, AlertTriangle, PauseCircle, Eye, ArrowLeft, Trash2, Mail, Phone, FileText, Activity, Sparkles, TrendingUp } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge, Card, Progress } from '@/components/ui/primitives'
import { ConfirmDialog, toast, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, DialogClose } from '@/components/ui/overlays'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useLeaveRequests, useApproveLeave, useLeaveBalance } from '@/hooks/useLeave'
import { useEmployees } from '@/hooks/useEmployees'
import { useOnboardingChecklists, useEmployeeChecklist, useUpdateOnboardingStep, useAddOnboardingStep, useDeleteOnboardingStep, useCreateOnboardingChecklist, useOnboardingAnalytics, type OnboardingChecklist, type OnboardingStep, type OnboardingStepStatus } from '@/hooks/useOnboarding'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { applyClientFilters, type FilterConfig, type QuickFilter } from '@/lib/filters'
import { useComplianceReport } from '@/hooks/useCompliance'
import { useDocuments } from '@/hooks/useDocuments'
import { useActivityLogs } from '@/hooks/useAudit'
import { useHeadcountReport, usePayrollSummaryReport, useVisaExpiryReport } from '@/hooks/useReports'
import { ApplyLeaveDialog } from '@/components/shared/action-dialogs'
import { InitialsAvatar } from '@/components/shared/Avatar'
import type { LeaveRequest } from '@/types'

const LEAVE_FILTERS: FilterConfig[] = [
  { name: 'employeeName', label: 'Employee', type: 'text', field: 'employeeName' },
  {
    name: 'leaveType', label: 'Leave type', type: 'select', field: 'leaveType',
    options: [
      { value: 'annual', label: 'Annual' },
      { value: 'sick', label: 'Sick' },
      { value: 'maternity', label: 'Maternity' },
      { value: 'paternity', label: 'Paternity' },
      { value: 'hajj', label: 'Hajj' },
      { value: 'compassionate', label: 'Compassionate' },
      { value: 'unpaid', label: 'Unpaid' },
    ],
  },
  {
    name: 'status', label: 'Status', type: 'select', field: 'status',
    options: [
      { value: 'pending', label: 'Pending' },
      { value: 'approved', label: 'Approved' },
      { value: 'rejected', label: 'Rejected' },
      { value: 'cancelled', label: 'Cancelled' },
    ],
  },
  { name: 'startDate', label: 'Start date', type: 'date_range', field: 'startDate' },
  { name: 'days', label: 'Duration (days)', type: 'number_range', field: 'days', min: 1 },
]

const HEADCOUNT_FILTERS: FilterConfig[] = [
  { name: 'fullName', label: 'Employee name', type: 'text', field: 'fullName' },
  { name: 'department', label: 'Department', type: 'text', field: 'department' },
  { name: 'designation', label: 'Designation', type: 'text', field: 'designation' },
  {
    name: 'status', label: 'Employment status', type: 'select', field: 'status',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'onboarding', label: 'Onboarding' },
      { value: 'probation', label: 'Probation' },
      { value: 'suspended', label: 'Suspended' },
      { value: 'terminated', label: 'Terminated' },
      { value: 'visa_expired', label: 'Visa expired' },
    ],
  },
  { name: 'nationality', label: 'Nationality', type: 'text', field: 'nationality' },
  { name: 'joinDate', label: 'Join date', type: 'date_range', field: 'joinDate' },
  {
    name: 'emiratisationCategory', label: 'Emiratisation', type: 'select', field: 'emiratisationCategory',
    options: [
      { value: 'emirati', label: 'Emirati' },
      { value: 'expat', label: 'Expat' },
    ],
  },
]

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

// ─── Leave Balance Panel ──────────────────────────────────────────────────────
const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual', sick: 'Sick', maternity: 'Maternity', paternity: 'Paternity',
  compassionate: 'Compassionate', hajj: 'Hajj', unpaid: 'Unpaid',
}

// Employee status → badge variant + icon (kept consistent with EmployeesPage)
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

function EmployeeStatusBadge({ status }: { status: string }) {
  const meta = EMPLOYEE_STATUS_META[status] ?? { variant: 'secondary' as const, Icon: CheckCircle2 }
  const { variant, Icon } = meta
  return (
    <Badge variant={variant} className="capitalize text-[11px] gap-1 inline-flex items-center">
      <Icon className="h-3 w-3" />
      {status.replace(/_/g, ' ')}
    </Badge>
  )
}

function LeaveBalancePanel() {
  const [selectedEmployee, setSelectedEmployee] = useState<string | undefined>()
  const { data: empData } = useEmployees({ limit: 1000, status: 'active' })
  const employees = (empData?.data as any[]) ?? []
  const { data: balanceData, isLoading: balanceLoading } = useLeaveBalance(selectedEmployee)
  const balance = balanceData?.balance

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <p className="text-sm font-semibold">Leave Balance Checker</p>
        <Select value={selectedEmployee ?? ''} onValueChange={setSelectedEmployee}>
          <SelectTrigger className="w-56 h-8 text-sm">
            <SelectValue placeholder="Select employee…" />
          </SelectTrigger>
          <SelectContent>
            {employees.map((e: any) => (
              <SelectItem key={e.id} value={e.id}>{e.fullName ?? `${e.firstName} ${e.lastName}`}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!selectedEmployee && (
        <p className="text-xs text-muted-foreground text-center py-4">Select an employee to view their leave balance</p>
      )}

      {selectedEmployee && balanceLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      )}

      {selectedEmployee && balance && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(balance).filter(([t]) => LEAVE_LABELS[t]).map(([type, b]) => {
            const entitled = b.entitled === -1 ? '∞' : b.entitled
            const available = b.available === -1 ? '∞' : b.available
            const pct = b.entitled > 0 && b.entitled !== -1 ? Math.min(100, Math.round((b.taken / b.entitled) * 100)) : 0
            return (
              <div key={type} className="border rounded-xl p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold">{LEAVE_LABELS[type]}</span>
                  <span className={cn('font-mono', b.available === 0 ? 'text-destructive' : 'text-success')}>{available}d left</span>
                </div>
                {b.entitled !== -1 && <Progress value={pct} className="h-1" />}
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>Used: {b.taken}d</span>
                  <span>Entitled: {entitled}d</span>
                </div>
                {b.pending > 0 && (
                  <p className="text-[10px] text-warning">{b.pending}d pending approval</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

// ─── Leave Page ───────────────────────────────────────────────────────────────
const leaveStatusVariant: Record<string, any> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  cancelled: 'secondary',
}

const leaveTypeColor: Record<string, string> = {
  annual: 'bg-blue-100 text-blue-700',
  sick: 'bg-red-100 text-red-700',
  maternity: 'bg-pink-100 text-pink-700',
  paternity: 'bg-primary/10 text-primary',
  compassionate: 'bg-slate-100 text-slate-700',
  hajj: 'bg-emerald-100 text-emerald-700',
  unpaid: 'bg-gray-100 text-gray-600',
}

export function LeavePage() {
  const { t } = useTranslation()
  const { data: leaveData, isLoading: leaveLoading } = useLeaveRequests({ limit: 50 })
  const leaves: LeaveRequest[] = (leaveData?.data as LeaveRequest[]) ?? []
  const approveLeave = useApproveLeave()
  const [approveTarget, setApproveTarget] = useState<LeaveRequest | null>(null)
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const [bulkAction, setBulkAction] = useState<{ ids: string[]; approve: boolean } | null>(null)

  const leaveSearch = useSearchFilters({
    storageKey: 'hrhub.leave.searchHistory',
    availableFilters: LEAVE_FILTERS,
  })
  const filteredLeaves = useMemo(
    () => applyClientFilters(leaves as any[], {
      searchInput: leaveSearch.searchInput,
      appliedFilters: leaveSearch.appliedFilters,
      searchFields: ['employeeName', 'leaveType', 'status', 'reason'],
    }),
    [leaves, leaveSearch.appliedFilters, leaveSearch.searchInput],
  )

  const columns: ColumnDef<LeaveRequest>[] = useMemo(() => [
    {
      accessorKey: 'employeeName',
      header: 'Employee',
      cell: ({ row: { original: l } }) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <InitialsAvatar name={l.employeeName || '—'} src={(l as any).employeeAvatarUrl} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{l.employeeName || '—'}</p>
            {(l as any).employeeDepartment && (
              <p className="text-[11px] text-muted-foreground truncate">{(l as any).employeeDepartment}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'leaveType',
      header: 'Type',
      cell: ({ getValue }) => {
        const t = getValue() as string
        return <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-medium capitalize', leaveTypeColor[t] || 'bg-gray-100 text-gray-700')}>{t}</span>
      },
    },
    {
      id: 'dates',
      header: 'Dates',
      cell: ({ row: { original: l } }) => (
        <div>
          <p className="text-xs">{formatDate(l.startDate)} → {formatDate(l.endDate)}</p>
          <p className="text-[10px] text-muted-foreground">{l.days} day{l.days !== 1 ? 's' : ''}</p>
        </div>
      ),
    },
    {
      accessorKey: 'reason',
      header: 'Reason',
      cell: ({ getValue }) => <span className="text-xs">{getValue() as string}</span>,
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ getValue }) => {
        const s = getValue() as string
        return <Badge variant={leaveStatusVariant[s]} className="capitalize text-[11px]">{s}</Badge>
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const l = row.original
        return (
          <div className="flex gap-1 justify-end">
            {l.status === 'pending' && (
              <>
                <Button size="icon-sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => setApproveTarget(l)} aria-label="Approve">
                  <CheckCircle2 className="h-4 w-4" />
                </Button>
                <Button size="icon-sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setRejectTarget(l)} aria-label="Reject">
                  <XCircle className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        )
      },
      size: 110,
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title={t('leave.title')}
        description={t('leave.description')}
        actions={
          <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setApplyOpen(true)}>Apply Leave</Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCardCompact label="Pending" value={leaves.filter((l: any) => l.status === 'pending').length} icon={Clock} color="amber" />
        <KpiCardCompact label="Approved" value={leaves.filter((l: any) => l.status === 'approved').length} icon={CheckCircle2} color="green" />
        <KpiCardCompact label="Days Used" value={leaves.filter((l: any) => l.status === 'approved').reduce((a: number, l: any) => a + (l.days ?? 0), 0)} icon={Calendar} color="blue" />
        <KpiCardCompact label="Rejected" value={leaves.filter((l: any) => l.status === 'rejected').length} icon={XCircle} color="red" />
      </div>

      {/* Leave type breakdown for this year */}
      {!leaveLoading && leaves.length > 0 && (() => {
        const thisYear = new Date().getFullYear().toString()
        const yearLeaves = leaves.filter((l: any) => l.startDate?.startsWith(thisYear))
        const types = ['annual', 'sick', 'maternity', 'paternity', 'compassionate', 'hajj', 'unpaid']
        const usedByType: Record<string, number> = {}
        for (const l of yearLeaves) {
          if ((l as any).status === 'approved') {
            const t = (l as any).leaveType as string
            usedByType[t] = (usedByType[t] ?? 0) + ((l as any).days ?? 0)
          }
        }
        const hasAny = types.some(t => usedByType[t])
        if (!hasAny) return null
        const entitlements: Record<string, number> = { annual: 30, sick: 45, maternity: 60, paternity: 5, compassionate: 5, hajj: 30, unpaid: 30 }
        return (
          <Card className="p-4">
            <p className="text-sm font-semibold mb-4">Leave Utilisation — {thisYear}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {types.filter(t => usedByType[t] || entitlements[t]).map(type => {
                const taken = usedByType[type] ?? 0
                const entitled = entitlements[type] ?? 30
                const pct = Math.min(100, Math.round((taken / entitled) * 100))
                return (
                  <div key={type} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="capitalize font-medium">{type}</span>
                      <span className="text-muted-foreground">{taken}/{entitled}d</span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })()}

      <LeaveBalancePanel />

      <Card className="p-4">
        <DataTable
          columns={columns}
          data={filteredLeaves}
          isLoading={leaveLoading}
          advancedFilter={{
            search: leaveSearch,
            filters: LEAVE_FILTERS,
            placeholder: 'Search by employee, type…',
          }}
          pageSize={8}
          enableSelection
          getRowId={(row: any) => String(row.id)}
          bulkActions={(selected) => (
            <>
              <Button variant="outline" size="sm" leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                onClick={() => setBulkAction({ ids: selected.map((l: any) => l.id), approve: true })}>
                Approve
              </Button>
              <Button variant="destructive" size="sm" leftIcon={<XCircle className="h-3.5 w-3.5" />}
                onClick={() => setBulkAction({ ids: selected.map((l: any) => l.id), approve: false })}>
                Reject
              </Button>
            </>
          )}
        />
      </Card>

      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={o => !o && setApproveTarget(null)}
        title="Approve Leave Request"
        description={`Approve ${approveTarget?.days} day(s) ${approveTarget?.leaveType} leave for ${approveTarget?.employeeName}?`}
        confirmLabel="Approve"
        onConfirm={() => {
          approveLeave.mutate({ id: approveTarget!.id, approved: true }, {
            onSuccess: () => toast.success('Leave approved', `${approveTarget?.employeeName}'s leave has been approved.`)
          })
          setApproveTarget(null)
        }}
        variant="warning"
      />
      <ConfirmDialog
        open={!!rejectTarget}
        onOpenChange={o => !o && setRejectTarget(null)}
        title="Reject Leave Request"
        description={`Reject leave request from ${rejectTarget?.employeeName}? They will be notified.`}
        confirmLabel="Reject"
        onConfirm={() => {
          approveLeave.mutate({ id: rejectTarget!.id, approved: false }, {
            onSuccess: () => toast.error('Leave rejected', `${rejectTarget?.employeeName}'s request has been rejected.`)
          })
          setRejectTarget(null)
        }}
        variant="destructive"
      />
      <ConfirmDialog
        open={!!bulkAction}
        onOpenChange={o => !o && setBulkAction(null)}
        title={bulkAction?.approve ? `Approve ${bulkAction.ids.length} leave request${bulkAction.ids.length === 1 ? '' : 's'}?` : `Reject ${bulkAction?.ids.length} leave request${bulkAction?.ids.length === 1 ? '' : 's'}?`}
        description={bulkAction?.approve ? 'All selected requests will be approved and employees notified.' : 'All selected requests will be rejected and employees notified.'}
        confirmLabel={bulkAction?.approve ? 'Approve all' : 'Reject all'}
        variant={bulkAction?.approve ? 'warning' : 'destructive'}
        onConfirm={() => {
          if (!bulkAction) return
          Promise.all(
            bulkAction.ids.map(id => new Promise<void>(res =>
              approveLeave.mutate({ id, approved: bulkAction.approve }, { onSettled: () => res() })
            ))
          ).then(() => {
            if (bulkAction.approve) toast.success(`${bulkAction.ids.length} requests approved`)
            else toast.error(`${bulkAction.ids.length} requests rejected`)
            setBulkAction(null)
          })
        }}
      />
      <ApplyLeaveDialog open={applyOpen} onOpenChange={setApplyOpen} />
    </PageWrapper >
  )
}

// ─── Onboarding Page ──────────────────────────────────────────────────────────

const ONBOARDING_TEMPLATE_STEPS = [
  { title: 'HR documentation & contracts', owner: 'HR', slaDays: 1 },
  { title: 'IT equipment setup & laptop handover', owner: 'IT', slaDays: 1 },
  { title: 'System access & account creation', owner: 'IT', slaDays: 2 },
  { title: 'Access card & office orientation', owner: 'Admin', slaDays: 2 },
  { title: 'Introduction to team & manager', owner: 'Manager', slaDays: 3 },
  { title: 'Employee handbook & policy review', owner: 'HR', slaDays: 5 },
  { title: 'Benefits enrollment & payroll setup', owner: 'HR', slaDays: 7 },
  { title: 'Compliance & safety training', owner: 'HR', slaDays: 10 },
  { title: '30-day check-in with manager', owner: 'Manager', slaDays: 30 },
]

const ONBOARDING_STATUS_LABEL: Record<OnboardingStepStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Completed',
  overdue: 'Overdue',
}

function isStepOverdue(step: OnboardingStep): boolean {
  if (step.status === 'completed') return false
  if (!step.dueDate) return false
  return new Date(step.dueDate) < new Date(new Date().toDateString())
}

function deriveSteps(steps: OnboardingStep[]): OnboardingStep[] {
  return (steps ?? []).map((s) => ({ ...s, status: isStepOverdue(s) ? 'overdue' : s.status }))
}

function progressTone(progress: number): { color: string; label: string } {
  if (progress >= 100) return { color: 'text-success', label: 'Completed' }
  if (progress >= 50) return { color: 'text-blue-600', label: 'On track' }
  if (progress > 0) return { color: 'text-warning', label: 'In progress' }
  return { color: 'text-muted-foreground', label: 'Not started' }
}

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / (24 * 3600 * 1000))
}

function DueBadge({ dueDate, status }: { dueDate?: string | null; status: OnboardingStepStatus }) {
  if (status === 'completed') return null
  const days = daysUntil(dueDate)
  if (days === null) return null
  if (days < 0) return <Badge variant="destructive" className="text-[10px]">{Math.abs(days)}d overdue</Badge>
  if (days === 0) return <Badge variant="warning" className="text-[10px]">Due today</Badge>
  if (days <= 3) return <Badge variant="warning" className="text-[10px]">In {days}d</Badge>
  if (days <= 7) return <Badge variant="info" className="text-[10px]">In {days}d</Badge>
  return <Badge variant="secondary" className="text-[10px]">In {days}d</Badge>
}

function StatusPill({ status }: { status: OnboardingStepStatus }) {
  return (
    <Badge
      variant={status === 'completed' ? 'success' : status === 'in_progress' ? 'info' : status === 'overdue' ? 'destructive' : 'secondary'}
      className="text-[10px] capitalize shrink-0"
    >
      {ONBOARDING_STATUS_LABEL[status]}
    </Badge>
  )
}

const ONBOARDING_FILTERS: FilterConfig[] = [
  {
    name: 'status', label: 'Status', type: 'select',
    icon: Activity,
    options: [
      { value: 'not_started', label: 'Not started' },
      { value: 'in_progress', label: 'In progress' },
      { value: 'completed', label: 'Completed' },
    ],
  },
  { name: 'department', label: 'Department', type: 'text', icon: Users, placeholder: 'e.g. Finance' },
  { name: 'designation', label: 'Role', type: 'text', icon: UserPlus, placeholder: 'e.g. Accountant' },
  {
    name: 'progress', label: 'Progress %', type: 'number_range', icon: BarChart3,
    min: 0, max: 100, step: 5, suffix: '%',
  },
  { name: 'startDate', label: 'Start date', type: 'date_range', icon: Calendar },
  { name: 'dueDate', label: 'Due date', type: 'date_range', icon: Clock },
  {
    name: 'overdue', label: 'Overdue steps only', type: 'toggle', icon: AlertTriangle,
  },
]

const ONBOARDING_QUICK_FILTERS: QuickFilter[] = [
  {
    name: 'overdue', label: 'Overdue', icon: AlertTriangle,
    filter: { overdue: { operator: 'is', value: true } },
  },
  {
    name: 'in_progress', label: 'In progress', icon: Activity,
    filter: { status: { operator: 'equals', value: 'in_progress' } },
  },
  {
    name: 'not_started', label: 'Not started', icon: PauseCircle,
    filter: { status: { operator: 'equals', value: 'not_started' } },
  },
  {
    name: 'completed', label: 'Completed', icon: CheckCircle2,
    filter: { status: { operator: 'equals', value: 'completed' } },
  },
]

export function OnboardingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: onboardingList, isLoading: onboardingLoading } = useOnboardingChecklists()
  const { data: analyticsData } = useOnboardingAnalytics()
  const analytics = analyticsData
  const createChecklist = useCreateOnboardingChecklist()
  const { data: empData } = useEmployees({ limit: 500, status: 'active' })
  const allEmployees = (empData?.data ?? []) as any[]

  const [newOpen, setNewOpen] = useState(false)
  const [newEmpId, setNewEmpId] = useState('')
  const [newStartDate, setNewStartDate] = useState('')
  const [newDueDate, setNewDueDate] = useState('')
  const [useTemplate, setUseTemplate] = useState(true)

  const search = useSearchFilters({
    storageKey: 'hrhub.onboarding.searchHistory',
    availableFilters: ONBOARDING_FILTERS,
  })

  const enriched = useMemo<OnboardingChecklist[]>(() => {
    const checklists = onboardingList ?? []
    return checklists.map((c) => ({ ...c, steps: deriveSteps(c.steps) }))
  }, [onboardingList])

  // IDs of employees who already have a checklist
  const enrolledIds = useMemo(() => new Set(enriched.map((c) => c.employeeId)), [enriched])

  const filtered = useMemo(() => {
    const q = search.searchInput.trim().toLowerCase()
    const f = search.appliedFilters
    const matchesText = (s: string | null | undefined, v: unknown) =>
      typeof v === 'string' ? (s ?? '').toLowerCase().includes(v.toLowerCase()) : true
    return enriched.filter((c) => {
      if (q) {
        const hit = c.employeeName.toLowerCase().includes(q)
          || (c.designation ?? '').toLowerCase().includes(q)
          || (c.department ?? '').toLowerCase().includes(q)
          || (c.employeeNo ?? '').toLowerCase().includes(q)
        if (!hit) return false
      }
      const status = f.status?.value
      if (status === 'completed' && c.progress < 100) return false
      if (status === 'in_progress' && (c.progress >= 100 || c.progress === 0)) return false
      if (status === 'not_started' && c.progress > 0) return false
      if (f.department && !matchesText(c.department, f.department.value)) return false
      if (f.designation && !matchesText(c.designation, f.designation.value)) return false
      if (f.progress && typeof f.progress.value === 'object' && f.progress.value && !Array.isArray(f.progress.value)) {
        const r = f.progress.value as { min?: number; max?: number }
        if (r.min !== undefined && c.progress < r.min) return false
        if (r.max !== undefined && c.progress > r.max) return false
      }
      const dateRange = (val: unknown, target: string | null) => {
        if (!val || typeof val !== 'object' || Array.isArray(val) || !target) return true
        const r = val as { from?: string; to?: string }
        if (r.from && target < r.from) return false
        if (r.to && target > r.to) return false
        return true
      }
      if (f.startDate && !dateRange(f.startDate.value, c.startDate)) return false
      if (f.dueDate && !dateRange(f.dueDate.value, c.dueDate)) return false
      if (f.overdue?.value === true && !c.steps.some((s) => s.status === 'overdue')) return false
      return true
    })
  }, [enriched, search.searchInput, search.appliedFilters])

  const totalOverdue = enriched.reduce((n, c) => n + c.steps.filter((s) => s.status === 'overdue').length, 0)

  const startOnboarding = () => {
    if (!newEmpId) { toast.error('Select an employee', 'Choose an employee to start onboarding.'); return }
    createChecklist.mutate(
      { employeeId: newEmpId, startDate: newStartDate || undefined, dueDate: newDueDate || undefined, useTemplate },
      {
        onSuccess: () => {
          toast.success('Onboarding started', useTemplate ? 'Checklist created with 9 default steps.' : 'Empty checklist created.')
          setNewOpen(false); setNewEmpId(''); setNewStartDate(''); setNewDueDate(''); setUseTemplate(true)
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.message ?? 'Could not create checklist.'
          toast.error('Failed', msg)
        },
      },
    )
  }

  const columns = useMemo<ColumnDef<OnboardingChecklist>[]>(() => [
    {
      accessorKey: 'employeeName',
      header: 'Employee',
      cell: ({ row: { original: c } }) => (
        <div className="flex items-center gap-3 min-w-0">
          <InitialsAvatar name={c.employeeName} src={c.avatarUrl ?? undefined} size="sm" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{c.employeeName}</p>
            <p className="text-[11px] text-muted-foreground truncate">{c.employeeNo ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'designation',
      header: 'Role',
      cell: ({ row: { original: c } }) => (
        <div className="min-w-0">
          <p className="text-sm truncate">{c.designation ?? '—'}</p>
          <p className="text-[11px] text-muted-foreground truncate">{c.department ?? '—'}</p>
        </div>
      ),
    },
    { accessorKey: 'startDate', header: 'Start', cell: ({ getValue }) => <span className="text-sm">{formatDate(getValue() as string)}</span> },
    { accessorKey: 'dueDate', header: 'Due', cell: ({ getValue }) => <span className="text-sm">{formatDate(getValue() as string)}</span> },
    {
      accessorKey: 'progress',
      header: 'Progress',
      cell: ({ row: { original: c } }) => {
        const tone = progressTone(c.progress)
        return (
          <div className="min-w-[140px]">
            <div className="flex items-center justify-between mb-1">
              <span className={cn('text-xs font-semibold', tone.color)}>{c.progress}%</span>
              <span className="text-[11px] text-muted-foreground">{c.completedCount}/{c.totalCount}</span>
            </div>
            <Progress value={c.progress} />
          </div>
        )
      },
    },
    {
      id: 'overdue',
      header: 'Overdue',
      cell: ({ row: { original: c } }) => {
        const n = c.steps.filter((s) => s.status === 'overdue').length
        return n > 0
          ? <Badge variant="destructive" className="text-[10px]">{n}</Badge>
          : <span className="text-xs text-muted-foreground">—</span>
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row: { original: c } }) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Button asChild size="sm" variant="outline">
            <Link to={`/onboarding/${c.employeeId}`}><Eye className="h-3.5 w-3.5 mr-1.5" />View</Link>
          </Button>
        </div>
      ),
    },
  ], [])

  return (
    <PageWrapper>
      <PageHeader
        title={t('onboarding.title')}
        description={t('onboarding.description')}
        actions={
          <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNewOpen(true)}>
            New Onboarding
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <KpiCardCompact label="Active" value={analytics?.inProgress ?? enriched.filter(c => c.progress > 0 && c.progress < 100).length} icon={Users} color="blue" loading={onboardingLoading} />
        <KpiCardCompact label="Completed" value={analytics?.completed ?? enriched.filter(c => c.progress >= 100).length} icon={CheckCircle2} color="green" loading={onboardingLoading} />
        <KpiCardCompact label="Overdue Steps" value={analytics?.overdueSteps ?? totalOverdue} icon={AlertTriangle} color="red" loading={onboardingLoading} />
        <KpiCardCompact label="Avg Progress" value={`${analytics?.avgProgress ?? 0}%`} icon={TrendingUp} color="amber" loading={onboardingLoading} />
      </div>

      {onboardingLoading ? (
        <Card className="p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </Card>
      ) : enriched.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <UserPlus className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">No active onboarding checklists</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              New employees with status "onboarding" will appear here automatically.
            </p>
          </div>
        </Card>
      ) : (
        <Card className="p-4">
          <DataTable
            columns={columns}
            data={filtered}
            getRowId={(row) => row.id}
            onRowClick={(row) => navigate(`/onboarding/${row.employeeId}`)}
            advancedFilter={{
              search,
              filters: ONBOARDING_FILTERS,
              quickFilters: ONBOARDING_QUICK_FILTERS,
              placeholder: 'Search by employee, role, department, employee №…',
            }}
            pageSize={10}
            emptyMessage="No checklists match your filters"
          />
        </Card>
      )}

      {/* New Onboarding Dialog */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Start Onboarding</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Employee *</label>
              <Select value={newEmpId} onValueChange={setNewEmpId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {allEmployees.filter((e: any) => !enrolledIds.has(e.id)).map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.firstName} {e.lastName}
                      {e.designation ? ` — ${e.designation}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {allEmployees.filter((e: any) => !enrolledIds.has(e.id)).length === 0 && (
                <p className="text-xs text-muted-foreground">All active employees already have a checklist.</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Start date</label>
                <DatePicker value={newStartDate} onChange={setNewStartDate} className="h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Due date</label>
                <DatePicker value={newDueDate} onChange={setNewDueDate} className="h-9" />
              </div>
            </div>
            <label className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border cursor-pointer hover:bg-muted/80 transition-colors">
              <input
                type="checkbox"
                checked={useTemplate}
                onChange={(e) => setUseTemplate(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-primary"
              />
              <div>
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-sm font-medium">Use default template</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Auto-creates 9 standard onboarding steps (HR docs, IT setup, orientation, 30-day check-in, etc.)
                </p>
              </div>
            </label>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" loading={createChecklist.isPending} onClick={startOnboarding}>
              Start Onboarding
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  )
}

// ─── Onboarding Detail Page (with tabs) ───────────────────────────────────────

export function OnboardingDetailPage() {
  const { employeeId = '' } = useParams<{ employeeId: string }>()
  const navigate = useNavigate()
  const { data: raw, isLoading } = useEmployeeChecklist(employeeId)
  const checklist = useMemo<OnboardingChecklist | null>(() => {
    if (!raw) return null
    return { ...raw, steps: deriveSteps(raw.steps) }
  }, [raw])

  if (isLoading) {
    return (
      <PageWrapper>
        <div className="space-y-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </PageWrapper>
    )
  }

  if (!checklist) {
    return (
      <PageWrapper>
        <Card className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <UserPlus className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm font-medium">Onboarding checklist not found</p>
          <Button variant="outline" size="sm" onClick={() => navigate('/onboarding')}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back to onboarding
          </Button>
        </Card>
      </PageWrapper>
    )
  }

  const tone = progressTone(checklist.progress)

  return (
    <PageWrapper>
      <div className="flex items-center gap-2 mb-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/onboarding')}>
          <ArrowLeft className="h-4 w-4 mr-1.5" />Onboarding
        </Button>
      </div>

      {/* Header card */}
      <Card className="p-5 mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <InitialsAvatar name={checklist.employeeName} src={checklist.avatarUrl ?? undefined} size="lg" />
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">{checklist.employeeName}</h1>
              <p className="text-sm text-muted-foreground truncate">
                {checklist.designation ?? '—'}{checklist.department ? ` · ${checklist.department}` : ''}
              </p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mt-1">
                {checklist.employeeNo && <span>#{checklist.employeeNo}</span>}
                {checklist.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{checklist.email}</span>}
                {checklist.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{checklist.phone}</span>}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={cn('text-3xl font-bold font-display', tone.color)}>{checklist.progress}%</p>
            <p className="text-xs text-muted-foreground">{tone.label} · {checklist.completedCount}/{checklist.totalCount} steps</p>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link to={`/employees/${checklist.employeeId}`}>View employee</Link>
            </Button>
          </div>
        </div>
        <Progress value={checklist.progress} className="mt-4" />
      </Card>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="steps">Steps ({checklist.totalCount})</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab checklist={checklist} /></TabsContent>
        <TabsContent value="steps"><StepsTab checklist={checklist} /></TabsContent>
        <TabsContent value="documents"><DocumentsTab employeeId={checklist.employeeId} /></TabsContent>
        <TabsContent value="activity"><ActivityTab employeeId={checklist.employeeId} /></TabsContent>
      </Tabs>
    </PageWrapper>
  )
}

function OverviewTab({ checklist }: { checklist: OnboardingChecklist }) {
  const stats = useMemo(() => {
    const counts = { pending: 0, in_progress: 0, completed: 0, overdue: 0 }
    for (const s of checklist.steps) counts[s.status] += 1
    return counts
  }, [checklist.steps])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCardCompact label="Pending" value={stats.pending} icon={Clock} color="amber" />
        <KpiCardCompact label="In progress" value={stats.in_progress} icon={Activity} color="blue" />
        <KpiCardCompact label="Completed" value={stats.completed} icon={CheckCircle2} color="green" />
        <KpiCardCompact label="Overdue" value={stats.overdue} icon={AlertTriangle} color="red" />
      </div>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Timeline</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Start date</p>
            <p className="font-medium">{checklist.startDate ? formatDate(checklist.startDate) : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Due date</p>
            <p className="font-medium">{checklist.dueDate ? formatDate(checklist.dueDate) : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Join date</p>
            <p className="font-medium">{checklist.joinDate ? formatDate(checklist.joinDate) : '—'}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Up next</h3>
        {(() => {
          const upcoming = checklist.steps.filter((s) => s.status !== 'completed').slice(0, 3)
          if (upcoming.length === 0) return <p className="text-sm text-muted-foreground">All steps complete. 🎉</p>
          return (
            <ul className="divide-y">
              {upcoming.map((step) => (
                <li key={step.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{step.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {step.owner ?? 'Unassigned'}{step.dueDate ? ` · Due ${formatDate(step.dueDate)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <DueBadge dueDate={step.dueDate} status={step.status} />
                    <StatusPill status={step.status} />
                  </div>
                </li>
              ))}
            </ul>
          )
        })()}
      </Card>
    </div>
  )
}

type StepFilter = 'all' | OnboardingStepStatus

function StepsTab({ checklist }: { checklist: OnboardingChecklist }) {
  const updateStep = useUpdateOnboardingStep()
  const addStep = useAddOnboardingStep()
  const deleteStep = useDeleteOnboardingStep()
  const [editing, setEditing] = useState<OnboardingStep | null>(null)
  const [stepStatus, setStepStatus] = useState<OnboardingStepStatus>('in_progress')
  const [stepNotes, setStepNotes] = useState('')
  const [stepDate, setStepDate] = useState('')
  const [adding, setAdding] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const [newDue, setNewDue] = useState('')
  const [newSlaDays, setNewSlaDays] = useState('')
  const [showTemplates, setShowTemplates] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<OnboardingStep | null>(null)
  const [stepFilter, setStepFilter] = useState<StepFilter>('all')

  const stepCounts = useMemo(() => {
    const c = { all: checklist.steps.length, pending: 0, in_progress: 0, completed: 0, overdue: 0 }
    for (const s of checklist.steps) c[s.status] += 1
    return c
  }, [checklist.steps])

  const visibleSteps = useMemo(
    () => stepFilter === 'all' ? checklist.steps : checklist.steps.filter((s) => s.status === stepFilter),
    [checklist.steps, stepFilter],
  )

  const openEdit = (step: OnboardingStep) => {
    setEditing(step)
    setStepStatus(step.status === 'overdue' ? 'in_progress' : step.status)
    setStepNotes(step.notes ?? '')
    setStepDate(step.completedDate ?? new Date().toISOString().split('T')[0])
  }

  const saveEdit = () => {
    if (!editing) return
    updateStep.mutate(
      {
        checklistId: checklist.id,
        stepId: editing.id,
        data: {
          status: stepStatus,
          notes: stepNotes || undefined,
          completedDate: stepStatus === 'completed' ? (stepDate || new Date().toISOString().split('T')[0]) : undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success('Step updated', `"${editing.title}" marked as ${ONBOARDING_STATUS_LABEL[stepStatus]}.`)
          setEditing(null)
        },
        onError: () => toast.error('Update failed', 'Could not update the step.'),
      },
    )
  }

  const saveNew = () => {
    if (!newTitle.trim()) {
      toast.error('Title required', 'Enter a step title.')
      return
    }
    addStep.mutate(
      {
        checklistId: checklist.id,
        data: {
          title: newTitle.trim(),
          owner: newOwner || undefined,
          dueDate: newDue || undefined,
          slaDays: newSlaDays ? Number(newSlaDays) : undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success('Step added', `"${newTitle.trim()}" added to checklist.`)
          setAdding(false)
          setNewTitle(''); setNewOwner(''); setNewDue(''); setNewSlaDays(''); setShowTemplates(false)
        },
        onError: () => toast.error('Add failed', 'Could not add the step.'),
      },
    )
  }

  const applyTemplateStep = (t: typeof ONBOARDING_TEMPLATE_STEPS[number]) => {
    setNewTitle(t.title)
    setNewOwner(t.owner)
    setNewSlaDays(String(t.slaDays))
    setShowTemplates(false)
  }

  const doDelete = () => {
    if (!confirmDelete) return
    deleteStep.mutate(
      { checklistId: checklist.id, stepId: confirmDelete.id },
      {
        onSuccess: () => {
          toast.success('Step removed', `"${confirmDelete.title}" deleted.`)
          setConfirmDelete(null)
        },
        onError: () => toast.error('Delete failed', 'Could not remove the step.'),
      },
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h3 className="text-sm font-semibold">Checklist steps</h3>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />Add step
        </Button>
      </div>

      {checklist.steps.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap mb-3">
          {([
            { key: 'all', label: 'All' },
            { key: 'pending', label: 'Pending' },
            { key: 'in_progress', label: 'In progress' },
            { key: 'completed', label: 'Completed' },
            { key: 'overdue', label: 'Overdue' },
          ] as Array<{ key: StepFilter; label: string }>).map(({ key, label }) => {
            const count = stepCounts[key]
            const active = stepFilter === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setStepFilter(key)}
                disabled={key !== 'all' && count === 0}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card text-muted-foreground border-border hover:bg-muted disabled:opacity-40 disabled:hover:bg-card',
                )}
              >
                {label}
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', active ? 'bg-primary-foreground/20' : 'bg-muted')}>{count}</span>
              </button>
            )
          })}
        </div>
      )}

      {checklist.steps.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No steps yet. Click "Add step" to create one.</p>
      ) : visibleSteps.length === 0 ? (
        <p className="text-xs text-muted-foreground py-6 text-center">No steps in this view.</p>
      ) : (
        <div className="space-y-2">
          {visibleSteps.map((step, i) => (
            <div
              key={step.id}
              className={cn(
                'w-full flex items-center gap-3 p-2.5 rounded-lg border',
                step.status === 'completed' ? 'bg-success/5 border-success/30' :
                  step.status === 'in_progress' ? 'bg-info/5 border-info/30' :
                    step.status === 'overdue' ? 'bg-destructive/5 border-destructive/30' :
                      'bg-card border-border',
              )}
            >
              <button
                type="button"
                className={cn(
                  'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                  step.status === 'completed' ? 'bg-success text-success-foreground' :
                    step.status === 'in_progress' ? 'bg-info text-info-foreground' :
                      step.status === 'overdue' ? 'bg-destructive text-destructive-foreground' :
                        'bg-muted text-muted-foreground',
                )}
                onClick={() => openEdit(step)}
              >
                {step.status === 'completed' ? '✓' : i + 1}
              </button>
              <button
                type="button"
                className="flex-1 min-w-0 text-left"
                onClick={() => openEdit(step)}
              >
                <p className="text-sm font-medium truncate">{step.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {step.owner ?? 'Unassigned'}
                  {step.dueDate ? ` · Due ${formatDate(step.dueDate)}` : ''}
                  {step.status === 'completed' && step.completedDate ? ` · Done ${formatDate(step.completedDate)}` : ''}
                </p>
                {step.notes && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{step.notes}</p>}
              </button>
              <DueBadge dueDate={step.dueDate} status={step.status} />
              <StatusPill status={step.status} />
              <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(step)} aria-label="Delete step">
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Edit step dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Update step</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-sm font-semibold">{editing?.title}</p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={stepStatus} onValueChange={(v) => setStepStatus(v as OnboardingStepStatus)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {stepStatus === 'completed' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Completion date</label>
                <DatePicker value={stepDate} onChange={setStepDate} className="h-9" />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <Textarea value={stepNotes} onChange={(e) => setStepNotes(e.target.value)} rows={3} placeholder="Add any relevant notes…" />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" loading={updateStep.isPending} onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add step dialog */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add step</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Title *</label>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-[11px] text-primary"
                  onClick={() => setShowTemplates(!showTemplates)}
                >
                  <Sparkles className="h-3 w-3 mr-1" />
                  {showTemplates ? 'Hide templates' : 'From template'}
                </Button>
              </div>
              {showTemplates && (
                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                  {ONBOARDING_TEMPLATE_STEPS.map((t, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => applyTemplateStep(t)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
                    >
                      <span className="font-medium">{t.title}</span>
                      <span className="text-muted-foreground text-[11px] ml-2">— {t.owner} · {t.slaDays}d SLA</span>
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Issue laptop"
                className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Owner</label>
                <input
                  type="text"
                  value={newOwner}
                  onChange={(e) => setNewOwner(e.target.value)}
                  placeholder="e.g. IT, HR"
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">SLA days</label>
                <input
                  type="number"
                  value={newSlaDays}
                  onChange={(e) => setNewSlaDays(e.target.value)}
                  placeholder="e.g. 3"
                  min={0}
                  className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Due date</label>
              <DatePicker value={newDue} onChange={setNewDue} className="h-9" />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
            <Button size="sm" loading={addStep.isPending} onClick={saveNew}>Add step</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}
        title="Delete step?"
        description={`This will permanently remove "${confirmDelete?.title}" from the checklist.`}
        confirmLabel={deleteStep.isPending ? 'Deleting…' : 'Delete'}
        variant="destructive"
        onConfirm={doDelete}
      />
    </Card>
  )
}

function DocumentsTab({ employeeId }: { employeeId: string }) {
  const { data, isLoading } = useDocuments({ employeeId, limit: 50 })
  const docs = (data?.data ?? []) as Array<{ id: string; fileName?: string; category?: string; docType?: string; status?: string; expiryDate?: string | null; uploadedAt?: string }>

  if (isLoading) {
    return (
      <Card className="p-4 space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Employee documents</h3>
        <Button asChild size="sm" variant="outline">
          <Link to={`/documents?employeeId=${employeeId}`}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />Upload
          </Link>
        </Button>
      </div>
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <FileText className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card">
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{d.fileName ?? d.docType ?? 'Document'}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {d.category ?? '—'}
                  {d.expiryDate ? ` · Expires ${formatDate(d.expiryDate)}` : ''}
                  {d.uploadedAt ? ` · Uploaded ${formatDate(d.uploadedAt)}` : ''}
                </p>
              </div>
              {d.status && <Badge variant="secondary" className="text-[10px] capitalize">{d.status}</Badge>}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function ActivityTab({ employeeId }: { employeeId: string }) {
  const { data, isLoading } = useActivityLogs({ entityType: 'employee', entityId: employeeId, limit: 30 })
  const logs = data ?? []

  if (isLoading) {
    return (
      <Card className="p-4 space-y-2">
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3">Recent activity</h3>
      {logs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
          <Activity className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-lg border bg-card">
              <Activity className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm">
                  <span className="font-medium">{log.actorName ?? 'System'}</span>
                  <span className="text-muted-foreground"> · {log.action}</span>
                </p>
                <p className="text-[11px] text-muted-foreground">{formatDate(log.createdAt)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// ─── Compliance Page ──────────────────────────────────────────────────────────
export function CompliancePage() {
  const { t } = useTranslation()
  const { data: report, isLoading } = useComplianceReport()
  const checks = report?.checks ?? []
  const overall = report?.overall ?? 0

  return (
    <PageWrapper>
      <PageHeader
        title={t('compliance.title')}
        description={t('compliance.description')}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-6 flex flex-col items-center justify-center text-center">
          <div className={cn('text-5xl font-bold mb-2 font-display', overall >= 95 ? 'text-emerald-600' : overall >= 80 ? 'text-amber-600' : 'text-red-600')}>
            {overall}
          </div>
          <p className="text-sm font-medium">Overall Compliance Score</p>
          <p className="text-sm text-muted-foreground mt-1">Out of 100 points</p>
          <Badge variant={overall >= 95 ? 'success' : overall >= 80 ? 'warning' : 'destructive'} className="mt-3">
            {overall >= 95 ? 'Excellent' : overall >= 80 ? 'Needs Attention' : 'Critical'}
          </Badge>
        </Card>
        <Card className="lg:col-span-2 p-4">
          <h3 className="font-semibold mb-4 text-sm">Compliance Breakdown</h3>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="space-y-1.5">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                  <Skeleton className="h-1.5 w-full rounded-full" />
                </div>
              ))}
            </div>
          ) : checks.length === 0 ? (
            <p className="text-xs text-muted-foreground py-6 text-center">No compliance data available yet.</p>
          ) : (
            <div className="space-y-3">
              {checks.map(c => (
                <div key={c.label} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{c.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{c.desc}</span>
                      <span className={cn('text-xs font-bold', c.score >= 98 ? 'text-emerald-600' : c.score >= 90 ? 'text-amber-600' : 'text-red-600')}>{c.score}%</span>
                    </div>
                  </div>
                  <Progress value={c.score} className="h-1.5" color={c.score >= 98 ? 'bg-emerald-500' : c.score >= 90 ? 'bg-amber-500' : 'bg-red-500'} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </PageWrapper>
  )
}

// ─── Reports Page ─────────────────────────────────────────────────────────────
export function ReportsPage() {
  const { t } = useTranslation()
  const { data: headcount, isLoading: hcLoading } = useHeadcountReport()
  const { data: payrollSummary, isLoading: prLoading } = usePayrollSummaryReport()
  const { data: visaExpiry, isLoading: veLoading } = useVisaExpiryReport(90)

  const headcountSearch = useSearchFilters({
    storageKey: 'hrhub.reports.headcount.searchHistory',
    availableFilters: HEADCOUNT_FILTERS,
  })
  const payrollSearch = useSearchFilters({
    storageKey: 'hrhub.reports.payroll.searchHistory',
    availableFilters: PAYROLL_REPORT_FILTERS,
  })
  const visaReportSearch = useSearchFilters({
    storageKey: 'hrhub.reports.visa.searchHistory',
    availableFilters: VISA_REPORT_FILTERS,
  })

  const headcountRows = useMemo(
    () => applyClientFilters((headcount?.employees ?? []) as any[], {
      searchInput: headcountSearch.searchInput,
      appliedFilters: headcountSearch.appliedFilters,
      searchFields: ['fullName', 'employeeNo', 'designation', 'department'],
    }),
    [headcount?.employees, headcountSearch.appliedFilters, headcountSearch.searchInput],
  )
  const payrollRows = useMemo(
    () => applyClientFilters((payrollSummary?.trend ?? []) as any[], {
      searchInput: payrollSearch.searchInput,
      appliedFilters: payrollSearch.appliedFilters,
      searchFields: ['period', 'status'],
    }),
    [payrollSummary?.trend, payrollSearch.appliedFilters, payrollSearch.searchInput],
  )
  const visaReportRows = useMemo(
    () => applyClientFilters((visaExpiry?.employees ?? []) as any[], {
      searchInput: visaReportSearch.searchInput,
      appliedFilters: visaReportSearch.appliedFilters,
      searchFields: ['fullName', 'employeeNo', 'department', 'visaType'],
    }),
    [visaExpiry?.employees, visaReportSearch.appliedFilters, visaReportSearch.searchInput],
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
              <h3 className="font-semibold text-sm">Employee List</h3>
              <Button size="sm" variant="outline" leftIcon={<Download className="h-3.5 w-3.5" />}
                onClick={() => exportCsv(headcount?.employees ?? [], 'headcount-full.csv')}>
                Export CSV
              </Button>
            </div>
            <DataTable
              isLoading={hcLoading}
              columns={[
                {
                  id: 'employee',
                  accessorKey: 'fullName',
                  header: 'Employee',
                  cell: ({ row: { original: e } }: any) => (
                    <div className="flex items-center gap-2.5 min-w-0">
                      <InitialsAvatar name={e.fullName || '—'} src={e.avatarUrl} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{e.fullName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {e.employeeNo}{e.employeeNo && e.designation ? ' · ' : ''}{e.designation}
                        </p>
                      </div>
                    </div>
                  ),
                },
                { accessorKey: 'department', header: 'Department', cell: ({ getValue }: any) => <span className="text-sm">{getValue() ?? '—'}</span> },
                { accessorKey: 'nationality', header: 'Nationality', cell: ({ getValue }: any) => <span className="text-sm">{getValue() ?? '—'}</span> },
                { accessorKey: 'status', header: 'Status', cell: ({ getValue }: any) => <EmployeeStatusBadge status={(getValue() as string) ?? ''} /> },
                { accessorKey: 'joinDate', header: 'Join Date', cell: ({ getValue }: any) => <span className="text-sm">{formatDate(getValue() as string)}</span> },
              ]}
              data={headcountRows}
              pageSize={10}
              advancedFilter={{
                search: headcountSearch,
                filters: HEADCOUNT_FILTERS,
                placeholder: 'Search employees…',
              }}
            />
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
                { accessorKey: 'period', header: 'Period', cell: ({ getValue }: any) => <span className="font-medium text-sm">{getValue()}</span> },
                { accessorKey: 'headcount', header: 'Employees', cell: ({ getValue }: any) => <span className="text-sm">{getValue()}</span> },
                { accessorKey: 'gross', header: 'Gross (AED)', cell: ({ getValue }: any) => <span className="text-sm font-semibold">{formatCurrency(getValue() as number)}</span> },
                { accessorKey: 'deductions', header: 'Deductions (AED)', cell: ({ getValue }: any) => <span className="text-sm text-destructive">{formatCurrency(getValue() as number)}</span> },
                { accessorKey: 'net', header: 'Net (AED)', cell: ({ getValue }: any) => <span className="text-sm font-bold text-success">{formatCurrency(getValue() as number)}</span> },
                { accessorKey: 'status', header: 'Status', cell: ({ getValue }: any) => <Badge variant="secondary" className="capitalize text-[11px]">{(getValue() as string).replace('_', ' ')}</Badge> },
              ]}
              data={payrollRows}
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
                  cell: ({ row: { original: e } }: any) => (
                    <div className="flex items-center gap-2.5 min-w-0">
                      <InitialsAvatar name={e.fullName || '—'} src={e.avatarUrl} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{e.fullName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {e.employeeNo}{e.employeeNo && e.designation ? ' · ' : ''}{e.designation}
                        </p>
                      </div>
                    </div>
                  ),
                },
                { accessorKey: 'department', header: 'Department', cell: ({ getValue }: any) => <span className="text-sm">{getValue() ?? '—'}</span> },
                { accessorKey: 'nationality', header: 'Nationality', cell: ({ getValue }: any) => <span className="text-sm">{getValue() ?? '—'}</span> },
                { accessorKey: 'visaExpiry', header: 'Visa Expiry', cell: ({ getValue }: any) => <span className="text-sm">{formatDate(getValue() as string)}</span> },
                {
                  accessorKey: 'daysLeft', header: 'Days Left',
                  cell: ({ getValue }: any) => {
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
                  cell: ({ getValue }: any) => {
                    const u = getValue() as string
                    const v = u === 'expired' ? 'destructive' : u === 'critical' ? 'destructive' : u === 'urgent' ? 'warning' : 'success'
                    return <Badge variant={v as any} className="capitalize text-[11px]">{u}</Badge>
                  }
                },
              ]}
              data={visaReportRows}
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
