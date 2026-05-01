import { useMemo, useState } from 'react'
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
import { Badge, Card, Input, Textarea, Label } from '@/components/ui/primitives'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
    toast, ConfirmDialog
} from '@/components/ui/overlays'
import {
    Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/form-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { formatDate } from '@/lib/utils'
import {
    useAssets, useCreateAsset, useUpdateAsset, useDeleteAsset,
    useAssignAsset, useReturnAsset,
    useAssetHistory, useAssetMaintenance,
    useCreateMaintenanceRecord, useUpdateMaintenanceRecord,
    useAssetCategories, useCreateAssetCategory, useDeleteAssetCategory,
    type Asset, type AssetAssignment, type AssetMaintenance,
} from '@/hooks/useAssets'
import { useEmployees } from '@/hooks/useEmployees'
import { useAuthStore } from '@/store/authStore'
import { hasPermission } from '@/lib/permissions'

// ─── Status badges ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<Asset['status'], { variant: 'success' | 'info' | 'warning' | 'destructive' | 'secondary'; label: string }> = {
    available: { variant: 'success', label: 'Available' },
    assigned: { variant: 'info', label: 'Assigned' },
    maintenance: { variant: 'warning', label: 'Maintenance' },
    lost: { variant: 'destructive', label: 'Lost' },
    retired: { variant: 'secondary', label: 'Retired' },
}

const CONDITION_BADGE: Record<Asset['condition'], { variant: 'success' | 'info' | 'warning'; label: string }> = {
    new: { variant: 'success', label: 'New' },
    good: { variant: 'info', label: 'Good' },
    damaged: { variant: 'warning', label: 'Damaged' },
}

// ─── Categories Panel ─────────────────────────────────────────────────────────

