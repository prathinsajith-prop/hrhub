import { useMemo, useState } from 'react'

const PAGE_SIZE = 10
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import {
    LogOut, DollarSign, CheckCircle2, Clock, UserMinus, Eye, CalendarDays,
    FileText, RefreshCcw, XCircle, AlertTriangle, ListChecks,
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
import { ExitClearancePanel } from './ExitClearancePanel'
import { ExitStagesTimeline, ExitProgressBadge } from './ExitStagesTimeline'
import { InitiateExitWizard } from './InitiateExitWizard'

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

function DetailRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
    return (
        <div className={`flex justify-between items-start py-2.5 border-b last:border-0 ${highlight ? 'bg-muted/30 px-4 -mx-4' : ''}`}>
            <span className={`text-sm ${highlight ? 'font-semibold' : 'text-muted-foreground'}`}>{label}</span>
            <span className={`text-sm font-medium text-right max-w-[60%] ${highlight ? 'text-primary font-bold text-base' : ''}`}>{value ?? '—'}</span>
        </div>
    )
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

            {/* Detail view dialog — wide two-column layout with the
                offboarding-flow stages visualised at the top. Left column
                holds the chronological flow (exit info → clearance →
                interview), right column holds finance + documents. */}
            <Dialog open={!!viewingExit} onOpenChange={(o) => { if (!o) setViewingExit(null) }}>
                <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <FileText className="size-4" /> Exit Request Details
                        </DialogTitle>
                        <DialogDescription>Full offboarding flow, settlement breakdown, and actions.</DialogDescription>
                    </DialogHeader>
                    {viewingExit && (
                        <div className="space-y-5 py-1">
                            {/* Employee header */}
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border">
                                <InitialsAvatar name={viewingExit.employeeName ?? '—'} src={viewingExit.employeeAvatarUrl ?? undefined} size="md" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold truncate">{viewingExit.employeeName}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {[viewingExit.employeeNo, viewingExit.employeeDesignation, viewingExit.employeeDepartment].filter(Boolean).join(' · ')}
                                    </p>
                                </div>
                                <Badge variant={statusVariant[viewingExit.status] ?? 'secondary'} className="capitalize shrink-0">
                                    {viewingExit.status}
                                </Badge>
                            </div>

                            {/* Stages timeline — prominent header for the
                                offboarding flow. Glanceable answer to "where
                                is this exit in the process?" */}
                            <div className="rounded-lg border bg-card p-4">
                                <div className="flex items-center justify-between gap-2 mb-3">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Offboarding Flow
                                    </p>
                                    <span className="text-[11px] text-muted-foreground">
                                        Clearance {viewingExit.clearanceCompleted ?? 0} / {viewingExit.clearanceTotal ?? 0}
                                        {viewingExit.interviewSubmitted ? ' · Interview submitted' : ''}
                                    </span>
                                </div>
                                <ExitStagesTimeline
                                    exit={viewingExit}
                                    onStageClick={(stage) => {
                                        // Scroll to the section corresponding
                                        // to the clicked stage. Submitted /
                                        // Closed share the top of the dialog.
                                        const targetId =
                                            stage === 'submitted' ? 'exit-section-info' :
                                            stage === 'clearance' ? 'exit-section-clearance' :
                                            stage === 'interview' ? 'exit-section-interview' :
                                            stage === 'approval' ? 'exit-section-approval' :
                                            stage === 'settlement' ? 'exit-section-settlement' :
                                            'exit-section-info'
                                        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                                    }}
                                />
                            </div>

                            {/* Sequential sections — each stage is a card with
                                its data + inline actions, so HR can work
                                through the offboarding flow top-to-bottom
                                instead of hunting for buttons in the footer. */}
                            <div className="space-y-4">
                                {/* Stage 1: Submitted — Exit Information */}
                                <div id="exit-section-info" className="rounded-lg border divide-y text-sm overflow-hidden scroll-mt-4">
                                    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30">
                                        <CalendarDays className="size-3.5 text-muted-foreground" />
                                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">1 · Exit Information</span>
                                    </div>
                                    <div className="px-4">
                                        <DetailRow label="Exit Type" value={
                                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${exitTypeColor[viewingExit.exitType] ?? 'bg-gray-100 text-gray-700'}`}>
                                                {EXIT_TYPE_LABELS[viewingExit.exitType] ?? viewingExit.exitType}
                                            </span>
                                        } />
                                        <DetailRow label="Exit Date" value={formatDate(viewingExit.exitDate)} />
                                        <DetailRow label="Last Working Day" value={formatDate(viewingExit.lastWorkingDay)} />
                                        <DetailRow label="Notice Period" value={`${viewingExit.noticePeriodDays} days`} />
                                        {viewingExit.reason && <DetailRow label="Reason" value={viewingExit.reason} />}
                                        {viewingExit.notes && <DetailRow label="Notes" value={viewingExit.notes} />}
                                    </div>
                                </div>

                                {/* Stage 2: Clearance */}
                                <div className="scroll-mt-4">
                                    <ExitClearancePanel exitId={viewingExit.id} sectionId="exit-section-clearance" />
                                </div>

                                {/* Stage 3: Exit Interview */}
                                <div id="exit-section-interview" className="rounded-lg border bg-card scroll-mt-4">
                                    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
                                        <ListChecks className="size-3.5 text-muted-foreground" />
                                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">3 · Exit Interview</span>
                                        {viewingExit.interviewSubmitted ? (
                                            <Badge variant="success" className="ms-auto text-[10px]">
                                                <CheckCircle2 className="size-2.5 me-0.5" /> Submitted
                                            </Badge>
                                        ) : (
                                            <Badge variant="secondary" className="ms-auto text-[10px]">
                                                <Clock className="size-2.5 me-0.5" /> Awaiting response
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="px-4 py-3 text-xs text-muted-foreground">
                                        {viewingExit.interviewSubmitted
                                            ? 'The employee has completed the exit interview. Responses are recorded for HR review.'
                                            : 'The employee has not yet completed the configured exit interview. Reminders fire automatically per the workflow rules — you do not need to chase manually.'}
                                    </div>
                                </div>

                                {/* Stage 4: Approval — inline approve/reject */}
                                {canManage && viewingExit.status === 'pending' && (
                                    <div id="exit-section-approval" className="rounded-lg border bg-card scroll-mt-4">
                                        <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b">
                                            <CheckCircle2 className="size-3.5 text-muted-foreground" />
                                            <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">4 · Approval</span>
                                        </div>
                                        <div className="px-4 py-3 space-y-2">
                                            {readiness && !readiness.canApprove ? (
                                                <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs">
                                                    <div className="flex items-start gap-2">
                                                        <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-amber-900 dark:text-amber-100">
                                                                {readiness.pendingClearances.length} clearance item{readiness.pendingClearances.length === 1 ? '' : 's'} still pending
                                                            </p>
                                                            <p className="text-amber-800 dark:text-amber-200/80 mt-0.5">
                                                                Complete the clearance section above, or force-approve as HR.
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-muted-foreground">
                                                    All clearance items are complete. Approving will move the employee to terminated status and trigger the configured workflows.
                                                </p>
                                            )}
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {readiness && !readiness.canApprove ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="border-amber-400/60 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                                        onClick={() => setOverrideConfirm(true)}
                                                        disabled={approve.isPending}
                                                    >
                                                        Force Approve
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        onClick={() => {
                                                            approve.mutate({ id: viewingExit.id }, {
                                                                onSuccess: () => {
                                                                    toast.success('Approved', 'Exit request approved.')
                                                                    setViewingExit(null)
                                                                },
                                                                onError: (e) => toast.error('Failed', e instanceof Error ? e.message : 'Could not approve exit.'),
                                                            })
                                                        }}
                                                        disabled={approve.isPending || !readiness}
                                                    >
                                                        <CheckCircle2 className="size-3.5 me-1" /> Approve Exit
                                                    </Button>
                                                )}
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                                                    onClick={() => {
                                                        setRejectTarget(viewingExit)
                                                        setRejectReason('')
                                                        setViewingExit(null)
                                                    }}
                                                >
                                                    <XCircle className="size-3.5 me-1" /> Reject
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Stage 5: Settlement — inline mark-paid */}
                                <div id="exit-section-settlement" className="rounded-lg border divide-y text-sm overflow-hidden scroll-mt-4">
                                    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30">
                                        <DollarSign className="size-3.5 text-muted-foreground" />
                                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">5 · Settlement</span>
                                        {viewingExit.settlementPaid && (
                                            <Badge variant="success" className="ms-auto text-[10px]">Paid</Badge>
                                        )}
                                    </div>
                                    <div className="px-4">
                                        <DetailRow label="Gratuity (UAE Labour Law 2022)" value={fmt(viewingExit.gratuityAmount)} />
                                        <DetailRow label="Leave Encashment" value={fmt(viewingExit.leaveEncashmentAmount)} />
                                        <DetailRow label="Unpaid Salary" value={fmt(viewingExit.unpaidSalaryAmount)} />
                                        {Number(viewingExit.deductions ?? 0) > 0 && (
                                            <DetailRow label="Deductions" value={`− ${fmt(viewingExit.deductions)}`} />
                                        )}
                                    </div>
                                    <div className="flex justify-between items-center px-4 py-3 bg-muted/50">
                                        <span className="font-semibold">Total Settlement</span>
                                        <span className="font-bold text-primary text-base">{fmt(viewingExit.totalSettlement)}</span>
                                    </div>
                                    {viewingExit.settlementPaidDate && (
                                        <div className="px-4">
                                            <DetailRow label="Paid On" value={formatDate(viewingExit.settlementPaidDate)} />
                                        </div>
                                    )}
                                    {canManage && viewingExit.status === 'approved' && !viewingExit.settlementPaid && (
                                        <div className="px-4 py-3 border-t bg-card">
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    markPaid.mutate(viewingExit.id, {
                                                        onSuccess: () => {
                                                            toast.success('Settlement paid', 'Marked as paid. Workflows fired.')
                                                            setViewingExit(null)
                                                        },
                                                        onError: () => toast.error('Failed', 'Could not update settlement.'),
                                                    })
                                                }}
                                                disabled={markPaid.isPending}
                                            >
                                                <DollarSign className="size-3.5 me-1" /> Mark Settlement Paid
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Footer is intentionally minimal — every action lives
                        inside its corresponding stage card above. */}
                    <DialogFooter className="gap-2 flex-wrap">
                        <Button variant="outline" onClick={() => setViewingExit(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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

