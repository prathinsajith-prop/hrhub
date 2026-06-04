/**
 * Travel module — single-page surface with two tabs:
 *
 *   • Requests : the trips themselves (create, submit, approve, cancel).
 *   • Expenses : per-trip line items (added once a trip is approved).
 *
 * Designed to match the project's existing patterns:
 *   - Filter chips for status (mirrors LeavePage)
 *   - Status badges with the same colour vocabulary
 *   - Action dialogs (Add Request, Add Expense) with date pickers
 *   - DataTable with action column gated by role
 *
 * Permissions:
 *   - All roles can see the page (employees see their own only — enforced
 *     server-side by the request scope resolver).
 *   - manage_travel = HR/super_admin can approve / reject / delete.
 *   - Everyone else can create + cancel their own draft / submitted trips.
 */
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Plus, CalendarDays, MapPin, Receipt, CheckCircle2, XCircle,
    Clock, ChevronRight, Trash2, FileText, Send, Building2, Plane,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Card, Input, Textarea, Label, NumericInput, Switch, Separator } from '@/components/ui/primitives'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/form-controls'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
    ConfirmDialog, toast,
} from '@/components/ui/overlays'
import { DatePicker } from '@/components/ui/date-picker'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { formatDate, cn, formatCurrency } from '@/lib/utils'
import { EmployeeSelect } from '@/components/shared'
import { usePermissions } from '@/hooks/usePermissions'
import {
    useTravelRequests, useTravelRequest, useCreateTravelRequest, useSubmitTravelRequest,
    useCancelTravelRequest, useApproveTravelRequest, useRejectTravelRequest,
    useCompleteTravelRequest, useDeleteTravelRequest,
    useTravelExpenses, useAllTravelExpenses, useCreateTravelExpense, useDeleteTravelExpense,
    useApproveTravelExpense, useRejectTravelExpense, useReimburseTravelExpense,
    type TravelRequestStatus, type TravelRequestListRow, type TravelExpenseRow,
    type TravelExpenseTotals,
} from '@/hooks/useTravel'

const STATUS_FILTERS: ReadonlyArray<{ value: TravelRequestStatus | 'all'; labelKey: string }> = [
    { value: 'all',       labelKey: 'travel.filters.all' },
    { value: 'draft',     labelKey: 'travel.filters.draft' },
    { value: 'submitted', labelKey: 'travel.filters.submitted' },
    { value: 'approved',  labelKey: 'travel.filters.approved' },
    { value: 'completed', labelKey: 'travel.filters.completed' },
    { value: 'rejected',  labelKey: 'travel.filters.rejected' },
    { value: 'cancelled', labelKey: 'travel.filters.cancelled' },
]

