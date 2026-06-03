import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ArrowRight, Calendar, CalendarDays, Plus, X } from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import {
    useCancelLeave,
    useCreateLeave,
    useLeaveBalance,
    useLeaveRequests,
    type CreateLeaveBody,
} from '@/hooks/useLeave'
import { useColleagues } from '@/hooks/useTeam'
import { useUpcomingHolidays } from '@/hooks/useHolidays'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { GlassCard } from '@/components/shared/GlassCard'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
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

/**
 * Inclusive day count between two YYYY-MM-DD strings. Returns 0 when either
 * end is missing or end < start, so callers can render the chip without
 * worrying about NaN or negative numbers.
 */
function computeDays(startISO: string, endISO: string): number {
    if (!startISO || !endISO) return 0
    const start = new Date(startISO + 'T00:00:00Z').getTime()
    const end = new Date(endISO + 'T00:00:00Z').getTime()
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
    return Math.round((end - start) / 86_400_000) + 1
}

const STATUS_TONE: Record<LeaveStatus, string> = {
    pending: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    approved: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
    rejected: 'bg-rose-100 text-rose-900 dark:bg-rose-950/40 dark:text-rose-200',
    cancelled: 'bg-muted text-foreground',
}

export function EmployeeLeavePage() {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const employeeId = user?.employeeId ?? undefined

    const [open, setOpen] = useState(false)
    const [cancelingId, setCancelingId] = useState<string | null>(null)
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
                        <Plus className="size-4" /> {t('leave.newRequest')}
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
                    <Calendar className="size-12 text-indigo-400/40 dark:text-indigo-500/30" />
                </div>
            </GlassCard>

            {holidays && holidays.length > 0 ? (
                <section>
                    <div className="mb-3 flex items-center gap-2">
                        <CalendarDays className="size-4 text-muted-foreground" />
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
                    icon={<Calendar className="size-8" />}
                    title={t('leave.noRequests')}
                    action={
                        <Button onClick={() => setOpen(true)}>
                            <Plus className="size-4" /> {t('leave.newRequest')}
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
                                        <span className="font-medium">
                                            {t(`leave.types.${req.leaveType}`, { defaultValue: req.leaveType })}
                                        </span>
                                        <Badge className={cn('border-0 text-xs uppercase tracking-wider', STATUS_TONE[req.status])}>
                                            {t(`leave.status.${req.status}`)}
                                        </Badge>
                                    </div>
                                    <div className="mt-1 inline-flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                                        {formatDate(req.startDate)}
                                        <ArrowRight className="size-3.5" data-rtl-flip />
                                        {formatDate(req.endDate)}
                                        {' · '}
                                        {t(req.days === 1 ? 'leave.days' : 'leave.days_plural', { count: req.days })}
                                    </div>
                                    {req.reason ? (
                                        <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{req.reason}</p>
                                    ) : null}
                                </div>
                                {req.status === 'pending' ? (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setCancelingId(req.id)}
                                        disabled={cancel.isPending}
                                        aria-label={t('leave.cancelRequest', { defaultValue: 'Cancel request' })}
                                    >
                                        <X className="size-4" />
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
                    toast.success(t('leave.requestSubmitted', { defaultValue: 'Leave request submitted' }))
                }}
            />

            <ConfirmDialog
                open={!!cancelingId}
                onOpenChange={(v) => !v && setCancelingId(null)}
                title={t('leave.cancelConfirmTitle', { defaultValue: 'Cancel this leave request?' })}
                description={t('leave.cancelConfirmDesc', {
                    defaultValue:
                        'This will withdraw the request. Your manager will no longer see it as pending.',
                })}
                confirmLabel={t('leave.cancelConfirmYes', { defaultValue: 'Yes, cancel' })}
                cancelLabel={t('leave.cancelConfirmKeep', { defaultValue: 'Keep request' })}
                variant="destructive"
                loading={cancel.isPending}
                onConfirm={() => {
                    if (!cancelingId) return
                    cancel.mutate(cancelingId, {
                        onSuccess: () => {
                            toast.success(t('leave.cancelled', { defaultValue: 'Leave request cancelled' }))
                            setCancelingId(null)
                        },
                    })
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
    const { data: colleagues = [] } = useColleagues()
    const [type, setType] = useState<LeaveType>('annual')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [reason, setReason] = useState('')
    const [handoverTo, setHandoverTo] = useState('')
    const [handoverNotes, setHandoverNotes] = useState('')

    // Handover required only if there's actually someone to hand over to.
    // A solo employee (no other active member in their department) shouldn't
    // be blocked from submitting.
    const handoverRequired = colleagues.length > 0

    // Hoist "today" so both date inputs share the same lower bound and the
    // recomputation stays cheap.
    const todayISO = new Date().toISOString().slice(0, 10)

    // Derived day count — inclusive of both endpoints. Lets the UI show
    // "3 days" next to the date row without an extra state field.
    const days = computeDays(startDate, endDate)

    function handleStartChange(value: string) {
        setStartDate(value)
        // Snap end-date forward when it would otherwise leave the request
        // invalid (empty, or earlier than the new start). Default to a
        // one-day request — that's the most common case and saves a click.
        if (!endDate || endDate < value) setEndDate(value)
    }

    function onSubmit(e: FormEvent) {
        e.preventDefault()
        if (!employeeId) return
        if (!startDate || !endDate) return
        if (endDate < startDate) {
            toast.error(t('leave.endBeforeStart', { defaultValue: 'End date can\'t be before the start date' }))
            return
        }
        if (handoverRequired && !handoverTo) {
            toast.error(t('leave.handoverRequired', { defaultValue: 'Please pick a colleague to hand over to' }))
            return
        }
        const body: CreateLeaveBody = {
            employeeId,
            leaveType: type,
            startDate,
            endDate,
            ...(reason ? { reason } : {}),
            ...(handoverTo ? { handoverTo } : {}),
            ...(handoverNotes ? { handoverNotes } : {}),
        }
        create.mutate(body, {
            onSuccess: () => {
                setType('annual')
                setStartDate('')
                setEndDate('')
                setReason('')
                setHandoverTo('')
                setHandoverNotes('')
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
                                    <SelectItem key={lt} value={lt}>
                                        {t(`leave.types.${lt}`, { defaultValue: lt })}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="leave-from">{t('leave.from')}</Label>
                            <DatePicker
                                id="leave-from"
                                value={startDate}
                                min={todayISO}
                                onChange={handleStartChange}
                                placeholder={t('leave.from')}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="leave-to">{t('leave.to')}</Label>
                            <DatePicker
                                id="leave-to"
                                value={endDate}
                                // End picker can't go earlier than the chosen start.
                                // Falls back to today when start isn't picked yet.
                                min={startDate || todayISO}
                                onChange={setEndDate}
                                disabled={!startDate}
                                placeholder={t('leave.to')}
                            />
                        </div>
                    </div>
                    {days > 0 ? (
                        <p className="-mt-2 text-xs text-muted-foreground">
                            {t(days === 1 ? 'leave.days' : 'leave.days_plural', { count: days })}
                        </p>
                    ) : null}
                    <div className="space-y-1.5">
                        <Label>{t('leave.reason')}</Label>
                        <Textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            maxLength={500}
                            rows={2}
                        />
                    </div>

                    {/* Handover — required iff there's at least one colleague in
                        the same department, so a single-person department isn't
                        blocked from applying. */}
                    <div className="space-y-1.5">
                        <Label>
                            {t('leave.handoverTo', { defaultValue: 'Handover to' })}
                            {handoverRequired ? <span className="ms-0.5 text-destructive">*</span> : null}
                        </Label>
                        {colleagues.length > 0 ? (
                            <Select value={handoverTo} onValueChange={setHandoverTo}>
                                <SelectTrigger aria-invalid={handoverRequired && !handoverTo ? 'true' : 'false'}>
                                    <SelectValue placeholder={t('common.selectEmployee', { defaultValue: 'Select an employee' })} />
                                </SelectTrigger>
                                <SelectContent>
                                    {colleagues.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.firstName} {c.lastName}
                                            {c.designation ? <span className="ms-1 text-xs text-muted-foreground"> · {c.designation}</span> : null}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        ) : (
                            <p className="rounded-md border border-dashed border-border bg-card/40 px-3 py-2 text-xs text-muted-foreground">
                                {t('leave.noColleaguesHandover', {
                                    defaultValue: 'No colleagues in your department: handover not required.',
                                })}
                            </p>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t('leave.handoverNotes', { defaultValue: 'Handover notes (optional)' })}</Label>
                        <Textarea
                            value={handoverNotes}
                            onChange={(e) => setHandoverNotes(e.target.value)}
                            maxLength={500}
                            rows={2}
                            placeholder={t('leave.handoverNotesPlaceholder', {
                                defaultValue: 'e.g. follow up with the Acme deal on Tuesday',
                            })}
                        />
                        {handoverTo ? (
                            <p className="text-xs text-muted-foreground">
                                {t('leave.handoverNotifyNote', {
                                    defaultValue:
                                        'Your handover person will be notified once HR approves this request.',
                                })}
                            </p>
                        ) : null}
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
