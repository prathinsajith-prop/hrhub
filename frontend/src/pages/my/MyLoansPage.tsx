import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import { zodToFieldErrors } from '@/lib/schemas'
import { Banknote, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMyLoans, useCreateLoan } from '@/hooks/useLoans'

const requestLoanSchema = z.object({
    amount: z.string().min(1, 'Amount is required').refine(v => parseFloat(v) > 0, 'Amount must be greater than 0'),
    monthlyDeduction: z.string().min(1, 'Monthly deduction is required').refine(v => parseFloat(v) > 0, 'Monthly deduction must be greater than 0'),
    reason: z.string().optional(),
})

const STATUS_STYLE: Record<string, string> = {
    pending:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    approved:  'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    active:    'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
    completed: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    rejected:  'bg-red-50 text-red-600 ring-1 ring-red-200',
    cancelled: 'bg-slate-100 text-slate-600',
}

function RequestLoanDialog({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation()
    const create = useCreateLoan()
    const [form, setForm] = useState({ amount: '', monthlyDeduction: '', reason: '' })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const amount = parseFloat(form.amount || '0')
    const monthly = parseFloat(form.monthlyDeduction || '0')
    const installments = monthly > 0 && amount > 0 ? Math.ceil(amount / monthly) : null

    function handleSubmit() {
        const result = zodToFieldErrors(requestLoanSchema, form)
        if (!result.ok) { setErrors(result.errors); return }
        setErrors({})
        create.mutate(form, {
            onSuccess: () => { toast.success(t('loans.requestSubmitted')); onClose() },
            onError: () => toast.error(t('loans.saveFailed')),
        })
    }

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>{t('loans.requestLoan')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid grid-cols-2 gap-4">
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

export function MyLoansPage() {
    const { t } = useTranslation()
    const { data, isLoading } = useMyLoans()
    const [requestOpen, setRequestOpen] = useState(false)
    const loans = data?.data ?? []

    return (
        <PageWrapper>
            <PageHeader
                title={t('loans.myPageTitle')}
                description={t('loans.myPageDesc')}
                actions={
                    <Button onClick={() => setRequestOpen(true)}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        {t('loans.requestLoan')}
                    </Button>
                }
            />

            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40">
                            <tr>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('loans.amount')}</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('loans.monthlyDeduction')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('loans.table.progress')}</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('loans.table.remaining')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('loans.reason')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        {Array.from({ length: 6 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : loans.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                                        <Banknote className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                        <p>{t('loans.noMyLoans')}</p>
                                    </td>
                                </tr>
                            ) : (
                                loans.map(loan => {
                                    const paid = loan.paidInstallments ?? 0
                                    const total = loan.totalInstallments ?? 0
                                    const pct = total > 0 ? Math.round((paid / total) * 100) : 0
                                    return (
                                        <tr key={loan.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3 text-right font-medium">
                                                AED {Number(loan.amount).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3 text-right text-muted-foreground">
                                                AED {Number(loan.monthlyDeduction).toLocaleString()}
                                            </td>
                                            <td className="px-4 py-3">
                                                {total > 0 ? (
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                                                            <div
                                                                className="h-full rounded-full bg-primary transition-all"
                                                                style={{ width: `${pct}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs text-muted-foreground">{paid}/{total}</span>
                                                    </div>
                                                ) : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                {loan.remainingBalance
                                                    ? `AED ${Number(loan.remainingBalance).toLocaleString()}`
                                                    : '—'}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">
                                                {loan.reason ?? '—'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[loan.status])}>
                                                    {t(`loans.statuses.${loan.status}`)}
                                                </span>
                                            </td>
                                        </tr>
                                    )
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {requestOpen && <RequestLoanDialog onClose={() => setRequestOpen(false)} />}
        </PageWrapper>
    )
}
