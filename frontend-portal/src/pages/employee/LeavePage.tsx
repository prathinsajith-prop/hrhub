import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Calendar, CalendarDays, Plus, X } from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import {
    useCancelLeave,
    useCreateLeave,
    useLeaveBalance,
    useLeaveRequests,
    type CreateLeaveBody,
} from '@/hooks/useLeave'
import { useUpcomingHolidays } from '@/hooks/useHolidays'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate } from '@/lib/utils'
import type { LeaveStatus, LeaveType } from '@/types'

const LEAVE_TYPES: LeaveType[] = ['annual', 'sick', 'maternity', 'paternity', 'unpaid', 'compassionate', 'emergency', 'bereavement', 'hajj']

const STATUS_TONE: Record<LeaveStatus, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    cancelled: 'bg-muted text-muted-foreground',
}

export function EmployeeLeavePage() {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const employeeId = user?.employeeId ?? undefined

    const [open, setOpen] = useState(false)
    const { data: balance } = useLeaveBalance(employeeId)
    const { data: list, isLoading } = useLeaveRequests({ employeeId, limit: 50 })
    const { data: holidays } = useUpcomingHolidays(5)
    const cancel = useCancelLeave()

    const annual = balance?.balance?.annual

    return (
        <div className="space-y-6">
            <PageHeader
                title={t('leave.title')}
                action={
                    <Button onClick={() => setOpen(true)}>
                        <Plus className="h-4 w-4" /> {t('leave.newRequest')}
                    </Button>
                }
            />

            <GlassCard tone="primary" className="p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-wider text-indigo-700/80 dark:text-indigo-300/80">
                            {t('leave.balance', { year: balance?.year ?? new Date().getFullYear() })}
                        </div>
                        <div className="mt-2 flex items-baseline gap-4">
                            <div>
                                <div className="font-display text-3xl font-bold tabular-figures">
                                    {annual ? Math.round(annual.available) : 0}
                                </div>
                                <div className="text-xs text-muted-foreground">{t('home.available')}</div>
                            </div>
                            <div className="opacity-70">
                                <div className="font-display text-lg tabular-figures">
                                    {annual ? Math.round(annual.taken) : 0}
                                </div>
                                <div className="text-xs text-muted-foreground">{t('home.taken')}</div>
                            </div>
                        </div>
                    </div>
                    <Calendar className="h-12 w-12 text-indigo-400/40 dark:text-indigo-500/30" />
                </div>
            </GlassCard>

            {holidays && holidays.length > 0 ? (
                <section>
                    <div className="mb-3 flex items-center gap-2">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('holidays.title')}
                        </h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {holidays.map((h) => (
                            <div
                                key={h.id}
                                className="flex flex-col rounded-xl border border-border bg-card/70 px-3 py-2 text-xs backdrop-blur-sm"
                            >
                                <span className="font-semibold text-foreground">{h.name}</span>
                                <span className="text-muted-foreground">{formatDate(h.date, { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                            </div>
                        ))}
                    </div>
                </section>
            ) : null}

            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-20" />
                    <Skeleton className="h-20" />
                </div>
            ) : !list?.data?.length ? (
                <EmptyState
                    icon={<Calendar className="h-8 w-8" />}
                    title={t('leave.noRequests')}
                    action={
                        <Button onClick={() => setOpen(true)}>
                            <Plus className="h-4 w-4" /> {t('leave.newRequest')}
                        </Button>
                    }
                />
            ) : (
                <div className="space-y-3">
                    {list.data.map((req) => (
                        <Card key={req.id} className="border-border/70">
                            <CardContent className="flex items-start justify-between gap-3 p-4">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-medium capitalize">{req.leaveType}</span>
                                        <Badge className={cn('border-0 text-[10px] uppercase tracking-wider', STATUS_TONE[req.status])}>
                                            {t(`leave.status.${req.status}`)}
                                        </Badge>
                                    </div>
                                    <div className="mt-1 text-sm text-muted-foreground">
                                        {formatDate(req.startDate)} → {formatDate(req.endDate)}
                                        {' · '}
                                        {req.days} {req.days === 1 ? 'day' : 'days'}
                                    </div>
                                    {req.reason ? (
                                        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{req.reason}</p>
                                    ) : null}
                                </div>
                                {req.status === 'pending' ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => cancel.mutate(req.id)}
                                        disabled={cancel.isPending}
                                        aria-label="Cancel request"
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                ) : null}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <NewLeaveDialog
                open={open}
                onOpenChange={setOpen}
                employeeId={employeeId}
                onSubmitted={() => {
                    setOpen(false)
                    toast.success(t('leave.submitRequest'))
                }}
            />
        </div>
    )
}

function NewLeaveDialog({
    open,
    onOpenChange,
    employeeId,
    onSubmitted,
}: {
    open: boolean
    onOpenChange: (v: boolean) => void
    employeeId: string | undefined
    onSubmitted: () => void
}) {
    const { t } = useTranslation()
    const create = useCreateLeave()
    const [type, setType] = useState<LeaveType>('annual')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [reason, setReason] = useState('')

    function onSubmit(e: FormEvent) {
        e.preventDefault()
        if (!employeeId) return
        const body: CreateLeaveBody = {
            employeeId,
            leaveType: type,
            startDate,
            endDate,
            ...(reason ? { reason } : {}),
        }
        create.mutate(body, {
            onSuccess: () => {
                setType('annual')
                setStartDate('')
                setEndDate('')
                setReason('')
                onSubmitted()
            },
        })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('leave.newRequest')}</DialogTitle>
                </DialogHeader>
                <form className="space-y-4" onSubmit={onSubmit}>
                    <div className="space-y-1.5">
                        <Label>{t('leave.type')}</Label>
                        <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {LEAVE_TYPES.map((lt) => (
                                    <SelectItem key={lt} value={lt} className="capitalize">
                                        {lt}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>{t('leave.from')}</Label>
                            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('leave.to')}</Label>
                            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>{t('leave.reason')}</Label>
                        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" loading={create.isPending}>
                            {t('leave.submitRequest')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
