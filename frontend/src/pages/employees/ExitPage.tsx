import { useMemo, useState } from 'react'

const PAGE_SIZE = 10
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import {
    LogOut, DollarSign, CheckCircle2, Clock, UserMinus, Eye, CalendarDays,
    FileText, RefreshCcw, XCircle, AlertTriangle, Scale, ListChecks,
} from 'lucide-react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { NumericInput } from '@/components/ui/numeric-input'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DataTable } from '@/components/ui/data-table'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { InitialsAvatar } from '@/components/shared/Avatar'
import {
    useExitRequests, useInitiateExit, useApproveExit, useRejectExit, useMarkSettlementPaid,
    useSettlementPreview, useExitApprovalReadiness, type ExitRequest,
} from '@/hooks/useExit'
import { useOffboardingSettings } from '@/hooks/useOffboardingFlow'
import { ConfirmDialog } from '@/components/ui/overlays'
import { EmployeeSelect } from '@/components/shared'
import { EmployeeLink } from '@/components/shared/EmployeeLink'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { type FilterConfig } from '@/lib/filters'
import { usePermissions } from '@/hooks/usePermissions'
import { formatDate, formatCurrency } from '@/lib/utils'
import { toast } from '@/components/ui/overlays'
import { ApiError } from '@/lib/api'
import { EXIT_TYPE_LABELS } from '@/lib/enums'
import { EXIT_TYPE_OPTIONS } from '@/lib/options'
import { ExitClearancePanel } from './ExitClearancePanel'
import { ExitStagesTimeline, ExitProgressBadge } from './ExitStagesTimeline'