function CategoriesPanel({ canManage }: { canManage: boolean }) {
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
            toast.success('Category added')
            setNewName('')
            setNewDesc('')
        } catch {
            toast.error('Failed to add category')
        }
    }

    async function handleDelete(id: string, name: string) {
        try {
            await deleteCategory.mutateAsync(id)
            toast.success(`"${name}" deleted`)
        } catch {
            toast.error('Failed to delete category')
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
                <span className="text-sm font-medium">Asset Categories</span>
                <span className="ml-auto text-xs text-muted-foreground">{collapsed ? 'Show' : 'Hide'}</span>
            </button>

            {!collapsed && (
                <div className="mt-4 space-y-4">
                    {/* Category list */}
                    {isLoading ? (
                        <Skeleton className="h-8 w-full" />
                    ) : (categories ?? []).length === 0 ? (
                        <p className="text-xs text-muted-foreground">No categories yet.</p>
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
                                            title={`Delete ${c.name}`}
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
                                <Label className="text-xs">Name</Label>
                                <Input
                                    className="h-8 text-sm w-40"
                                    placeholder="e.g. Electronics"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Description (optional)</Label>
                                <Input
                                    className="h-8 text-sm w-52"
                                    placeholder="Short description…"
                                    value={newDesc}
                                    onChange={e => setNewDesc(e.target.value)}
                                />
                            </div>
                            <Button type="submit" size="sm" className="h-8" disabled={createCategory.isPending || !newName.trim()}>
                                {createCategory.isPending ? 'Adding…' : 'Add'}
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
    const { data: categories } = useAssetCategories()
    const createAsset = useCreateAsset()
    const updateAsset = useUpdateAsset(asset?.id ?? '')

    const [form, setForm] = useState<Partial<Asset>>(() => asset ?? { status: 'available', condition: 'good' })

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
                toast.success('Asset updated')
            } else {
                await createAsset.mutateAsync(payload)
                toast.success('Asset created')
            }
            onOpenChange(false)
        } catch {
            toast.error(isEdit ? 'Failed to update asset' : 'Failed to create asset')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit Asset' : 'New Asset'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <DialogBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Asset Code — read-only display when editing, hidden on create */}
                        {isEdit && asset?.assetCode && (
                            <div className="space-y-1.5">
                                <Label>Asset Code</Label>
                                <div className="h-9 flex items-center px-3 rounded-md border bg-muted text-sm font-mono font-medium text-muted-foreground">
                                    {asset.assetCode}
                                </div>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <Label required>Name</Label>
                            <Input
                                value={form.name ?? ''}
                                onChange={e => set('name', e.target.value)}
                                placeholder="e.g. MacBook Pro"
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Category</Label>
                            <Select value={form.categoryId ?? 'none'} onValueChange={v => set('categoryId', v === 'none' ? null : v)}>
                                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">— None —</SelectItem>
                                    {(categories ?? []).map(c => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Status</Label>
                            <Select value={form.status ?? 'available'} onValueChange={v => set('status', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="available">Available</SelectItem>
                                    <SelectItem value="maintenance">Maintenance</SelectItem>
                                    <SelectItem value="lost">Lost</SelectItem>
                                    <SelectItem value="retired">Retired</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Brand</Label>
                            <Input value={form.brand ?? ''} onChange={e => set('brand', e.target.value)} placeholder="e.g. Apple" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Model</Label>
                            <Input value={form.model ?? ''} onChange={e => set('model', e.target.value)} placeholder="e.g. M2 Pro" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Serial Number</Label>
                            <Input value={form.serialNumber ?? ''} onChange={e => set('serialNumber', e.target.value)} placeholder="e.g. SN123456" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Condition</Label>
                            <Select value={form.condition ?? 'good'} onValueChange={v => set('condition', v)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="new">New</SelectItem>
                                    <SelectItem value="good">Good</SelectItem>
                                    <SelectItem value="damaged">Damaged</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Purchase Date</Label>
                            <DatePicker
                                value={form.purchaseDate ?? ''}
                                onChange={v => set('purchaseDate', v || null)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Purchase Cost (AED)</Label>
                            <Input
                                type="number"
                                step="0.01"
                                value={form.purchaseCost ?? ''}
                                onChange={e => set('purchaseCost', e.target.value || null)}
                                placeholder="0.00"
                            />
                        </div>
                        <div className="col-span-2 space-y-1.5">
                            <Label>Notes</Label>
                            <Textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={2} />
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={pending}>
                            {pending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Asset'}
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
    const { data: employeesData } = useEmployees({ limit: 100 })
    const assignAsset = useAssignAsset()

    const [employeeId, setEmployeeId] = useState('')
    const [assignedDate, setAssignedDate] = useState(new Date().toISOString().slice(0, 10))
    const [expectedReturnDate, setExpectedReturnDate] = useState<string | undefined>()
    const [notes, setNotes] = useState('')

    const employees = employeesData?.data ?? []

    async function handleSubmit(e: { preventDefault(): void }) {
        e.preventDefault()
        if (!employeeId) { toast.error('Please select an employee'); return }
        try {
            await assignAsset.mutateAsync({ assetId: asset.id, employeeId, assignedDate, expectedReturnDate, notes: notes || undefined })
            toast.success('Asset assigned successfully')
            onOpenChange(false)
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to assign asset')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Assign Asset: {asset.name}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit}>
                    <DialogBody className="space-y-4">
                        <div className="space-y-1.5">
                            <Label required>Employee</Label>
                            <Select value={employeeId} onValueChange={setEmployeeId}>
                                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                                <SelectContent>
                                    {employees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>
                                            {emp.firstName} {emp.lastName} ({emp.employeeNo})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Assigned Date</Label>
                            <DatePicker value={assignedDate} onChange={v => setAssignedDate(v || assignedDate)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Expected Return Date</Label>
                            <DatePicker value={expectedReturnDate ?? ''} onChange={v => setExpectedReturnDate(v || undefined)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Notes</Label>
                            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..." />
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <Button type="submit" disabled={assignAsset.isPending}>
                            {assignAsset.isPending ? 'Assigning…' : 'Assign Asset'}
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
            toast.success('Asset returned successfully')
            onOpenChange(false)
        } catch {
            toast.error('Failed to return asset')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Return Asset: {asset.name}</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    {activeAssignment && (
                        <p className="text-sm text-muted-foreground">
                            Assigned to <strong>{activeAssignment.employeeName}</strong> on {formatDate(activeAssignment.assignedDate)}
                        </p>
                    )}
                    <div className="space-y-1.5">
                        <Label>Notes</Label>
                        <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Return condition notes..." />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleReturn} disabled={returnAsset.isPending || !activeAssignment}>
                        {returnAsset.isPending ? 'Processing…' : 'Confirm Return'}
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
    const { data: records, isLoading } = useAssetMaintenance(asset.id)
    const createRecord = useCreateMaintenanceRecord()
    const updateRecord = useUpdateMaintenanceRecord()

    const [issueDescription, setIssueDescription] = useState('')
    const [notes, setNotes] = useState('')

    async function handleCreate(e: { preventDefault(): void }) {
        e.preventDefault()
        try {
            await createRecord.mutateAsync({ assetId: asset.id, issueDescription, notes: notes || undefined })
            toast.success('Maintenance record created')
            setIssueDescription('')
            setNotes('')
        } catch {
            toast.error('Failed to create maintenance record')
        }
    }

    async function handleResolve(record: AssetMaintenance) {
        try {
            await updateRecord.mutateAsync({ maintenanceId: record.id, status: 'resolved' })
            toast.success('Marked as resolved')
        } catch {
            toast.error('Failed to resolve')
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Maintenance — {asset.name}</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-6">
                    {/* New Record Form */}
                    <form onSubmit={handleCreate} className="space-y-3 border rounded-lg p-4 bg-muted/30">
                        <p className="text-sm font-medium">Log New Issue</p>
                        <div className="space-y-1.5">
                            <Label required>Issue Description</Label>
                            <Textarea
                                value={issueDescription}
                                onChange={e => setIssueDescription(e.target.value)}
                                rows={2}
                                placeholder="Describe the issue..."
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Notes</Label>
                            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={1} />
                        </div>
                        <Button type="submit" size="sm" disabled={createRecord.isPending}>
                            {createRecord.isPending ? 'Logging…' : 'Log Issue'}
                        </Button>
                    </form>

                    {/* Existing Records */}
                    <div className="space-y-2">
                        <p className="text-sm font-medium">Maintenance History</p>
                        {isLoading ? (
                            <Skeleton className="h-16 w-full" />
                        ) : (records ?? []).length === 0 ? (
                            <p className="text-xs text-muted-foreground">No maintenance records yet.</p>
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
                                        Mark Resolved
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
    const { data, isLoading } = useAssetHistory(asset.id)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Assignment History — {asset.name}</DialogTitle>
                </DialogHeader>
                <DialogBody>
                    {isLoading ? (
                        <Skeleton className="h-32 w-full" />
                    ) : (data ?? []).length === 0 ? (
                        <p className="text-sm text-muted-foreground">No assignment history yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {(data ?? []).map((a: AssetAssignment) => (
                                <div key={a.id} className="border rounded-lg p-3 text-sm space-y-1">
                                    <div className="flex items-center justify-between">
                                        <p className="font-medium">{a.employeeName} <span className="text-muted-foreground font-normal">({a.employeeNo})</span></p>
                                        <Badge variant={a.status === 'returned' ? 'success' : a.status === 'lost' ? 'destructive' : 'info'}>
                                            {a.status}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Assigned: {formatDate(a.assignedDate)}
                                        {a.actualReturnDate && ` · Returned: ${formatDate(a.actualReturnDate)}`}
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
    const user = useAuthStore(s => s.user)
    const canManageAssets = !!user?.role && hasPermission(user.role, 'manage_assets')

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
            header: 'Code',
            cell: ({ row }) => <span className="font-mono text-xs font-medium">{row.original.assetCode}</span>,
        },
        {
            accessorKey: 'name',
            header: 'Name',
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
            header: 'Category',
            cell: ({ row }) => row.original.categoryName
                ? <Badge variant="outline">{row.original.categoryName}</Badge>
                : <span className="text-xs text-muted-foreground">—</span>,
        },
        {
            accessorKey: 'serialNumber',
            header: 'Serial No.',
            cell: ({ row }) => row.original.serialNumber
                ? <span className="text-xs font-mono">{row.original.serialNumber}</span>
                : <span className="text-xs text-muted-foreground">—</span>,
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const s = STATUS_BADGE[row.original.status]
                return <Badge variant={s.variant}>{s.label}</Badge>
            },
        },
        {
            accessorKey: 'condition',
            header: 'Condition',
            cell: ({ row }) => {
                const c = CONDITION_BADGE[row.original.condition]
                return <Badge variant={c.variant}>{c.label}</Badge>
            },
        },
        {
            id: 'assignedTo',
            header: 'Assigned To',
            cell: ({ row }) => row.original.assignedEmployeeName
                ? (
                    <div>
                        <p className="text-sm">{row.original.assignedEmployeeName}</p>
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
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => setEditTarget(asset)}>
                            <Edit2 className="h-3.5 w-3.5" />
                        </Button>
                        {asset.status === 'available' && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600" title="Assign" onClick={() => setAssignTarget(asset)}>
                                <UserPlus className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        {asset.status === 'assigned' && (
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-green-600" title="Return" onClick={() => setReturnTarget(asset)}>
                                <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-600" title="Maintenance" onClick={() => setMaintenanceTarget(asset)}>
                            <Wrench className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="History" onClick={() => setHistoryTarget(asset)}>
                            <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" title="Delete" onClick={() => setDeleteTarget(asset)}>
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )
            },
        },
    ], [])

    return (
        <PageWrapper>
            <PageHeader
                title="Asset Management"
                description="Track and manage company assets"
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
                            Refresh
                        </Button>
                        {canManageAssets && (
                            <Button onClick={() => setCreateOpen(true)}>
                                <Plus className="h-4 w-4 mr-1.5" />
                                New Asset
                            </Button>
                        )}
                    </div>
                }
            />

            {/* KPI Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCardCompact
                    label="Total Assets"
                    value={isLoading ? '—' : String(summary?.total ?? 0)}
                    icon={Package}
                    color="blue"
                    loading={isLoading}
                />
                <KpiCardCompact
                    label="Available"
                    value={isLoading ? '—' : String(summary?.available ?? 0)}
                    icon={CheckCircle2}
                    color="green"
                    loading={isLoading}
                />
                <KpiCardCompact
                    label="Assigned"
                    value={isLoading ? '—' : String(summary?.assigned ?? 0)}
                    icon={UserPlus}
                    color="purple"
                    loading={isLoading}
                />
                <KpiCardCompact
                    label="In Maintenance"
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
                        placeholder="Search assets…"
                        value={params.search ?? ''}
                        onChange={e => setParams(p => ({ ...p, search: e.target.value || undefined, offset: 0 }))}
                    />
                    <Select
                        value={params.status ?? 'all'}
                        onValueChange={v => setParams(p => ({ ...p, status: v === 'all' ? undefined : v, offset: 0 }))}
                    >
                        <SelectTrigger className="h-8 w-40 text-sm"><SelectValue placeholder="All statuses" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All statuses</SelectItem>
                            <SelectItem value="available">Available</SelectItem>
                            <SelectItem value="assigned">Assigned</SelectItem>
                            <SelectItem value="maintenance">Maintenance</SelectItem>
                            <SelectItem value="lost">Lost</SelectItem>
                            <SelectItem value="retired">Retired</SelectItem>
                        </SelectContent>
                    </Select>
                    <Select
                        value={params.categoryId ?? 'all'}
                        onValueChange={v => setParams(p => ({ ...p, categoryId: v === 'all' ? undefined : v, offset: 0 }))}
                    >
                        <SelectTrigger className="h-8 w-48 text-sm"><SelectValue placeholder="All categories" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All categories</SelectItem>
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
                            Clear filters
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
                    emptyMessage="No assets found"
                />
            )}

            {/* Pagination */}
            {!isLoading && (data?.total ?? 0) > 25 && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Showing {(params.offset) + 1}–{Math.min(params.offset + 25, data!.total!)} of {data!.total}</span>
                    <div className="flex gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={params.offset === 0}
                            onClick={() => setParams(p => ({ ...p, offset: Math.max(0, p.offset - 25) }))}
                        >
                            Previous
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            disabled={params.offset + 25 >= (data?.total ?? 0)}
                            onClick={() => setParams(p => ({ ...p, offset: p.offset + 25 }))}
                        >
                            Next
                        </Button>
                    </div>
                </div>
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
                title="Delete Asset"
                description={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
                confirmLabel="Delete"
                onConfirm={() => {
                    if (!deleteTarget) return
                    deleteAsset.mutateAsync(deleteTarget.id)
                        .then(() => toast.success('Asset deleted'))
                        .catch(() => toast.error('Failed to delete asset'))
                        .finally(() => setDeleteTarget(null))
                }}
            />
        </PageWrapper>
    )
}