const STATUS_BADGE: Record<TravelRequestStatus, { className: string; icon: typeof Clock }> = {
    draft:     { className: 'bg-muted text-muted-foreground ring-1 ring-border',                            icon: FileText },
    submitted: { className: 'bg-blue-100 text-blue-800 ring-1 ring-blue-300/60 dark:bg-blue-950/40 dark:text-blue-300', icon: Send },
    approved:  { className: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300/60 dark:bg-emerald-950/40 dark:text-emerald-300', icon: CheckCircle2 },
    rejected:  { className: 'bg-rose-100 text-rose-700 ring-1 ring-rose-300/60 dark:bg-rose-950/40 dark:text-rose-300', icon: XCircle },
    cancelled: { className: 'bg-slate-200 text-slate-600 ring-1 ring-slate-300/60 dark:bg-slate-800 dark:text-slate-300', icon: XCircle },
    completed: { className: 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300/60 dark:bg-indigo-950/40 dark:text-indigo-300', icon: CheckCircle2 },
}

function StatusBadge({ status }: { status: TravelRequestStatus }) {
    const v = STATUS_BADGE[status]
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', v.className)}>
            <v.icon className="size-3" />
            {status}
        </span>
    )
}

export default function TravelPage() {
    const { t } = useTranslation()
    const { can } = usePermissions()
    const canManage = can('manage_travel')
    const deleteRequest = useDeleteTravelRequest()

    // Top-level state — which tab the user is on, and (for the Expenses tab)
    // which travel request is currently selected. The Expenses tab is a
    // detail-view of a single request; selecting a row in the Requests tab
    // jumps over and loads its expenses.
    const [tab, setTab] = useState<'requests' | 'expenses'>('requests')
    const [statusFilter, setStatusFilter] = useState<TravelRequestStatus | 'all'>('all')
    const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
    const [addRequestOpen, setAddRequestOpen] = useState(false)
    const [addExpenseOpen, setAddExpenseOpen] = useState(false)
    const [rejectingId, setRejectingId] = useState<string | null>(null)
    const [deletingId, setDeletingId] = useState<string | null>(null)

    return (
        <PageWrapper>
            <PageHeader
                title={t('travel.title', 'Travel')}
                description={t('travel.subtitle', 'Trip requests and per-trip expense claims')}
                actions={
                    <Button onClick={() => setAddRequestOpen(true)} className="gap-1.5">
                        <Plus className="size-4" />
                        {t('travel.actions.newRequest', 'New travel request')}
                    </Button>
                }
            />

            <Tabs value={tab} onValueChange={(v) => setTab(v as 'requests' | 'expenses')} className="space-y-4">
                <TabsList>
                    <TabsTrigger value="requests" className="gap-1.5">
                        <Plane className="size-3.5" />
                        {t('travel.tabs.requests', 'Travel Requests')}
                    </TabsTrigger>
                    <TabsTrigger value="expenses" className="gap-1.5">
                        <Receipt className="size-3.5" />
                        {t('travel.tabs.expenses', 'Travel Expenses')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="requests" className="space-y-4">
                    {/* Status filter chips — re-uses the same visual vocabulary
                        as the LeavePage filter chips for consistency. */}
                    <div className="flex flex-wrap gap-1.5">
                        {STATUS_FILTERS.map((f) => (
                            <button
                                key={f.value}
                                type="button"
                                onClick={() => setStatusFilter(f.value)}
                                className={cn(
                                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                                    statusFilter === f.value
                                        ? 'bg-primary text-primary-foreground'
                                        : 'bg-muted text-muted-foreground hover:bg-muted/80',
                                )}
                            >
                                {t(f.labelKey, f.value)}
                            </button>
                        ))}
                    </div>

                    <TravelRequestsList
                        statusFilter={statusFilter === 'all' ? undefined : statusFilter}
                        canManage={canManage}
                        onOpenExpenses={(id) => { setSelectedRequestId(id); setTab('expenses') }}
                        onReject={(id) => setRejectingId(id)}
                        onDelete={(id) => setDeletingId(id)}
                    />
                </TabsContent>

                <TabsContent value="expenses" className="space-y-4">
                    {selectedRequestId ? (
                        // A specific trip is selected — show its detail view
                        // (line items + per-category totals + actions).
                        <TravelExpensesPanel
                            travelRequestId={selectedRequestId}
                            canManage={canManage}
                            onAddExpense={() => setAddExpenseOpen(true)}
                            onBack={() => setSelectedRequestId(null)}
                        />
                    ) : (
                        // No selection — show a flat list across every trip
                        // the viewer can see. Clicking a row drills into the
                        // single-trip detail above.
                        <AllExpensesView
                            canManage={canManage}
                            onAddExpense={() => setAddExpenseOpen(true)}
                            onSelectRequest={(id) => setSelectedRequestId(id)}
                            onJumpToRequests={() => setTab('requests')}
                        />
                    )}
                </TabsContent>
            </Tabs>

            <AddTravelRequestDialog
                open={addRequestOpen}
                onOpenChange={setAddRequestOpen}
                canPickEmployee={canManage}
            />
            {/* Single instance — mounted regardless of selection so the Add
                Expense button on AllExpensesView can open it with no pre-
                selection (user picks the trip inside the dialog). When
                opened from a specific trip, the travel id is locked. */}
            <AddTravelExpenseDialog
                open={addExpenseOpen}
                onOpenChange={setAddExpenseOpen}
                preselectedRequestId={selectedRequestId}
            />
            {rejectingId && (
                <RejectRequestDialog
                    requestId={rejectingId}
                    onClose={() => setRejectingId(null)}
                />
            )}
            <ConfirmDialog
                open={!!deletingId}
                onOpenChange={(v) => !v && setDeletingId(null)}
                title={t('travel.delete.title', 'Delete travel request?')}
                description={t('travel.delete.desc', 'This will remove the request and any attached expenses. The data remains in the audit trail.')}
                variant="destructive"
                confirmLabel={t('common.delete', 'Delete')}
                onConfirm={async () => {
                    if (!deletingId) return
                    await deleteRequest.mutateAsync(deletingId)
                    setDeletingId(null)
                }}
            />
        </PageWrapper>
    )
}

// ─── Requests list ──────────────────────────────────────────────────────────

function TravelRequestsList({
    statusFilter,
    canManage,
    onOpenExpenses,
    onReject,
    onDelete,
}: {
    statusFilter: TravelRequestStatus | undefined
    canManage: boolean
    onOpenExpenses: (id: string) => void
    onReject: (id: string) => void
    onDelete: (id: string) => void
}) {
    const { t } = useTranslation()
    const { data, isLoading } = useTravelRequests({ status: statusFilter, limit: 100 })
    const submit = useSubmitTravelRequest()
    const cancel = useCancelTravelRequest()
    const approve = useApproveTravelRequest()
    const complete = useCompleteTravelRequest()

    const rows = data?.data ?? []

    // Aggregate counters — feed the four KPI cards at the top.
    const counts = useMemo(() => {
        const by: Record<TravelRequestStatus, number> = { draft: 0, submitted: 0, approved: 0, rejected: 0, cancelled: 0, completed: 0 }
        for (const r of rows) by[r.status]++
        return by
    }, [rows])

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCardCompact label={t('travel.kpi.pending', 'Pending approval')} value={counts.submitted} icon={Clock} color="blue" loading={isLoading} />
                <KpiCardCompact label={t('travel.kpi.approved', 'Approved')} value={counts.approved} icon={CheckCircle2} color="green" loading={isLoading} />
                <KpiCardCompact label={t('travel.kpi.completed', 'Completed')} value={counts.completed} icon={Plane} color="cyan" loading={isLoading} />
                <KpiCardCompact label={t('travel.kpi.draft', 'Drafts')} value={counts.draft} icon={FileText} color="amber" loading={isLoading} />
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.list.travelId', 'Travel ID')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.list.employee', 'Employee')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.list.place', 'Place')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.list.dates', 'Dates')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.list.days', 'Days')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.list.status', 'Status')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.list.actions', 'Actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {isLoading ? (
                                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{t('common.loading', 'Loading...')}</td></tr>
                            ) : rows.length === 0 ? (
                                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{t('travel.list.empty', 'No travel requests yet')}</td></tr>
                            ) : rows.map((r) => (
                                <RequestRow
                                    key={r.id}
                                    row={r}
                                    canManage={canManage}
                                    onOpenExpenses={() => onOpenExpenses(r.id)}
                                    onSubmit={() => submit.mutate({ id: r.id })}
                                    onCancel={() => cancel.mutate({ id: r.id })}
                                    onApprove={() => approve.mutate({ id: r.id })}
                                    onComplete={() => complete.mutate({ id: r.id })}
                                    onReject={() => onReject(r.id)}
                                    onDelete={() => onDelete(r.id)}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    )
}

function RequestRow({
    row, canManage, onOpenExpenses, onSubmit, onCancel, onApprove, onComplete, onReject, onDelete,
}: {
    row: TravelRequestListRow
    canManage: boolean
    onOpenExpenses: () => void
    onSubmit: () => void
    onCancel: () => void
    onApprove: () => void
    onComplete: () => void
    onReject: () => void
    onDelete: () => void
}) {
    const canSubmit = row.status === 'draft'
    const canCancel = row.status === 'draft' || row.status === 'submitted' || row.status === 'approved'
    const canApprove = canManage && row.status === 'submitted'
    const canComplete = canManage && row.status === 'approved'
    const canViewExpenses = row.status === 'approved' || row.status === 'completed'

    return (
        <tr className="hover:bg-muted/30">
            <td className="px-3 py-2 align-middle">
                <div className="font-mono text-xs font-semibold">{row.travelNo}</div>
                {row.isBillableToCustomer && row.customerName && (
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                        <Building2 className="size-3" />
                        {row.customerName}
                    </div>
                )}
            </td>
            <td className="px-3 py-2 align-middle">
                <div className="font-medium">{row.employeeName}</div>
                <div className="text-[11px] text-muted-foreground">{row.employeeNo}{row.department ? ` · ${row.department}` : ''}</div>
            </td>
            <td className="px-3 py-2 align-middle">
                {row.placeOfVisit ? (
                    <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3 text-muted-foreground" />
                        {row.placeOfVisit}
                    </span>
                ) : <span className="text-muted-foreground/50">—</span>}
                {row.purposeOfVisit && (
                    <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{row.purposeOfVisit}</div>
                )}
            </td>
            <td className="px-3 py-2 align-middle text-xs">
                <div className="inline-flex items-center gap-1">
                    <CalendarDays className="size-3 text-muted-foreground" />
                    <span>{formatDate(row.departureDate)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">→ {formatDate(row.arrivalDate)}</div>
            </td>
            <td className="px-3 py-2 align-middle text-right tabular-nums">{row.durationDays}</td>
            <td className="px-3 py-2 align-middle"><StatusBadge status={row.status} /></td>
            <td className="px-3 py-2 align-middle">
                <div className="flex items-center justify-end gap-1">
                    {canSubmit && (
                        <Button size="sm" variant="ghost" onClick={onSubmit} className="h-7 px-2 text-xs">
                            <Send className="size-3 me-1" />
                            Submit
                        </Button>
                    )}
                    {canApprove && (
                        <>
                            <Button size="sm" variant="ghost" onClick={onApprove} className="h-7 px-2 text-xs text-emerald-700 hover:text-emerald-800">
                                <CheckCircle2 className="size-3 me-1" />
                                Approve
                            </Button>
                            <Button size="sm" variant="ghost" onClick={onReject} className="h-7 px-2 text-xs text-rose-700 hover:text-rose-800">
                                <XCircle className="size-3 me-1" />
                                Reject
                            </Button>
                        </>
                    )}
                    {canComplete && (
                        <Button size="sm" variant="ghost" onClick={onComplete} className="h-7 px-2 text-xs">
                            <CheckCircle2 className="size-3 me-1" />
                            Complete
                        </Button>
                    )}
                    {canCancel && row.status !== 'approved' && (
                        <Button size="sm" variant="ghost" onClick={onCancel} className="h-7 px-2 text-xs text-muted-foreground">
                            Cancel
                        </Button>
                    )}
                    {canViewExpenses && (
                        <Button size="sm" variant="outline" onClick={onOpenExpenses} className="h-7 px-2 text-xs">
                            <Receipt className="size-3 me-1" />
                            Expenses
                            <ChevronRight className="size-3 ms-0.5" />
                        </Button>
                    )}
                    {canManage && (
                        <Button size="sm" variant="ghost" onClick={onDelete} className="size-7 p-0 text-rose-600">
                            <Trash2 className="size-3.5" />
                        </Button>
                    )}
                </div>
            </td>
        </tr>
    )
}

// ─── Expenses panel ─────────────────────────────────────────────────────────

/**
 * Top-level Expenses view — flat list across every trip the viewer can see.
 *
 * Shown when the Expenses tab is opened without first picking a specific
 * travel request. Three useful behaviours:
 *   1. Status filter chips (pending / approved / rejected / reimbursed)
 *      so HR can triage what still needs action.
 *   2. KPI strip with totals — by status + grand total — to answer "how
 *      much travel cost is still pending reimbursement?" at a glance.
 *   3. Click any row → drill into the single-trip detail (TravelExpensesPanel).
 */
function AllExpensesView({
    canManage,
    onAddExpense,
    onSelectRequest,
    onJumpToRequests,
}: {
    canManage: boolean
    onAddExpense: () => void
    onSelectRequest: (travelRequestId: string) => void
    onJumpToRequests: () => void
}) {
    const { t } = useTranslation()
    const [statusFilter, setStatusFilter] = useState<TravelExpenseRow['status'] | 'all'>('all')
    const { data: allExpenses, isLoading } = useAllTravelExpenses(
        statusFilter === 'all' ? {} : { status: statusFilter },
    )
    const rows = allExpenses ?? []

    // Aggregate per-status + grand total. Cheaper than firing N requests
    // for each KPI card.
    const stats = useMemo(() => {
        const out = {
            pending: 0,
            approved: 0,
            rejected: 0,
            reimbursed: 0,
            grandTotal: 0,
            count: rows.length,
        }
        for (const r of rows) {
            const t = Number(r.total)
            out.grandTotal += t
            out[r.status] += t
        }
        return out
    }, [rows])

    return (
        <div className="space-y-4">
            {/* Header row — gives the flat view its own primary action so
                users don't have to navigate into a trip first. The dialog
                that opens has a Travel ID picker since nothing is pre-
                selected here. */}
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold">{t('travel.allExpenses.title', 'All travel expenses')}</h2>
                    <p className="text-[11px] text-muted-foreground">
                        {t('travel.allExpenses.subtitle', 'Every expense across every approved trip you can see.')}
                    </p>
                </div>
                <Button size="sm" onClick={onAddExpense} className="gap-1.5 shrink-0">
                    <Plus className="size-4" />
                    {t('travel.allExpenses.add', 'Add expense')}
                </Button>
            </div>

            {/* KPI strip — totals by status. Click-throughs filter the
                table to the matching status so HR can pivot quickly. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ExpenseKpi
                    label={t('travel.allExpenses.pending', 'Pending')}
                    value={stats.pending}
                    tone="amber"
                    active={statusFilter === 'pending'}
                    onClick={() => setStatusFilter((s) => s === 'pending' ? 'all' : 'pending')}
                    loading={isLoading}
                />
                <ExpenseKpi
                    label={t('travel.allExpenses.approved', 'Approved')}
                    value={stats.approved}
                    tone="emerald"
                    active={statusFilter === 'approved'}
                    onClick={() => setStatusFilter((s) => s === 'approved' ? 'all' : 'approved')}
                    loading={isLoading}
                />
                <ExpenseKpi
                    label={t('travel.allExpenses.reimbursed', 'Reimbursed')}
                    value={stats.reimbursed}
                    tone="indigo"
                    active={statusFilter === 'reimbursed'}
                    onClick={() => setStatusFilter((s) => s === 'reimbursed' ? 'all' : 'reimbursed')}
                    loading={isLoading}
                />
                <ExpenseKpi
                    label={t('travel.allExpenses.grandTotal', 'Grand total')}
                    value={stats.grandTotal}
                    tone="neutral"
                    loading={isLoading}
                />
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.allExpenses.date', 'Date')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.allExpenses.trip', 'Trip')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.allExpenses.employee', 'Employee')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.allExpenses.description', 'Description')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.allExpenses.amount', 'Amount')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.allExpenses.status', 'Status')}</th>
                                <th className="px-3 py-2 text-right font-medium"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {isLoading ? (
                                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">{t('common.loading', 'Loading...')}</td></tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="px-3 py-12 text-center">
                                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                            <Receipt className="size-8 opacity-30" />
                                            <p>{t('travel.allExpenses.empty', 'No expenses yet')}</p>
                                            <Button variant="outline" size="sm" onClick={onJumpToRequests} className="mt-2 gap-1.5">
                                                <Plane className="size-3.5" />
                                                {t('travel.allExpenses.gotoRequests', 'Go to Travel Requests')}
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ) : rows.map((r) => (
                                <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => onSelectRequest(r.travelRequestId)}>
                                    <td className="px-3 py-2 text-xs tabular-nums">{formatDate(r.expenseDate)}</td>
                                    <td className="px-3 py-2">
                                        <span className="font-mono text-xs font-semibold">{r.travelNo}</span>
                                    </td>
                                    <td className="px-3 py-2 text-xs">
                                        <div className="font-medium">{r.employeeName}</div>
                                        <div className="text-[10px] text-muted-foreground">{r.employeeNo}</div>
                                    </td>
                                    <td className="px-3 py-2 text-xs text-muted-foreground line-clamp-1 max-w-xs">
                                        {r.description || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums font-semibold">
                                        {formatCurrency(Number(r.total))}
                                    </td>
                                    <td className="px-3 py-2"><ExpenseStatusBadge status={r.status} /></td>
                                    <td className="px-3 py-2 text-right">
                                        <ChevronRight className="size-3.5 inline text-muted-foreground" />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Hint banner only when there are rows — gives non-HR users a
                cue that clicking will drill in. Suppressed on the empty
                state since the CTA above already covers it. */}
            {rows.length > 0 && (
                <p className="text-[11px] text-muted-foreground text-center">
                    {canManage
                        ? t('travel.allExpenses.hintHr', 'Click any row to open the trip and approve, reject, or reimburse its expenses.')
                        : t('travel.allExpenses.hint', 'Click any row to open the trip and see its full expense breakdown.')}
                </p>
            )}
        </div>
    )
}

/** Tone-aware KPI card used in the AllExpensesView. Values render as AED. */
function ExpenseKpi({
    label, value, tone, active, onClick, loading,
}: {
    label: string
    value: number
    tone: 'amber' | 'emerald' | 'indigo' | 'neutral'
    active?: boolean
    onClick?: () => void
    loading?: boolean
}) {
    const toneClass = {
        amber:   'border-amber-200/60 bg-amber-50/60 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/15 dark:text-amber-200',
        emerald: 'border-emerald-200/60 bg-emerald-50/60 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/15 dark:text-emerald-200',
        indigo:  'border-indigo-200/60 bg-indigo-50/60 text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/15 dark:text-indigo-200',
        neutral: 'border-border bg-card text-foreground',
    }[tone]
    const Tag = onClick ? 'button' : 'div'
    return (
        <Tag
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={cn(
                'rounded-lg border p-3 text-left transition-all',
                toneClass,
                onClick && 'hover:shadow-sm cursor-pointer',
                active && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
            )}
        >
            <div className="text-[10px] font-bold uppercase tracking-widest opacity-80">{label}</div>
            <div className="mt-0.5 text-lg font-bold tabular-nums">
                {loading ? '—' : formatCurrency(value)}
            </div>
        </Tag>
    )
}

// Verbs each correspond to one mutation. Modeling them as a single state
// makes the row → confirmation → mutation flow uniform: pick a verb, render
// the matching dialog, dispatch on confirm.
type ExpenseActionVerb = 'approve' | 'reject' | 'reimburse' | 'delete'

interface PendingExpenseAction {
    expense: TravelExpenseRow
    verb: ExpenseActionVerb
}

function TravelExpensesPanel({
    travelRequestId,
    canManage,
    onAddExpense,
    onBack,
}: {
    travelRequestId: string
    canManage: boolean
    onAddExpense: () => void
    onBack: () => void
}) {
    const { t } = useTranslation()
    const { data: trip } = useTravelRequest(travelRequestId)
    const { data, isLoading } = useTravelExpenses(travelRequestId)
    const del = useDeleteTravelExpense()
    const approve = useApproveTravelExpense()
    const reject = useRejectTravelExpense()
    const reimburse = useReimburseTravelExpense()
    const expenses = data?.data ?? []
    const totals = data?.totals
    // One state, four verbs. Rendering one confirmation dialog at panel
    // level beats four near-identical dialogs per row.
    const [pending, setPending] = useState<PendingExpenseAction | null>(null)

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
                    <ChevronRight className="size-3.5 rotate-180" />
                    {t('travel.expenses.back', 'Back to requests')}
                </Button>
                <Button onClick={onAddExpense} size="sm" className="gap-1.5">
                    <Plus className="size-4" />
                    {t('travel.expenses.add', 'Add expense')}
                </Button>
            </div>

            {/* Trip header — shows the Travel ID + context so HR knows
                which trip these expenses are being billed against. */}
            {trip && (
                <Card className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="secondary" className="font-mono text-xs font-semibold">
                                    {trip.travelNo}
                                </Badge>
                                <StatusBadge status={trip.status} />
                                {trip.isBillableToCustomer && trip.customerName && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                        <Building2 className="size-3" />
                                        {trip.customerName}
                                    </span>
                                )}
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="font-medium text-foreground">{trip.employeeName}</span>
                                    {trip.employeeNo && <span>· {trip.employeeNo}</span>}
                                </span>
                                {trip.placeOfVisit && (
                                    <span className="inline-flex items-center gap-1.5">
                                        <MapPin className="size-3" />
                                        {trip.placeOfVisit}
                                    </span>
                                )}
                                <span className="inline-flex items-center gap-1.5 tabular-nums">
                                    <CalendarDays className="size-3" />
                                    {formatDate(trip.departureDate)} → {formatDate(trip.arrivalDate)}
                                    <span className="text-muted-foreground/60">· {trip.durationDays} {trip.durationDays === 1 ? 'day' : 'days'}</span>
                                </span>
                            </div>
                            {trip.purposeOfVisit && (
                                <p className="mt-2 text-xs text-muted-foreground">{trip.purposeOfVisit}</p>
                            )}
                        </div>
                    </div>
                </Card>
            )}

            {totals && <ExpenseTotalsCard totals={totals} />}

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                            <tr>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.expenses.date', 'Date')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.expenses.description', 'Description')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.expenses.ticket', 'Ticket')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.expenses.lodging', 'Lodging')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.expenses.boarding', 'Boarding')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.expenses.phone', 'Phone')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.expenses.localConveyance', 'Local')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.expenses.incidentals', 'Incid.')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.expenses.others', 'Others')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.expenses.total', 'Total')}</th>
                                <th className="px-3 py-2 text-left font-medium">{t('travel.expenses.status', 'Status')}</th>
                                <th className="px-3 py-2 text-right font-medium">{t('travel.expenses.actions', 'Actions')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {isLoading ? (
                                <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">{t('common.loading', 'Loading...')}</td></tr>
                            ) : expenses.length === 0 ? (
                                <tr><td colSpan={12} className="px-3 py-8 text-center text-muted-foreground">{t('travel.expenses.empty', 'No expenses yet. Add one to get started.')}</td></tr>
                            ) : expenses.map((e) => (
                                <ExpenseRow
                                    key={e.id}
                                    row={e}
                                    canManage={canManage}
                                    onApprove={() => setPending({ expense: e, verb: 'approve' })}
                                    onReject={() => setPending({ expense: e, verb: 'reject' })}
                                    onReimburse={() => setPending({ expense: e, verb: 'reimburse' })}
                                    onDelete={() => setPending({ expense: e, verb: 'delete' })}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>

            <ExpenseActionDialog
                pending={pending}
                onClose={() => setPending(null)}
                onApproveConfirm={(id) => approve.mutateAsync({ id }).then(() => setPending(null))}
                onRejectConfirm={(id, reason) => reject.mutateAsync({ id, rejectionReason: reason }).then(() => setPending(null))}
                onReimburseConfirm={(id) => reimburse.mutateAsync({ id }).then(() => setPending(null))}
                onDeleteConfirm={(id) => del.mutateAsync(id).then(() => setPending(null))}
                approving={approve.isPending}
                rejecting={reject.isPending}
                reimbursing={reimburse.isPending}
                deleting={del.isPending}
            />
        </div>
    )
}

function ExpenseTotalsCard({ totals }: { totals: TravelExpenseTotals }) {
    const { t } = useTranslation()
    const items: Array<[string, string]> = [
        [t('travel.expenses.ticket', 'Ticket'), totals.ticket],
        [t('travel.expenses.lodging', 'Lodging'), totals.lodging],
        [t('travel.expenses.boarding', 'Boarding'), totals.boarding],
        [t('travel.expenses.phone', 'Phone'), totals.phone],
        [t('travel.expenses.localConveyance', 'Local'), totals.localConveyance],
        [t('travel.expenses.incidentals', 'Incidentals'), totals.incidentals],
        [t('travel.expenses.others', 'Others'), totals.others],
    ]
    return (
        <Card className="p-4">
            <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-semibold">{t('travel.expenses.totals', 'Expense totals')}</h3>
                <div className="text-right">
                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{t('travel.expenses.grandTotal', 'Grand total')}</div>
                    <div className="text-xl font-bold tabular-nums">{formatCurrency(Number(totals.grandTotal))}</div>
                </div>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-2 mt-3 sm:grid-cols-4 lg:grid-cols-7">
                {items.map(([label, value]) => {
                    const n = Number(value)
                    const dim = n === 0
                    return (
                        <div key={label} className={cn('rounded-md border bg-card p-2', dim && 'opacity-50')}>
                            <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
                            <div className="mt-0.5 text-sm font-semibold tabular-nums">{formatCurrency(n)}</div>
                        </div>
                    )
                })}
            </div>
        </Card>
    )
}

function ExpenseRow({
    row, canManage, onApprove, onReject, onReimburse, onDelete,
}: {
    row: TravelExpenseRow
    canManage: boolean
    onApprove: () => void
    onReject: () => void
    onReimburse: () => void
    onDelete: () => void
}) {
    return (
        <tr className="hover:bg-muted/30">
            <td className="px-3 py-2 text-xs tabular-nums">{formatDate(row.expenseDate)}</td>
            <td className="px-3 py-2 text-xs">{row.description || <span className="text-muted-foreground/50">—</span>}</td>
            <ExpenseCell value={row.ticket} />
            <ExpenseCell value={row.lodging} />
            <ExpenseCell value={row.boarding} />
            <ExpenseCell value={row.phone} />
            <ExpenseCell value={row.localConveyance} />
            <ExpenseCell value={row.incidentals} />
            <ExpenseCell value={row.others} />
            <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatCurrency(Number(row.total))}</td>
            <td className="px-3 py-2"><ExpenseStatusBadge status={row.status} /></td>
            <td className="px-3 py-2">
                {/* Each action is a tinted, bordered button with an explicit
                    icon + label — reads as "this is a real action" instead
                    of a passive link. Tints match the verb's outcome tone
                    (emerald = approve, rose = reject/delete, indigo =
                    reimburse) so HR can pattern-match by colour. */}
                <div className="flex items-center justify-end gap-1.5">
                    {canManage && row.status === 'pending' && (
                        <>
                            <ExpenseActionButton tone="emerald" icon={CheckCircle2} onClick={onApprove}>
                                Approve
                            </ExpenseActionButton>
                            <ExpenseActionButton tone="rose" icon={XCircle} onClick={onReject}>
                                Reject
                            </ExpenseActionButton>
                        </>
                    )}
                    {canManage && row.status === 'approved' && (
                        <ExpenseActionButton tone="indigo" icon={Receipt} onClick={onReimburse}>
                            Reimburse
                        </ExpenseActionButton>
                    )}
                    {canManage && (row.status === 'pending' || row.status === 'rejected') && (
                        <ExpenseActionButton tone="rose" icon={Trash2} onClick={onDelete} iconOnly aria-label="Delete expense" />
                    )}
                </div>
            </td>
        </tr>
    )
}

/**
 * Visually distinct action button used in the expense row. Looks like a
 * "do something" button (background tint + border + icon) rather than a
 * passive ghost link.
 */
function ExpenseActionButton({
    tone, icon: Icon, children, iconOnly, ...rest
}: {
    tone: 'emerald' | 'rose' | 'indigo'
    icon: typeof CheckCircle2
    children?: React.ReactNode
    iconOnly?: boolean
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
    const toneClass = {
        emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/60 dark:hover:bg-emerald-950/50',
        rose:    'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/60 dark:hover:bg-rose-950/50',
        indigo:  'bg-indigo-50 text-indigo-800 border-indigo-200 hover:bg-indigo-100 dark:bg-indigo-950/30 dark:text-indigo-300 dark:border-indigo-900/60 dark:hover:bg-indigo-950/50',
    }[tone]
    return (
        <button
            type="button"
            className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                toneClass,
                iconOnly && 'p-1.5',
            )}
            {...rest}
        >
            <Icon className="size-3.5" />
            {!iconOnly && children}
        </button>
    )
}

