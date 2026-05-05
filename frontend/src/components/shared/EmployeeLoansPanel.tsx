import { useState } from 'react'
import { DollarSign, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { formatDate, formatCurrency, cn } from '@/lib/utils'
import { useLoans, useApproveLoan, useRejectLoan, LOAN_STATUS_STYLE, type EmployeeLoan } from '@/hooks/useLoans'
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

function LoanRow({ loan, canManage }: { loan: EmployeeLoan; canManage: boolean }) {
    const [expanded, setExpanded] = useState(false)
    const [approveConfirm, setApproveConfirm] = useState(false)
    const [rejectOpen, setRejectOpen] = useState(false)
    const approve = useApproveLoan()
    const reject = useRejectLoan()

    const isPending = loan.status === 'pending'

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

    return (
        <>
            <div className="py-3 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-medium">{formatCurrency(Number(loan.amount))}</p>
                            <Badge className={cn('text-[10px] px-1.5 py-0 rounded-md font-medium', LOAN_STATUS_STYLE[loan.status])}>
                                {labelFor(loan.status)}
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Monthly: {formatCurrency(Number(loan.monthlyDeduction))}
                            {loan.totalInstallments ? ` · ${loan.totalInstallments} installments` : ''}
                            {loan.startDate ? ` · Started ${formatDate(loan.startDate)}` : ''}
                            {' · '}{formatDate(loan.createdAt)}
                        </p>
                        {loan.status === 'active' && loan.remainingBalance && (
                            <p className="text-xs text-muted-foreground">
                                Remaining: {formatCurrency(Number(loan.remainingBalance))}
                                {' · '}{loan.paidInstallments} of {loan.totalInstallments} paid
                            </p>
                        )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {canManage && isPending && (
                            <>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-800"
                                    onClick={() => setApproveConfirm(true)}
                                >
                                    <Check className="h-3.5 w-3.5 mr-1" />
                                    Approve
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-red-700 border-red-200 bg-red-50 hover:bg-red-100 hover:text-red-800"
                                    onClick={() => setRejectOpen(true)}
                                >
                                    <X className="h-3.5 w-3.5 mr-1" />
                                    Reject
                                </Button>
                            </>
                        )}
                        {(loan.reason || loan.notes) && (
                            <Button variant="ghost" size="icon-sm" onClick={() => setExpanded(v => !v)} aria-label="Toggle details">
                                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </Button>
                        )}
                    </div>
                </div>

                {expanded && (
                    <div className="pl-0 space-y-1 text-xs text-muted-foreground border-l-2 border-border pl-3 ml-0.5">
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
        </>
    )
}

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
                    <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : loans.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                        <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
                        <p className="text-sm font-medium">No loans</p>
                        <p className="text-xs mt-1">This employee has no loan records</p>
                    </div>
                ) : (
                    <div className="divide-y">
                        {loans.map(loan => (
                            <LoanRow key={loan.id} loan={loan} canManage={canManage} />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
