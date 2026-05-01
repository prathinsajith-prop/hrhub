import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/overlays'
import { toast } from '@/components/ui/overlays'
import {
    Banknote, Clock, CheckCircle2, AlertCircle,
    Plus, Check, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    type EmployeeLoan,
    useLoans,
    useCreateLoan,
    useApproveLoan,
    useRejectLoan,
    useRecordLoanPayment,
} from '@/hooks/useLoans'
import { useEmployees } from '@/hooks/useEmployees'
import { useAuthStore } from '@/store/authStore'
import { hasPermission } from '@/lib/permissions'
import type { UserRole } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
    pending:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    approved:  'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    active:    'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
    completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    rejected:  'bg-red-50 text-red-600 ring-1 ring-red-200',
    cancelled: 'bg-slate-100 text-slate-600',
}

// ─── Create Loan Dialog ───────────────────────────────────────────────────────

function CreateLoanDialog({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation()
    const create = useCreateLoan()
    const { data: empData } = useEmployees({ limit: 200 })
    const [form, setForm] = useState({ employeeId: '', amount: '', monthlyDeduction: '', reason: '', notes: '' })

    const amount = parseFloat(form.amount || '0')
    const monthly = parseFloat(form.monthlyDeduction || '0')
    const installments = monthly > 0 && amount > 0 ? Math.ceil(amount / monthly) : null

    function handleSubmit() {
        if (!form.employeeId || !form.amount || !form.monthlyDeduction) {
            toast.error(t('common.required'))
            return
        }
        create.mutate(form, {
            onSuccess: () => { toast.success(t('loans.created')); onClose() },
            onError: () => toast.error(t('loans.saveFailed')),
        })
    }

    const employees = empData?.data ?? []

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{t('loans.newLoan')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid gap-1.5">
                        <Label>{t('training.employee')} <span className="text-destructive">*</span></Label>
                        <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                            <SelectTrigger><SelectValue placeholder={t('training.selectEmployee')} /></SelectTrigger>
                            <SelectContent>
                                {employees.map(e => (
                                    <SelectItem key={e.id} value={e.id}>
                                        {e.firstName} {e.lastName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-1.5">
                            <Label>{t('loans.amount')} (AED) <span className="text-destructive">*</span></Label>
                            <Input type="number" min="0" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" />
                        </div>
                        <div className="grid gap-1.5">
                            <Label>{t('loans.monthlyDeduction')} (AED) <span className="text-destructive">*</span></Label>
                            <Input type="number" min="0" value={form.monthlyDeduction} onChange={e => setForm(f => ({ ...f, monthlyDeduction: e.target.value }))} placeholder="0.00" />
                        </div>
                    </div>
                    {installments !== null && (
                        <p className="text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-lg">
                            {t('loans.installmentCalc', { count: installments })}
                        </p>
                    )}
                    <div className="grid gap-1.5">
                        <Label>{t('loans.reason')}</Label>
                        <Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder={t('loans.reasonPlaceholder')} />
                    </div>
                    <div className="grid gap-1.5">
                        <Label>{t('common.notes')}</Label>
                        <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={create.isPending}>
                        {create.isPending ? t('common.loading') : t('common.submit')}
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
                    <div className="grid gap-1.5">
                        <Label>{t('common.notes')}</Label>
                        <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('loans.rejectNotesPlaceholder')} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="destructive" onClick={() => reject.mutate({ id: loan.id, notes }, { onSuccess: () => { toast.success(t('loans.rejected')); onClose() } })} disabled={reject.isPending}>
                        {reject.isPending ? t('common.loading') : t('common.reject')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LoansPage() {
    const { t } = useTranslation()
    const role = useAuthStore(s => s.user?.role) as UserRole | undefined
    const canManage = hasPermission(role ?? 'employee', 'manage_payroll')

    const [statusFilter, setStatusFilter] = useState('all')
    const [createOpen, setCreateOpen] = useState(false)
    const [rejectTarget, setRejectTarget] = useState<EmployeeLoan | null>(null)
    const [paymentTarget, setPaymentTarget] = useState<EmployeeLoan | null>(null)

    const { data, isLoading } = useLoans({ status: statusFilter === 'all' ? undefined : statusFilter })
    const approve = useApproveLoan()
    const recordPayment = useRecordLoanPayment()

    const loans = data?.data ?? []
    const summary = data?.summary

    function handleApprove(loan: EmployeeLoan) {
        approve.mutate({ id: loan.id }, {
            onSuccess: () => toast.success(t('loans.approved')),
            onError: () => toast.error(t('loans.actionFailed')),
        })
    }

    function handlePayment() {
        if (!paymentTarget) return
        recordPayment.mutate(paymentTarget.id, {
            onSuccess: () => { toast.success(t('loans.paymentRecorded')); setPaymentTarget(null) },
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
                        <Plus className="h-4 w-4 mr-1.5" />
                        {t('loans.newLoan')}
                    </Button>
                ) : undefined}
            />

            {/* KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
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

            {/* Filter */}
            <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('common.all')} {t('common.status')}</SelectItem>
                        <SelectItem value="pending">{t('loans.statuses.pending')}</SelectItem>
                        <SelectItem value="active">{t('loans.statuses.active')}</SelectItem>
                        <SelectItem value="completed">{t('loans.statuses.completed')}</SelectItem>
                        <SelectItem value="rejected">{t('loans.statuses.rejected')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('loans.table.employee')}</th>
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
                                        {Array.from({ length: canManage ? 7 : 6 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : loans.length === 0 ? (
                                <tr>
                                    <td colSpan={canManage ? 7 : 6} className="px-4 py-12 text-center text-muted-foreground">
                                        <Banknote className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                        <p>{t('loans.noLoans')}</p>
                                    </td>
                                </tr>
                            ) : (
                                loans.map(loan => {
                                    const paid = loan.paidInstallments ?? 0
                                    const total = loan.totalInstallments ?? 0
                                    const pct = total > 0 ? Math.round((paid / total) * 100) : 0
                                    return (
                                        <tr key={loan.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3">
                                                <div className="font-medium">{loan.employeeName}</div>
                                                <div className="text-xs text-muted-foreground">{loan.employeeNo}</div>
                                            </td>
                                            <td className="px-4 py-3 text-right font-medium">
                                                AED {Number(loan.amount).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-muted-foreground">
                                                AED {Number(loan.monthlyDeduction).toLocaleString()}
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
                                                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[loan.status])}>
                                                    {t(`loans.statuses.${loan.status}`)}
                                                </span>
                                            </td>
                                            {canManage && (
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-1 justify-end">
                                                        {loan.status === 'pending' && (
                                                            <>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:text-emerald-700" onClick={() => handleApprove(loan)} disabled={approve.isPending}>
                                                                    <Check className="h-3.5 w-3.5" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setRejectTarget(loan)}>
                                                                    <X className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </>
                                                        )}
                                                        {loan.status === 'active' && (
                                                            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setPaymentTarget(loan)}>
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

            <ConfirmDialog
                open={!!paymentTarget}
                variant="warning"
                title={t('loans.paymentConfirmTitle')}
                description={t('loans.paymentConfirmDesc', {
                    amount: paymentTarget ? `AED ${Number(paymentTarget.monthlyDeduction).toLocaleString()}` : '',
                    name: paymentTarget?.employeeName ?? '',
                })}
                confirmLabel={t('loans.recordPayment')}
                onConfirm={handlePayment}
                onOpenChange={(open) => { if (!open) setPaymentTarget(null) }}
            />
        </PageWrapper>
    )
}