// ─── Confirmation dialog for every expense action ───────────────────────────

const ACTION_COPY: Record<ExpenseActionVerb, {
    title: string
    description: (e: TravelExpenseRow) => string
    confirmLabel: string
    variant: 'destructive' | 'warning' | 'success' | 'info'
    needsReason?: boolean
}> = {
    approve: {
        title: 'Approve this expense?',
        description: (e) => `Approving will mark the ${formatCurrency(Number(e.total))} expense as approved and make it eligible for reimbursement.`,
        confirmLabel: 'Approve expense',
        variant: 'success',
    },
    reject: {
        title: 'Reject this expense?',
        description: (e) => `The ${formatCurrency(Number(e.total))} expense will be marked as rejected. The employee will see the reason you provide.`,
        confirmLabel: 'Reject expense',
        variant: 'destructive',
        needsReason: true,
    },
    reimburse: {
        title: 'Mark as reimbursed?',
        description: (e) => `This records that ${formatCurrency(Number(e.total))} has been paid out to the employee for this expense. Reimbursed expenses become read-only.`,
        confirmLabel: 'Mark as reimbursed',
        variant: 'info',
    },
    delete: {
        title: 'Delete this expense?',
        description: (e) => `This will soft-delete the ${formatCurrency(Number(e.total))} expense. The row stays in the audit trail but disappears from this list.`,
        confirmLabel: 'Delete expense',
        variant: 'destructive',
    },
}

