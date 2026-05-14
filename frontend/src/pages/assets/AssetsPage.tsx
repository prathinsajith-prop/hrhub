import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { type ColumnDef } from '@tanstack/react-table'
import { labelFor } from '@/lib/enums'
import {
    Package, Plus, CheckCircle2, Wrench,
    Edit2, Trash2, UserPlus, RotateCcw, History, RefreshCcw, Tags,
} from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Card, Input, Textarea, Label, NumericInput } from '@/components/ui/primitives'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { FormField } from '@/components/shared/FormField'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
    toast, ConfirmDialog
} from '@/components/ui/overlays'
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/form-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { formatDate } from '@/lib/utils'
import { exportAssets } from '@/lib/export'
import { ExportDropdown } from '@/components/shared/ExportDropdown'
import {
    useAssets, useCreateAsset, useUpdateAsset, useDeleteAsset,
    useAssignAsset, useReturnAsset,
    useAssetHistory, useAssetMaintenance,
    useCreateMaintenanceRecord, useUpdateMaintenanceRecord,
    useAssetCategories, useCreateAssetCategory, useDeleteAssetCategory,
    type Asset, type AssetAssignment, type AssetMaintenance,
} from '@/hooks/useAssets'
import { EmployeeSelect } from '@/components/shared'
import { EmployeeLink } from '@/components/shared/EmployeeLink'
import { usePermissions } from '@/hooks/usePermissions'

// ─── Status badges ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<Asset['status'], { variant: 'success' | 'info' | 'warning' | 'destructive' | 'secondary'; labelKey: string }> = {
    available: { variant: 'success', labelKey: 'assets.available' },
    assigned: { variant: 'info', labelKey: 'assets.assigned' },
    maintenance: { variant: 'warning', labelKey: 'assets.maintenance' },
    lost: { variant: 'destructive', labelKey: 'assets.lost' },
    retired: { variant: 'secondary', labelKey: 'assets.retired' },
}

const CONDITION_BADGE: Record<Asset['condition'], { variant: 'success' | 'info' | 'warning'; labelKey: string }> = {
    new: { variant: 'success', labelKey: 'assets.new' },
    good: { variant: 'info', labelKey: 'assets.good' },
    damaged: { variant: 'warning', labelKey: 'assets.damaged' },
}

// ─── Categories Panel ─────────────────────────────────────────────────────────

