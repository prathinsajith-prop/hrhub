import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { FormField } from '@/components/shared/FormField'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { ConfirmDialog } from '@/components/ui/overlays'
import { toast } from '@/components/ui/overlays'
import { zodToFieldErrors } from '@/lib/schemas'
import {
    GraduationCap, BookOpen, CheckCircle2, TrendingUp,
    Search, Plus, Pencil, Trash2, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    type TrainingRecord,
    useTraining,
    useCreateTraining,
    useUpdateTraining,
    useDeleteTraining,
} from '@/hooks/useTraining'
import { useEmployees } from '@/hooks/useEmployees'
import { useAuthStore } from '@/store/authStore'
import { hasPermission } from '@/lib/permissions'
import type { UserRole } from '@/types'

const trainingFormSchema = z.object({
    employeeId: z.string().min(1, 'Employee is required'),
    title: z.string().min(1, 'Title is required'),
    startDate: z.string().min(1, 'Start date is required'),
    provider: z.string().optional(),
    type: z.string().optional(),
    endDate: z.string().optional(),
    cost: z.string().optional(),
    status: z.string().optional(),
    notes: z.string().optional(),
    certificateExpiry: z.string().optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
    planned:     'bg-slate-100 text-slate-600',
    in_progress: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    completed:   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    cancelled:   'bg-red-50 text-red-600 ring-1 ring-red-200',
}

// ─── Training Form Dialog ─────────────────────────────────────────────────────

function TrainingFormDialog({
    record,
    onClose,
}: {
    record: TrainingRecord | null
    onClose: () => void
}) {
    const { t } = useTranslation()
    const create = useCreateTraining()
    const update = useUpdateTraining()
    const { data: empData } = useEmployees({ limit: 100, status: 'active' })

    const [form, setForm] = useState({
        employeeId: record?.employeeId ?? '',
        title: record?.title ?? '',
        provider: record?.provider ?? '',
        type: record?.type ?? 'external',
        startDate: record?.startDate ?? '',
        endDate: record?.endDate ?? '',
        cost: record?.cost ?? '',
        status: record?.status ?? 'planned',
        notes: record?.notes ?? '',
        certificateExpiry: record?.certificateExpiry ?? '',
    })
    const [errors, setErrors] = useState<Record<string, string>>({})

    const isPending = create.isPending || update.isPending

    function handleSubmit() {
        const result = zodToFieldErrors(trainingFormSchema, form)
        if (!result.ok) { setErrors(result.errors); return }
        setErrors({})
        if (record) {
            update.mutate({ id: record.id, ...form }, {
                onSuccess: () => { toast.success(t('training.updated')); onClose() },
                onError: () => toast.error(t('training.saveFailed')),
            })
        } else {
            create.mutate(form as never, {
                onSuccess: () => { toast.success(t('training.created')); onClose() },
                onError: () => toast.error(t('training.saveFailed')),
            })
        }
    }

    const employees = empData?.data ?? []

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{record ? t('training.editRecord') : t('training.addRecord')}</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-2">
                    <FormField label={t('training.employee')} required error={errors.employeeId}>
                        <Select
                            value={form.employeeId}
                            onValueChange={v => { setForm(f => ({ ...f, employeeId: v })); setErrors(e => ({ ...e, employeeId: '' })) }}
                        >
                            <SelectTrigger aria-invalid={!!errors.employeeId}><SelectValue placeholder={t('training.selectEmployee')} /></SelectTrigger>
                            <SelectContent>
                                {employees.map(e => (
                                    <SelectItem key={e.id} value={e.id}>
                                        {e.firstName} {e.lastName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>

                    <FormField label={t('training.title')} required error={errors.title}>
                        <Input
                            aria-invalid={!!errors.title}
                            value={form.title}
                            onChange={e => { setForm(f => ({ ...f, title: e.target.value })); setErrors(er => ({ ...er, title: '' })) }}
                            placeholder={t('training.titlePlaceholder')}
                        />
                    </FormField>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label={t('training.provider')}>
                            <Input
                                value={form.provider}
                                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
                                placeholder={t('training.providerPlaceholder')}
                            />
                        </FormField>
                        <FormField label={t('training.type')}>
                            <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as never }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="internal">{t('training.types.internal')}</SelectItem>
                                    <SelectItem value="external">{t('training.types.external')}</SelectItem>
                                    <SelectItem value="online">{t('training.types.online')}</SelectItem>
                                    <SelectItem value="conference">{t('training.types.conference')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label={t('training.startDate')} required error={errors.startDate}>
                            <Input
                                type="date"
                                aria-invalid={!!errors.startDate}
                                value={form.startDate}
                                onChange={e => { setForm(f => ({ ...f, startDate: e.target.value })); setErrors(er => ({ ...er, startDate: '' })) }}
                            />
                        </FormField>
                        <FormField label={t('training.endDate')}>
                            <Input
                                type="date"
                                value={form.endDate}
                                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField label={`${t('training.cost')} (AED)`}>
                            <NumericInput
                                maxDecimals={2}
                                value={form.cost}
                                onChange={e => setForm(f => ({ ...f, cost: e.target.value }))}
                                placeholder="0.00"
                            />
                        </FormField>
                        <FormField label={t('training.status')}>
                            <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as never }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="planned">{t('training.statuses.planned')}</SelectItem>
                                    <SelectItem value="in_progress">{t('training.statuses.in_progress')}</SelectItem>
                                    <SelectItem value="completed">{t('training.statuses.completed')}</SelectItem>
                                    <SelectItem value="cancelled">{t('training.statuses.cancelled')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </FormField>
                    </div>

                    <FormField label={t('training.certExpiry')}>
                        <Input
                            type="date"
                            value={form.certificateExpiry}
                            onChange={e => setForm(f => ({ ...f, certificateExpiry: e.target.value }))}
                        />
                    </FormField>

                    <FormField label={t('common.notes')}>
                        <Input
                            value={form.notes}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder={t('training.notesPlaceholder')}
                        />
                    </FormField>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={isPending}>
                        {isPending ? t('common.loading') : t('common.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function TrainingPage() {
    const { t } = useTranslation()
    const role = useAuthStore(s => s.user?.role) as UserRole | undefined
    const canManage = hasPermission(role ?? 'employee', 'manage_training')

    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')
    const [typeFilter, setTypeFilter] = useState('all')
    const [formOpen, setFormOpen] = useState(false)
    const [editRecord, setEditRecord] = useState<TrainingRecord | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<TrainingRecord | null>(null)

    const { data, isLoading } = useTraining({
        status: statusFilter === 'all' ? undefined : statusFilter,
        type: typeFilter === 'all' ? undefined : typeFilter,
        search: search || undefined,
    })
    const deleteTraining = useDeleteTraining()

    const records = data?.data ?? []
    const summary = data?.summary

    function handleDelete() {
        if (!deleteTarget) return
        deleteTraining.mutate(deleteTarget.id, {
            onSuccess: () => { toast.success(t('training.deleted')); setDeleteTarget(null) },
            onError: () => toast.error(t('training.deleteFailed')),
        })
    }

    return (
        <PageWrapper>
            <PageHeader
                title={t('training.pageTitle')}
                description={t('training.pageDesc')}
                actions={canManage ? (
                    <Button onClick={() => { setEditRecord(null); setFormOpen(true) }}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        {t('training.addRecord')}
                    </Button>
                ) : undefined}
            />

            {/* KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {isLoading ? (
                    Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
                ) : (
                    <>
                        <KpiCardCompact label={t('training.kpi.total')} value={summary?.total ?? 0} icon={GraduationCap} />
                        <KpiCardCompact label={t('training.kpi.planned')} value={summary?.planned ?? 0} icon={BookOpen} color="blue" />
                        <KpiCardCompact label={t('training.kpi.completed')} value={summary?.completed ?? 0} icon={CheckCircle2} color="green" />
                        <KpiCardCompact
                            label={t('training.kpi.totalCost')}
                            value={`AED ${(summary?.totalCost ?? 0).toLocaleString()}`}
                            icon={TrendingUp}
                            color="amber"
                        />
                    </>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-2 items-center">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        className="pl-8"
                        placeholder={t('training.searchPlaceholder')}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('common.all')} {t('common.status')}</SelectItem>
                        <SelectItem value="planned">{t('training.statuses.planned')}</SelectItem>
                        <SelectItem value="in_progress">{t('training.statuses.in_progress')}</SelectItem>
                        <SelectItem value="completed">{t('training.statuses.completed')}</SelectItem>
                        <SelectItem value="cancelled">{t('training.statuses.cancelled')}</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('common.all')} {t('training.type')}</SelectItem>
                        <SelectItem value="internal">{t('training.types.internal')}</SelectItem>
                        <SelectItem value="external">{t('training.types.external')}</SelectItem>
                        <SelectItem value="online">{t('training.types.online')}</SelectItem>
                        <SelectItem value="conference">{t('training.types.conference')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="rounded-xl border bg-card overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="border-b bg-muted/40">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('training.table.employee')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('training.title')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('training.type')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('training.table.dates')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('training.cost')}</th>
                                <th className="text-left px-4 py-3 font-medium text-muted-foreground">{t('common.status')}</th>
                                {canManage && <th className="px-4 py-3" />}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="border-b">
                                        {Array.from({ length: canManage ? 7 : 6 }).map((__, j) => (
                                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                        ))}
                                    </tr>
                                ))
                            ) : records.length === 0 ? (
                                <tr>
                                    <td colSpan={canManage ? 7 : 6} className="px-4 py-12 text-center text-muted-foreground">
                                        <GraduationCap className="h-10 w-10 mx-auto mb-2 opacity-30" />
                                        <p>{t('training.noRecords')}</p>
                                    </td>
                                </tr>
                            ) : (
                                records.map(r => (
                                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{r.employeeName}</div>
                                            <div className="text-xs text-muted-foreground">{r.employeeNo}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium">{r.title}</div>
                                            {r.provider && <div className="text-xs text-muted-foreground">{r.provider}</div>}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                                {t(`training.types.${r.type}`)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">
                                            {r.startDate}
                                            {r.endDate && ` – ${r.endDate}`}
                                        </td>
                                        <td className="px-4 py-3">
                                            {r.cost ? `AED ${Number(r.cost).toLocaleString()}` : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[r.status])}>
                                                {t(`training.statuses.${r.status}`)}
                                            </span>
                                        </td>
                                        {canManage && (
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-1 justify-end">
                                                    {r.certificateUrl && (
                                                        <a href={r.certificateUrl} target="_blank" rel="noreferrer">
                                                            <Button variant="ghost" size="icon" className="h-7 w-7">
                                                                <ExternalLink className="h-3.5 w-3.5" />
                                                            </Button>
                                                        </a>
                                                    )}
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditRecord(r); setFormOpen(true) }}>
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(r)}>
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

            {formOpen && (
                <TrainingFormDialog
                    record={editRecord}
                    onClose={() => { setFormOpen(false); setEditRecord(null) }}
                />
            )}

            <ConfirmDialog
                open={!!deleteTarget}
                variant="destructive"
                title={t('training.deleteTitle')}
                description={t('training.deleteDesc', { title: deleteTarget?.title ?? '' })}
                confirmLabel={t('common.delete')}
                onConfirm={handleDelete}
                onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
            />
        </PageWrapper>
    )
}