const EXIT_FILTERS: FilterConfig[] = [
    { name: 'exitType', label: 'Exit type', type: 'multi_select', field: 'exitType', options: EXIT_TYPE_OPTIONS },
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

interface InitiateForm {
    employeeId: string
    exitType: 'resignation' | 'termination' | 'contract_end' | 'retirement'
    exitDate: string
    lastWorkingDay: string
    noticePeriodDays: number
    reason: string
    notes: string
    deductions: number
}

const defaultForm: InitiateForm = {
    employeeId: '',
    exitType: 'resignation',
    exitDate: '',
    lastWorkingDay: '',
    noticePeriodDays: 30,
    reason: '',
    notes: '',
    deductions: 0,
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

function GratuityBreakdown({ preview }: { preview: NonNullable<ReturnType<typeof useSettlementPreview>['data']> }) {
    const yrs = preview.yearsOfService
    const dailyWage = preview.basicSalary / 30
    const first5 = Math.min(yrs, 5)
    const beyond5 = Math.max(0, yrs - 5)

    return (
        <div className="rounded-lg border bg-muted/20 p-3 space-y-1.5 text-xs">
            <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px] flex items-center gap-1">
                <Scale className="size-3" /> Gratuity Calculation (UAE Labour Law 2022)
            </p>
            <div className="space-y-1 text-muted-foreground">
                <p>Daily wage: <span className="font-medium text-foreground">{fmt(dailyWage)}</span> (basic ÷ 30)</p>
                <p>Service: <span className="font-medium text-foreground">{yrs} years</span></p>
                {first5 > 0 && (
                    <p>First {first5.toFixed(2)}y × 21 days: <span className="font-medium text-foreground">{fmt(dailyWage * 21 * first5)}</span></p>
                )}
                {beyond5 > 0 && (
                    <p>Next {beyond5.toFixed(2)}y × 30 days: <span className="font-medium text-foreground">{fmt(dailyWage * 30 * beyond5)}</span></p>
                )}
                {preview.basicSalary * 24 < (dailyWage * 21 * first5 + dailyWage * 30 * beyond5) && (
                    <p className="text-amber-600">Cap applied: 2-year salary maximum ({fmt(preview.basicSalary * 24)})</p>
                )}
            </div>
        </div>
    )
}

export function ExitPage() {
    const { t } = useTranslation()
    const { can } = usePermissions()
    const canManage = can('manage_exit')

    const initiate = useInitiateExit()
    const approve = useApproveExit()
    const reject = useRejectExit()
    const markPaid = useMarkSettlementPaid()
    // Read the configured Offboarding Flow defaults so the Initiate Exit
    // dialog pre-fills the notice period the tenant actually wants instead
    // of a hard-coded 30. Hint copy below the input tells the user where
    // the default came from.
    const offboardingSettings = useOffboardingSettings()

    const [showDialog, setShowDialog] = useState(false)
    const [form, setForm] = useState<InitiateForm>(defaultForm)
    const [step, setStep] = useState<'form' | 'preview'>('form')
    const [viewingExit, setViewingExit] = useState<ExitRequest | null>(null)
    const [rejectTarget, setRejectTarget] = useState<ExitRequest | null>(null)
    const [rejectReason, setRejectReason] = useState('')
    const [overrideConfirm, setOverrideConfirm] = useState(false)

    // Live readiness check for the open exit detail dialog. canApprove === false
    // when clearance items are still pending — the Approve button is then
    // disabled and a "Force approve" path appears for HR.
    const readinessQ = useExitApprovalReadiness(viewingExit?.status === 'pending' ? viewingExit.id : null)
    const readiness = readinessQ.data

    // Compute the configured default notice period (in days) so it can be
    // pre-filled into the Initiate Exit form. Falls back to 30 if the
    // settings haven't loaded yet or notice period is disabled.
    const configuredNoticeDays = (() => {
        const s = offboardingSettings.data
        if (!s || !s.noticePeriodEnabled) return 30
        return s.noticePeriodUnit === 'months' ? s.noticePeriodValue * 30 : s.noticePeriodValue
    })()
    // State-during-render sync: when the Initiate dialog opens for the first
    // time after the configured default loads, replace the placeholder 30
    // with the tenant's actual configured value. Doesn't override after the
    // user has typed.
    const [lastConfiguredNotice, setLastConfiguredNotice] = useState(30)
    if (configuredNoticeDays !== lastConfiguredNotice) {
        setLastConfiguredNotice(configuredNoticeDays)
        // Only seed when the dialog is closed (so it doesn't yank a value
        // out from under a user mid-edit). The form resets on close anyway.
        if (!showDialog) {
            setForm((prev) => ({ ...prev, noticePeriodDays: configuredNoticeDays }))
        }
    }

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

    const previewEnabled = !!form.employeeId && !!form.exitDate && !!form.exitType
    const { data: preview, isLoading: previewLoading } = useSettlementPreview(
        previewEnabled ? form.employeeId : undefined,
        previewEnabled ? form.exitDate : undefined,
        previewEnabled ? form.exitType : undefined,
        previewEnabled ? form.deductions : undefined,
    )

    const set = (k: keyof InitiateForm, v: string | number) => setForm(f => ({ ...f, [k]: v }))

    async function handleSubmit() {
        if (!form.reason?.trim()) {
            toast.warning('Reason required', 'Please provide a reason for the exit.')
            setStep('form')
            return
        }
        try {
            await initiate.mutateAsync({ ...form, reason: form.reason.trim() })
            toast.success('Exit initiated', 'Employee exit request submitted successfully.')
            setShowDialog(false)
            setForm(defaultForm)
            setStep('form')
        } catch (err) {
            toast.error('Failed', err instanceof ApiError ? err.message : 'Could not initiate exit.')
        }
    }

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
                            <Button size="sm" leftIcon={<UserMinus className="size-3.5" />} onClick={() => { setShowDialog(true); setStep('form') }}>
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
                                <ExitStagesTimeline exit={viewingExit} />
                            </div>

                            {/* Two-column body */}
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="space-y-4">
                                    <div className="rounded-lg border divide-y text-sm overflow-hidden">
                                        <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30">
                                            <CalendarDays className="size-3.5 text-muted-foreground" />
                                            <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Exit Information</span>
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

                                    <ExitClearancePanel exitId={viewingExit.id} />
                                </div>

                                <div className="space-y-4">
                                    {viewingExit.totalSettlement && (
                                <div className="rounded-lg border divide-y text-sm overflow-hidden">
                                    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30">
                                        <DollarSign className="size-3.5 text-muted-foreground" />
                                        <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">Settlement Breakdown</span>
                                        {viewingExit.settlementPaid && (
                                            <Badge variant="success" className="ml-auto text-[10px]">Paid</Badge>
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
                                </div>
                            )}

                            {/* Exit Interview status card — surfaces the
                                offboarding-flow interview step alongside the
                                settlement so HR sees the full picture. */}
                            <div className="rounded-lg border bg-card">
                                <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30">
                                    <ListChecks className="size-3.5 text-muted-foreground" />
                                    <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                                        Exit Interview
                                    </span>
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
                                        : 'The employee has not yet completed the configured exit interview. Reminders fire automatically per the workflow rules.'}
                                </div>
                            </div>
                            </div>
                        </div>
                        </div>
                    )}
                    {canManage && viewingExit?.status === 'pending' && readiness && !readiness.canApprove && (
                        <div className="rounded-lg border border-amber-400/40 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 mb-3 text-xs">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium text-amber-900 dark:text-amber-100">
                                        {readiness.pendingClearances.length} clearance item{readiness.pendingClearances.length === 1 ? '' : 's'} still pending
                                    </p>
                                    <p className="text-amber-800 dark:text-amber-200/80 mt-0.5">
                                        Approval is blocked until each clearance is marked complete (or HR overrides).
                                    </p>
                                    <ul className="mt-1.5 space-y-0.5 text-[11px] text-amber-900 dark:text-amber-100/90">
                                        {readiness.pendingClearances.slice(0, 5).map(p => (
                                            <li key={p.id} className="flex items-center gap-1.5">
                                                <span className="size-1 rounded-full bg-amber-600 dark:bg-amber-400" />
                                                {p.name}
                                            </li>
                                        ))}
                                        {readiness.pendingClearances.length > 5 && (
                                            <li className="text-amber-800/70 dark:text-amber-200/60 ms-2.5">
                                                +{readiness.pendingClearances.length - 5} more…
                                            </li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter className="gap-2 flex-wrap">
                        {canManage && viewingExit?.status === 'pending' && (
                            <>
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
                                            if (!viewingExit) return
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
                                        <CheckCircle2 className="size-3.5 mr-1" /> Approve Exit
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
                                    <XCircle className="size-3.5 mr-1" /> Reject
                                </Button>
                            </>
                        )}
                        {canManage && viewingExit?.status === 'approved' && !viewingExit?.settlementPaid && (
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    if (!viewingExit) return
                                    markPaid.mutate(viewingExit.id, {
                                        onSuccess: () => {
                                            toast.success('Settlement paid', 'Settlement marked as paid.')
                                            setViewingExit(null)
                                        },
                                        onError: () => toast.error('Failed', 'Could not update settlement.'),
                                    })
                                }}
                                disabled={markPaid.isPending}
                            >
                                <DollarSign className="size-3.5 mr-1" /> Mark Settlement Paid
                            </Button>
                        )}
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

            {/* Initiate Exit Dialog */}
            <Dialog open={showDialog} onOpenChange={(o) => { if (!initiate.isPending) setShowDialog(o) }}>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            {step === 'form' ? 'Initiate Employee Exit' : 'Settlement Preview'}
                        </DialogTitle>
                        <DialogDescription>
                            {step === 'form'
                                ? 'Fill in the exit details. Preview the settlement calculation before confirming.'
                                : 'Review the calculated settlement (UAE Labour Law 2022) before submitting.'}
                        </DialogDescription>
                    </DialogHeader>

                    {step === 'form' && (
                        <div className="space-y-4 py-2">
                            <div className="space-y-1.5">
                                <Label required>Employee</Label>
                                <EmployeeSelect value={form.employeeId} onValueChange={v => set('employeeId', v)} />
                            </div>
                            <div className="space-y-1.5">
                                <Label required>Exit Type</Label>
                                <Select value={form.exitType} onValueChange={v => set('exitType', v)}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {EXIT_TYPE_OPTIONS.map(o => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label required>Exit Date</Label>
                                    <DatePicker value={form.exitDate} onChange={v => set('exitDate', v)} />
                                </div>
                                <div className="space-y-1.5">
                                    <Label required>Last Working Day</Label>
                                    <DatePicker value={form.lastWorkingDay} min={form.exitDate || undefined} onChange={v => set('lastWorkingDay', v)} />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Notice Period (days)</Label>
                                    <NumericInput decimal={false} value={form.noticePeriodDays} onChange={e => set('noticePeriodDays', Number(e.target.value))} />
                                    {form.noticePeriodDays === configuredNoticeDays && offboardingSettings.data?.noticePeriodEnabled && (
                                        <p className="text-[10px] text-muted-foreground leading-tight">
                                            Default from Org Settings → Offboarding Flow.
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Deductions (AED)</Label>
                                    <NumericInput decimal value={form.deductions} onChange={e => set('deductions', Number(e.target.value))} placeholder="0.00" />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label required>Reason</Label>
                                <Textarea value={form.reason} onChange={e => set('reason', e.target.value)} rows={2} placeholder="Reason for exit…" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Notes</Label>
                                <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="Additional notes…" />
                            </div>
                        </div>
                    )}

                    {step === 'preview' && previewLoading && (
                        <div className="py-10 text-center text-sm text-muted-foreground">
                            <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent mx-auto mb-3" />
                            Calculating settlement…
                        </div>
                    )}

                    {step === 'preview' && preview && !previewLoading && (
                        <div className="space-y-4 py-2">
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                                <InitialsAvatar name={preview.employeeName} size="sm" />
                                <div>
                                    <p className="text-sm font-semibold">{preview.employeeName}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {preview.yearsOfService} years of service · {EXIT_TYPE_LABELS[form.exitType] ?? form.exitType}
                                    </p>
                                    <p className="text-xs text-muted-foreground">Basic: {fmt(preview.basicSalary)} · Total: {fmt(preview.totalSalary)}</p>
                                </div>
                            </div>

                            <GratuityBreakdown preview={preview} />

                            <div className="divide-y rounded-lg border overflow-hidden text-sm">
                                {[
                                    ['Gratuity (UAE Labour Law 2022)', fmt(preview.gratuityAmount)],
                                    [`Leave Encashment (${preview.unusedLeaveDays} unused days)`, fmt(preview.leaveEncashmentAmount)],
                                    ['Unpaid Salary (current month prorate)', fmt(preview.unpaidSalaryAmount)],
                                    ...(preview.deductions > 0 ? [['Deductions', `− ${fmt(preview.deductions)}`]] : []),
                                ].map(([label, val]) => (
                                    <div key={label} className="flex justify-between px-4 py-2.5">
                                        <span className="text-muted-foreground">{label}</span>
                                        <span className="font-medium">{val}</span>
                                    </div>
                                ))}
                                <div className="flex justify-between px-4 py-3 bg-muted/50 font-semibold">
                                    <span>Total Settlement</span>
                                    <span className="text-primary text-base">{fmt(preview.totalSettlement)}</span>
                                </div>
                            </div>

                            {preview.yearsOfService < 1 && (
                                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/50 px-3 py-2.5 text-xs text-amber-700">
                                    <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                                    <span>Employee has less than 1 year of service - gratuity is not payable under UAE Labour Law.</span>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'preview' && !previewLoading && !preview && (
                        <div className="py-8 text-center text-sm text-muted-foreground">
                            Could not load settlement preview. Please go back and verify the details.
                        </div>
                    )}

                    <DialogFooter>
                        {step === 'form' && (
                            <>
                                <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
                                <Button
                                    onClick={() => setStep('preview')}
                                    disabled={!form.employeeId || !form.exitDate || !form.lastWorkingDay || !form.reason?.trim()}
                                >
                                    Preview Settlement
                                </Button>
                            </>
                        )}
                        {step === 'preview' && (
                            <>
                                <Button variant="outline" onClick={() => setStep('form')}>Back</Button>
                                <Button onClick={handleSubmit} disabled={initiate.isPending || previewLoading}>
                                    {initiate.isPending ? 'Submitting…' : 'Confirm & Submit'}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageWrapper>
    )
}

