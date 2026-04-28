import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Calendar, Clock, CheckCircle2, XCircle, Plus, AlertCircle, RefreshCcw } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge, Card, Progress } from '@/components/ui/primitives'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { formatDate, cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useLeaveRequests, useApproveLeave, useLeaveBalance } from '@/hooks/useLeave'
import { useEmployees } from '@/hooks/useEmployees'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { applyClientFilters, type FilterConfig } from '@/lib/filters'
import { ApplyLeaveDialog } from '@/components/shared/action-dialogs'
import { InitialsAvatar } from '@/components/shared/Avatar'
import { usePermissions } from '@/hooks/usePermissions'
import type { Employee, LeaveRequest } from '@/types'

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

const LEAVE_LABELS: Record<string, string> = {
    annual: 'Annual', sick: 'Sick', maternity: 'Maternity', paternity: 'Paternity',
    compassionate: 'Compassionate', hajj: 'Hajj', unpaid: 'Unpaid',
}

function LeaveBalancePanel() {
    const [selectedEmployee, setSelectedEmployee] = useState<string | undefined>()
    const { data: empData } = useEmployees({ limit: 100, status: 'active' })
    const employees = (empData?.data as Employee[]) ?? []
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
                        {employees.map((e: Employee) => (
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

const leaveStatusVariant: Record<string, string> = {
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
    const { can } = usePermissions()
    const canApprove = can('approve_leave')
    const [searchParams] = useSearchParams()
    const urlEmployeeId = searchParams.get('employeeId') ?? undefined
    const { data: leaveData, isLoading: leaveLoading, isError: leaveError, refetch } = useLeaveRequests({ limit: 50, employeeId: urlEmployeeId })
    const leaves = useMemo<LeaveRequest[]>(() => (leaveData?.data as LeaveRequest[]) ?? [], [leaveData?.data])
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
        () => applyClientFilters(leaves as unknown as Record<string, unknown>[], {
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
                    <InitialsAvatar name={l.employeeName || '—'} src={l.employeeAvatarUrl ?? undefined} size="sm" />
                    <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{l.employeeName || '—'}</p>
                        {l.employeeDepartment && (
                            <p className="text-[11px] text-muted-foreground truncate">{l.employeeDepartment}</p>
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
                return <Badge variant={leaveStatusVariant[s] as 'warning' | 'success' | 'destructive' | 'secondary'} className="capitalize text-[11px]">{s}</Badge>
            },
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => {
                const l = row.original
                return (
                    <div className="flex gap-1 justify-end">
                        {l.status === 'pending' && canApprove && (
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
    ], [canApprove])

    return (
        <PageWrapper>
            <PageHeader
                title={t('leave.title')}
                description={t('leave.description')}
                actions={
                    <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setApplyOpen(true)}>Apply Leave</Button>
                }
            />

            {leaveError && (
                <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span className="flex-1">Failed to load leave requests. Your session may have expired.</span>
                    <Button size="sm" variant="outline" onClick={() => refetch()} leftIcon={<RefreshCcw className="h-3.5 w-3.5" />}>Retry</Button>
                </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCardCompact label="Pending" value={leaves.filter((l) => l.status === 'pending').length} icon={Clock} color="amber" />
                <KpiCardCompact label="Approved" value={leaves.filter((l) => l.status === 'approved').length} icon={CheckCircle2} color="green" />
                <KpiCardCompact label="Days Used" value={leaves.filter((l) => l.status === 'approved').reduce((a: number, l: LeaveRequest) => a + (l.days ?? 0), 0)} icon={Calendar} color="blue" />
                <KpiCardCompact label="Rejected" value={leaves.filter((l) => l.status === 'rejected').length} icon={XCircle} color="red" />
            </div>

            {/* Leave type breakdown for this year */}
            {!leaveLoading && leaves.length > 0 && (() => {
                const thisYear = new Date().getFullYear().toString()
                const yearLeaves = leaves.filter((l) => l.startDate?.startsWith(thisYear))
                const types = ['annual', 'sick', 'maternity', 'paternity', 'compassionate', 'hajj', 'unpaid']
                const usedByType: Record<string, number> = {}
                for (const l of yearLeaves) {
                    if (l.status === 'approved') {
                        const t = l.leaveType as string
                        usedByType[t] = (usedByType[t] ?? 0) + (l.days ?? 0)
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
                    data={filteredLeaves as unknown as LeaveRequest[]}
                    isLoading={leaveLoading}
                    advancedFilter={{
                        search: leaveSearch,
                        filters: LEAVE_FILTERS,
                        placeholder: 'Search by employee, type…',
                    }}
                    pageSize={8}
                    enableSelection
                    getRowId={(row: LeaveRequest) => String(row.id)}
                    bulkActions={(selected) => (
                        <>
                            <Button variant="outline" size="sm" leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                                onClick={() => setBulkAction({ ids: selected.map((l: LeaveRequest) => l.id), approve: true })}>
                                Approve
                            </Button>
                            <Button variant="destructive" size="sm" leftIcon={<XCircle className="h-3.5 w-3.5" />}
                                onClick={() => setBulkAction({ ids: selected.map((l: LeaveRequest) => l.id), approve: false })}>
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
