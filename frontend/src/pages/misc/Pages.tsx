import React, { useState } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { Calendar, Clock, CheckCircle2, XCircle, Plus } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge, Card, Progress } from '@/components/ui/primitives'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { formatDate, cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { useLeaveRequests, useApproveLeave } from '@/hooks/useLeave'
import { useOnboardingChecklists } from '@/hooks/useOnboarding'
import type { LeaveRequest } from '@/types'

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
  const { data: leaveData } = useLeaveRequests({ limit: 50 })
  const leaves: LeaveRequest[] = (leaveData?.data as LeaveRequest[]) ?? []
  const approveLeave = useApproveLeave()
  const [approveTarget, setApproveTarget] = useState<LeaveRequest | null>(null)
  const [rejectTarget, setRejectTarget] = useState<LeaveRequest | null>(null)

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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCardCompact label="Pending" value={leaves.filter((l: any) => l.status === 'pending').length} icon={Clock} color="amber" />
        <KpiCardCompact label="Approved" value={leaves.filter((l: any) => l.status === 'approved').length} icon={CheckCircle2} color="green" />
        <KpiCardCompact label="Days Used" value={leaves.filter((l: any) => l.status === 'approved').reduce((a: number, l: any) => a + (l.days ?? 0), 0)} icon={Calendar} color="blue" />
        <KpiCardCompact label="Rejected" value={leaves.filter((l: any) => l.status === 'rejected').length} icon={XCircle} color="red" />
      </div>

      <Card className="p-5">
        <DataTable
          columns={columns}
          data={leaves}
          searchKey="employeeName"
          searchPlaceholder="Search by employee..."
          pageSize={8}
          toolbar={<Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>Apply Leave</Button>}
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
    </PageWrapper >
  )
}

// ─── Onboarding Page ──────────────────────────────────────────────────────────
export function OnboardingPage() {
  const { data: onboardingList } = useOnboardingChecklists()
  const checklists = (onboardingList as any[]) ?? []
  const checklist = checklists[0]
  if (!checklist) {
    return <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
      No active onboarding checklists
    </div>
  }
  return (
    <PageWrapper>
      <Card className="p-5">
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
            <div key={i} className={cn('flex items-center gap-4 p-3 rounded-xl border', step.status === 'completed' ? 'bg-emerald-50/50 border-emerald-200' : step.status === 'in_progress' ? 'bg-blue-50/50 border-blue-200' : step.status === 'overdue' ? 'bg-red-50/50 border-red-200' : 'bg-card border-border')}>
              <div className={cn('h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0',
                step.status === 'completed' ? 'bg-emerald-500 text-white' :
                  step.status === 'in_progress' ? 'bg-blue-600 text-white' :
                    step.status === 'overdue' ? 'bg-red-500 text-white' : 'bg-muted text-muted-foreground'
              )}>
                {step.status === 'completed' ? '✓' : i + 1}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.owner} · Due: {formatDate(step.dueDate)}</p>
              </div>
              <Badge variant={step.status === 'completed' ? 'success' : step.status === 'in_progress' ? 'info' : step.status === 'overdue' ? 'destructive' : 'secondary'} className="text-[10px] capitalize">
                {step.status.replace('_', ' ')}
              </Badge>
            </div>))}
        </div>
      </Card>
    </PageWrapper>
  )
}

// ─── Compliance Page ──────────────────────────────────────────────────────────
export function CompliancePage() {
  const checks = [
    { label: 'WPS Compliance', score: 100, status: 'pass', desc: 'All employees paid via WPS on time' },
    { label: 'Emiratisation Ratio', score: 90, status: 'warning', desc: '1.8% vs 2.0% MOHRE target' },
    { label: 'Visa Validity', score: 96, status: 'warning', desc: '2 employees with expiring visas' },
    { label: 'Labour Contracts', score: 100, status: 'pass', desc: 'All contracts registered with MOHRE' },
    { label: 'Health Insurance', score: 98, status: 'pass', desc: '1 pending renewal' },
    { label: 'Document Completeness', score: 88, status: 'warning', desc: '3 missing documents flagged' },
  ]
  const overall = Math.round(checks.reduce((a, c) => a + c.score, 0) / checks.length)

  return (
    <PageWrapper>
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
        </Card>
      </div>
    </PageWrapper>
  )
}

// ─── Reports Page ─────────────────────────────────────────────────────────────
export function ReportsPage() {
  return (
    <PageWrapper>
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-4">
          <Calendar className="h-8 w-8 text-blue-500" />
        </div>
        <h2 className="text-lg font-semibold mb-2">Reports Coming Soon</h2>
        <p className="text-sm text-muted-foreground">Advanced analytics and reporting will be available in Phase 4.</p>
      </div>
    </PageWrapper>
  )
}
