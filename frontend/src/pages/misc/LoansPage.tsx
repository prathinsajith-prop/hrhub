import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/overlays'
import { toast } from '@/components/ui/overlays'
import { zodToFieldErrors } from '@/lib/schemas'
import { AdvancedSearchBar } from '@/components/filters/AdvancedSearchBar'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { buildFilterQueryString } from '@/lib/filters'
import {
    Banknote, Clock, CheckCircle2, AlertCircle,
    Plus, Check, X, Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    type EmployeeLoan,
    LOAN_STATUS_STYLE,
    useLoans,
    useCreateLoan,
    useApproveLoan,
    useRejectLoan,
    useDeleteLoan,
} from '@/hooks/useLoans'
import { EmployeeSelect } from '@/components/shared'
import { EmployeeLink } from '@/components/shared/EmployeeLink'
import { LoanScheduleDialog } from '@/components/shared/EmployeeLoansPanel'
import { usePermissions } from '@/hooks/usePermissions'
import type { FilterConfig } from '@/lib/filters'

const LOAN_FILTERS: FilterConfig[] = [
    {
        name: 'status',
        label: 'Status',
        type: 'multi_select',
        options: [
            { value: 'pending', label: 'Pending' },
            { value: 'active', label: 'Active' },
            { value: 'completed', label: 'Completed' },
            { value: 'rejected', label: 'Rejected' },
            { value: 'cancelled', label: 'Cancelled' },
        ],
    },
]

const createLoanSchema = z.object({
    employeeId: z.string().min(1, 'Employee is required'),
    amount: z.string().min(1, 'Amount is required').refine(v => parseFloat(v) > 0, 'Amount must be greater than 0'),
    monthlyDeduction: z.string().min(1, 'Monthly deduction is required').refine(v => parseFloat(v) > 0, 'Monthly deduction must be greater than 0'),
    reason: z.string().optional(),
    notes: z.string().optional(),
})

// ─── Create Loan Dialog ───────────────────────────────────────────────────────