/**
 * Single dialog handles every expense verb. Uses the project's `ConfirmDialog`
 * for the yes/no flows; renders a richer dialog with a textarea for `reject`
 * since the rejection-reason is required by the backend.
 */
function ExpenseActionDialog({
    pending,
    onClose,
    onApproveConfirm,
    onRejectConfirm,
    onReimburseConfirm,
    onDeleteConfirm,
    approving,
    rejecting,
    reimbursing,
    deleting,
}: {
    pending: PendingExpenseAction | null
    onClose: () => void
    onApproveConfirm: (id: string) => void | Promise<void>
    onRejectConfirm: (id: string, reason: string) => void | Promise<void>
    onReimburseConfirm: (id: string) => void | Promise<void>
    onDeleteConfirm: (id: string) => void | Promise<void>
    approving: boolean
    rejecting: boolean
    reimbursing: boolean
    deleting: boolean
}) {
    const { t } = useTranslation()
    const [reason, setReason] = useState('')

    // Reset the reason textarea whenever the verb / target changes — keeps
    // a previous rejection's text from leaking into a new dialog.
    const [lastKey, setLastKey] = useState('')
    const currentKey = pending ? `${pending.verb}:${pending.expense.id}` : ''
    if (lastKey !== currentKey) {
        setLastKey(currentKey)
        setReason('')
    }

    if (!pending) {
        // ConfirmDialog still needs to be rendered for the close animation
        // but we don't have a verb to pick copy for — render nothing.
        return null
    }

    const copy = ACTION_COPY[pending.verb]

    // Reject is the special case — needs a styled dialog with a reason
    // textarea instead of a one-click confirm.
    if (pending.verb === 'reject') {
        return (
            <Dialog open onOpenChange={(v) => { if (!v) onClose() }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('travel.expense.reject.title', copy.title)}</DialogTitle>
                        <DialogDescription>
                            {t('travel.expense.reject.desc', copy.description(pending.expense))}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label>
                            {t('travel.expense.reject.reason', 'Reason for rejection')}
                            <span className="ms-0.5 text-rose-600">*</span>
                        </Label>
                        <Textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            placeholder={t('travel.expense.reject.placeholder', 'Reason for rejection…') as string}
                            autoFocus
                        />
                    </div>
                    <Separator />
                    <div className="flex justify-end gap-2 pt-1">
                        <Button variant="ghost" onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
                        <Button
                            variant="destructive"
                            disabled={!reason.trim()}
                            loading={rejecting}
                            onClick={() => onRejectConfirm(pending.expense.id, reason.trim())}
                            className="gap-1.5"
                        >
                            <XCircle className="size-3.5" />
                            {t('travel.expense.reject.confirm', copy.confirmLabel)}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        )
    }

    // Everyone else — yes/no confirmation via the shared ConfirmDialog.
    const onConfirm = () => {
        if (pending.verb === 'approve') return onApproveConfirm(pending.expense.id)
        if (pending.verb === 'reimburse') return onReimburseConfirm(pending.expense.id)
        if (pending.verb === 'delete') return onDeleteConfirm(pending.expense.id)
    }
    const isLoading = (pending.verb === 'approve' && approving)
        || (pending.verb === 'reimburse' && reimbursing)
        || (pending.verb === 'delete' && deleting)

    return (
        <ConfirmDialog
            open
            onOpenChange={(v) => { if (!v) onClose() }}
            title={copy.title}
            description={copy.description(pending.expense)}
            variant={copy.variant}
            confirmLabel={isLoading ? `${copy.confirmLabel}…` : copy.confirmLabel}
            onConfirm={onConfirm}
        />
    )
}

