import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Printer, Receipt } from 'lucide-react'

import { useMyPayslips, usePayslipDetail } from '@/hooks/usePayslips'
import { useMyEmployee } from '@/hooks/useMe'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { BankDetailsCard } from '@/components/shared/BankDetailsCard'
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
    const { data: employee } = useMyEmployee()
    const [selectedId, setSelectedId] = useState<string | null>(null)

    return (
        <div className="space-y-6">
            <PageHeader title={t('payslips.title')} />

            {/* Bank details belong here next to the payslips — that's the
                account these payments land in. Editing routes through the
                manager-approval flow. */}
            {employee ? <BankDetailsCard employee={employee} /> : null}

            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                </div>
            ) : !data?.length ? (
                <EmptyState icon={<Receipt className="size-8" />} title={t('payslips.noPayslips')} />
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

                        {/* Grouped Earnings → Additions → Deductions → Net so the
                            employee can see at a glance where each Dirham came from.
                            Matches the admin payslip breakdown layout (PayrollPage). */}
                        <dl className="space-y-2 text-sm">
                            {/* Earnings — dynamic from the catalog breakdown
                                snapshot when present, otherwise the four
                                named columns (legacy payslips). */}
                            <SectionLabel tone="neutral">Earnings</SectionLabel>
                            {(() => {
                                const breakdown = (data.earningsBreakdown ?? [])
                                    .map((b) => ({ ...b, amount: Number(b.amount) }))
                                    .filter((b) => b.amount > 0)
                                    .sort((a, b) => {
                                        const order = (cat: string) =>
                                            ({ basic: 0, housing: 1, transport: 2 }[cat] ?? 3)
                                        return order(a.category) - order(b.category)
                                    })
                                if (breakdown.length > 0) {
                                    return breakdown.map((b) => (
                                        <Row key={b.componentId} label={b.name} value={formatCurrency(b.amount)} />
                                    ))
                                }
                                return (
                                    <>
                                        <Row label="Basic" value={formatCurrency(data.basicSalary)} />
                                        {Number(data.housingAllowance) > 0 && (
                                            <Row label="Housing" value={formatCurrency(data.housingAllowance)} />
                                        )}
                                        {Number(data.transportAllowance) > 0 && (
                                            <Row label="Transport" value={formatCurrency(data.transportAllowance)} />
                                        )}
                                        {Number(data.otherAllowances) > 0 && (
                                            <Row label="Other allowances" value={formatCurrency(data.otherAllowances)} />
                                        )}
                                    </>
                                )
                            })()}

                            {/* Additions — only render when there's anything */}
                            {(Number(data.overtime ?? 0) > 0 || Number(data.commission ?? 0) > 0) && (
                                <>
                                    <SectionLabel tone="positive">Additions</SectionLabel>
                                    {Number(data.overtime ?? 0) > 0 && (
                                        <Row
                                            label="Overtime"
                                            value={`+ ${formatCurrency(data.overtime ?? '0')}`}
                                            tone="positive"
                                        />
                                    )}
                                    {Number(data.commission ?? 0) > 0 && (
                                        <Row
                                            label="Commission / Bonus"
                                            value={`+ ${formatCurrency(data.commission ?? '0')}`}
                                            tone="positive"
                                        />
                                    )}
                                </>
                            )}

                            <div className="my-1 border-t border-border" />
                            <Row label={t('payslips.gross')} value={formatCurrency(data.grossSalary)} bold />

                            {/* Deductions — itemised so the total isn't an opaque sum */}
                            {Number(data.deductions) > 0 && (
                                <>
                                    <SectionLabel tone="negative">Deductions</SectionLabel>
                                    {Number(data.unpaidLeaveDeduction ?? 0) > 0 && (
                                        <Row
                                            label={`Loss of pay (${data.unpaidLeaveDays ?? 0} day${
                                                (data.unpaidLeaveDays ?? 0) === 1 ? '' : 's'
                                            })`}
                                            value={`- ${formatCurrency(data.unpaidLeaveDeduction ?? '0')}`}
                                            tone="negative"
                                        />
                                    )}
                                    {Number(data.sickHalfPayDeduction ?? 0) > 0 && (
                                        <Row
                                            label={`Sick half-pay (${data.sickHalfPayDays ?? 0} day${
                                                (data.sickHalfPayDays ?? 0) === 1 ? '' : 's'
                                            })`}
                                            value={`- ${formatCurrency(data.sickHalfPayDeduction ?? '0')}`}
                                            tone="negative"
                                        />
                                    )}
                                    {Number(data.loanDeduction ?? 0) > 0 && (
                                        <Row
                                            label="Loan repayment"
                                            value={`- ${formatCurrency(data.loanDeduction ?? '0')}`}
                                            tone="negative"
                                        />
                                    )}
                                    {Number(data.otherDeduction ?? 0) > 0 && (
                                        <Row
                                            label="Other manual deductions"
                                            value={`- ${formatCurrency(data.otherDeduction ?? '0')}`}
                                            tone="negative"
                                        />
                                    )}
                                    <Row
                                        label={t('payslips.deductions')}
                                        value={`- ${formatCurrency(data.deductions)}`}
                                        bold
                                        tone="negative"
                                    />
                                </>
                            )}

                            <div className="my-1 border-t border-border" />
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
                        <Printer className="size-4" /> {t('payslips.print')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function SectionLabel({ tone, children }: { tone: 'neutral' | 'positive' | 'negative'; children: ReactNode }) {
    const color =
        tone === 'positive'
            ? 'text-emerald-700 dark:text-emerald-300'
            : tone === 'negative'
                ? 'text-rose-700 dark:text-rose-300'
                : 'text-muted-foreground'
    return (
        <div className={`pt-1 text-[10px] font-bold uppercase tracking-widest ${color}`}>
            {children}
        </div>
    )
}

function Row({ label, value, bold, tone }: { label: string; value: string; bold?: boolean; tone?: 'positive' | 'negative' }) {
    const valueColor =
        tone === 'positive'
            ? 'text-emerald-700 dark:text-emerald-400'
            : tone === 'negative'
                ? 'text-rose-700 dark:text-rose-400'
                : ''
    return (
        <div className="flex items-center justify-between">
            <dt className="text-muted-foreground">{label}</dt>
            <dd
                className={
                    (bold ? 'font-display font-semibold tabular-figures ' : 'tabular-figures ') + valueColor
                }
            >
                {value}
            </dd>
        </div>
    )
}
