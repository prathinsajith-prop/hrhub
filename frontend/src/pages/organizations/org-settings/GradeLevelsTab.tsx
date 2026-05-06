import { useState } from 'react'
import { Plus, Pencil, Check, XCircle, GraduationCap, Building2, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { toast, ConfirmDialog } from '@/components/ui/overlays'
import {
    useAllGradeLevels, useCreateGradeLevel, useUpdateGradeLevel, useDeleteGradeLevel, useSeedDefaultGradeLevels,
    HIERARCHY_OPTIONS, HIERARCHY_COLORS,
    type GradeLevel, type GradeLevelInput, type GradeHierarchy,
} from '@/hooks/useGradeLevels'
import { useSponsoringEntities, useCreateSponsoringEntity, useUpdateSponsoringEntity, type SponsoringEntity } from '@/hooks/useSponsoringEntities'
import { Section } from './_shared'

// ─── Grade Level Modal ────────────────────────────────────────────────────────

interface ModalState {
    code: string
    name: string
    level: string
    hierarchy: GradeHierarchy | ''
    salaryMin: string
    salaryMax: string
    description: string
}

const EMPTY_MODAL: ModalState = { code: '', name: '', level: '', hierarchy: '', salaryMin: '', salaryMax: '', description: '' }

function gradeLevelToModal(g: GradeLevel): ModalState {
    return {
        code: g.code ?? '',
        name: g.name,
        level: g.level != null ? String(g.level) : '',
        hierarchy: g.hierarchy ?? '',
        salaryMin: g.salaryMin != null ? String(g.salaryMin) : '',
        salaryMax: g.salaryMax != null ? String(g.salaryMax) : '',
        description: g.description ?? '',
    }
}

interface GradeLevelModalProps {
    open: boolean
    editing: GradeLevel | null
    onOpenChange: (v: boolean) => void
    onCreate: (data: GradeLevelInput) => void
    onUpdate: (id: string, data: Partial<GradeLevelInput>) => void
    isPending: boolean
}

function GradeLevelModal({ open, editing, onOpenChange, onCreate, onUpdate, isPending }: GradeLevelModalProps) {
    const [form, setForm] = useState<ModalState>(EMPTY_MODAL)
    const [salaryError, setSalaryError] = useState('')

    const externalKey = editing?.id ?? '__new__'
    const [lastKey, setLastKey] = useState(externalKey)
    if (externalKey !== lastKey) {
        setLastKey(externalKey)
        setForm(editing ? gradeLevelToModal(editing) : EMPTY_MODAL)
        setSalaryError('')
    }

    if (!open && lastKey !== '__closed__') {
        // reset when closed
    }

    function set(field: keyof ModalState, value: string) {
        setForm(f => ({ ...f, [field]: value }))
        if (field === 'salaryMin' || field === 'salaryMax') setSalaryError('')
    }

    function buildInput(): GradeLevelInput | null {
        const name = form.name.trim()
        if (!name) return null

        const salaryMin = form.salaryMin ? Number(form.salaryMin) : undefined
        const salaryMax = form.salaryMax ? Number(form.salaryMax) : undefined

        if (salaryMin != null && salaryMax != null && salaryMin >= salaryMax) {
            setSalaryError('Minimum must be less than maximum')
            return null
        }

        return {
            name,
            code: form.code.trim() || undefined,
            level: form.level ? Number(form.level) : undefined,
            hierarchy: form.hierarchy || undefined,
            salaryMin,
            salaryMax,
            description: form.description.trim() || undefined,
        }
    }

    function handleSubmit() {
        const input = buildInput()
        if (!input) return
        if (editing) onUpdate(editing.id, input)
        else onCreate(input)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit Grade Level' : 'Add Grade Level'}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-1">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Code</label>
                            <Input
                                placeholder="e.g. G6"
                                value={form.code}
                                onChange={e => set('code', e.target.value)}
                                maxLength={10}
                                className="font-mono"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">Level <span className="text-muted-foreground font-normal">(numeric)</span></label>
                            <Input
                                type="number"
                                placeholder="e.g. 6"
                                value={form.level}
                                onChange={e => set('level', e.target.value)}
                                min={1}
                                max={100}
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
                        <Input
                            autoFocus={!editing}
                            placeholder="e.g. Mid Level 1"
                            value={form.name}
                            onChange={e => set('name', e.target.value)}
                            maxLength={80}
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Hierarchy Band</label>
                        <Select value={form.hierarchy} onValueChange={v => set('hierarchy', v as GradeHierarchy)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select band…" />
                            </SelectTrigger>
                            <SelectContent>
                                {HIERARCHY_OPTIONS.map(h => (
                                    <SelectItem key={h} value={h}>
                                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', HIERARCHY_COLORS[h])}>
                                            {h}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Salary Range <span className="text-muted-foreground font-normal">(AED / month)</span></label>
                        <div className="grid grid-cols-2 gap-3">
                            <Input
                                type="number"
                                placeholder="Min"
                                value={form.salaryMin}
                                onChange={e => set('salaryMin', e.target.value)}
                                min={0}
                            />
                            <Input
                                type="number"
                                placeholder="Max"
                                value={form.salaryMax}
                                onChange={e => set('salaryMax', e.target.value)}
                                min={0}
                            />
                        </div>
                        {salaryError && <p className="text-xs text-destructive">{salaryError}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Description</label>
                        <Textarea
                            placeholder="Brief description of this grade level…"
                            value={form.description}
                            onChange={e => set('description', e.target.value)}
                            maxLength={500}
                            rows={2}
                            className="resize-none"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!form.name.trim() || isPending}>
                        {isPending ? 'Saving…' : editing ? 'Save Changes' : 'Add Grade Level'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Grade Levels section ──────────────────────────────────────────────────────

function formatSalary(min: number | null, max: number | null): string {
    if (min == null && max == null) return '—'
    const fmt = (n: number) => new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 }).format(n)
    if (min != null && max != null) return `AED ${fmt(min)} – ${fmt(max)}`
    if (min != null) return `AED ${fmt(min)}+`
    return `Up to AED ${fmt(max!)}`
}

function GradeLevelsSection() {
    const { data: items = [], isLoading } = useAllGradeLevels()
    const levels = Array.isArray(items) ? items as GradeLevel[] : []
    const create = useCreateGradeLevel()
    const update = useUpdateGradeLevel()
    const remove = useDeleteGradeLevel()
    const seed = useSeedDefaultGradeLevels()

    const [modalOpen, setModalOpen] = useState(false)
    const [editingGrade, setEditingGrade] = useState<GradeLevel | null>(null)
    const [toggleTarget, setToggleTarget] = useState<GradeLevel | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<GradeLevel | null>(null)

    function openAdd() { setEditingGrade(null); setModalOpen(true) }
    function openEdit(g: GradeLevel) { setEditingGrade(g); setModalOpen(true) }

    function handleCreate(data: GradeLevelInput) {
        create.mutate(data, {
            onSuccess: () => { setModalOpen(false); toast.success('Grade level added') },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? 'Code or name already exists' : 'Failed to add'),
        })
    }

    function handleUpdate(id: string, data: Partial<GradeLevelInput>) {
        update.mutate({ id, data }, {
            onSuccess: () => { setModalOpen(false); toast.success('Grade level updated') },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? 'Code or name already exists' : 'Failed to update'),
        })
    }

    function handleToggle() {
        if (!toggleTarget) return
        update.mutate({ id: toggleTarget.id, data: { isActive: !toggleTarget.isActive } }, {
            onSuccess: () => {
                toast.success(toggleTarget.isActive ? `"${toggleTarget.name}" deactivated` : `"${toggleTarget.name}" activated`)
                setToggleTarget(null)
            },
            onError: () => { toast.error('Failed to update'); setToggleTarget(null) },
        })
    }

    function handleDelete() {
        if (!deleteTarget) return
        remove.mutate(deleteTarget.id, {
            onSuccess: () => { toast.success(`"${deleteTarget.name}" deleted`); setDeleteTarget(null) },
            onError: () => { toast.error('Failed to delete'); setDeleteTarget(null) },
        })
    }

    function handleSeedDefaults() {
        seed.mutate(undefined, {
            onSuccess: () => toast.success('G1–G15 defaults loaded'),
            onError: (err: Error) => toast.error(err.message.includes('409') || err.message.includes('already exist') ? 'Grade levels already exist' : 'Failed to load defaults'),
        })
    }

    return (
        <>
            <div className="space-y-4">
                {isLoading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map(i => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
                    </div>
                ) : levels.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-muted/30 flex flex-col items-center justify-center py-12 text-center gap-4">
                        <div className="space-y-1">
                            <p className="text-sm font-medium">No grade levels yet</p>
                            <p className="text-xs text-muted-foreground">Load the G1–G15 defaults or add your own.</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSeedDefaults} disabled={seed.isPending}>
                                <Sparkles className="h-3.5 w-3.5" />
                                {seed.isPending ? 'Loading…' : 'Load G1–G15 Defaults'}
                            </Button>
                            <Button size="sm" className="gap-1.5" onClick={openAdd}>
                                <Plus className="h-3.5 w-3.5" /> Add Grade Level
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="rounded-xl border bg-card overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/40">
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-16">Code</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-8">Lvl</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-28">Band</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-44">Salary Range</th>
                                        <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-20">Status</th>
                                        <th className="w-28 px-4 py-2.5" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border/50">
                                    {levels.map(g => (
                                        <tr key={g.id} className="group hover:bg-muted/30 transition-colors">
                                            <td className="px-4 py-2.5">
                                                {g.code
                                                    ? <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{g.code}</span>
                                                    : <span className="text-muted-foreground">—</span>
                                                }
                                            </td>
                                            <td className="px-4 py-2.5 text-muted-foreground text-xs">
                                                {g.level ?? '—'}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className={cn('font-medium', !g.isActive && 'line-through text-muted-foreground')}>
                                                    {g.name}
                                                </div>
                                                {g.description && (
                                                    <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{g.description}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {g.hierarchy
                                                    ? <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', HIERARCHY_COLORS[g.hierarchy])}>{g.hierarchy}</span>
                                                    : <span className="text-muted-foreground text-xs">—</span>
                                                }
                                            </td>
                                            <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                                                {formatSalary(g.salaryMin, g.salaryMax)}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <Badge variant={g.isActive ? 'success' : 'secondary'} className="text-[11px]">
                                                    {g.isActive ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        size="sm" variant="ghost"
                                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                        title="Edit"
                                                        onClick={() => openEdit(g)}
                                                    >
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                    <Button
                                                        size="sm" variant="ghost"
                                                        className={cn('h-7 px-2 text-[11px] font-medium rounded-full',
                                                            g.isActive
                                                                ? 'text-amber-600 hover:bg-amber-50 hover:text-amber-700'
                                                                : 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                                                        )}
                                                        onClick={() => setToggleTarget(g)}
                                                    >
                                                        {g.isActive ? 'Deactivate' : 'Activate'}
                                                    </Button>
                                                    <Button
                                                        size="sm" variant="ghost"
                                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                                        title="Delete"
                                                        onClick={() => setDeleteTarget(g)}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <Button variant="ghost" size="sm" className="gap-1.5 text-primary font-medium" onClick={openAdd}>
                            <Plus className="h-3.5 w-3.5" /> Add grade level
                        </Button>
                    </>
                )}
            </div>

            <GradeLevelModal
                open={modalOpen}
                editing={editingGrade}
                onOpenChange={setModalOpen}
                onCreate={handleCreate}
                onUpdate={handleUpdate}
                isPending={create.isPending || update.isPending}
            />

            <ConfirmDialog
                open={!!toggleTarget}
                onOpenChange={o => !o && setToggleTarget(null)}
                title={toggleTarget?.isActive ? `Deactivate "${toggleTarget?.name}"?` : `Activate "${toggleTarget?.name}"?`}
                description={toggleTarget?.isActive
                    ? 'This grade level will be hidden from employee forms. Employees currently assigned this level are not affected.'
                    : 'This grade level will become available again in employee forms.'}
                confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
                variant={toggleTarget?.isActive ? 'destructive' : 'success'}
                onConfirm={handleToggle}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={o => !o && setDeleteTarget(null)}
                title={`Delete "${deleteTarget?.name}"?`}
                description="This action cannot be undone. Employees currently assigned this grade level will retain their assignment but the level will no longer be selectable."
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={handleDelete}
            />
        </>
    )
}

// ─── Sponsoring Entities section ───────────────────────────────────────────────

interface MasterItem { id: string; name: string; isActive: boolean }

interface MasterListProps {
    items: MasterItem[]
    isLoading: boolean
    addingNew: boolean
    newName: string
    editingId: string | null
    editName: string
    addPending: boolean
    onNewNameChange: (v: string) => void
    onStartAdd: () => void
    onCancelAdd: () => void
    onAdd: () => void
    onStartEdit: (item: MasterItem) => void
    onEditNameChange: (v: string) => void
    onCancelEdit: () => void
    onSaveEdit: (id: string) => void
    onToggle: (item: MasterItem) => void
    addLabel: string
    emptyMessage: string
}

function MasterList({
    items, isLoading, addingNew, newName, editingId, editName, addPending,
    onNewNameChange, onStartAdd, onCancelAdd, onAdd,
    onStartEdit, onEditNameChange, onCancelEdit, onSaveEdit,
    onToggle, addLabel, emptyMessage,
}: MasterListProps) {
    return (
        <div className="space-y-3">
            {isLoading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
                </div>
            ) : (
                <div className="rounded-xl border bg-card overflow-hidden">
                    {items.length === 0 && !addingNew ? (
                        <div className="flex flex-col items-center justify-center py-10 text-center text-sm text-muted-foreground gap-2">
                            <p>{emptyMessage}</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/40">
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-24">Status</th>
                                    <th className="w-24 px-4 py-2.5" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {items.map(item => (
                                    <tr key={item.id} className="group hover:bg-muted/30 transition-colors">
                                        <td className="px-4 py-2.5">
                                            {editingId === item.id ? (
                                                <Input
                                                    autoFocus
                                                    className="h-8 max-w-xs"
                                                    value={editName}
                                                    onChange={e => onEditNameChange(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') onSaveEdit(item.id)
                                                        if (e.key === 'Escape') onCancelEdit()
                                                    }}
                                                />
                                            ) : (
                                                <span className={cn('font-medium', !item.isActive && 'line-through text-muted-foreground')}>
                                                    {item.name}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            {editingId !== item.id && (
                                                <Badge variant={item.isActive ? 'success' : 'secondary'} className="text-[11px]">
                                                    {item.isActive ? 'Active' : 'Inactive'}
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center justify-end gap-1">
                                                {editingId === item.id ? (
                                                    <>
                                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600 hover:text-emerald-700" onClick={() => onSaveEdit(item.id)}>
                                                            <Check className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={onCancelEdit}>
                                                            <XCircle className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button
                                                            size="sm" variant="ghost"
                                                            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                                                            title="Rename"
                                                            onClick={() => onStartEdit(item)}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            size="sm" variant="ghost"
                                                            className={cn('h-7 px-2.5 text-[11px] font-medium rounded-full opacity-0 group-hover:opacity-100 transition-opacity',
                                                                item.isActive
                                                                    ? 'text-amber-600 hover:bg-amber-50 hover:text-amber-700'
                                                                    : 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700'
                                                            )}
                                                            onClick={() => onToggle(item)}
                                                        >
                                                            {item.isActive ? 'Deactivate' : 'Activate'}
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {addingNew ? (
                <div className="flex items-center gap-2">
                    <Input
                        autoFocus
                        className="flex-1 max-w-xs"
                        placeholder="Enter name…"
                        value={newName}
                        onChange={e => onNewNameChange(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'Enter') onAdd()
                            if (e.key === 'Escape') onCancelAdd()
                        }}
                    />
                    <Button size="sm" onClick={onAdd} disabled={!newName.trim() || addPending}>
                        {addPending ? '…' : 'Add'}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground" onClick={onCancelAdd}>
                        <XCircle className="h-4 w-4" />
                    </Button>
                </div>
            ) : (
                <Button variant="ghost" size="sm" className="gap-1.5 text-primary font-medium" onClick={onStartAdd}>
                    <Plus className="h-3.5 w-3.5" /> {addLabel}
                </Button>
            )}
        </div>
    )
}

function SponsoringEntitiesSection() {
    const { data: items = [], isLoading } = useSponsoringEntities()
    const entities = Array.isArray(items) ? items as SponsoringEntity[] : []
    const create = useCreateSponsoringEntity()
    const update = useUpdateSponsoringEntity()

    const [newName, setNewName] = useState('')
    const [addingNew, setAddingNew] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [toggleTarget, setToggleTarget] = useState<SponsoringEntity | null>(null)

    function handleAdd() {
        const name = newName.trim()
        if (!name) return
        create.mutate({ name }, {
            onSuccess: () => { setNewName(''); setAddingNew(false); toast.success('Sponsoring entity added') },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? 'Entity already exists' : 'Failed to add'),
        })
    }

    function handleUpdate(id: string) {
        const name = editName.trim()
        if (!name) return
        update.mutate({ id, data: { name } }, {
            onSuccess: () => { setEditingId(null); toast.success('Updated') },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? 'Name already exists' : 'Failed to update'),
        })
    }

    function handleToggle() {
        if (!toggleTarget) return
        update.mutate({ id: toggleTarget.id, data: { isActive: !toggleTarget.isActive } }, {
            onSuccess: () => {
                toast.success(toggleTarget.isActive ? `"${toggleTarget.name}" deactivated` : `"${toggleTarget.name}" activated`)
                setToggleTarget(null)
            },
            onError: () => { toast.error('Failed to update'); setToggleTarget(null) },
        })
    }

    return (
        <>
            <MasterList
                items={entities}
                isLoading={isLoading}
                addingNew={addingNew}
                newName={newName}
                editingId={editingId}
                editName={editName}
                addPending={create.isPending}
                onNewNameChange={setNewName}
                onStartAdd={() => setAddingNew(true)}
                onCancelAdd={() => { setAddingNew(false); setNewName('') }}
                onAdd={handleAdd}
                onStartEdit={(item) => { setEditingId(item.id); setEditName(item.name) }}
                onEditNameChange={setEditName}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={handleUpdate}
                onToggle={(item) => setToggleTarget(item as SponsoringEntity)}
                addLabel="Add sponsoring entity"
                emptyMessage="No sponsoring entities yet. Add one to get started."
            />
            <ConfirmDialog
                open={!!toggleTarget}
                onOpenChange={o => !o && setToggleTarget(null)}
                title={toggleTarget?.isActive ? `Deactivate "${toggleTarget?.name}"?` : `Activate "${toggleTarget?.name}"?`}
                description={toggleTarget?.isActive
                    ? 'This sponsoring entity will be hidden from employee visa forms. Existing assignments are not affected.'
                    : 'This sponsoring entity will become available again in employee visa forms.'}
                confirmLabel={toggleTarget?.isActive ? 'Deactivate' : 'Activate'}
                variant={toggleTarget?.isActive ? 'destructive' : 'success'}
                onConfirm={handleToggle}
            />
        </>
    )
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export function GradeLevelsTab() {
    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-base font-semibold">Grade Levels & Sponsoring Entities</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Manage the master lists used across employee records. Changes apply to all employees going forward.
                </p>
            </div>

            <Section
                icon={GraduationCap}
                title="Grade Levels"
                description="Define grades or bands that can be assigned to employees (e.g. G1, G6, Senior Level 2)."
            >
                <GradeLevelsSection />
            </Section>

            <Section
                icon={Building2}
                title="Sponsoring Entities"
                description="Companies or entities that sponsor employee visas. Used in the Visa & ID section of employee profiles."
            >
                <SponsoringEntitiesSection />
            </Section>
        </div>
    )
}
