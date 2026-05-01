import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Plane, CalendarPlus, SlidersHorizontal, Trash2 } from 'lucide-react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { FormField } from '@/components/shared/FormField'
import { cn } from '@/lib/utils'
import { useEmployees } from '@/hooks/useEmployees'
import { useAdjustLeaveBalance } from '@/hooks/useLeave'
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
import { useAuthStore } from '@/store/authStore'
import { hasPermission } from '@/lib/permissions'
import type { UserRole } from '@/types'

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

function formatDate(iso: string | null | undefined) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ─── Leave Adjustment Dialog ──────────────────────────────────────────────────

function LeaveAdjustmentDialog({ onClose }: { onClose: () => void }) {
    const { t } = useTranslation()
    const { data: empData } = useEmployees({ limit: 500, status: 'active' })
    const adjust = useAdjustLeaveBalance()

    const [form, setForm] = useState({
        employeeId: '',
        leaveType: 'annual',
        year: String(new Date().getFullYear()),
        delta: '',
        reason: '',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const employees = empData?.data ?? []

    function validate() {
        const errs: Record<string, string> = {}
        if (!form.employeeId) errs.employeeId = t('leaveAdjustments.adjustment.employeeRequired')
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
                employeeId: form.employeeId,
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
                    <FormField label={t('leaveAdjustments.adjustment.employee')} required error={errors.employeeId}>
                        <Select value={form.employeeId} onValueChange={v => { setForm(f => ({ ...f, employeeId: v })); setErrors(e => ({ ...e, employeeId: '' })) }}>
                            <SelectTrigger aria-invalid={!!errors.employeeId}><SelectValue placeholder={t('training.selectEmployee')} /></SelectTrigger>
                            <SelectContent>
                                {employees.map(e => (
                                    <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>
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

// ─── Air Ticket Dialog ────────────────────────────────────────────────────────

function AirTicketDialog({ ticket, onClose }: { ticket?: AirTicket; onClose: () => void }) {
    const { t } = useTranslation()
    const { data: empData } = useEmployees({ limit: 500, status: 'active' })
    const create = useCreateAirTicket()
    const update = useUpdateAirTicket()

    const [form, setForm] = useState({
        employeeId: ticket?.employeeId ?? '',
        year: String(ticket?.year ?? new Date().getFullYear()),
        ticketFor: (ticket?.ticketFor ?? 'self') as CreateAirTicketInput['ticketFor'],
        destination: ticket?.destination ?? '',
        amount: ticket?.amount ? String(ticket.amount) : '',
        reason: ticket?.reason ?? '',
        notes: ticket?.notes ?? '',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const employees = empData?.data ?? []
    const isEdit = !!ticket

    function validate() {
        const errs: Record<string, string> = {}
        if (!form.employeeId) errs.employeeId = t('leaveAdjustments.airTicket.employeeRequired')
        if (!form.year || isNaN(Number(form.year))) errs.year = t('leaveAdjustments.adjustment.yearRequired')
        return errs
    }

    function handleSubmit() {
        const errs = validate()
        if (Object.keys(errs).length > 0) { setErrors(errs); return }
        setErrors({})
        const payload: CreateAirTicketInput = {
            employeeId: form.employeeId,
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
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? t('leaveAdjustments.airTicket.editTitle') : t('leaveAdjustments.airTicket.newAirTicket')}
                    </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <FormField label={t('leaveAdjustments.adjustment.employee')} required error={errors.employeeId}>
                        <Select
                            value={form.employeeId}
                            onValueChange={v => { setForm(f => ({ ...f, employeeId: v })); setErrors(e => ({ ...e, employeeId: '' })) }}
                            disabled={isEdit}
                        >
                            <SelectTrigger aria-invalid={!!errors.employeeId}><SelectValue placeholder={t('training.selectEmployee')} /></SelectTrigger>
                            <SelectContent>
                                {employees.map(e => (
                                    <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>
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

// ─── Offset Dialog ────────────────────────────────────────────────────────────

function OffsetDialog({ offset, onClose }: { offset?: LeaveOffset; onClose: () => void }) {
    const { t } = useTranslation()
    const { data: empData } = useEmployees({ limit: 500, status: 'active' })
    const create = useCreateLeaveOffset()
    const update = useUpdateLeaveOffset()

    const [form, setForm] = useState({
        employeeId: offset?.employeeId ?? '',
        workDate: offset?.workDate ?? '',
        days: offset?.days ? String(offset.days) : '1',
        reason: offset?.reason ?? '',
        notes: offset?.notes ?? '',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const employees = empData?.data ?? []
    const isEdit = !!offset

    function validate() {
        const errs: Record<string, string> = {}
        if (!form.employeeId) errs.employeeId = t('leaveAdjustments.offset.employeeRequired')
        if (!form.workDate) errs.workDate = t('leaveAdjustments.offset.workDateRequired')
        if (!form.days || isNaN(Number(form.days)) || Number(form.days) <= 0) errs.days = t('leaveAdjustments.offset.daysRequired')
        return errs
    }

    function handleSubmit() {
        const errs = validate()
        if (Object.keys(errs).length > 0) { setErrors(errs); return }
        setErrors({})
        const payload: CreateLeaveOffsetInput = {
            employeeId: form.employeeId,
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
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? t('leaveAdjustments.offset.editTitle') : t('leaveAdjustments.offset.newOffset')}
                    </DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <FormField label={t('leaveAdjustments.adjustment.employee')} required error={errors.employeeId}>
                        <Select
                            value={form.employeeId}
                            onValueChange={v => { setForm(f => ({ ...f, employeeId: v })); setErrors(e => ({ ...e, employeeId: '' })) }}
                            disabled={isEdit}
                        >
                            <SelectTrigger aria-invalid={!!errors.employeeId}><SelectValue placeholder={t('training.selectEmployee')} /></SelectTrigger>
                            <SelectContent>
                                {employees.map(e => (
                                    <SelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>
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

// ─── Leave Adjustments Tab ────────────────────────────────────────────────────

function LeaveAdjustmentsTab({ canManage }: { canManage: boolean }) {
    const { t } = useTranslation()
    const { data, isLoading } = useLeaveAdjustments()
    const deleteMut = useDeleteLeaveAdjustment()
    const [createOpen, setCreateOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<LeaveAdjustment | null>(null)

    const adjustments = data?.data ?? []

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-base">{t('leaveAdjustments.tabLeaveAdjustment')}</h3>
                    <p className="text-sm text-muted-foreground">{t('leaveAdjustments.adjustment.desc')}</p>
                </div>
                {canManage && (
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        {t('leaveAdjustments.adjustment.newAdjustment')}
                    </Button>
                )}
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.employee')}</th>
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
                                Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        {Array.from({ length: canManage ? 7 : 6 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : adjustments.length === 0 ? (
                                <tr>
                                    <td colSpan={canManage ? 7 : 6} className="px-4 py-12 text-center text-muted-foreground">
                                        <SlidersHorizontal className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                        <p>{t('leaveAdjustments.adjustment.noAdjustments')}</p>
                                    </td>
                                </tr>
                            ) : (
                                adjustments.map(adj => {
                                    const delta = Number(adj.delta)
                                    const isPos = delta >= 0
                                    return (
                                        <tr key={adj.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-3 font-medium">{adj.employeeName ?? '—'}</td>
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

            {createOpen && <LeaveAdjustmentDialog onClose={() => setCreateOpen(false)} />}

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

function AirTicketsTab({ canManage }: { canManage: boolean }) {
    const { t } = useTranslation()
    const { data, isLoading } = useAirTickets()
    const deleteMut = useDeleteAirTicket()
    const [createOpen, setCreateOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<AirTicket | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<AirTicket | null>(null)

    const tickets = data?.data ?? []

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-base">{t('leaveAdjustments.tabAirTicket')}</h3>
                    <p className="text-sm text-muted-foreground">{t('leaveAdjustments.airTicket.desc')}</p>
                </div>
                {canManage && (
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        {t('leaveAdjustments.airTicket.newAirTicket')}
                    </Button>
                )}
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.employee')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.airTicket.ticketFor')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.airTicket.destination')}</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.airTicket.amount')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.reason')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.createdBy')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.createdAt')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('common.status')}</th>
                                {canManage && <th className="px-4 py-3" />}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        {Array.from({ length: canManage ? 9 : 8 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : tickets.length === 0 ? (
                                <tr>
                                    <td colSpan={canManage ? 9 : 8} className="px-4 py-12 text-center text-muted-foreground">
                                        <Plane className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                        <p>{t('leaveAdjustments.airTicket.noTickets')}</p>
                                    </td>
                                </tr>
                            ) : (
                                tickets.map(ticket => (
                                    <tr key={ticket.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3 font-medium">
                                            {ticket.employeeName ?? '—'}
                                            <span className="text-xs text-muted-foreground ml-1">({ticket.year})</span>
                                        </td>
                                        <td className="px-4 py-3 capitalize">
                                            {t(`leaveAdjustments.airTicket.for${ticket.ticketFor.charAt(0).toUpperCase() + ticket.ticketFor.slice(1)}`)}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{ticket.destination ?? '—'}</td>
                                        <td className="px-4 py-3 text-right">
                                            {ticket.amount ? `${ticket.currency} ${Number(ticket.amount).toLocaleString()}` : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{ticket.reason ?? '—'}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{ticket.createdByName ?? '—'}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{formatDate(ticket.createdAt)}</td>
                                        <td className="px-4 py-3">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', AIR_TICKET_STATUS_STYLE[ticket.status])}>
                                                {t(`leaveAdjustments.airTicket.status.${ticket.status}`)}
                                            </span>
                                        </td>
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

            {createOpen && <AirTicketDialog onClose={() => setCreateOpen(false)} />}
            {editTarget && <AirTicketDialog ticket={editTarget} onClose={() => setEditTarget(null)} />}

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

// ─── Offset Adjustments Tab ───────────────────────────────────────────────────

function OffsetAdjustmentsTab({ canManage }: { canManage: boolean }) {
    const { t } = useTranslation()
    const { data, isLoading } = useLeaveOffsets()
    const deleteMut = useDeleteLeaveOffset()
    const [createOpen, setCreateOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<LeaveOffset | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<LeaveOffset | null>(null)

    const offsets = data?.data ?? []

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="font-semibold text-base">{t('leaveAdjustments.tabOffsetAdjustment')}</h3>
                    <p className="text-sm text-muted-foreground">{t('leaveAdjustments.offset.desc')}</p>
                </div>
                {canManage && (
                    <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        {t('leaveAdjustments.offset.newOffset')}
                    </Button>
                )}
            </div>

            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.employee')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.offset.workDate')}</th>
                                <th className="text-right px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.offset.days')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.reason')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.createdBy')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('leaveAdjustments.table.createdAt')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('common.status')}</th>
                                {canManage && <th className="px-4 py-3" />}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 4 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        {Array.from({ length: canManage ? 8 : 7 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : offsets.length === 0 ? (
                                <tr>
                                    <td colSpan={canManage ? 8 : 7} className="px-4 py-12 text-center text-muted-foreground">
                                        <CalendarPlus className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                        <p>{t('leaveAdjustments.offset.noOffsets')}</p>
                                    </td>
                                </tr>
                            ) : (
                                offsets.map(offset => (
                                    <tr key={offset.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3 font-medium">{offset.employeeName ?? '—'}</td>
                                        <td className="px-4 py-3">{formatDate(offset.workDate)}</td>
                                        <td className="px-4 py-3 text-right">{offset.days}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{offset.reason ?? '—'}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{offset.createdByName ?? '—'}</td>
                                        <td className="px-4 py-3 text-muted-foreground">{formatDate(offset.createdAt)}</td>
                                        <td className="px-4 py-3">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', OFFSET_STATUS_STYLE[offset.status])}>
                                                {t(`leaveAdjustments.offset.status.${offset.status}`)}
                                            </span>
                                        </td>
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

            {createOpen && <OffsetDialog onClose={() => setCreateOpen(false)} />}
            {editTarget && <OffsetDialog offset={editTarget} onClose={() => setEditTarget(null)} />}

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
                        onError: (err: Error) => toast.error(t('leaveAdjustments.offset.deleteFailed'), err?.message),
                    })
                }}
                onOpenChange={open => { if (!open) setDeleteTarget(null) }}
            />
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LeaveAdjustmentsPage() {
    const { t } = useTranslation()
    const role = useAuthStore(s => s.user?.role) as UserRole | undefined
    const canManage = hasPermission(role ?? 'employee', 'manage_leave')

    return (
        <PageWrapper>
            <PageHeader
                title={t('leaveAdjustments.title')}
                description={t('leaveAdjustments.description')}
            />

            <Tabs defaultValue="air-ticket">
                <TabsList className="mb-6">
                    <TabsTrigger value="air-ticket" className="gap-2">
                        <Plane className="h-4 w-4" />
                        {t('leaveAdjustments.tabAirTicket')}
                    </TabsTrigger>
                    <TabsTrigger value="leave-adjustment" className="gap-2">
                        <SlidersHorizontal className="h-4 w-4" />
                        {t('leaveAdjustments.tabLeaveAdjustment')}
                    </TabsTrigger>
                    <TabsTrigger value="offset-adjustment" className="gap-2">
                        <CalendarPlus className="h-4 w-4" />
                        {t('leaveAdjustments.tabOffsetAdjustment')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="air-ticket">
                    <AirTicketsTab canManage={canManage} />
                </TabsContent>

                <TabsContent value="leave-adjustment">
                    <LeaveAdjustmentsTab canManage={canManage} />
                </TabsContent>

                <TabsContent value="offset-adjustment">
                    <OffsetAdjustmentsTab canManage={canManage} />
                </TabsContent>
            </Tabs>
        </PageWrapper>
    )
}
