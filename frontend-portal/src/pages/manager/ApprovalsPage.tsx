import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, ListChecks, X } from 'lucide-react'

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
    const [pending, setPending] = useState<{ id: string; approved: boolean } | null>(null)
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
                                    </div>
                                    <div className="flex shrink-0 flex-col gap-1.5">
                                        <Button
                                            size="sm"
                                            variant="success"
                                            onClick={() => setPending({ id: req.id, approved: true })}
                                        >
                                            <Check className="size-4" /> {t('common.approve')}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setPending({ id: req.id, approved: false })}
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