function CategoriesPanel({ canManage }: { canManage: boolean }) {
    const { t } = useTranslation()
    const { data: categories, isLoading } = useAssetCategories()
    const createCategory = useCreateAssetCategory()
    const deleteCategory = useDeleteAssetCategory()

    const [newName, setNewName] = useState('')
    const [newDesc, setNewDesc] = useState('')
    const [collapsed, setCollapsed] = useState(true)

    async function handleAdd(e: { preventDefault(): void }) {
        e.preventDefault()
        if (!newName.trim()) return
        try {
            await createCategory.mutateAsync({ name: newName.trim(), description: newDesc.trim() || undefined })
            toast.success(t('assets.categoryAdded'))
            setNewName('')
            setNewDesc('')
        } catch {
            toast.error(t('assets.categoryAddFailed'))
        }
    }

    async function handleDelete(id: string, name: string) {
        try {
            await deleteCategory.mutateAsync(id)
            toast.success(t('assets.categoryDeleted', { name }))
        } catch {
            toast.error(t('assets.categoryDeleteFailed'))
        }
    }

    return (
        <Card className="p-4">
            <button
                type="button"
                className="flex items-center gap-2 w-full text-left"
                onClick={() => setCollapsed(c => !c)}
            >
                <Tags className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t('assets.categories')}</span>
                <span className="ml-auto text-xs text-muted-foreground">{collapsed ? t('assets.show') : t('assets.hide')}</span>
            </button>

            {!collapsed && (
                <div className="mt-4 space-y-4">
                    {/* Category list */}
                    {isLoading ? (
                        <Skeleton className="h-8 w-full" />
                    ) : (categories ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">{t('assets.noCategories')}</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {(categories ?? []).map(c => (
                                <div
                                    key={c.id}
                                    className="flex items-center gap-1.5 border rounded-full px-3 py-1 text-xs bg-muted/40"
                                >
                                    <span className="font-medium">{c.name}</span>
                                    {c.description && (
                                        <span className="text-muted-foreground">· {c.description}</span>
                                    )}
                                    {canManage && (
                                        <button
                                            type="button"
                                            className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                                            title={t('assets.deleteCategory', { name: c.name })}
                                            onClick={() => handleDelete(c.id, c.name)}
                                            disabled={deleteCategory.isPending}
                                        >
                                            <Trash2 className="h-3 w-3" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Add category form */}
                    {canManage && (
                        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 border-t pt-3">
                            <div className="space-y-1">
                                <Label className="text-xs">{t('assets.categoryName')}</Label>
                                <Input
                                    className="h-8 text-sm w-40"
                                    placeholder={t('assets.categoryNamePlaceholder')}
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t('assets.categoryDescription')}</Label>
                                <Input
                                    className="h-8 text-sm w-52"
                                    placeholder={t('assets.categoryDescPlaceholder')}
                                    value={newDesc}
                                    onChange={e => setNewDesc(e.target.value)}
                                />
                            </div>
                            <Button type="submit" size="sm" className="h-8" disabled={createCategory.isPending || !newName.trim()}>
                                {createCategory.isPending ? t('assets.adding') : t('common.add')}
                            </Button>
                        </form>
                    )}
                </div>
            )}
        </Card>
    )
}

// ─── Asset Form Dialog ────────────────────────────────────────────────────────

function AssetFormDialog({
    open,
    onOpenChange,
    asset,
}: {
    open: boolean
    onOpenChange: (o: boolean) => void
    asset?: Asset
}) {
    const { t } = useTranslation()
    const { data: categories } = useAssetCategories()
    const createAsset = useCreateAsset()
    const updateAsset = useUpdateAsset(asset?.id ?? '')

    const [form, setForm] = useState<Partial<Asset>>(() => asset ?? { status: 'available', condition: 'good' })

    useEffect(() => {
        if (!open && !asset) setForm({ status: 'available', condition: 'good' })
    }, [open, asset])

    const isEdit = !!asset
    const pending = createAsset.isPending || updateAsset.isPending

    const set = (k: keyof Asset, v: unknown) => setForm(f => ({ ...f, [k]: v }))

    async function handleSubmit(e: { preventDefault(): void }) {
        e.preventDefault()
        // Strip computed/server-only fields before sending
        const { categoryName: _cn, assignedEmployeeId: _aei, assignedEmployeeName: _aen, assignedEmployeeNo: _aeno,
                id: _id, tenantId: _tid, createdAt: _ca, updatedAt: _ua, deletedAt: _da, assetCode: _ac, ...payload } = form as Asset
        try {
            if (isEdit) {
                await updateAsset.mutateAsync(payload)
                toast.success(t('assets.assetUpdated'))
            } else {
                await createAsset.mutateAsync(payload)
                toast.success(t('assets.assetCreated'))
            }
            onOpenChange(false)
        } catch {
            toast.error(isEdit ? t('assets.updateFailed') : t('assets.createFailed'))
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{isEdit ? t('assets.editAsset') : t('assets.newAsset')}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <DialogBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Asset Code — read-only display when editing, hidden on create */}
                        {isEdit && asset?.assetCode && (
                            <div className="space-y-1.5">
                                <Label>{t('assets.assetCode')}</Label>
                                <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm font-mono font-medium text-muted-foreground">
                                    {asset.assetCode}
                                </div>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label required>{t('common.name')}</Label>
                            <Input
                                value={form.name ?? ''}
                                onChange={e => set('name', e.target.value)}
                                placeholder={t('assets.assetNamePlaceholder')}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('assets.category')}</Label>
                            <Select value={form.categoryId ?? 'none'} onValueChange={v => set('categoryId', v === 'none' ? null : v)}>
                                <SelectTrigger><SelectValue placeholder={t('assets.selectCategory')} /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t('assets.noneCategory')}</SelectItem>
                                    {(categories ?? []).map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('common.status')}</Label>
                            <Select value={form.status ?? 'available'} onValueChange={v => set('status', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="available">{t('assets.available')}</SelectItem>
                                    <SelectItem value="maintenance">{t('assets.maintenance')}</SelectItem>
                                    <SelectItem value="lost">{t('assets.lost')}</SelectItem>
                                    <SelectItem value="retired">{t('assets.retired')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('assets.brand')}</Label>
                            <Input value={form.brand ?? ''} onChange={e => set('brand', e.target.value)} placeholder={t('assets.brandPlaceholder')} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('assets.model')}</Label>
                            <Input value={form.model ?? ''} onChange={e => set('model', e.target.value)} placeholder={t('assets.modelPlaceholder')} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('assets.serialNumber')}</Label>
                            <Input value={form.serialNumber ?? ''} onChange={e => set('serialNumber', e.target.value)} placeholder={t('assets.serialPlaceholder')} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('assets.condition')}</Label>
                            <Select value={form.condition ?? 'good'} onValueChange={v => set('condition', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="new">{t('assets.new')}</SelectItem>
                                    <SelectItem value="good">{t('assets.good')}</SelectItem>
                                    <SelectItem value="damaged">{t('assets.damaged')}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('assets.purchaseDate')}</Label>
                            <DatePicker
                                value={form.purchaseDate ?? ''}
                                onChange={v => set('purchaseDate', v || null)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('assets.purchaseCost')}</Label>
                            <NumericInput
                                maxDecimals={2}
                                value={form.purchaseCost ?? ''}
                                onChange={e => set('purchaseCost', e.target.value || null)}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                            <Label>{t('common.notes')}</Label>
                            <Textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={2} />
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? t('assets.saving') : isEdit ? t('assets.saveChanges') : t('assets.createAsset')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ─── Assign Asset Dialog ──────────────────────────────────────────────────────

function AssignAssetDialog({
    asset,
    open,
    onOpenChange,
}: {
    asset: Asset
    open: boolean
    onOpenChange: (o: boolean) => void
}) {
    const { t } = useTranslation()
    const assignAsset = useAssignAsset()

    const [employeeId, setEmployeeId] = useState('')
    const [assignedDate, setAssignedDate] = useState(() => new Date().toISOString().slice(0, 10))
    const [expectedReturnDate, setExpectedReturnDate] = useState<string | undefined>()
    const [notes, setNotes] = useState('')
    const [errors, setErrors] = useState<Record<string, string>>({})

    useEffect(() => {
        if (!open) {
            setEmployeeId('')
            setAssignedDate(new Date().toISOString().slice(0, 10))
            setExpectedReturnDate(undefined)
            setNotes('')
            setErrors({})
        }
    }, [open])

    async function handleSubmit(e: { preventDefault(): void }) {
        e.preventDefault()
        if (!employeeId) { setErrors({ employeeId: t('assets.employeeRequired') }); return }
        setErrors({})
        try {
            await assignAsset.mutateAsync({ assetId: asset.id, employeeId, assignedDate, expectedReturnDate, notes: notes || undefined })
            toast.success(t('assets.assignedSuccess'))
            onOpenChange(false)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t('assets.assignFailed'))
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('assets.assignTitle', { name: asset.name })}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <DialogBody className="space-y-4">
                        <FormField label={t('assets.employee')} required error={errors.employeeId}>
                            <EmployeeSelect
                                value={employeeId}
                                onValueChange={v => { setEmployeeId(v); setErrors(err => ({ ...err, employeeId: '' })) }}
                            />
                        </FormField>
                        <div className="space-y-1.5">
                            <Label>{t('assets.assignedDate')}</Label>
                            <DatePicker value={assignedDate} onChange={v => setAssignedDate(v || assignedDate)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('assets.expectedReturnDate')}</Label>
                            <DatePicker value={expectedReturnDate ?? ''} onChange={v => setExpectedReturnDate(v || undefined)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('common.notes')}</Label>
                            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder={t('assets.optionalNotes')} />
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" disabled={assignAsset.isPending}>
                            {assignAsset.isPending ? t('assets.assigning') : t('assets.assignAsset')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// ─── Return Asset Dialog ──────────────────────────────────────────────────────

function ReturnAssetDialog({
    asset,
    open,
    onOpenChange,
}: {
    asset: Asset
    open: boolean
    onOpenChange: (o: boolean) => void
}) {
    const { t } = useTranslation()
    const { data: historyData } = useAssetHistory(asset.id)
    const returnAsset = useReturnAsset()
    const [notes, setNotes] = useState('')

    const activeAssignment = (historyData ?? []).find(a => a.status === 'assigned')

    async function handleReturn() {
        if (!activeAssignment) return
        try {
            await returnAsset.mutateAsync({
                assignmentId: activeAssignment.id,
                actualReturnDate: new Date().toISOString().slice(0, 10),
                notes: notes || undefined,
            })
            toast.success(t('assets.returnedSuccess'))
            onOpenChange(false)
        } catch {
            toast.error(t('assets.returnFailed'))
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('assets.returnTitle', { name: asset.name })}</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    {activeAssignment && (
                        <p className="text-sm text-muted-foreground">
                            {t('assets.assignedToOn', { employee: activeAssignment.employeeName, date: formatDate(activeAssignment.assignedDate) })}
                        </p>
                    )}
                    <div className="space-y-1.5">
                        <Label>{t('common.notes')}</Label>
                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder={t('assets.returnConditionNotes')} />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleReturn} disabled={returnAsset.isPending || !activeAssignment}>
                        {returnAsset.isPending ? t('assets.processing') : t('assets.confirmReturn')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Maintenance Dialog ────────────────────────────────────────────────────────

function MaintenanceDialog({
    asset,
    open,
    onOpenChange,
}: {
    asset: Asset
    open: boolean
    onOpenChange: (o: boolean) => void
}) {
    const { t } = useTranslation()
    const { data: records, isLoading } = useAssetMaintenance(asset.id)
    const createRecord = useCreateMaintenanceRecord()
    const updateRecord = useUpdateMaintenanceRecord()

    const [issueDescription, setIssueDescription] = useState('')
    const [notes, setNotes] = useState('')

    async function handleCreate(e: { preventDefault(): void }) {
        e.preventDefault()
        try {
            await createRecord.mutateAsync({ assetId: asset.id, issueDescription, notes: notes || undefined })
            toast.success(t('assets.maintenanceCreated'))
            setIssueDescription('')
            setNotes('')
        } catch {
            toast.error(t('assets.maintenanceCreateFailed'))
        }
    }

    async function handleResolve(record: AssetMaintenance) {
        try {
            await updateRecord.mutateAsync({ maintenanceId: record.id, status: 'resolved' })
            toast.success(t('assets.markedResolved'))
        } catch {
            toast.error(t('assets.resolveFailed'))
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('assets.maintenanceTitle', { name: asset.name })}</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-6">
                    {/* New Record Form */}
                    <form onSubmit={handleCreate} className="space-y-3 border rounded-lg p-4 bg-muted/30">
                        <p className="text-sm font-medium">{t('assets.logNewIssue')}</p>
                        <div className="space-y-1.5">
                            <Label required>{t('assets.issueDescription')}</Label>
                            <Textarea
                                value={issueDescription}
                                onChange={e => setIssueDescription(e.target.value)}
                                rows={2}
                                placeholder={t('assets.describeIssue')}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('common.notes')}</Label>
                            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={1} />
                        </div>
                        <Button type="submit" size="sm" disabled={createRecord.isPending}>
                            {createRecord.isPending ? t('assets.logging') : t('assets.logIssue')}
                        </Button>
                    </form>

                    {/* Existing Records */}
                    <div className="space-y-2">
                        <p className="text-sm font-medium">{t('assets.maintenanceHistory')}</p>
                        {isLoading ? (
                            <Skeleton className="h-16 w-full" />
                        ) : (records ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">{t('assets.noMaintenanceRecords')}</p>
                        ) : (records ?? []).map(r => (
                            <div key={r.id} className="border rounded-lg p-3 text-sm space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                    <p className="font-medium">{r.issueDescription}</p>
                                    <Badge variant={r.status === 'resolved' ? 'success' : r.status === 'in_progress' ? 'warning' : 'secondary'}>
                                        {labelFor(r.status)}
                                    </Badge>
                                </div>
                                {r.notes && <p className="text-muted-foreground">{r.notes}</p>}
                                <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                                {r.status !== 'resolved' && (
                                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleResolve(r)}>
                                        {t('assets.markResolved')}
                                    </Button>
                                )}
                            </div>
                        ))}
                    </div>
                </DialogBody>
            </DialogContent>
        </Dialog>
    )
}

// ─── History Dialog ────────────────────────────────────────────────────────────

function HistoryDialog({ asset, open, onOpenChange }: { asset: Asset; open: boolean; onOpenChange: (o: boolean) => void }) {
    const { t } = useTranslation()
    const { data, isLoading } = useAssetHistory(asset.id)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('assets.historyTitle', { name: asset.name })}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    {isLoading ? (
                        <Skeleton className="h-32 w-full" />
                    ) : (data ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('assets.noHistory')}</p>
                    ) : (
                        <div className="space-y-2">
                            {(data ?? []).map((a: AssetAssignment) => (
                                <div key={a.id} className="border rounded-lg p-3 text-sm space-y-1">
                                    <div className="flex items-center justify-between">
                                        <p className="font-medium">
                                            <EmployeeLink id={a.employeeId} name={a.employeeName ?? '—'} />
                                            {' '}<span className="text-muted-foreground font-normal">({a.employeeNo})</span>
                                        </p>
                                        <Badge variant={a.status === 'returned' ? 'success' : a.status === 'lost' ? 'destructive' : 'info'}>
                                            {a.status}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {t('assets.assignedOn', { date: formatDate(a.assignedDate) })}
                                        {a.actualReturnDate && ` ${t('assets.returnedOn', { date: formatDate(a.actualReturnDate) })}`}
                                    </p>
                                    {a.notes && <p className="text-muted-foreground">{a.notes}</p>}
                                </div>
                            ))}
                        </div>
                    )}
                </DialogBody>
            </DialogContent>
        </Dialog>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function AssetsPage() {
    const { t } = useTranslation()
    const { can } = usePermissions()
    const canManageAssets = can('manage_assets')

    const [params, setParams] = useState<{
        status?: string
        categoryId?: string
        search?: string
        offset: number
    }>({ offset: 0 })

    const { data, isLoading, isFetching, refetch } = useAssets({ ...params, limit: 25 })
    const { data: categories } = useAssetCategories()
    const deleteAsset = useDeleteAsset()

    const [createOpen, setCreateOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<Asset | null>(null)
    const [assignTarget, setAssignTarget] = useState<Asset | null>(null)
    const [returnTarget, setReturnTarget] = useState<Asset | null>(null)
    const [maintenanceTarget, setMaintenanceTarget] = useState<Asset | null>(null)
    const [historyTarget, setHistoryTarget] = useState<Asset | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<Asset | null>(null)

    const summary = data?.summary

    const columns = useMemo<ColumnDef<Asset>[]>(() => [
        {
            accessorKey: 'assetCode',
            header: t('assets.code'),
            cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.assetCode}</span>,
        },
        {
            accessorKey: 'name',
            header: t('common.name'),
            cell: ({ row }) => (
                <div>
                    <p className="font-medium text-sm">{row.original.name}</p>
                    {row.original.brand && (
                        <p className="text-xs text-muted-foreground">{row.original.brand} {row.original.model}</p>
                    )}
                </div>
            ),
        },
        {
            accessorKey: 'categoryName',
            header: t('assets.category'),
            cell: ({ row }) => row.original.categoryName
                ? <Badge variant="outline">{row.original.categoryName}</Badge>
                : <span className="text-xs text-muted-foreground">—</span>,
        },
        {
            accessorKey: 'serialNumber',
            header: t('assets.serialNo'),
            cell: ({ row }) => row.original.serialNumber
                ? <span className="text-xs font-mono">{row.original.serialNumber}</span>
                : <span className="text-xs text-muted-foreground">—</span>,
        },
        {
            accessorKey: 'status',
            header: t('common.status'),
            cell: ({ row }) => {
                const s = STATUS_BADGE[row.original.status]
                return <Badge variant={s.variant}>{t(s.labelKey)}</Badge>
            },
        },
        {
            accessorKey: 'condition',
            header: t('assets.condition'),
            cell: ({ row }) => {
                const c = CONDITION_BADGE[row.original.condition]
                return <Badge variant={c.variant}>{t(c.labelKey)}</Badge>
            },
        },
        {
            id: 'assignedTo',
            header: t('assets.assignedTo'),
            cell: ({ row }) => row.original.assignedEmployeeName
                ? (
                    <div>
                        {row.original.assignedEmployeeId
                            ? <EmployeeLink id={row.original.assignedEmployeeId} name={row.original.assignedEmployeeName} className="text-sm" />
                            : <p className="text-sm">{row.original.assignedEmployeeName}</p>
                        }
                        <p className="text-xs text-muted-foreground">{row.original.assignedEmployeeNo}</p>
                    </div>
                )
                : <span className="text-xs text-muted-foreground">—</span>,
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => {
                const asset = row.original
                return (
                    <div className="flex items-center gap-1 justify-end">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title={t('common.edit')} onClick={() => setEditTarget(asset)}>
                            <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        {asset.status === 'available' && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600" title={t('assets.assignAsset')} onClick={() => setAssignTarget(asset)}>
                                <UserPlus className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        {asset.status === 'assigned' && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" title={t('assets.returnAsset')} onClick={() => setReturnTarget(asset)}>
                                <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-600" title={t('assets.logMaintenance')} onClick={() => setMaintenanceTarget(asset)}>
                            <Wrench className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title={t('assets.viewHistory')} onClick={() => setHistoryTarget(asset)}>
                            <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" title={t('common.delete')} onClick={() => setDeleteTarget(asset)}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )
            },
        },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [t])

    return (
        <PageWrapper>
            <PageHeader
                title={t('assets.title')}
                description={t('assets.pageDescription')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
                            {t('assets.refresh')}
                        </Button>
                        <ExportDropdown
                            onExportCsv={() => exportAssets({ format: 'csv' })}
                            onExportPdf={() => exportAssets({ format: 'pdf' })}
                        />
                        {canManageAssets && (
                            <Button onClick={() => setCreateOpen(true)}>
                                <Plus className="h-4 w-4 mr-1.5" />
                                {t('assets.newAsset')}
                            </Button>
                        )}
                    </div>
                }
            />

            {/* KPI Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCardCompact
                    label={t('assets.totalAssets')}
                    value={isLoading ? '—' : String(summary?.total ?? 0)}
                    icon={Package}
                    color="blue"
                    loading={isLoading}
                />
                <KpiCardCompact
                    label={t('assets.totalAvailable')}
                    value={isLoading ? '—' : String(summary?.available ?? 0)}
                    icon={CheckCircle2}
                    color="green"
                    loading={isLoading}
                />
                <KpiCardCompact
                    label={t('assets.totalAssigned')}
                    value={isLoading ? '—' : String(summary?.assigned ?? 0)}
                    icon={UserPlus}
                    color="purple"
                    loading={isLoading}
                />
                <KpiCardCompact
                    label={t('assets.inMaintenance')}
                    value={isLoading ? '—' : String(summary?.maintenance ?? 0)}
                    icon={Wrench}
                    color="amber"
                    loading={isLoading}
                />
            </div>

            {/* Categories Panel */}
            <CategoriesPanel canManage={canManageAssets} />

            {/* Filters */}
            <Card className="p-3">
                <div className="flex flex-wrap gap-3">
                    <Input
                        className="h-8 w-48 text-sm"
                        placeholder={t('assets.searchAssets')}
                        value={params.search ?? ''}
                        onChange={e => setParams(p => ({ ...p, search: e.target.value || undefined, offset: 0 }))}
                    />
                    <Select
                        value={params.status ?? 'all'}
                        onValueChange={v => setParams(p => ({ ...p, status: v === 'all' ? undefined : v, offset: 0 }))}
                    >
                        <SelectTrigger className="h-8 w-40 text-sm"><SelectValue placeholder={t('assets.allStatuses')} /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('assets.allStatuses')}</SelectItem>
                            <SelectItem value="available">{t('assets.available')}</SelectItem>
                            <SelectItem value="assigned">{t('assets.assigned')}</SelectItem>
                            <SelectItem value="maintenance">{t('assets.maintenance')}</SelectItem>
                            <SelectItem value="lost">{t('assets.lost')}</SelectItem>
                            <SelectItem value="retired">{t('assets.retired')}</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select
                        value={params.categoryId ?? 'all'}
                        onValueChange={v => setParams(p => ({ ...p, categoryId: v === 'all' ? undefined : v, offset: 0 }))}
                    >
                        <SelectTrigger className="h-8 w-48 text-sm"><SelectValue placeholder={t('assets.allCategories')} /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('assets.allCategories')}</SelectItem>
                            {(categories ?? []).map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {(params.status || params.categoryId || params.search) && (
                        <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            onClick={() => setParams({ offset: 0 })}
                        >
                            {t('assets.clearFilters')}
                        </Button>
                    )}
                </div>
            </Card>

            {/* Table */}
            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
            ) : (
                <DataTable
                    columns={columns}
                    data={data?.data ?? []}
                    emptyMessage={t('assets.noAssetsFound')}
                    pageSize={25}
                    serverPagination={{ total: data?.total ?? 0, offset: params.offset, limit: 25, onPageChange: offset => setParams(p => ({ ...p, offset })), loading: isFetching }}
                />
            )}

            {/* Dialogs */}
            {canManageAssets && (
                <AssetFormDialog open={createOpen} onOpenChange={setCreateOpen} />
            )}

            {editTarget && (
                <AssetFormDialog
                    open={!!editTarget}
                    onOpenChange={o => { if (!o) setEditTarget(null) }}
                    asset={editTarget}
                />
            )}

            {assignTarget && (
                <AssignAssetDialog
                    asset={assignTarget}
                    open={!!assignTarget}
                    onOpenChange={o => { if (!o) setAssignTarget(null) }}
                />
            )}

            {returnTarget && (
                <ReturnAssetDialog
                    asset={returnTarget}
                    open={!!returnTarget}
                    onOpenChange={o => { if (!o) setReturnTarget(null) }}
                />
            )}

            {maintenanceTarget && (
                <MaintenanceDialog
                    asset={maintenanceTarget}
                    open={!!maintenanceTarget}
                    onOpenChange={o => { if (!o) setMaintenanceTarget(null) }}
                />
            )}

            {historyTarget && (
                <HistoryDialog
                    asset={historyTarget}
                    open={!!historyTarget}
                    onOpenChange={o => { if (!o) setHistoryTarget(null) }}
                />
            )}

            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={o => { if (!o) setDeleteTarget(null) }}
                title={t('assets.deleteAssetTitle')}
                description={t('assets.deleteAssetConfirm', { name: deleteTarget?.name })}
                confirmLabel={t('common.delete')}
                onConfirm={() => {
                    if (!deleteTarget) return
                    deleteAsset.mutateAsync(deleteTarget.id)
                        .then(() => toast.success(t('assets.assetDeleted')))
                        .catch(() => toast.error(t('assets.deleteFailed')))
                        .finally(() => setDeleteTarget(null))
                }}
            />
        </PageWrapper>
    )
}
