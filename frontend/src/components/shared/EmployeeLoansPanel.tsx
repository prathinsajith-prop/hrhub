import { useState, memo } from 'react'
import { DollarSign, Check, X, ChevronDown, ChevronUp, Trash2, AlertTriangle, Calendar } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import {
    useLoans, useApproveLoan, useRejectLoan, useDeleteLoan,
    useLoanSchedule, useRecordLoanPayment,
    LOAN_STATUS_STYLE, type EmployeeLoan, type LoanScheduleEntry,
} from '@/hooks/useLoans'
import { labelFor } from '@/lib/enums'

interface Props {
    employeeId: string
    canManage: boolean
}

function RejectDialog({ open, onClose, onConfirm, isPending }: {
    open: boolean
    onClose: () => void
    onConfirm: (notes: string) => void
    isPending: boolean
}) {
    const [notes, setNotes] = useState('')
    return (
        <Dialog open={open} onOpenChange={o => !o && onClose()}>
            <DialogContent className="max-w-sm">
                <DialogHeader>
                    <DialogTitle>Reject Loan Request</DialogTitle>
                </DialogHeader>
                <Textarea
                    placeholder="Reason for rejection (optional)"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                />
                <DialogFooter>
                    <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>Cancel</Button>
                    <Button variant="destructive" size="sm" onClick={() => onConfirm(notes)} disabled={isPending}>
                        Reject
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ── Schedule dialog ──────────────────────────────────────────────────────────
/**
 * Reusable dialog showing a loan's full month-by-month installment schedule.
 * Each row shows status (Paid / Pending / Overdue), due date, amount, and a
 * Pay button (managers only) that requires a confirmation before recording.
 *
 * Exported so the global Loans & Advances page can use the same modal.
 */
export function LoanScheduleDialog({ loan, open, onClose, canManage }: {
    loan: EmployeeLoan
    open: boolean
    onClose: () => void
    canManage: boolean
}) {
    const { data, isLoading } = useLoanSchedule(open ? loan.id : null)
    const recordPayment = useRecordLoanPayment()
    const entries = data?.data ?? []
    const [payTarget, setPayTarget] = useState<LoanScheduleEntry | null>(null)

    const monthLabel = (period: string) => {
        const d = new Date(period)
        return d.toLocaleDateString('en-AE', { month: 'short', year: 'numeric' })
    }

    const confirmPay = () => {
        if (!payTarget) return
        const entry = payTarget
        recordPayment.mutate({ id: loan.id, periodMonth: entry.periodMonth }, {
            onSuccess: () => {
                const paidOn = formatDate(new Date())
                toast.success(
                    `${monthLabel(entry.periodMonth)} payment recorded`,
                    `Marked as paid on ${paidOn}.`,
                )
                setPayTarget(null)
            },
            onError: (err: Error) => {
                toast.error('Failed to record payment', err?.message)
                setPayTarget(null)
            },
        })
    }

    return (
        <>
        <Dialog open={open} onOpenChange={o => !o && onClose()}>
            <DialogContent className="max-w-lg p-0 flex flex-col max-h-[80vh]">
                <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
                    <DialogTitle className="text-base">Installment Schedule</DialogTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                        {formatCurrency(Number(loan.amount))} · {formatCurrency(Number(loan.monthlyDeduction))}/month
                    </p>
                </DialogHeader>
                <div className="overflow-y-auto flex-1 divide-y">
                    {isLoading ? (
                        <div className="p-4 space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={`skeleton-${i}`} className="h-9 w-full" />)}</div>
                    ) : entries.length === 0 ? (
                        <div className="p-8 text-center text-sm text-muted-foreground">No schedule available.</div>
                    ) : entries.map(en => {
                        const isPaid = en.status === 'paid'
                        const isOverdue = en.status === 'overdue'
                        const isUpcoming = en.status === 'upcoming'
                        const tone = isPaid
                            ? 'bg-emerald-50/60'
                            : isOverdue
                                ? 'bg-red-50/60'
                                : isUpcoming
                                    ? 'opacity-60'
                                    : ''
                        return (
                            <div key={en.installmentNo} className={cn('flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 flex-wrap', tone)}>
                                <div className={cn(
                                    'flex items-center justify-center size-7 rounded-full text-[11px] font-semibold tabular-nums shrink-0',
                                    isPaid ? 'bg-emerald-100 text-emerald-800'
                                        : isOverdue ? 'bg-red-100 text-red-800'
                                            : isUpcoming ? 'bg-muted/60 text-muted-foreground/60'
                                                : 'bg-muted text-muted-foreground',
                                )}>
                                    {isPaid ? <Check className="size-3.5" /> : en.installmentNo}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={cn('text-xs font-semibold leading-tight', isUpcoming && 'text-muted-foreground')}>
                                        {monthLabel(en.periodMonth)}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground tabular-nums truncate">
                                        Due {formatDate(en.dueDate)}
                                        {isOverdue && en.daysOverdue && <> · {en.daysOverdue}d overdue</>}
                                    </p>
                                </div>

                                <span className={cn('text-xs font-semibold tabular-nums shrink-0', isUpcoming && 'text-muted-foreground')}>
                                    {formatCurrency(isPaid ? en.paidAmount : en.amount)}
                                </span>

                                {/* Right cell: status indicator + Pay (only when canPay) */}
                                {isPaid ? (
                                    <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-emerald-700 font-medium">
                                        <Check className="size-3" />
                                        <span>Paid on {en.paidDate ? formatDate(en.paidDate) : '—'}</span>
                                    </div>
                                ) : (
                                    <>
                                        <span className="shrink-0">
                                            {isOverdue ? (
                                                <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px]">
                                                    <AlertTriangle className="size-2.5 mr-0.5" />Overdue
                                                </Badge>
                                            ) : isUpcoming ? (
                                                <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">
                                                    <Calendar className="size-2.5 mr-0.5" />Upcoming
                                                </Badge>
                                            ) : (
                                                <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                                                    <Calendar className="size-2.5 mr-0.5" />Pending
                                                </Badge>
                                            )}
                                        </span>
                                        {canManage && en.canPay && (
                                            <Button
                                                size="sm"
                                                type="button"
                                                className="h-7 text-[11px] px-2 shrink-0"
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPayTarget(en) }}
                                            >
                                                Pay
                                            </Button>
                                        )}
                                    </>
                                )}
                            </div>
                        )
                    })}
                </div>
                <DialogFooter className="px-5 py-3 border-t shrink-0">
                    <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        {/* ConfirmDialog rendered as a sibling - never nested inside the
            schedule Dialog, which avoids Radix focus/dismiss conflicts that
            could otherwise close the parent dialog or trigger navigation. */}
        <ConfirmDialog
            open={!!payTarget}
            onOpenChange={o => { if (!o) setPayTarget(null) }}
            title={payTarget ? `Record payment for ${monthLabel(payTarget.periodMonth)}?` : ''}
            description={
                payTarget
                    ? `This will mark ${formatCurrency(payTarget.amount)} as paid for the ${monthLabel(payTarget.periodMonth)} installment of this loan. The loan balance will be reduced. This cannot be undone.`
                    : ''
            }
            confirmLabel={recordPayment.isPending ? 'Recording…' : 'Record Payment'}
            variant="warning"
            onConfirm={confirmPay}
        />
        </>
    )
}

