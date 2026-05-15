import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer, Receipt } from 'lucide-react'

import { useMyPayslips, usePayslipDetail } from '@/hooks/usePayslips'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { formatCurrency, monthName } from '@/lib/utils'

export function EmployeePayslipsPage() {
    const { t } = useTranslation()
    const { data, isLoading } = useMyPayslips()
    const [selectedId, setSelectedId] = useState<string | null>(null)

    return (
        <div className="space-y-6">
            <PageHeader title={t('payslips.title')} />

            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                </div>
            ) : !data?.length ? (
                <EmptyState icon={<Receipt className="h-8 w-8" />} title={t('payslips.noPayslips')} />
            ) : (
                <div className="space-y-2.5">
                    {data.map((p) => (
                        <Card key={p.id} className="border-border/70 transition-all hover:border-primary/40 hover:shadow-md">
                            <CardContent className="flex items-center justify-between gap-3 p-4">
                                <div>
                                    <div className="font-display text-base font-semibold">
                                        {monthName(p.month)} {p.year}
                                    </div>
                                    <div className="mt-0.5 text-xs uppercase tracking-wider text-muted-foreground">
                                        {p.runStatus}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-display text-lg font-bold tabular-figures">
                                        {formatCurrency(p.netSalary)}
                                    </div>
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="h-auto p-0 text-xs"
                                        onClick={() => setSelectedId(p.id)}
                                    >
                                        {t('payslips.view')}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <PayslipDialog id={selectedId} onClose={() => setSelectedId(null)} />
        </div>
    )
}

function PayslipDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
    const { t } = useTranslation()
    const { data, isLoading } = usePayslipDetail(id ?? undefined)

    return (
        <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('payslips.viewSlip')}</DialogTitle>
                </DialogHeader>
                {isLoading || !data ? (
                    <Skeleton className="h-64" />
                ) : (
                    <div className="space-y-4">
                        <div className="rounded-xl border border-border bg-gradient-to-br from-indigo-50 to-sky-50 p-4 dark:from-indigo-950/30 dark:to-sky-950/20">
                            <div className="text-xs uppercase tracking-wider text-muted-foreground">
                                {monthName(data.month)} {data.year}
                            </div>
                            <div className="mt-1 font-display text-2xl font-bold tabular-figures">
                                {formatCurrency(data.netSalary)}
                            </div>
                            <div className="text-xs text-muted-foreground">{t('payslips.net')}</div>
                        </div>

                        <dl className="space-y-2 text-sm">
                            <Row label="Basic" value={formatCurrency(data.basicSalary)} />
                            <Row label="Housing" value={formatCurrency(data.housingAllowance)} />
                            <Row label="Transport" value={formatCurrency(data.transportAllowance)} />
                            <Row label="Other allowances" value={formatCurrency(data.otherAllowances)} />
                            <div className="my-2 border-t border-border" />
                            <Row label={t('payslips.gross')} value={formatCurrency(data.grossSalary)} bold />
                            <Row label={t('payslips.deductions')} value={`- ${formatCurrency(data.deductions)}`} />
                            <Row label={t('payslips.net')} value={formatCurrency(data.netSalary)} bold />
                        </dl>

                        {data.bankName || data.iban ? (
                            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
                                <div>Paid to {data.bankName ?? '—'}</div>
                                {data.iban ? <div className="mt-0.5 font-mono">{data.iban}</div> : null}
                            </div>
                        ) : null}
                    </div>
                )}
                <DialogFooter>
                    <Button variant="outline" onClick={() => window.print()}>
                        <Printer className="h-4 w-4" /> {t('payslips.print')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
    return (
        <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className={bold ? 'font-display font-semibold tabular-figures' : 'tabular-figures'}>{value}</dd>
        </div>
    )
}
