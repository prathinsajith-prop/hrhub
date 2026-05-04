import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Plane, CalendarPlus, SlidersHorizontal, Trash2, CalendarDays, TrendingDown } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { FormField } from '@/components/shared/FormField'
import { cn, formatDate } from '@/lib/utils'
import { useLeaveBalance, useLeaveRequests, useAdjustLeaveBalance } from '@/hooks/useLeave'
import {
    type LeaveAdjustment,
    type AirTicket,
    type LeaveOffset,
    type CreateAirTicketInput,
    type CreateLeaveOffsetInput,
    useLeaveAdjustments,
    useDeleteLeaveAdjustment,
    useAirTickets,
    useCreateAirTicket,
    useUpdateAirTicket,
    useDeleteAirTicket,
    useLeaveOffsets,
    useCreateLeaveOffset,
    useUpdateLeaveOffset,
    useDeleteLeaveOffset,
} from '@/hooks/useLeaveAdjustments'
import { labelFor } from '@/lib/enums'

interface LeaveRecord {
    id: string
    leaveType: string
    startDate: string
    endDate: string
    days: number
    status: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LEAVE_TYPES = ['annual', 'sick', 'maternity', 'paternity', 'compassionate', 'hajj', 'unpaid']

const AIR_TICKET_STATUS_STYLE: Record<string, string> = {
    pending:  'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    rejected: 'bg-red-50 text-red-600 ring-1 ring-red-200',
    used:     'bg-slate-100 text-slate-600',
}

const OFFSET_STATUS_STYLE: Record<string, string> = {
    pending:  'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    approved: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    rejected: 'bg-red-50 text-red-600 ring-1 ring-red-200',
}

// ─── Leave Adjustment Dialog (employee-locked) ────────────────────────────────

function LeaveAdjustmentDialog({ employeeId, onClose }: { employeeId: string; onClose: () => void }) {
    const { t } = useTranslation()
    const adjust = useAdjustLeaveBalance()

    const [form, setForm] = useState({
        leaveType: 'annual',
        year: String(new Date().getFullYear()),
        delta: '',
        reason: '',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})

    function validate() {
        const errs: Record<string, string> = {}
        if (!form.delta || isNaN(Number(form.delta)) || Number(form.delta) === 0)
            errs.delta = t('leaveAdjustments.adjustment.deltaRequired')
        if (!form.year || isNaN(Number(form.year)))
            errs.year = t('leaveAdjustments.adjustment.yearRequired')
        return errs
    }

    function handleSubmit() {
        const errs = validate()
        if (Object.keys(errs).length > 0) { setErrors(errs); return }
        setErrors({})
        adjust.mutate(
            {
                employeeId,
                leaveType: form.leaveType,
                year: Number(form.year),
                delta: Number(form.delta),
                reason: form.reason || undefined,
            },
            {
                onSuccess: () => { toast.success(t('leaveAdjustments.adjustment.created')); onClose() },
                onError: (err: Error) => toast.error(t('leaveAdjustments.adjustment.saveFailed'), err?.message),
            },
        )
    }

    const deltaNum = Number(form.delta)
    const isPositive = deltaNum > 0
    const isNegative = deltaNum < 0

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{t('leaveAdjustments.adjustment.newAdjustment')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label={t('leaveAdjustments.adjustment.leaveType')} required>
                            <Select value={form.leaveType} onValueChange={v => setForm(f => ({ ...f, leaveType: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {LEAVE_TYPES.map(lt => (
                                        <SelectItem key={lt} value={lt}>{t(`leavePolicies.types.${lt}`, { defaultValue: lt })}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </FormField>
                        <FormField label={t('leaveAdjustments.adjustment.year')} required error={errors.year}>
                            <NumericInput
                                value={form.year}
                                onChange={e => { setForm(f => ({ ...f, year: e.target.value })); setErrors(er => ({ ...er, year: '' })) }}
                                placeholder="2025"
                                maxDecimals={0}
                            />
                        </FormField>
                    </div>
                    <FormField label={t('leaveAdjustments.adjustment.delta')} required error={errors.delta}>
                        <div className="relative">
                            <NumericInput
                                value={form.delta}
                                onChange={e => { setForm(f => ({ ...f, delta: e.target.value })); setErrors(er => ({ ...er, delta: '' })) }}
                                placeholder={t('leaveAdjustments.adjustment.deltaPlaceholder')}
                                maxDecimals={2}
                                allowNegative
                                aria-invalid={!!errors.delta}
                                className={cn(
                                    form.delta && isPositive && 'border-emerald-400 focus-visible:ring-emerald-300',
                                    form.delta && isNegative && 'border-red-400 focus-visible:ring-red-300',
                                )}
                            />
                            {form.delta && (
                                <span className={cn(
                                    'absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold',
                                    isPositive ? 'text-emerald-600' : 'text-red-600',
                                )}>
                                    {isPositive ? `+${deltaNum}` : deltaNum} {t('leaveAdjustments.days')}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{t('leaveAdjustments.adjustment.deltaHint')}</p>
                    </FormField>
                    <FormField label={t('leaveAdjustments.adjustment.reason')}>
                        <Input
                            value={form.reason}
                            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                            placeholder={t('leaveAdjustments.adjustment.reasonPlaceholder')}
                        />
                    </FormField>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={adjust.isPending}>
                        {adjust.isPending ? t('common.loading') : t('common.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Air Ticket Dialog (employee-locked) ──────────────────────────────────────

function AirTicketDialog({ employeeId, ticket, onClose }: { employeeId: string; ticket?: AirTicket; onClose: () => void }) {
    const { t } = useTranslation()
    const create = useCreateAirTicket()
    const update = useUpdateAirTicket()

    const [form, setForm] = useState({
        year: String(ticket?.year ?? new Date().getFullYear()),
        ticketFor: (ticket?.ticketFor ?? 'self') as CreateAirTicketInput['ticketFor'],
        destination: ticket?.destination ?? '',
        amount: ticket?.amount ? String(ticket.amount) : '',
        reason: ticket?.reason ?? '',
        notes: ticket?.notes ?? '',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const isEdit = !!ticket

    function validate() {
        const errs: Record<string, string> = {}
        if (!form.year || isNaN(Number(form.year))) errs.year = t('leaveAdjustments.adjustment.yearRequired')
        return errs
    }

    function handleSubmit() {
        const errs = validate()
        if (Object.keys(errs).length > 0) { setErrors(errs); return }
        setErrors({})
        const payload: CreateAirTicketInput = {
            employeeId,
            year: Number(form.year),
            ticketFor: form.ticketFor,
            destination: form.destination || undefined,
            amount: form.amount ? Number(form.amount) : undefined,
            reason: form.reason || undefined,
            notes: form.notes || undefined,
        }
        if (isEdit) {
            update.mutate(
                { id: ticket.id, ...payload },
                {
                    onSuccess: () => { toast.success(t('leaveAdjustments.airTicket.updated')); onClose() },
                    onError: (err: Error) => toast.error(t('leaveAdjustments.airTicket.saveFailed'), err?.message),
                },
            )
        } else {
            create.mutate(payload, {
                onSuccess: () => { toast.success(t('leaveAdjustments.airTicket.created')); onClose() },
                onError: (err: Error) => toast.error(t('leaveAdjustments.airTicket.saveFailed'), err?.message),
            })
        }
    }

    const isPending = create.isPending || update.isPending

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? t('leaveAdjustments.airTicket.editTitle') : t('leaveAdjustments.airTicket.newAirTicket')}
                    </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label={t('leaveAdjustments.adjustment.year')} required error={errors.year}>
                            <NumericInput
                                value={form.year}
                                onChange={e => { setForm(f => ({ ...f, year: e.target.value })); setErrors(er => ({ ...er, year: '' })) }}
                                placeholder="2025"
                                maxDecimals={0}
                            />
                        </FormField>
                        <FormField label={t('leaveAdjustments.airTicket.ticketFor')} required>
                            <Select value={form.ticketFor} onValueChange={v => setForm(f => ({ ...f, ticketFor: v as CreateAirTicketInput['ticketFor'] }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="self">{t('leaveAdjustments.airTicket.forSelf')}</SelectItem>
                                    <SelectItem value="family">{t('leaveAdjustments.airTicket.forFamily')}</SelectItem>
                                    <SelectItem value="both">{t('leaveAdjustments.airTicket.forBoth')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label={t('leaveAdjustments.airTicket.destination')}>
                            <Input
                                value={form.destination}
                                onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                                placeholder={t('leaveAdjustments.airTicket.destinationPlaceholder')}
                            />
                        </FormField>
                        <FormField label={`${t('leaveAdjustments.airTicket.amount')} (AED)`}>
                            <NumericInput
                                value={form.amount}
                                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                                placeholder="0.00"
                                maxDecimals={2}
                            />
                        </FormField>
                    </div>
                    <FormField label={t('leaveAdjustments.adjustment.reason')}>
                        <Input
                            value={form.reason}
                            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                            placeholder={t('leaveAdjustments.airTicket.reasonPlaceholder')}
                        />
                    </FormField>
                    <FormField label={t('common.notes')}>
                        <Input
                            value={form.notes}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        />
                    </FormField>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending ? t('common.loading') : isEdit ? t('common.save') : t('common.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Offset Dialog (employee-locked) ──────────────────────────────────────────

function OffsetDialog({ employeeId, offset, onClose }: { employeeId: string; offset?: LeaveOffset; onClose: () => void }) {
    const { t } = useTranslation()
    const create = useCreateLeaveOffset()
    const update = useUpdateLeaveOffset()

    const [form, setForm] = useState({
        workDate: offset?.workDate ?? '',
        days: offset?.days ? String(offset.days) : '1',
        reason: offset?.reason ?? '',
        notes: offset?.notes ?? '',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const isEdit = !!offset

    function validate() {
        const errs: Record<string, string> = {}
        if (!form.workDate) errs.workDate = t('leaveAdjustments.offset.workDateRequired')
        if (!form.days || isNaN(Number(form.days)) || Number(form.days) <= 0) errs.days = t('leaveAdjustments.offset.daysRequired')
        return errs
    }

    function handleSubmit() {
        const errs = validate()
        if (Object.keys(errs).length > 0) { setErrors(errs); return }
        setErrors({})
        const payload: CreateLeaveOffsetInput = {
            employeeId,
            workDate: form.workDate,
            days: Number(form.days),
            reason: form.reason || undefined,
            notes: form.notes || undefined,
        }
        if (isEdit) {
            update.mutate(
                { id: offset.id, ...payload },
                {
                    onSuccess: () => { toast.success(t('leaveAdjustments.offset.updated')); onClose() },
                    onError: (err: Error) => toast.error(t('leaveAdjustments.offset.saveFailed'), err?.message),
                },
            )
        } else {
            create.mutate(payload, {
                onSuccess: () => { toast.success(t('leaveAdjustments.offset.created')); onClose() },
                onError: (err: Error) => toast.error(t('leaveAdjustments.offset.saveFailed'), err?.message),
            })
        }
    }

    const isPending = create.isPending || update.isPending

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? t('leaveAdjustments.offset.editTitle') : t('leaveAdjustments.offset.newOffset')}
                    </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <div className="grid grid-cols-2 gap-4">
                        <FormField label={t('leaveAdjustments.offset.workDate')} required error={errors.workDate}>
                            <Input
                                type="date"
                                value={form.workDate}
                                onChange={e => { setForm(f => ({ ...f, workDate: e.target.value })); setErrors(er => ({ ...er, workDate: '' })) }}
                                aria-invalid={!!errors.workDate}
                            />
                        </FormField>
                        <FormField label={t('leaveAdjustments.offset.days')} required error={errors.days}>
                            <NumericInput
                                value={form.days}
                                onChange={e => { setForm(f => ({ ...f, days: e.target.value })); setErrors(er => ({ ...er, days: '' })) }}
                                placeholder="1"
                                maxDecimals={2}
                                aria-invalid={!!errors.days}
                            />
                        </FormField>
                    </div>
                    <FormField label={t('leaveAdjustments.adjustment.reason')}>
                        <Input
                            value={form.reason}
                            onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                            placeholder={t('leaveAdjustments.offset.reasonPlaceholder')}
                        />
                    </FormField>
                    <FormField label={t('common.notes')}>
                        <Input
                            value={form.notes}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        />
                    </FormField>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending ? t('common.loading') : isEdit ? t('common.save') : t('common.submit')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Balance Tab ──────────────────────────────────────────────────────────────

function BalanceTab({ employeeId }: { employeeId: string }) {
    const { data: balanceData, isLoading } = useLeaveBalance(employeeId)

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Leave Balance — {new Date().getFullYear()}</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
                    </div>
                ) : !balanceData?.balance ? (
                    <p className="text-sm text-muted-foreground text-center py-6">No leave data available</p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {Object.entries(balanceData.balance)
                            .filter(([, b]) => b.entitled !== 0)
                            .map(([type, b]) => {
                                const isUnlimited = b.entitled === -1
                                const pct = isUnlimited ? 0 : Math.min(100, Math.round((b.taken / (b.entitled || 1)) * 100))
                                const isLow = !isUnlimited && b.available <= 3 && b.entitled > 0
                                return (
                                    <div key={type} className="rounded-lg border bg-card p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-1">
                                            <span className="text-xs font-medium leading-tight">{labelFor(type)}</span>
                                            {isLow && <TrendingDown className="h-3 w-3 text-destructive shrink-0 mt-0.5" />}
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className={cn('text-xl font-bold font-display', isLow ? 'text-destructive' : 'text-foreground')}>
                                                {isUnlimited ? '∞' : b.available}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground">/ {isUnlimited ? '∞' : b.entitled} days</span>
                                        </div>
                                        {!isUnlimited && (
                                            <div className="w-full bg-muted rounded-full h-1.5">
                                                <div
                                                    className={cn('h-1.5 rounded-full transition-all', pct >= 80 ? 'bg-destructive' : pct >= 50 ? 'bg-warning' : 'bg-success')}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        )}
                                        <div className="flex gap-2 text-[10px] text-muted-foreground">
                                            <span>Used: <strong className="text-foreground">{b.taken}</strong></span>
                                            {b.pending > 0 && <span>Pending: <strong className="text-warning">{b.pending}</strong></span>}
                                        </div>
                                    </div>
                                )
                            })}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ employeeId }: { employeeId: string }) {
    const { data, isLoading } = useLeaveRequests({ employeeId, limit: 20 })
    const requests = (data?.data ?? []) as LeaveRecord[]

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Leave History</CardTitle>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : requests.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
                        <p className="text-sm font-medium">No leave requests found</p>
                    </div>
                ) : (
                    <div className="divide-y">
                        {requests.map(req => (
                            <div key={req.id} className="py-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-sm font-medium capitalize">{labelFor(req.leaveType)} Leave</p>
                                    <p className="text-xs text-muted-foreground">
                                        {formatDate(req.startDate)} — {formatDate(req.endDate)} · {req.days} day{req.days !== 1 ? 's' : ''}
                                    </p>
                                </div>
                                <Badge
                                    variant={req.status === 'approved' ? 'success' : req.status === 'rejected' ? 'destructive' : req.status === 'pending' ? 'warning' : 'secondary'}
                                    className="text-[10px] capitalize shrink-0"
                                >
                                    {req.status}
                                </Badge>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

// ─── Adjustments Tab ──────────────────────────────────────────────────────────

function AdjustmentsTab({ employeeId, canManage }: { employeeId: string; canManage: boolean }) {
    const { t } = useTranslation()
    const { data, isLoading } = useLeaveAdjustments({ employeeId })
    const deleteMut = useDeleteLeaveAdjustment()
    const [createOpen, setCreateOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<LeaveAdjustment | null>(null)

    const adjustments = data?.data ?? []

    return (
        <div className="space-y-4">
            {canManage && (
                <div className="flex justify-end">
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        {t('leaveAdjustments.adjustment.newAdjustment')}
                    </Button>
                </div>
            )}

            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.leaveType')}</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.delta')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.reason')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.createdBy')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.createdAt')}</th>
                                {canManage && <th className="px-4 py-3" />}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        {Array.from({ length: canManage ? 6 : 5 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : adjustments.length === 0 ? (
                                <tr>
                                    <td colSpan={canManage ? 6 : 5} className="px-4 py-10 text-center text-muted-foreground">
                                        <SlidersHorizontal className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">{t('leaveAdjustments.adjustment.noAdjustments')}</p>
                                    </td>
                                </tr>
                            ) : (
                                adjustments.map(adj => {
                                    const delta = Number(adj.delta)
                                    const isPos = delta >= 0
                                    return (
                                        <tr key={adj.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3 capitalize">
                                                {t(`leavePolicies.types.${adj.leaveType}`, { defaultValue: adj.leaveType })}
                                                <span className="text-xs text-muted-foreground ml-1">({adj.year})</span>
                                            </td>
                                            <td className={cn('px-4 py-3 text-right font-semibold', isPos ? 'text-emerald-600' : 'text-red-600')}>
                                                {isPos ? '+' : ''}{delta} {t('leaveAdjustments.days')}
                                            </td>
                                            <td className="px-4 py-3 text-muted-foreground">{adj.reason ?? '—'}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{adj.createdByName ?? '—'}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{formatDate(adj.createdAt)}</td>
                                            {canManage && (
                                                <td className="px-4 py-3">
                                                    <Button
                                                        variant="ghost" size="icon"
                                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                                        onClick={() => setDeleteTarget(adj)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
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

            {createOpen && <LeaveAdjustmentDialog employeeId={employeeId} onClose={() => setCreateOpen(false)} />}

            <ConfirmDialog
                open={!!deleteTarget}
                variant="destructive"
                title={t('leaveAdjustments.adjustment.deleteTitle')}
                description={t('leaveAdjustments.adjustment.deleteDesc')}
                confirmLabel={t('common.delete')}
                onConfirm={() => {
                    if (!deleteTarget) return
                    deleteMut.mutate(deleteTarget.id, {
                        onSuccess: () => { toast.success(t('leaveAdjustments.adjustment.deleted')); setDeleteTarget(null) },
                        onError: (err: Error) => toast.error(t('leaveAdjustments.adjustment.deleteFailed'), err?.message),
                    })
                }}
                onOpenChange={open => { if (!open) setDeleteTarget(null) }}
            />
        </div>
    )
}

// ─── Air Tickets Tab ──────────────────────────────────────────────────────────

function AirTicketsTab({ employeeId, canManage }: { employeeId: string; canManage: boolean }) {
    const { t } = useTranslation()
    const { data, isLoading } = useAirTickets({ employeeId })
    const deleteMut = useDeleteAirTicket()
    const [createOpen, setCreateOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<AirTicket | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<AirTicket | null>(null)

    const tickets = data?.data ?? []

    return (
        <div className="space-y-4">
            {canManage && (
                <div className="flex justify-end">
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        {t('leaveAdjustments.airTicket.newAirTicket')}
                    </Button>
                </div>
            )}

            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.airTicket.ticketFor')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.adjustment.year')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.airTicket.destination')}</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.airTicket.amount')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('common.status')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.createdAt')}</th>
                                {canManage && <th className="px-4 py-3" />}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        {Array.from({ length: canManage ? 7 : 6 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : tickets.length === 0 ? (
                                <tr>
                                    <td colSpan={canManage ? 7 : 6} className="px-4 py-10 text-center text-muted-foreground">
                                        <Plane className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">{t('leaveAdjustments.airTicket.noTickets')}</p>
                                    </td>
                                </tr>
                            ) : (
                                tickets.map(ticket => (
                                    <tr key={ticket.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3 capitalize">
                                            {t(`leaveAdjustments.airTicket.for${ticket.ticketFor.charAt(0).toUpperCase() + ticket.ticketFor.slice(1)}`)}
                                        </td>
                                        <td className="px-4 py-3">{ticket.year}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{ticket.destination ?? '—'}</td>
                                        <td className="px-4 py-3 text-right">
                                            {ticket.amount ? `${ticket.currency} ${Number(ticket.amount).toLocaleString()}` : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', AIR_TICKET_STATUS_STYLE[ticket.status])}>
                                                {t(`leaveAdjustments.airTicket.status.${ticket.status}`)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{formatDate(ticket.createdAt)}</td>
                                        {canManage && (
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1 justify-end">
                                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditTarget(ticket)}>
                                                        {t('common.edit')}
                                                    </Button>
                                                    <Button
                                                        variant="ghost" size="icon"
                                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                                        onClick={() => setDeleteTarget(ticket)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {createOpen && <AirTicketDialog employeeId={employeeId} onClose={() => setCreateOpen(false)} />}
            {editTarget && <AirTicketDialog employeeId={employeeId} ticket={editTarget} onClose={() => setEditTarget(null)} />}

            <ConfirmDialog
                open={!!deleteTarget}
                variant="destructive"
                title={t('leaveAdjustments.airTicket.deleteTitle')}
                description={t('leaveAdjustments.airTicket.deleteDesc')}
                confirmLabel={t('common.delete')}
                onConfirm={() => {
                    if (!deleteTarget) return
                    deleteMut.mutate(deleteTarget.id, {
                        onSuccess: () => { toast.success(t('leaveAdjustments.airTicket.deleted')); setDeleteTarget(null) },
                        onError: (err: Error) => toast.error(t('leaveAdjustments.airTicket.deleteFailed'), err?.message),
                    })
                }}
                onOpenChange={open => { if (!open) setDeleteTarget(null) }}
            />
        </div>
    )
}

// ─── Offsets Tab ──────────────────────────────────────────────────────────────

function OffsetsTab({ employeeId, canManage }: { employeeId: string; canManage: boolean }) {
    const { t } = useTranslation()
    const { data, isLoading } = useLeaveOffsets({ employeeId })
    const deleteMut = useDeleteLeaveOffset()
    const [createOpen, setCreateOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<LeaveOffset | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<LeaveOffset | null>(null)

    const offsets = data?.data ?? []

    return (
        <div className="space-y-4">
            {canManage && (
                <div className="flex justify-end">
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        {t('leaveAdjustments.offset.newOffset')}
                    </Button>
                </div>
            )}

            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.offset.workDate')}</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.offset.days')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.reason')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('common.status')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.createdAt')}</th>
                                {canManage && <th className="px-4 py-3" />}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 3 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        {Array.from({ length: canManage ? 6 : 5 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : offsets.length === 0 ? (
                                <tr>
                                    <td colSpan={canManage ? 6 : 5} className="px-4 py-10 text-center text-muted-foreground">
                                        <CalendarPlus className="h-8 w-8 mx-auto mb-2 opacity-30" />
                                        <p className="text-sm">{t('leaveAdjustments.offset.noOffsets')}</p>
                                    </td>
                                </tr>
                            ) : (
                                offsets.map(offset => (
                                    <tr key={offset.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3">{formatDate(offset.workDate)}</td>
                                        <td className="px-4 py-3 text-right">{offset.days}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{offset.reason ?? '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', OFFSET_STATUS_STYLE[offset.status])}>
                                                {t(`leaveAdjustments.offset.status.${offset.status}`)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{formatDate(offset.createdAt)}</td>
                                        {canManage && (
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1 justify-end">
                                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditTarget(offset)}>
                                                        {t('common.edit')}
                                                    </Button>
                                                    <Button
                                                        variant="ghost" size="icon"
                                                        className="h-7 w-7 text-destructive hover:text-destructive"
                                                        onClick={() => setDeleteTarget(offset)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {createOpen && <OffsetDialog employeeId={employeeId} onClose={() => setCreateOpen(false)} />}
            {editTarget && <OffsetDialog employeeId={employeeId} offset={editTarget} onClose={() => setEditTarget(null)} />}

            <ConfirmDialog
                open={!!deleteTarget}
                variant="destructive"
                title={t('leaveAdjustments.offset.deleteTitle')}
                description={t('leaveAdjustments.offset.deleteDesc')}
                confirmLabel={t('common.delete')}
                onConfirm={() => {
                    if (!deleteTarget) return
                    deleteMut.mutate(deleteTarget.id, {
                        onSuccess: () => { toast.success(t('leaveAdjustments.offset.deleted')); setDeleteTarget(null) },
                        onError: (err: Error) => toast.error(t('leaveAdjustments.offset.saveFailed'), err?.message),
                    })
                }}
                onOpenChange={open => { if (!open) setDeleteTarget(null) }}
            />
        </div>
    )
}

// ─── EmployeeLeavePanel ───────────────────────────────────────────────────────

interface EmployeeLeavePanelProps {
    employeeId: string
    canManage: boolean
}

export function EmployeeLeavePanel({ employeeId, canManage }: EmployeeLeavePanelProps) {
    const { t } = useTranslation()

    return (
        <Tabs defaultValue="balance" className="space-y-4">
            <TabsList className="h-9 bg-muted/50 p-1">
                <TabsTrigger value="balance" className="text-xs gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    Balance
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" />
                    History
                </TabsTrigger>
                <TabsTrigger value="air-tickets" className="text-xs gap-1.5">
                    <Plane className="h-3.5 w-3.5" />
                    {t('leaveAdjustments.tabAirTicket')}
                </TabsTrigger>
                <TabsTrigger value="adjustments" className="text-xs gap-1.5">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {t('leaveAdjustments.tabLeaveAdjustment')}
                </TabsTrigger>
                <TabsTrigger value="offsets" className="text-xs gap-1.5">
                    <CalendarPlus className="h-3.5 w-3.5" />
                    {t('leaveAdjustments.tabOffsetAdjustment')}
                </TabsTrigger>
            </TabsList>

            <TabsContent value="balance">
                <BalanceTab employeeId={employeeId} />
            </TabsContent>

            <TabsContent value="history">
                <HistoryTab employeeId={employeeId} />
            </TabsContent>

            <TabsContent value="air-tickets">
                <AirTicketsTab employeeId={employeeId} canManage={canManage} />
            </TabsContent>

            <TabsContent value="adjustments">
                <AdjustmentsTab employeeId={employeeId} canManage={canManage} />
            </TabsContent>

            <TabsContent value="offsets">
                <OffsetsTab employeeId={employeeId} canManage={canManage} />
            </TabsContent>
        </Tabs>
    )
}
