import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import { Calendar, Clock, CheckCircle2, XCircle, Plus, Download, BarChart3, Users, Shield } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge, Card, Progress } from '@/components/ui/primitives'
import { ConfirmDialog, toast, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, DialogClose } from '@/components/ui/overlays'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useLeaveRequests, useApproveLeave, useLeaveBalance } from '@/hooks/useLeave'
import { useEmployees } from '@/hooks/useEmployees'
import { useOnboardingChecklists, useUpdateOnboardingStep } from '@/hooks/useOnboarding'
import { useComplianceReport } from '@/hooks/useCompliance'
import { useHeadcountReport, usePayrollSummaryReport, useVisaExpiryReport } from '@/hooks/useReports'
import { ApplyLeaveDialog } from '@/components/shared/action-dialogs'
import type { LeaveRequest } from '@/types'

// ─── Leave Balance Panel ──────────────────────────────────────────────────────
const LEAVE_LABELS: Record<string, string> = {
  annual: 'Annual', sick: 'Sick', maternity: 'Maternity', paternity: 'Paternity',
  compassionate: 'Compassionate', hajj: 'Hajj', unpaid: 'Unpaid',
}

function LeaveBalancePanel() {
  const [selectedEmployee, setSelectedEmployee] = useState<string | undefined>()
  const { data: empData } = useEmployees({ limit: 100, status: 'active' })
  const employees = (empData?.data as any[]) ?? []
  const { data: balanceData, isLoading: balanceLoading } = useLeaveBalance(selectedEmployee)
  const balance = balanceData?.balance

  return (
    <Card className="p-5">
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
  paternity: 'bg-purple-100 text-purple-700',
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

  const columns: ColumnDef<LeaveRequest>[] = [
    {
      accessorKey: 'employeeName',
      header: 'Employee',
      cell: ({ getValue }) => <span className="font-medium text-sm">{getValue() as string}</span>,
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
      cell: ({ row }) => row.original.status === 'pending' ? (
        <div className="flex gap-1">
          <Button size="icon-sm" variant="ghost" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => setApproveTarget(row.original)}>
            <CheckCircle2 className="h-4 w-4" />
          </Button>
          <Button size="icon-sm" variant="ghost" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => setRejectTarget(row.original)}>
            <XCircle className="h-4 w-4" />
          </Button>
        </div>
      ) : null,
      size: 80,
    },
  ]

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
          <Card className="p-5">
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

      <Card className="p-5">
        <DataTable
          columns={columns}
          data={leaves}
          isLoading={leaveLoading}
          searchPlaceholder="Search by employee..."
          pageSize={8}
          toolbar={undefined}
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
export function OnboardingPage() {
  const { t } = useTranslation()
  const { data: onboardingList, isLoading: onboardingLoading } = useOnboardingChecklists()
  const checklists = (onboardingList as any[]) ?? []
  const [completingStep, setCompletingStep] = useState<{ checklistId: string; step: any } | null>(null)
  const [stepStatus, setStepStatus] = useState('in_progress')
  const [stepNotes, setStepNotes] = useState('')
  const [stepDate, setStepDate] = useState('')
  const updateStep = useUpdateOnboardingStep()

  const handleStepClick = (checklistId: string, step: any) => {
    setCompletingStep({ checklistId, step })
    setStepStatus(step.status === 'completed' ? 'completed' : 'in_progress')
    setStepNotes(step.notes ?? '')
    setStepDate(step.completedDate ?? '')
  }

  const handleStepSave = () => {
    if (!completingStep) return
    updateStep.mutate(
      {
        checklistId: completingStep.checklistId,
        stepId: completingStep.step.id,
        data: { status: stepStatus, notes: stepNotes || undefined, completedDate: stepDate || undefined },
      },
      {
        onSuccess: () => {
          toast.success('Step updated', `"${completingStep.step.title}" marked as ${stepStatus.replace('_', ' ')}.`)
          setCompletingStep(null)
        },
        onError: () => toast.error('Update failed', 'Could not update the step.'),
      }
    )
  }

  return (
    <PageWrapper>
      <PageHeader title={t('onboarding.title')} description={t('onboarding.description')} />

      {onboardingLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <Card key={i} className="p-5 space-y-4">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-2 w-full rounded-full" />
              {[1, 2, 3, 4].map(j => <Skeleton key={j} className="h-14 w-full rounded-xl" />)}
            </Card>
          ))}
        </div>
      ) : checklists.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
          No active onboarding checklists
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {checklists.map((checklist: any) => (
            <Card key={checklist.id} className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-bold text-base">{checklist.employeeName}</h2>
                  <p className="text-sm text-muted-foreground">Starting {formatDate(checklist.startDate)}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-blue-600 font-display">{checklist.progress}%</p>
                  <p className="text-xs text-muted-foreground">Complete</p>
                </div>
              </div>
              <Progress value={checklist.progress} className="mb-5" />
              <div className="space-y-3">
                {(checklist.steps ?? []).map((step: any, i: number) => (
                  <button
                    key={i}
                    type="button"
                    className={cn(
                      'w-full flex items-center gap-4 p-3 rounded-xl border text-left cursor-pointer transition-colors hover:brightness-95',
                      step.status === 'completed' ? 'bg-emerald-50/50 border-emerald-200' :
                        step.status === 'in_progress' ? 'bg-blue-50/50 border-blue-200' :
                          step.status === 'overdue' ? 'bg-red-50/50 border-red-200' : 'bg-card border-border'
                    )}
                    onClick={() => handleStepClick(checklist.id, step)}
                  >
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                      step.status === 'completed' ? 'bg-emerald-500 text-white' :
                        step.status === 'in_progress' ? 'bg-blue-600 text-white' :
                          step.status === 'overdue' ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'
                    )}>
                      {step.status === 'completed' ? '✓' : i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{step.title}</p>
                      <p className="text-xs text-muted-foreground">{step.owner} · Due: {formatDate(step.dueDate)}</p>
                    </div>
                    <Badge
                      variant={step.status === 'completed' ? 'success' : step.status === 'in_progress' ? 'info' : step.status === 'overdue' ? 'destructive' : 'secondary'}
                      className="text-[10px] capitalize shrink-0"
                    >
                      {step.status.replace('_', ' ')}
                    </Badge>
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Step Update Dialog */}
      <Dialog open={!!completingStep} onOpenChange={open => { if (!open) setCompletingStep(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Update Step</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <p className="text-sm font-medium">{completingStep?.step?.title}</p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Status</label>
              <Select value={stepStatus} onValueChange={setStepStatus}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {stepStatus === 'completed' && (
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">Completion Date</label>
                <Input type="date" value={stepDate} onChange={e => setStepDate(e.target.value)} className="h-9" />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
              <Textarea value={stepNotes} onChange={e => setStepNotes(e.target.value)} rows={3} placeholder="Add any relevant notes…" />
            </div>
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" loading={updateStep.isPending} onClick={handleStepSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
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
        <Card className="lg:col-span-2 p-5">
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
        <TabsList className="mb-4">
          <TabsTrigger value="headcount" className="gap-2">
            <Users className="h-4 w-4" /> Headcount
          </TabsTrigger>
          <TabsTrigger value="payroll" className="gap-2">
            <BarChart3 className="h-4 w-4" /> Payroll Summary
          </TabsTrigger>
          <TabsTrigger value="visa" className="gap-2">
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
            <Card className="p-5">
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

            <Card className="p-5">
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

          <Card className="p-5">
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
                { accessorKey: 'fullName', header: 'Name', cell: ({ getValue }: any) => <span className="font-medium text-sm">{getValue()}</span> },
                { accessorKey: 'department', header: 'Department', cell: ({ getValue }: any) => <span className="text-sm">{getValue() ?? '—'}</span> },
                { accessorKey: 'nationality', header: 'Nationality', cell: ({ getValue }: any) => <span className="text-sm">{getValue() ?? '—'}</span> },
                { accessorKey: 'status', header: 'Status', cell: ({ getValue }: any) => <Badge variant="secondary" className="capitalize text-[11px]">{(getValue() as string).replace('_', ' ')}</Badge> },
                { accessorKey: 'joinDate', header: 'Join Date', cell: ({ getValue }: any) => <span className="text-sm">{formatDate(getValue() as string)}</span> },
              ]}
              data={headcount?.employees ?? []}
              pageSize={10}
              searchKey="fullName"
              searchPlaceholder="Search employees..."
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

          <Card className="p-5">
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
              data={payrollSummary?.trend ?? []}
              pageSize={12}
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

          <Card className="p-5">
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
                { accessorKey: 'fullName', header: 'Employee', cell: ({ getValue }: any) => <span className="font-medium text-sm">{getValue()}</span> },
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
              data={visaExpiry?.employees ?? []}
              pageSize={10}
              searchKey="fullName"
              searchPlaceholder="Search employees..."
            />
          </Card>
        </TabsContent>
      </Tabs>
    </PageWrapper>
  )
}
