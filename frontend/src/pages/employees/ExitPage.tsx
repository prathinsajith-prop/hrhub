import { useMemo, useState } from 'react'

const PAGE_SIZE = 10
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import {
    LogOut, DollarSign, CheckCircle2, Clock, UserMinus, Eye,
    RefreshCcw, AlertTriangle,
} from 'lucide-react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DataTable } from '@/components/ui/data-table'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { InitialsAvatar } from '@/components/shared/Avatar'
import {
    useExitRequests, useApproveExit, useRejectExit, useMarkSettlementPaid,
    useExitApprovalReadiness, type ExitRequest,
} from '@/hooks/useExit'
import { ConfirmDialog } from '@/components/ui/overlays'
import { EmployeeLink } from '@/components/shared/EmployeeLink'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { type FilterConfig } from '@/lib/filters'
import { usePermissions } from '@/hooks/usePermissions'
import { formatDate, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/overlays'
import { ApiError } from '@/lib/api'
import { EXIT_TYPE_LABELS } from '@/lib/enums'
import { ExitProgressBadge } from './ExitStagesTimeline'
import { InitiateExitWizard } from './InitiateExitWizard'
import { ExitDetailWizard } from './ExitDetailWizard'

const EXIT_TYPE_FILTER_OPTIONS = [
    { value: 'resignation', label: 'Resignation' },
    { value: 'termination', label: 'Termination' },
    { value: 'contract_end', label: 'Contract End' },
    { value: 'retirement', label: 'Retirement' },
] as const

const EXIT_FILTERS: FilterConfig[] = [
    { name: 'exitType', label: 'Exit type', type: 'multi_select', field: 'exitType', options: [...EXIT_TYPE_FILTER_OPTIONS] },
    {
        name: 'status', label: 'Status', type: 'multi_select', field: 'status',
        options: [
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'completed', label: 'Completed' },
        ],
    },
    { name: 'exitDate', label: 'Exit date', type: 'date_range', field: 'exitDate' },
]

const statusVariant: Record<string, 'warning' | 'info' | 'destructive' | 'success' | 'secondary'> = {
    pending: 'warning',
    approved: 'info',
    rejected: 'destructive',
    completed: 'success',
}

const exitTypeColor: Record<string, string> = {
    resignation: 'bg-amber-100 text-amber-700',
    termination: 'bg-red-100 text-red-700',
    contract_end: 'bg-blue-100 text-blue-700',
    retirement: 'bg-emerald-100 text-emerald-700',
}

function fmt(n: string | number | undefined | null) {
    if (n === undefined || n === null) return '—'
    const num = Number(n)
    if (isNaN(num)) return '—'
    return formatCurrency(num)
}

