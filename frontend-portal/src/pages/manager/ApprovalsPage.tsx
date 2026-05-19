import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowRightLeft, Check, ListChecks, X } from 'lucide-react'

import { useApproveLeave, useLeaveRequests } from '@/hooks/useLeave'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'

export function ManagerApprovalsPage() {
    const { t } = useTranslation()
    const { data, isLoading } = useLeaveRequests({ status: 'pending', limit: 50 })
    const approve = useApproveLeave()
    // Track the full request, not just id+approved, so the approval dialog can
    // surface the handover person + notes — the reviewer needs that context to
    // approve the handover as part of the leave.
    const [pending, setPending] = useState<{
        id: string
        approved: boolean
        handoverToName: string | null
        handoverNotes: string | null
        employeeName: string | null
    } | null>(null)
    const [note, setNote] = useState('')

    function submit() {
        if (!pending) return
        approve.mutate(
            { id: pending.id, approved: pending.approved, notes: note || undefined },
            {
                onSuccess: () => {
                    toast.success(pending.approved ? t('team.approveSuccess') : t('team.rejectSuccess'))
                    setPending(null)
                    setNote('')
                },
            },
        )
    }

    return (
        <div className="space-y-5">
            <PageHeader title={t('team.pendingApprovals')} />

            {isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-24" />
                    <Skeleton className="h-24" />
                </div>
            ) : !data?.data?.length ? (
                <EmptyState icon={<ListChecks className="size-8" />} title={t('team.noApprovals')} />
            ) : (
                <div className="space-y-2.5">
                    {data.data.map((req) => (
                        <Card key={req.id} className="border-border/70">
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="font-medium">{req.employeeName ?? req.employeeId}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {req.employeeDepartment ?? '—'} · {req.employeeNo ?? ''}
                                        </div>
                                        <div className="mt-2 text-sm">
                                            <span className="capitalize">{req.leaveType}</span>
                                            <span className="text-muted-foreground"> · </span>
                                            {formatDate(req.startDate)} → {formatDate(req.endDate)}
                                            <span className="text-muted-foreground"> · </span>
                                            {req.days} {req.days === 1 ? 'day' : 'days'}
                                        </div>
                                        {req.reason ? (
                                            <p className="mt-2 text-xs text-muted-foreground">{req.reason}</p>
                                        ) : null}

                                        {/* Handover summary inline — the manager sees who's
                                            picking up the work without having to open the dialog. */}
                                        {req.handoverToName ? (
                                            <div className="mt-2 flex items-start gap-2 rounded-md border border-border/60 bg-card/40 px-2.5 py-1.5 text-xs">
                                                <ArrowRightLeft className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                                                <div className="min-w-0">
                                                    <div>
                                                        <span className="text-muted-foreground">Handover to: </span>
                                                        <span className="font-medium">{req.handoverToName}</span>
                                                        {req.handoverToDesignation ? (
                                                            <span className="text-muted-foreground"> · {req.handoverToDesignation}</span>
                                                        ) : null}
                                                    </div>
                                                    {req.handoverNotes ? (
                                                        <p className="mt-0.5 line-clamp-2 italic text-muted-foreground/80">"{req.handoverNotes}"</p>
                                                    ) : null}
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="flex shrink-0 flex-col gap-1.5">
                                        <Button
                                            size="sm"
                                            variant="success"
                                            onClick={() =>
                                                setPending({
                                                    id: req.id,
                                                    approved: true,
                                                    handoverToName: req.handoverToName ?? null,
                                                    handoverNotes: req.handoverNotes ?? null,
                                                    employeeName: req.employeeName ?? null,
                                                })
                                            }
                                        >
                                            <Check className="size-4" /> {t('common.approve')}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                setPending({
                                                    id: req.id,
                                                    approved: false,
                                                    handoverToName: req.handoverToName ?? null,
                                                    handoverNotes: req.handoverNotes ?? null,
                                                    employeeName: req.employeeName ?? null,
                                                })
                                            }
                                        >
                                            <X className="size-4" /> {t('common.reject')}
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <Dialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>{pending?.approved ? t('team.approveLeave') : t('team.rejectLeave')}</DialogTitle>
                    </DialogHeader>

                    {/* When approving, the reviewer is also approving the
                        handover assignment — surface it explicitly so they
                        have a chance to reject if the handover person is
                        unsuitable (e.g. also on leave that period). */}
                    {pending?.approved && pending.handoverToName ? (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs dark:border-sky-900/60 dark:bg-sky-950/30">
                            <div className="flex items-center gap-1.5 font-semibold text-sky-900 dark:text-sky-100">
                                <ArrowRightLeft className="size-3.5" />
                                Handover plan
                            </div>
                            <p className="mt-1 text-sky-800/90 dark:text-sky-200/90">
                                <span className="font-medium">{pending.employeeName ?? 'The employee'}</span> will hand over their work to{' '}
                                <span className="font-medium">{pending.handoverToName}</span>.
                            </p>
                            {pending.handoverNotes ? (
                                <p className="mt-1 italic text-sky-800/80 dark:text-sky-200/80">"{pending.handoverNotes}"</p>
                            ) : null}
                            <p className="mt-2 text-[11px] text-sky-700/80 dark:text-sky-300/80">
                                Approving the leave also confirms this handover. Reject if it isn't workable.
                            </p>
                        </div>
                    ) : null}

                    <div className="space-y-1.5">
                        <Label>{t('team.managerNote')}</Label>
                        <Input value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPending(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={submit} loading={approve.isPending}>
                            {pending?.approved ? t('common.approve') : t('common.reject')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