const LoanRow = memo(function LoanRow({ loan, canManage }: { loan: EmployeeLoan; canManage: boolean }) {
    const [expanded, setExpanded] = useState(false)
    const [approveConfirm, setApproveConfirm] = useState(false)
    const [rejectOpen, setRejectOpen] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState(false)
    const [scheduleOpen, setScheduleOpen] = useState(false)
    const approve = useApproveLoan()
    const reject = useRejectLoan()
    const deleteLoan = useDeleteLoan()

    const isPending = loan.status === 'pending'

    const handleDelete = () => {
        deleteLoan.mutate(loan.id, {
            onSuccess: () => { toast.success('Loan deleted'); setDeleteConfirm(false) },
            onError: (err: Error) => { toast.error('Failed to delete', err?.message); setDeleteConfirm(false) },
        })
    }

    const handleApprove = () => {
        approve.mutate({ id: loan.id }, {
            onSuccess: () => { toast.success('Loan approved'); setApproveConfirm(false) },
            onError: (err: Error) => { toast.error('Failed to approve', err?.message); setApproveConfirm(false) },
        })
    }

    const handleReject = (notes: string) => {
        reject.mutate({ id: loan.id, notes }, {
            onSuccess: () => { toast.success('Loan rejected'); setRejectOpen(false) },
            onError: (err: Error) => { toast.error('Failed to reject', err?.message); setRejectOpen(false) },
        })
    }

    // ── Derived progress numbers ────────────────────────────────────────────
    const principal = Number(loan.amount) || 0
    const monthly = Number(loan.monthlyDeduction) || 0
    const total = loan.totalInstallments ?? (monthly > 0 ? Math.ceil(principal / monthly) : 0)
    const paid = loan.paidInstallments ?? 0
    const remaining = loan.remainingBalance != null ? Number(loan.remainingBalance) : principal
    const received = Math.max(0, principal - remaining)
    const progressPct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : (loan.status === 'completed' ? 100 : 0)

    const isCompleted = loan.status === 'completed'
    const isActive = loan.status === 'active'
    const isRejectedOrCancelled = loan.status === 'rejected' || loan.status === 'cancelled'

    return (
        <>
            <div className={cn(
                'rounded-lg border bg-card px-3.5 py-2.5 transition-colors',
                isCompleted && 'border-emerald-200 bg-emerald-50/40',
                isPending && 'border-amber-200 bg-amber-50/40',
                isRejectedOrCancelled && 'opacity-70',
            )}>
                {/* Top: amount + status + actions */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-base font-bold text-foreground tabular-nums leading-none">{formatCurrency(principal)}</p>
                            <Badge className={cn('text-[10px] px-1.5 py-0.5 rounded-md font-medium leading-none', LOAN_STATUS_STYLE[loan.status])}>
                                {labelFor(loan.status)}
                            </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-tight">
                            Monthly: <span className="font-medium text-foreground">{formatCurrency(monthly)}</span>
                            {loan.startDate && <> · Started {formatDate(loan.startDate)}</>}
                            <> · Requested {formatDate(loan.createdAt)}</>
                        </p>
                    </div>
                    <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap shrink-0 self-start sm:self-auto">
                        {canManage && isPending && (
                            <>
                                <Button variant="success" size="sm" className="h-7 text-xs" onClick={() => setApproveConfirm(true)}>
                                    <Check className="size-3.5 mr-1" />Approve
                                </Button>
                                <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setRejectOpen(true)}>
                                    <X className="size-3.5 mr-1" />Reject
                                </Button>
                            </>
                        )}
                        {canManage && (isActive || isCompleted) && (
                            <Button
                                variant={isActive ? 'info' : 'outline'} size="sm" type="button" className="h-7 text-xs"
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setScheduleOpen(true) }}
                            >
                                <Calendar className="size-3.5 mr-1" />
                                {isActive ? 'Record Payment' : 'Schedule'}
                            </Button>
                        )}
                        {canManage && isPending && (
                            <Button
                                variant="ghost"
                                size="icon-sm"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => setDeleteConfirm(true)}
                                aria-label="Delete loan"
                            >
                                <Trash2 className="size-3.5" />
                            </Button>
                        )}
                        {(loan.reason || loan.notes || loan.approverName) && (
                            <Button variant="ghost" size="icon-sm" onClick={() => setExpanded(v => !v)} aria-label="Toggle details">
                                {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Progress (shown when loan has been approved at least once) */}
                {(isActive || isCompleted) && total > 0 && (
                    <div className="mt-2 space-y-1.5">
                        {/* Installment counter + percent + received/pending - single dense line */}
                        <div className="flex items-center justify-between gap-3 text-[11px] leading-none">
                            <span className="font-medium text-muted-foreground tabular-nums">
                                {paid}/{total} installments
                            </span>
                            <div className="flex items-center gap-3 tabular-nums">
                                <span><span className="text-emerald-700 font-semibold">{formatCurrency(received)}</span> <span className="text-[10px] text-muted-foreground">received</span></span>
                                <span><span className="text-amber-700 font-semibold">{formatCurrency(remaining)}</span> <span className="text-[10px] text-muted-foreground">pending</span></span>
                                <span className={cn('font-bold', isCompleted ? 'text-emerald-700' : 'text-foreground')}>
                                    {progressPct}%
                                </span>
                            </div>
                        </div>
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                            <div
                                className={cn(
                                    'h-full rounded-full transition-all',
                                    isCompleted ? 'bg-emerald-500' : 'bg-primary',
                                )}
                                style={{ width: `${progressPct}%` }}
                            />
                        </div>
                    </div>
                )}

                {expanded && (
                    <div className="mt-2 space-y-0.5 text-xs text-muted-foreground border-l-2 border-border pl-2.5">
                        {loan.reason && <p><span className="font-medium text-foreground">Reason:</span> {loan.reason}</p>}
                        {loan.notes && <p><span className="font-medium text-foreground">Notes:</span> {loan.notes}</p>}
                        {loan.approverName && <p><span className="font-medium text-foreground">Approved by:</span> {loan.approverName}</p>}
                    </div>
                )}
            </div>

            <ConfirmDialog
                open={approveConfirm}
                onOpenChange={setApproveConfirm}
                title="Approve Loan"
                description={`Approve loan of ${formatCurrency(Number(loan.amount))} with monthly deduction of ${formatCurrency(Number(loan.monthlyDeduction))}?`}
                confirmLabel="Approve"
                variant="success"
                onConfirm={handleApprove}
            />

            <RejectDialog
                open={rejectOpen}
                onClose={() => setRejectOpen(false)}
                onConfirm={handleReject}
                isPending={reject.isPending}
            />

            <ConfirmDialog
                open={deleteConfirm}
                onOpenChange={setDeleteConfirm}
                title="Delete Loan"
                description={`Delete this loan request of ${formatCurrency(Number(loan.amount))}? This cannot be undone.`}
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={handleDelete}
            />

            <LoanScheduleDialog
                loan={loan}
                open={scheduleOpen}
                onClose={() => setScheduleOpen(false)}
                canManage={canManage}
            />
        </>
    )
})

export function EmployeeLoansPanel({ employeeId, canManage }: Props) {
    const { data, isLoading } = useLoans({ employeeId, limit: 50 })
    const loans = data?.data ?? []
    const pending = loans.filter(l => l.status === 'pending').length

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Loans</CardTitle>
                    {pending > 0 && (
                        <Badge className="bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-xs">
                            {pending} pending approval
                        </Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={`skeleton-${i}`} className="h-12 w-full" />)}</div>
                ) : loans.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                        <DollarSign className="size-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">No loans</p>
                        <p className="text-xs mt-1">This employee has no loan records</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {loans.map(loan => (
                            <LoanRow key={loan.id} loan={loan} canManage={canManage} />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