function CreateLoanDialog({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation()
    const create = useCreateLoan()
    const [form, setForm] = useState({ employeeId: '', amount: '', monthlyDeduction: '', reason: '', notes: '' })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const amount = parseFloat(form.amount || '0')
    const monthly = parseFloat(form.monthlyDeduction || '0')
    const installments = monthly > 0 && amount > 0 ? Math.ceil(amount / monthly) : null

    function handleSubmit() {
        const result = zodToFieldErrors(createLoanSchema, form)
        if (!result.ok) { setErrors(result.errors); return }
        setErrors({})
        create.mutate(form, {
            onSuccess: () => { toast.success(t('loans.created')); onClose() },
            onError: () => toast.error(t('loans.saveFailed')),
        })
    }

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[640px]">
                <DialogHeader>
                    <DialogTitle>{t('loans.newLoan')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <FormField label={t('loans.employee')} required error={errors.employeeId}>
                        <EmployeeSelect
                            value={form.employeeId}
                            onValueChange={v => { setForm(f => ({ ...f, employeeId: v })); setErrors(e => ({ ...e, employeeId: '' })) }}
                        />
                    </FormField>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField label={`${t('loans.amount')} (AED)`} required error={errors.amount}>
                            <NumericInput
                                maxDecimals={2}
                                aria-invalid={!!errors.amount}
                                value={form.amount}
                                onChange={e => { setForm(f => ({ ...f, amount: e.target.value })); setErrors(er => ({ ...er, amount: '' })) }}
                                placeholder="0.00"
                            />
                        </FormField>
                        <FormField label={`${t('loans.monthlyDeduction')} (AED)`} required error={errors.monthlyDeduction}>
                            <NumericInput
                                maxDecimals={2}
                                aria-invalid={!!errors.monthlyDeduction}
                                value={form.monthlyDeduction}
                                onChange={e => { setForm(f => ({ ...f, monthlyDeduction: e.target.value })); setErrors(er => ({ ...er, monthlyDeduction: '' })) }}
                                placeholder="0.00"
                            />
                        </FormField>
                    </div>
                    {installments !== null && (
                        <p className="text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                            {t('loans.installmentCalc', { count: installments })}
                        </p>
                    )}
                    <FormField label={t('loans.reason')}>
                        <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder={t('loans.reasonPlaceholder')} />
                    </FormField>
                    <FormField label={t('common.notes')}>
                        <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </FormField>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={create.isPending}>
                        {create.isPending ? t('common.saving') : t('common.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Reject Dialog ────────────────────────────────────────────────────────────

function RejectDialog({ loan, onClose }: { loan: EmployeeLoan; onClose: () => void }) {
    const { t } = useTranslation()
    const reject = useRejectLoan()
    const [notes, setNotes] = useState('')

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>{t('loans.rejectTitle')}</DialogTitle>
                </DialogHeader>
                <div className="py-2 space-y-3">
                    <p className="text-sm text-muted-foreground">{t('loans.rejectDesc', { name: loan.employeeName })}</p>
                    <FormField label={t('common.notes')}>
                        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('loans.rejectNotesPlaceholder')} />
                    </FormField>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="destructive" onClick={() => reject.mutate({ id: loan.id, notes }, { onSuccess: () => { toast.success(t('loans.rejected')); onClose() } })} disabled={reject.isPending}>
                        {reject.isPending ? t('loans.rejecting') : t('common.reject')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LoansPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { can } = usePermissions()
    const canManage = can('manage_loans')

    const [createOpen, setCreateOpen] = useState(false)
    const [rejectTarget, setRejectTarget] = useState<EmployeeLoan | null>(null)
    const [paymentTarget, setPaymentTarget] = useState<EmployeeLoan | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<EmployeeLoan | null>(null)

    const loanSearch = useSearchFilters({ storageKey: 'loans.search', availableFilters: LOAN_FILTERS })
    const filterStr = buildFilterQueryString(loanSearch.appliedFilters)

    const { data, isLoading } = useLoans({
        q: loanSearch.searchInput || undefined,
        filter: filterStr || undefined,
    })
    const approve = useApproveLoan()
    const deleteLoan = useDeleteLoan()

    const loans = data?.data ?? []
    const summary = data?.summary

    function handleApprove(loan: EmployeeLoan) {
        approve.mutate({ id: loan.id }, {
            onSuccess: () => toast.success(t('loans.approved')),
            onError: () => toast.error(t('loans.actionFailed')),
        })
    }


    return (
        <PageWrapper>
            <PageHeader
                title={t('loans.pageTitle')}
                description={t('loans.pageDesc')}
                actions={canManage ? (
                    <Button onClick={() => setCreateOpen(true)}>
                        <Plus className="size-4 mr-1.5" />
                        {t('loans.newLoan')}
                    </Button>
                ) : undefined}
            />

            {/* KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => <Skeleton key={`skeleton-${i}`} className="h-20 rounded-xl" />)
                ) : (
                    <>
                        <KpiCardCompact label={t('loans.kpi.total')} value={summary?.total ?? 0} icon={Banknote} />
                        <KpiCardCompact label={t('loans.kpi.pending')} value={summary?.pending ?? 0} icon={Clock} color="amber" />
                        <KpiCardCompact label={t('loans.kpi.active')} value={summary?.active ?? 0} icon={AlertCircle} color="blue" />
                        <KpiCardCompact
                            label={t('loans.kpi.outstanding')}
                            value={`AED ${(summary?.totalOutstanding ?? 0).toLocaleString()}`}
                            icon={CheckCircle2}
                            color="red"
                        />
                    </>
                )}
            </div>

            {/* Search + Filters */}
            <AdvancedSearchBar
                search={loanSearch}
                filters={LOAN_FILTERS}
                placeholder={t('loans.searchPlaceholder', 'Search loans…')}
                resultCount={data?.total}
            />

            {/* Table */}
            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('loans.table.employee')}</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Basic Salary</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('loans.amount')}</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('loans.monthlyDeduction')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('loans.table.progress')}</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('loans.table.remaining')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('common.status')}</th>
                                {canManage && <th className="px-4 py-3" />}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        {Array.from({ length: canManage ? 8 : 7 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : loans.length === 0 ? (
                                <tr>
                                    <td colSpan={canManage ? 8 : 7} className="px-4 py-12 text-center text-muted-foreground">
                                        <Banknote className="size-10 mx-auto mb-2 opacity-30" />
                                        <p>{t('loans.noLoans')}</p>
                                    </td>
                                </tr>
                            ) : (
                                loans.map(loan => {
                                    const paid = loan.paidInstallments ?? 0
                                    const total = loan.totalInstallments ?? 0
                                    const pct = total > 0 ? Math.round((paid / total) * 100) : 0
                                    return (
                                        <tr key={loan.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => loan.employeeId && navigate(`/employees/${loan.employeeId}`)}>
                                            <td className="px-4 py-3">
                                                <div className="font-medium">
                                                    {loan.employeeId
                                                        ? <EmployeeLink id={loan.employeeId} name={loan.employeeName ?? '—'} />
                                                        : loan.employeeName
                                                    }
                                                </div>
                                                <div className="text-xs text-muted-foreground">{loan.employeeNo}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right tabular-nums">
                                                {loan.employeeBasicSalary != null
                                                    ? <span className="font-medium text-foreground/90">AED {Number(loan.employeeBasicSalary).toLocaleString()}</span>
                                                    : <span className="text-muted-foreground">—</span>}
                                                {loan.employeeTotalSalary != null && (
                                                    <div className="text-[10px] text-muted-foreground">
                                                        Total AED {Number(loan.employeeTotalSalary).toLocaleString()}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                                                AED {Number(loan.amount).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                                                AED {Number(loan.monthlyDeduction).toLocaleString()}
                                                {loan.employeeBasicSalary && Number(loan.employeeBasicSalary) > 0 && (
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {Math.round((Number(loan.monthlyDeduction) / Number(loan.employeeBasicSalary)) * 100)}% of basic
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                {total > 0 ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full bg-primary transition-all"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                            {paid}/{total}
                                                        </span>
                                                    </div>
                                                ) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {loan.remainingBalance
                                                    ? `AED ${Number(loan.remainingBalance).toLocaleString()}`
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', LOAN_STATUS_STYLE[loan.status])}>
                                                    {t(`loans.statuses.${loan.status}`)}
                                                </span>
                                            </td>
                                            {canManage && (
                                                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                                    <div className="flex items-center gap-1 justify-end">
                                                        {loan.status === 'pending' && (
                                                            <>
                                                                <Button variant="success" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleApprove(loan) }} disabled={approve.isPending}>
                                                                    <Check className="size-3.5 mr-1" />
                                                                    Approve
                                                                </Button>
                                                                <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setRejectTarget(loan) }}>
                                                                    <X className="size-3.5 mr-1" />
                                                                    Reject
                                                                </Button>
                                                                <Button variant="ghost" size="icon-sm" className="size-7 text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); setDeleteTarget(loan) }} aria-label="Delete loan">
                                                                    <Trash2 className="size-3.5" />
                                                                </Button>
                                                            </>
                                                        )}
                                                        {loan.status === 'active' && (
                                                            <Button variant="info" size="sm" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); setPaymentTarget(loan) }}>
                                                                {t('loans.recordPayment')}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {createOpen && <CreateLoanDialog onClose={() => setCreateOpen(false)} />}
            {rejectTarget && <RejectDialog loan={rejectTarget} onClose={() => setRejectTarget(null)} />}

            {paymentTarget && (
                <LoanScheduleDialog
                    loan={paymentTarget}
                    open={!!paymentTarget}
                    onClose={() => setPaymentTarget(null)}
                    canManage={canManage}
                />
            )}

            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
                title={t('loans.deleteTitle')}
                description={t('loans.deleteDesc', {
                    amount: deleteTarget ? `AED ${Number(deleteTarget.amount).toLocaleString()}` : '',
                    name: deleteTarget?.employeeName ?? '',
                })}
                confirmLabel={t('common.delete')}
                variant="destructive"
                onConfirm={() => {
                    if (!deleteTarget) return
                    deleteLoan.mutate(deleteTarget.id, {
                        onSuccess: () => { toast.success(t('loans.deleted')); setDeleteTarget(null) },
                        onError: (err: Error) => { toast.error(t('common.error'), err?.message); setDeleteTarget(null) },
                    })
                }}
            />
        </PageWrapper>
    )
}