export function ExitPage() {
    const { t } = useTranslation()
    const { can } = usePermissions()
    const canManage = can('manage_exit')

    const approve = useApproveExit()
    const reject = useRejectExit()
    const markPaid = useMarkSettlementPaid()

    const [showDialog, setShowDialog] = useState(false)
    const [viewingExit, setViewingExit] = useState<ExitRequest | null>(null)
    const [rejectTarget, setRejectTarget] = useState<ExitRequest | null>(null)
    const [rejectReason, setRejectReason] = useState('')
    const [overrideConfirm, setOverrideConfirm] = useState(false)

    // Live readiness check for the open exit detail dialog. canApprove === false
    // when clearance items are still pending — the Approve button is then
    // disabled and a "Force approve" path appears for HR.
    const readinessQ = useExitApprovalReadiness(viewingExit?.status === 'pending' ? viewingExit.id : null)
    const readiness = readinessQ.data


    const exitSearch = useSearchFilters({
        storageKey: 'hrhub.exit.searchHistory',
        availableFilters: EXIT_FILTERS,
    })

    // status is multi_select → goes through the filter string so IN() works correctly.
    const [offset, setOffset] = useState(0)
    const filterKey = (exitSearch.searchInput ?? '') + '||' + JSON.stringify(exitSearch.appliedFilters)
    const [prevExitFilterKey, setPrevExitFilterKey] = useState(filterKey)
    if (filterKey !== prevExitFilterKey) {
        setPrevExitFilterKey(filterKey)
        setOffset(0)
    }

    const { data: exitsData, isLoading, isFetching, refetch } = useExitRequests({
        q: exitSearch.searchInput || undefined,
        filters: exitSearch.appliedFilters,
        limit: PAGE_SIZE,
        offset,
    })
    const exitTotal = exitsData?.total ?? 0

    const exitList: ExitRequest[] = useMemo(
        () => exitsData?.data ?? [],
        [exitsData],
    )

    // Server-side filtering now handles q, status, exitType, exitDate via useExitRequests.
    const filteredExits = exitList

    const pending = exitList.filter((e) => e.status === 'pending').length
    const approved = exitList.filter((e) => e.status === 'approved').length
    const completed = exitList.filter((e) => e.status === 'completed').length

    const columns: ColumnDef<ExitRequest>[] = useMemo(() => [
        {
            id: 'employee',
            header: 'Employee',
            cell: ({ row: { original: e } }) => (
                <div className="flex items-center gap-2.5 min-w-0">
                    <InitialsAvatar name={e.employeeName ?? '—'} src={e.employeeAvatarUrl ?? undefined} size="sm" />
                    <div className="min-w-0">
                        {e.employeeId
                            ? <EmployeeLink id={e.employeeId} name={e.employeeName ?? '—'} className="text-sm font-medium truncate block" />
                            : <p className="text-sm font-medium truncate">{e.employeeName ?? '—'}</p>
                        }
                        {e.employeeDesignation && (
                            <p className="text-[11px] text-muted-foreground truncate">{e.employeeDesignation}</p>
                        )}
                    </div>
                </div>
            ),
            size: 200,
        },
        {
            accessorKey: 'exitType',
            header: 'Exit Type',
            cell: ({ getValue }) => {
                const v = getValue() as string
                return (
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${exitTypeColor[v] ?? 'bg-gray-100 text-gray-700'}`}>
                        {EXIT_TYPE_LABELS[v] ?? v}
                    </span>
                )
            },
            size: 130,
        },
        {
            id: 'dates',
            header: 'Exit Date / LWD',
            cell: ({ row: { original: e } }) => (
                <div>
                    <p className="text-xs font-medium">{formatDate(e.exitDate)}</p>
                    {e.lastWorkingDay && (
                        <p className="text-[10px] text-muted-foreground">LWD: {formatDate(e.lastWorkingDay)}</p>
                    )}
                </div>
            ),
            size: 130,
        },
        {
            id: 'settlement',
            header: 'Settlement (AED)',
            cell: ({ row: { original: e } }) => (
                <div>
                    <p className="text-sm font-semibold text-primary">{fmt(e.totalSettlement)}</p>
                    {e.settlementPaid && (
                        <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5">
                            <CheckCircle2 className="size-3" /> Paid
                        </p>
                    )}
                </div>
            ),
            size: 150,
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ getValue }) => {
                const s = getValue() as string
                return (
                    <Badge variant={statusVariant[s] ?? 'secondary'} className="capitalize text-[11px]">
                        {s}
                    </Badge>
                )
            },
            size: 110,
        },
        {
            id: 'progress',
            header: 'Offboarding',
            cell: ({ row: { original: e } }) => <ExitProgressBadge exit={e} />,
            size: 170,
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row: { original: e } }) => (
                <div className="flex gap-1.5 justify-end">
                    <Button
                        size="sm"
                        variant="ghost"
                        className="size-7 p-0"
                        onClick={(ev) => { ev.stopPropagation(); setViewingExit(e) }}
                        title="View details"
                    >
                        <Eye className="size-3.5" />
                    </Button>
                    {canManage && e.status === 'pending' && (
                        <>
                            <Button
                                size="sm"
                                className="h-7 text-xs"
                                onClick={(ev) => {
                                    ev.stopPropagation()
                                    approve.mutate({ id: e.id }, {
                                        onSuccess: () => toast.success('Approved', 'Exit request approved and employee marked as terminated.'),
                                        // Show the backend message so HR sees "3 clearance items
                                        // still pending …" instead of a generic failure toast.
                                        // They can then click the row to open the detail view
                                        // and either complete clearances or use Force Approve.
                                        onError: (err) => {
                                            const apiErr = err as ApiError
                                            const msg = apiErr?.message ?? 'Could not approve exit.'
                                            if (apiErr?.statusCode === 409) {
                                                toast.error('Approval blocked', msg)
                                            } else {
                                                toast.error('Failed', msg)
                                            }
                                        },
                                    })
                                }}
                                disabled={approve.isPending}
                            >
                                Approve
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                                onClick={(ev) => {
                                    ev.stopPropagation()
                                    setRejectTarget(e)
                                    setRejectReason('')
                                }}
                            >
                                Reject
                            </Button>
                        </>
                    )}
                    {canManage && e.status === 'approved' && !e.settlementPaid && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={(ev) => {
                                ev.stopPropagation()
                                markPaid.mutate(e.id, {
                                    onSuccess: () => toast.success('Settlement paid', 'Settlement marked as paid.'),
                                    onError: () => toast.error('Failed', 'Could not update settlement.'),
                                })
                            }}
                            disabled={markPaid.isPending}
                        >
                            <DollarSign className="size-3 mr-1" /> Mark Paid
                        </Button>
                    )}
                </div>
            ),
            size: 180,
        },
    ], [canManage, approve, markPaid])

    return (
        <PageWrapper>
            <PageHeader
                title={t('exit.title')}
                description={t('exit.description')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'size-3.5 animate-spin' : 'size-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
                            Refresh
                        </Button>
                        {canManage && (
                            <Button size="sm" leftIcon={<UserMinus className="size-3.5" />} onClick={() => setShowDialog(true)}>
                                Initiate Exit
                            </Button>
                        )}
                    </div>
                }
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCardCompact label="Total Exits" value={exitList.length} icon={LogOut} color="blue" loading={isLoading} />
                <KpiCardCompact label="Pending" value={pending} icon={Clock} color="amber" loading={isLoading} />
                <KpiCardCompact label="Approved" value={approved} icon={CheckCircle2} color="green" loading={isLoading} />
                <KpiCardCompact label="Completed" value={completed} icon={CheckCircle2} color="cyan" loading={isLoading} />
            </div>

            <Card>
                <CardHeader className="flex-row items-start sm:items-center justify-between gap-3 flex-wrap">
                    <div>
                        <CardTitle className="text-base">All Exit Requests</CardTitle>
                        <CardDescription className="mt-0.5">{exitList.length} total records</CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={filteredExits as unknown as ExitRequest[]}
                        isLoading={isLoading}
                        advancedFilter={{
                            search: exitSearch,
                            filters: EXIT_FILTERS,
                            placeholder: 'Search by employee, exit type, reason…',
                        }}
                        pageSize={PAGE_SIZE}
                        emptyMessage={exitList.length === 0 ? 'No exit requests yet.' : 'No results match your filters.'}
                        onRowClick={(row) => setViewingExit(row as ExitRequest)}
                        serverPagination={{ total: exitTotal, offset, limit: PAGE_SIZE, onPageChange: setOffset, loading: isFetching }}
                    />
                </CardContent>
            </Card>

            {/* Detail view — multi-step wizard. HR walks through the 5
                offboarding stages with Prev/Next, with each stage's actions
                inline. The Reject and Force-Approve dialogs are still owned
                by this page (state below). */}
            {viewingExit && (
                <ExitDetailWizard
                    exit={viewingExit}
                    open={!!viewingExit}
                    onClose={() => setViewingExit(null)}
                    onRequestReject={() => {
                        setRejectTarget(viewingExit)
                        setRejectReason('')
                        setViewingExit(null)
                    }}
                    onRequestForceApprove={() => setOverrideConfirm(true)}
                />
            )}

            {/* Force-approve confirm (when clearance items are pending) */}
            <ConfirmDialog
                open={overrideConfirm}
                onOpenChange={setOverrideConfirm}
                title="Force approve with pending clearances?"
                description={
                    readiness
                        ? `${readiness.pendingClearances.length} clearance item${readiness.pendingClearances.length === 1 ? '' : 's'} ${readiness.pendingClearances.length === 1 ? 'is' : 'are'} still pending. The override will be recorded in the audit log. Continue?`
                        : 'Some offboarding steps are still pending. Continue anyway?'
                }
                variant="warning"
                confirmLabel="Force Approve"
                onConfirm={async () => {
                    if (!viewingExit) return
                    try {
                        await approve.mutateAsync({ id: viewingExit.id, override: true })
                        toast.success('Approved', 'Exit request approved (override).')
                        setViewingExit(null)
                        setOverrideConfirm(false)
                    } catch (e) {
                        toast.error('Failed', e instanceof Error ? e.message : 'Could not approve exit.')
                    }
                }}
            />

            {/* Reject dialog */}
            <Dialog open={!!rejectTarget} onOpenChange={o => { if (!o) setRejectTarget(null) }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="size-4" /> Reject Exit Request
                        </DialogTitle>
                        <DialogDescription>
                            Rejecting this request will keep the employee active. Add a reason for the record.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-1.5 py-2">
                        <Label>Reason for rejection <span className="text-muted-foreground text-xs">(optional)</span></Label>
                        <Textarea
                            rows={3}
                            value={rejectReason}
                            onChange={e => setRejectReason(e.target.value)}
                            placeholder="Explain why this exit request is being rejected…"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
                        <Button
                            variant="destructive"
                            disabled={reject.isPending}
                            onClick={() => {
                                if (!rejectTarget) return
                                reject.mutate(
                                    { id: rejectTarget.id, reason: rejectReason || undefined },
                                    {
                                        onSuccess: () => {
                                            toast.error('Exit rejected', 'The exit request has been rejected.')
                                            setRejectTarget(null)
                                        },
                                        onError: () => toast.error('Failed', 'Could not reject exit request.'),
                                    },
                                )
                            }}
                        >
                            {reject.isPending ? 'Rejecting…' : 'Confirm Rejection'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Initiate Exit — multi-step wizard. Owns its own form state, so
                Prev/Next never drops user input. Settlement is the final
                step; submission happens there. */}
            <InitiateExitWizard
                open={showDialog}
                onOpenChange={setShowDialog}
            />
        </PageWrapper>
    )
}