function ExpenseCell({ value }: { value: string }) {
    const n = Number(value)
    return (
        <td className={cn('px-3 py-2 text-right tabular-nums text-xs', n === 0 && 'text-muted-foreground/40')}>
            {n > 0 ? formatCurrency(n) : '—'}
        </td>
    )
}

const EXPENSE_STATUS_BADGE: Record<TravelExpenseRow['status'], string> = {
    pending:    'bg-amber-100 text-amber-800 ring-1 ring-amber-300/60 dark:bg-amber-950/40 dark:text-amber-300',
    approved:   'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    rejected:   'bg-rose-100 text-rose-700 ring-1 ring-rose-300/60 dark:bg-rose-950/40 dark:text-rose-300',
    reimbursed: 'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-300/60 dark:bg-indigo-950/40 dark:text-indigo-300',
}

function ExpenseStatusBadge({ status }: { status: TravelExpenseRow['status'] }) {
    return (
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide', EXPENSE_STATUS_BADGE[status])}>
            {status}
        </span>
    )
}

// ─── Dialogs ────────────────────────────────────────────────────────────────

function AddTravelRequestDialog({
    open, onOpenChange, canPickEmployee,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
    canPickEmployee: boolean
}) {
    const { t } = useTranslation()
    const create = useCreateTravelRequest()
    const [employeeId, setEmployeeId] = useState('')
    const [placeOfVisit, setPlaceOfVisit] = useState('')
    const [departureDate, setDepartureDate] = useState('')
    const [arrivalDate, setArrivalDate] = useState('')
    const [purposeOfVisit, setPurposeOfVisit] = useState('')
    const [customerName, setCustomerName] = useState('')
    const [isBillable, setIsBillable] = useState(false)
    const [notes, setNotes] = useState('')

    // Inclusive duration preview — mirror what the server will compute.
    const durationDays = useMemo(() => {
        if (!departureDate || !arrivalDate) return 0
        const d = new Date(departureDate + 'T00:00:00Z').getTime()
        const a = new Date(arrivalDate + 'T00:00:00Z').getTime()
        if (!Number.isFinite(d) || !Number.isFinite(a) || a < d) return 0
        return Math.round((a - d) / 86400000) + 1
    }, [departureDate, arrivalDate])

    const reset = () => {
        setEmployeeId('')
        setPlaceOfVisit('')
        setDepartureDate('')
        setArrivalDate('')
        setPurposeOfVisit('')
        setCustomerName('')
        setIsBillable(false)
        setNotes('')
    }

    const canSubmit = !!departureDate && !!arrivalDate && durationDays > 0
        && (canPickEmployee ? !!employeeId : true)

    const handleSubmit = async () => {
        if (!canSubmit) return
        try {
            await create.mutateAsync({
                employeeId: canPickEmployee ? employeeId : undefined,
                placeOfVisit: placeOfVisit || null,
                departureDate,
                arrivalDate,
                purposeOfVisit: purposeOfVisit || null,
                customerName: customerName || null,
                isBillableToCustomer: isBillable,
                notes: notes || null,
            })
            toast.success(t('travel.create.success', 'Travel request created'))
            reset()
            onOpenChange(false)
        } catch {
            /* toast handled by hook */
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
            <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
                {/* Header — branded gradient strip + icon avatar. Gives the
                    dialog a clear identity so it doesn't feel like a generic
                    form. The whole card sits on a subtle gradient so the body
                    sections (cards) stand out against it. */}
                <DialogHeader className="space-y-0 p-6 pb-4 border-b bg-gradient-to-br from-sky-50/60 to-indigo-50/40 dark:from-sky-950/20 dark:to-indigo-950/15">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-sm shadow-indigo-500/20">
                            <Plane className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-base font-semibold">{t('travel.create.title', 'New travel request')}</DialogTitle>
                            <DialogDescription className="mt-0.5 text-xs">{t('travel.create.desc', 'Submit a trip request for approval. Expenses can be added once the request is approved.')}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="max-h-[calc(85vh-12rem)] overflow-y-auto px-6 py-4 space-y-4 bg-muted/20">

                    {/* Section: Trip target — who's going and where */}
                    <FormSection title={t('travel.create.sectionTrip', 'Trip details')} icon={MapPin}>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {canPickEmployee && (
                                <div className="sm:col-span-2">
                                    <FieldLabel required>{t('travel.create.employee', 'Employee')}</FieldLabel>
                                    <EmployeeSelect value={employeeId} onValueChange={setEmployeeId} />
                                </div>
                            )}
                            <div>
                                <FieldLabel>{t('travel.create.place', 'Place of visit')}</FieldLabel>
                                <Input value={placeOfVisit} onChange={(e) => setPlaceOfVisit(e.target.value)} placeholder="Place of visit" />
                            </div>
                            <div>
                                <FieldLabel>{t('travel.create.customer', 'Customer name')}</FieldLabel>
                                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" />
                            </div>
                            <div className="sm:col-span-2">
                                <FieldLabel>{t('travel.create.purpose', 'Purpose of visit')}</FieldLabel>
                                <Textarea
                                    value={purposeOfVisit}
                                    onChange={(e) => setPurposeOfVisit(e.target.value)}
                                    rows={2}
                                    placeholder={t('travel.create.purposePlaceholder', 'Purpose of visit…') as string}
                                />
                            </div>
                        </div>
                    </FormSection>

                    {/* Section: Schedule — dates + auto-computed duration */}
                    <FormSection title={t('travel.create.sectionSchedule', 'Schedule')} icon={CalendarDays}>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
                            <div>
                                <FieldLabel required>{t('travel.create.departure', 'Departure date')}</FieldLabel>
                                <DatePicker value={departureDate} onChange={setDepartureDate} />
                            </div>
                            <div>
                                <FieldLabel required>{t('travel.create.arrival', 'Arrival date')}</FieldLabel>
                                <DatePicker value={arrivalDate} onChange={setArrivalDate} />
                            </div>
                            {/* Duration chip — always rendered (showing "—" until
                                both dates picked) so the layout doesn't reflow when
                                the user clicks the second date. */}
                            <div className="sm:self-end">
                                <FieldLabel>{t('travel.create.duration', 'Duration')}</FieldLabel>
                                <div className={cn(
                                    'flex h-9 min-w-[6.5rem] items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-semibold tabular-nums transition-colors',
                                    durationDays > 0
                                        ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/30 dark:text-sky-300'
                                        : 'border-dashed bg-muted/30 text-muted-foreground',
                                )}>
                                    {durationDays > 0 ? (
                                        <>
                                            <span>{durationDays}</span>
                                            <span className="text-[10px] font-medium uppercase tracking-wider opacity-80">
                                                {durationDays === 1 ? t('travel.create.day', 'day') : t('travel.create.days', 'days')}
                                            </span>
                                        </>
                                    ) : (
                                        <span className="text-xs font-normal">—</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    </FormSection>

                    {/* Section: Customer billing — toggle row + notes */}
                    <FormSection title={t('travel.create.sectionExtra', 'Additional info')} icon={FileText}>
                        <div className="space-y-3">
                            {/* Custom toggle row — full width, clickable label,
                                visual feedback on the "on" state. Matches the
                                aesthetic of the Org Policy toggles. */}
                            <button
                                type="button"
                                onClick={() => setIsBillable((v) => !v)}
                                className={cn(
                                    'group flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2.5 text-left transition-colors',
                                    isBillable
                                        ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                                        : 'border-border bg-card hover:bg-muted/40',
                                )}
                            >
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <Building2 className={cn(
                                        'size-4 shrink-0',
                                        isBillable ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
                                    )} />
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium">{t('travel.create.billable', 'Billable to customer')}</div>
                                        <div className="text-[11px] text-muted-foreground">
                                            {t('travel.create.billableHint', 'Mark when costs will be invoiced to the customer named above.')}
                                        </div>
                                    </div>
                                </div>
                                <Switch checked={isBillable} onCheckedChange={setIsBillable} />
                            </button>

                            <div>
                                <FieldLabel>{t('travel.create.notes', 'Notes')}</FieldLabel>
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={2}
                                    placeholder={t('travel.create.notesPlaceholder', 'Additional notes for HR…') as string}
                                />
                            </div>
                        </div>
                    </FormSection>
                </div>

                {/* Footer — sticky-feeling bar with a contextual hint on the
                    left and the action pair on the right. */}
                <div className="flex items-center justify-between gap-3 border-t bg-background px-6 py-3">
                    <p className="hidden text-[11px] text-muted-foreground sm:block">
                        {t('travel.create.footerHint', 'After submitting you can add expense line items once HR approves the request.')}
                    </p>
                    <div className="flex flex-1 justify-end gap-2 sm:flex-initial">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
                        <Button onClick={handleSubmit} disabled={!canSubmit} loading={create.isPending} className="gap-1.5">
                            <Send className="size-3.5" />
                            {t('travel.create.submit', 'Create request')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Pretty grouped section used inside Add/Edit dialogs. The icon sits on a
 * tinted square so the heading reads at a glance, and the content lives in
 * a card with a thin border — gives related fields a visual home without
 * the heavyweight feel of full Card components.
 */
function FormSection({
    title, icon: Icon, children,
}: {
    title: string
    icon: typeof CalendarDays
    children: React.ReactNode
}) {
    return (
        <section className="rounded-lg border bg-card p-4">
            <header className="mb-3 flex items-center gap-2">
                <div className="flex size-6 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon className="size-3.5" />
                </div>
                <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</h3>
            </header>
            {children}
        </section>
    )
}

/** Lightweight label that handles the required-asterisk consistently. */
function FieldLabel({
    children, required,
}: {
    children: React.ReactNode
    required?: boolean
}) {
    return (
        <Label className="mb-1.5 block text-xs font-medium text-foreground">
            {children}
            {required && <span className="ms-0.5 text-rose-600">*</span>}
        </Label>
    )
}

/**
 * Add Travel Expense dialog.
 *
 * Two modes — driven by whether `preselectedRequestId` is set:
 *
 *   • Pre-selected (from a trip's detail panel): the Travel ID is fixed and
 *     rendered as a locked badge with the trip's metadata. The user knows
 *     which trip they're billing against because they navigated here from it.
 *
 *   • Free-pick (from the AllExpensesView "Add expense" button): the user
 *     picks a Travel ID from a dropdown listing every approved or completed
 *     trip they can see. Once selected, the trip's place + purpose render as
 *     read-only context so they can confirm before saving.
 *
 * In both modes, the chosen Travel ID is the FK that the row commits against
 * server-side. Without it, submit is disabled — the dialog cannot create an
 * orphan expense.
 */
function AddTravelExpenseDialog({
    open, onOpenChange, preselectedRequestId,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
    preselectedRequestId: string | null
}) {
    const { t } = useTranslation()
    const create = useCreateTravelExpense()
    // Default to today so HR doesn't have to pick a date for the most common
    // case (logging an expense as it happens).
    const today = new Date().toISOString().slice(0, 10)
    const [selectedRequestId, setSelectedRequestId] = useState<string>(preselectedRequestId ?? '')
    const [expenseDate, setExpenseDate] = useState(today)
    const [description, setDescription] = useState('')
    const [ticket, setTicket] = useState<number | ''>('')
    const [lodging, setLodging] = useState<number | ''>('')
    const [boarding, setBoarding] = useState<number | ''>('')
    const [phone, setPhone] = useState<number | ''>('')
    const [localConveyance, setLocalConveyance] = useState<number | ''>('')
    const [incidentals, setIncidentals] = useState<number | ''>('')
    const [others, setOthers] = useState<number | ''>('')

    // Sync the locked id when the parent re-opens the dialog with a different
    // pre-selection (state-during-render pattern — preferred over useEffect).
    const [lastPreselected, setLastPreselected] = useState(preselectedRequestId ?? '')
    if (lastPreselected !== (preselectedRequestId ?? '')) {
        setLastPreselected(preselectedRequestId ?? '')
        setSelectedRequestId(preselectedRequestId ?? '')
    }

    // Trips eligible to receive an expense: approved or completed only.
    // The backend rejects expenses against any other status — fetching the
    // shorter list here keeps the dropdown clean.
    const requestsApproved = useTravelRequests({ status: 'approved', limit: 100 })
    const requestsCompleted = useTravelRequests({ status: 'completed', limit: 100 })
    const eligibleRequests = useMemo(() => {
        const rows = [
            ...(requestsApproved.data?.data ?? []),
            ...(requestsCompleted.data?.data ?? []),
        ]
        // De-dup defensively in case the same row leaks through both queries.
        const seen = new Set<string>()
        return rows.filter((r) => (seen.has(r.id) ? false : seen.add(r.id) && true))
    }, [requestsApproved.data, requestsCompleted.data])

    const selectedRequest = useMemo(
        () => eligibleRequests.find((r) => r.id === selectedRequestId) ?? null,
        [eligibleRequests, selectedRequestId],
    )

    const lineTotal = useMemo(() => (
        Number(ticket || 0) + Number(lodging || 0) + Number(boarding || 0)
        + Number(phone || 0) + Number(localConveyance || 0)
        + Number(incidentals || 0) + Number(others || 0)
    ), [ticket, lodging, boarding, phone, localConveyance, incidentals, others])

    const reset = () => {
        setSelectedRequestId(preselectedRequestId ?? '')
        setExpenseDate(today)
        setDescription('')
        setTicket(''); setLodging(''); setBoarding(''); setPhone('')
        setLocalConveyance(''); setIncidentals(''); setOthers('')
    }

    const canSubmit = !!selectedRequestId && !!expenseDate && lineTotal > 0

    const handleSubmit = async () => {
        if (!canSubmit) {
            if (!selectedRequestId) {
                toast.error(t('travel.expense.errors.noTrip', 'Pick a travel request first'))
            } else {
                toast.error(t('travel.expense.errors.invalid', 'Add at least one positive amount and a date'))
            }
            return
        }
        try {
            await create.mutateAsync({
                travelRequestId: selectedRequestId,
                expenseDate,
                description: description || null,
                ticket: ticket || 0,
                lodging: lodging || 0,
                boarding: boarding || 0,
                phone: phone || 0,
                localConveyance: localConveyance || 0,
                incidentals: incidentals || 0,
                others: others || 0,
            })
            toast.success(t('travel.expense.success', 'Expense added'))
            reset()
            onOpenChange(false)
        } catch {
            /* hook toasts */
        }
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
            <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden">
                {/* Same header pattern as AddTravelRequestDialog — amber/orange
                    tint here to signal "this is the money side", not the
                    trip-planning side. */}
                <DialogHeader className="space-y-0 p-6 pb-4 border-b bg-gradient-to-br from-amber-50/60 to-orange-50/40 dark:from-amber-950/20 dark:to-orange-950/15">
                    <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-sm shadow-orange-500/20">
                            <Receipt className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-base font-semibold">{t('travel.expense.title', 'Add travel expense')}</DialogTitle>
                            <DialogDescription className="mt-0.5 text-xs">{t('travel.expense.desc', 'Add one expense line — leave any category at 0 if it doesn\'t apply.')}</DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="max-h-[calc(85vh-12rem)] overflow-y-auto px-6 py-4 space-y-4 bg-muted/20">

                    {/* Trip target — the Travel ID this expense will commit
                        against. Locked when pre-selected, picker when free. */}
                    <FormSection title={t('travel.expense.sectionTrip', 'Trip')} icon={Plane}>
                        <TravelTripField
                            preselected={!!preselectedRequestId}
                            value={selectedRequestId}
                            onChange={setSelectedRequestId}
                            selectedRequest={selectedRequest}
                            options={eligibleRequests}
                            loading={requestsApproved.isLoading || requestsCompleted.isLoading}
                        />
                    </FormSection>

                    <FormSection title={t('travel.expense.sectionMeta', 'Expense details')} icon={CalendarDays}>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]">
                            <div>
                                <FieldLabel required>{t('travel.expense.date', 'Date')}</FieldLabel>
                                <DatePicker value={expenseDate} onChange={setExpenseDate} />
                            </div>
                            <div>
                                <FieldLabel>{t('travel.expense.description', 'Description')}</FieldLabel>
                                <Input
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder={t('travel.expense.descPlaceholder', 'Expense description') as string}
                                />
                            </div>
                        </div>
                    </FormSection>

                    {/* Categories — 4-column grid on desktop, 2-column on mobile.
                        The category icon next to each label makes the form
                        scannable; HR can find "lodging" without re-reading. */}
                    <FormSection title={t('travel.expense.sectionAmounts', 'Amounts (AED)')} icon={Receipt}>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <AmountField label={t('travel.expense.ticket', 'Ticket')} value={ticket} onChange={setTicket} />
                            <AmountField label={t('travel.expense.lodging', 'Lodging')} value={lodging} onChange={setLodging} />
                            <AmountField label={t('travel.expense.boarding', 'Boarding')} value={boarding} onChange={setBoarding} />
                            <AmountField label={t('travel.expense.phone', 'Phone')} value={phone} onChange={setPhone} />
                            <AmountField label={t('travel.expense.localConveyance', 'Local conveyance')} value={localConveyance} onChange={setLocalConveyance} />
                            <AmountField label={t('travel.expense.incidentals', 'Incidentals')} value={incidentals} onChange={setIncidentals} />
                            <AmountField label={t('travel.expense.others', 'Others')} value={others} onChange={setOthers} />
                            <div className={cn(
                                'flex flex-col justify-center rounded-md border p-3 transition-colors',
                                lineTotal > 0
                                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30'
                                    : 'border-dashed bg-muted/30',
                            )}>
                                <div className={cn(
                                    'text-[10px] font-bold uppercase tracking-widest',
                                    lineTotal > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground',
                                )}>
                                    {t('travel.expense.total', 'Total')}
                                </div>
                                <div className={cn(
                                    'mt-0.5 text-lg font-bold tabular-nums leading-tight',
                                    lineTotal > 0 ? 'text-emerald-900 dark:text-emerald-100' : 'text-muted-foreground/60',
                                )}>
                                    {formatCurrency(lineTotal)}
                                </div>
                            </div>
                        </div>
                    </FormSection>
                </div>

                <div className="flex items-center justify-between gap-3 border-t bg-background px-6 py-3">
                    <p className="hidden text-[11px] text-muted-foreground sm:block">
                        {t('travel.expense.footerHint', 'Categories you leave blank will be saved as 0 — only the total has to be positive.')}
                    </p>
                    <div className="flex flex-1 justify-end gap-2 sm:flex-initial">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>{t('common.cancel', 'Cancel')}</Button>
                        <Button onClick={handleSubmit} disabled={!canSubmit} loading={create.isPending} className="gap-1.5">
                            <Plus className="size-3.5" />
                            {t('travel.expense.submit', 'Add expense')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Trip selector field used inside the Add Expense dialog. Renders one of:
 *
 *   • A locked card with the trip number + dates + place — when the dialog
 *     was opened from a specific trip's detail panel and the Travel ID is
 *     not user-editable.
 *
 *   • A Select dropdown listing every approved/completed trip — when the
 *     dialog was opened from the AllExpensesView and the user needs to
 *     pick which trip to bill against. Once a value is picked, a context
 *     card slides in beneath the dropdown showing the trip's place +
 *     purpose + dates so the user can confirm before submitting.
 */
function TravelTripField({
    preselected,
    value,
    onChange,
    selectedRequest,
    options,
    loading,
}: {
    preselected: boolean
    value: string
    onChange: (id: string) => void
    selectedRequest: TravelRequestListRow | null
    options: TravelRequestListRow[]
    loading: boolean
}) {
    const { t } = useTranslation()

    if (preselected && selectedRequest) {
        // Locked card — Travel ID is fixed by the parent context.
        return (
            <div className="rounded-md border bg-card p-3">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-semibold">{selectedRequest.travelNo}</span>
                            <StatusBadge status={selectedRequest.status} />
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {selectedRequest.placeOfVisit && (
                                <span className="inline-flex items-center gap-1">
                                    <MapPin className="size-3" />
                                    {selectedRequest.placeOfVisit}
                                </span>
                            )}
                            <span className="inline-flex items-center gap-1">
                                <CalendarDays className="size-3" />
                                {formatDate(selectedRequest.departureDate)} → {formatDate(selectedRequest.arrivalDate)}
                            </span>
                        </div>
                        {selectedRequest.purposeOfVisit && (
                            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                                {selectedRequest.purposeOfVisit}
                            </p>
                        )}
                    </div>
                    <Badge variant="secondary" className="shrink-0 text-[10px] uppercase tracking-wide">
                        {t('travel.expense.locked', 'Locked')}
                    </Badge>
                </div>
            </div>
        )
    }

    // Free picker — Select dropdown over eligible trips.
    return (
        <div className="space-y-3">
            <div>
                <FieldLabel required>{t('travel.expense.tripLabel', 'Travel ID')}</FieldLabel>
                <Select value={value} onValueChange={onChange}>
                    <SelectTrigger>
                        <SelectValue placeholder={loading
                            ? t('common.loading', 'Loading...') as string
                            : t('travel.expense.pickTrip', 'Pick the trip this expense belongs to') as string} />
                    </SelectTrigger>
                    <SelectContent>
                        {options.length === 0 ? (
                            <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                                {t('travel.expense.noEligibleTrips', 'No approved or completed trips to bill against yet.')}
                            </div>
                        ) : options.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-semibold">{r.travelNo}</span>
                                    <span className="text-xs text-muted-foreground">
                                        · {r.employeeName}
                                        {r.placeOfVisit ? ` · ${r.placeOfVisit}` : ''}
                                    </span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* Context card — slides in once a trip is picked so the user
                can confirm the place/purpose/dates match what they meant. */}
            {selectedRequest && (
                <div className="rounded-md border border-sky-200/60 bg-sky-50/40 p-3 dark:border-sky-900/40 dark:bg-sky-950/15">
                    <div className="flex items-center gap-2 mb-1">
                        <StatusBadge status={selectedRequest.status} />
                        <span className="text-[11px] text-muted-foreground">
                            {selectedRequest.employeeName}
                        </span>
                    </div>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-2">
                        <div>
                            <span className="text-muted-foreground">{t('travel.expense.place', 'Place')}: </span>
                            <span className="font-medium">{selectedRequest.placeOfVisit || '—'}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground">{t('travel.expense.dates', 'Dates')}: </span>
                            <span className="font-medium tabular-nums">
                                {formatDate(selectedRequest.departureDate)} → {formatDate(selectedRequest.arrivalDate)}
                            </span>
                        </div>
                        {selectedRequest.purposeOfVisit && (
                            <div className="sm:col-span-2">
                                <span className="text-muted-foreground">{t('travel.expense.purpose', 'Purpose')}: </span>
                                <span>{selectedRequest.purposeOfVisit}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

function AmountField({
    label, value, onChange,
}: {
    label: string
    value: number | ''
    onChange: (v: number | '') => void
}) {
    // NumericInput sanitises keystrokes server-side but fires a standard
    // `change` event — we adapt that into the `number | ''` model the form
    // state expects.
    return (
        <div>
            <Label className="text-[11px] uppercase tracking-wide">{label}</Label>
            <NumericInput
                value={value === '' ? '' : String(value)}
                onChange={(e) => {
                    const raw = e.target.value
                    if (raw === '' || raw === '-') { onChange(''); return }
                    const n = Number(raw)
                    onChange(Number.isFinite(n) ? n : '')
                }}
                placeholder="Amount"
                min={0}
            />
        </div>
    )
}

function RejectRequestDialog({
    requestId, onClose,
}: {
    requestId: string
    onClose: () => void
}) {
    const { t } = useTranslation()
    const reject = useRejectTravelRequest()
    const [reason, setReason] = useState('')
    return (
        <Dialog open onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('travel.reject.title', 'Reject travel request?')}</DialogTitle>
                    <DialogDescription>{t('travel.reject.desc', 'The employee will see this reason in their notification.')}</DialogDescription>
                </DialogHeader>
                <div>
                    <Label>{t('travel.reject.reason', 'Reason')}<span className="text-rose-600 ms-0.5">*</span></Label>
                    <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
                </div>
                <Separator />
                <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" onClick={onClose}>{t('common.cancel', 'Cancel')}</Button>
                    <Button
                        variant="destructive"
                        disabled={!reason.trim()}
                        loading={reject.isPending}
                        onClick={async () => {
                            await reject.mutateAsync({ id: requestId, rejectionReason: reason })
                            onClose()
                        }}
                    >
                        {t('travel.reject.confirm', 'Reject')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
