import { useState } from 'react'
import { Plus, Pencil, Check, XCircle, GraduationCap, Building2, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, toast, ConfirmDialog } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import {
    useAllGradeLevels, useCreateGradeLevel, useUpdateGradeLevel, useDeleteGradeLevel, useSeedDefaultGradeLevels,
    type GradeLevel, type GradeLevelInput,
} from '@/hooks/useGradeLevels'
import { useSponsoringEntities, useCreateSponsoringEntity, useUpdateSponsoringEntity, type SponsoringEntity } from '@/hooks/useSponsoringEntities'
import { Section } from './_shared'

// ─── Role categories ──────────────────────────────────────────────────────────

const ROLE_CATEGORY_OPTIONS = [
    { value: 'employee',  label: 'Employee' },
    { value: 'manager',   label: 'Manager' },
    { value: 'director',  label: 'Director' },
] as const

type RoleCategory = (typeof ROLE_CATEGORY_OPTIONS)[number]['value']

const ROLE_CATEGORY_COLORS: Record<RoleCategory, string> = {
    employee:  'bg-blue-100 text-blue-800 border-blue-200',
    manager:   'bg-violet-100 text-violet-800 border-violet-200',
    director:  'bg-amber-100 text-amber-800 border-amber-200',
}

const ROLE_CATEGORY_BORDER_ACTIVE: Record<RoleCategory, string> = {
    employee:  'border-blue-500',
    manager:   'border-violet-500',
    director:  'border-amber-500',
}

function roleCategoryLabel(value: string): string {
    return ROLE_CATEGORY_OPTIONS.find(o => o.value === value)?.label ?? value
}

function roleCategoryColor(value: string): string {
    return ROLE_CATEGORY_COLORS[value as RoleCategory] ?? 'bg-muted text-muted-foreground'
}

// Values accepted by the current backend Zod schema — filter out legacy system-role strings
const VALID_ROLE_VALUES = new Set(ROLE_CATEGORY_OPTIONS.map(o => o.value))

// ─── Sort helpers ─────────────────────────────────────────────────────────────

function sortByLevel(levels: GradeLevel[]): GradeLevel[] {
    return levels.toSorted((a, b) => {
        if (a.level == null && b.level == null) return a.name.localeCompare(b.name)
        if (a.level == null) return 1
        if (b.level == null) return -1
        return a.level - b.level
    })
}

// ─── Grade Level Modal ────────────────────────────────────────────────────────

interface ModalState {
    code: string
    name: string
    level: string
    roles: string[]
    salaryMin: string
    salaryMax: string
    description: string
}

const EMPTY_MODAL: ModalState = { code: '', name: '', level: '', roles: [], salaryMin: '', salaryMax: '', description: '' }

function gradeLevelToModal(g: GradeLevel): ModalState {
    return {
        code: g.code ?? '',
        name: g.name,
        level: g.level != null ? String(g.level) : '',
        // Filter out any legacy system-role strings stored before the role-categories refactor
        roles: (g.roles ?? []).filter(r => VALID_ROLE_VALUES.has(r as RoleCategory)),
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
    const [form, setForm] = useState<ModalState>(() => editing ? gradeLevelToModal(editing) : EMPTY_MODAL)
    const [salaryError, setSalaryError] = useState('')

    // Sync form every time the modal opens — handles reopening on the same grade after edits
    const [prevOpen, setPrevOpen] = useState(open)
    if (open !== prevOpen) {
        setPrevOpen(open)
        if (open) {
            setForm(editing ? gradeLevelToModal(editing) : EMPTY_MODAL)
            setSalaryError('')
        }
    }

    function handleCodeChange(val: string) {
        const match = val.trim().match(/^[Gg](\d{1,3})$/)
        setForm(f => ({ ...f, code: val, level: match ? match[1]! : f.level }))
    }

    function handleLevelChange(val: string) {
        setForm(f => {
            const wasAutoCode = !f.code.trim() || f.code.trim() === `G${f.level.trim()}`
            return { ...f, level: val, code: wasAutoCode && val ? `G${val}` : f.code }
        })
    }

    function toggleRole(role: string) {
        setForm(f => ({
            ...f,
            roles: f.roles.includes(role) ? f.roles.filter(r => r !== role) : [...f.roles, role],
        }))
    }

    function buildInput(): { ok: true; data: GradeLevelInput } | { ok: false; salaryError?: string } {
        const name = form.name.trim()
        if (!name) return { ok: false }
        // For edit: send null to explicitly clear a salary; for create: omit undefined fields
        const salaryMin = form.salaryMin !== '' ? Number(form.salaryMin) : (editing ? null : undefined)
        const salaryMax = form.salaryMax !== '' ? Number(form.salaryMax) : (editing ? null : undefined)
        if (salaryMin != null && salaryMax != null && salaryMin >= salaryMax) {
            return { ok: false, salaryError: 'Minimum must be less than maximum' }
        }
        return {
            ok: true,
            data: {
                name,
                code: form.code.trim() || undefined,
                level: form.level ? Number(form.level) : undefined,
                roles: form.roles,
                salaryMin,
                salaryMax,
                description: form.description.trim() || undefined,
            },
        }
    }

    function handleSubmit() {
        const result = buildInput()
        if (!result.ok) {
            if (result.salaryError) setSalaryError(result.salaryError)
            return
        }
        if (editing) onUpdate(editing.id, result.data)
        else onCreate(result.data)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent size="md">
                <DialogHeader>
                    <DialogTitle>{editing ? 'Edit Grade Level' : 'Add Grade Level'}</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">
                                Level <span className="text-muted-foreground font-normal text-xs">(sort order)</span>
                            </label>
                            <NumericInput
                                decimal={false}
                                placeholder="e.g. 6"
                                value={form.level}
                                onChange={e => handleLevelChange(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium">
                                Code <span className="text-muted-foreground font-normal text-xs">(auto from level)</span>
                            </label>
                            <Input
                                placeholder="e.g. G6"
                                value={form.code}
                                onChange={e => handleCodeChange(e.target.value)}
                                maxLength={10}
                                className="font-mono"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">
                            Name <span className="text-destructive">*</span>
                        </label>
                        <Input
                            placeholder="e.g. Mid Level 1"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            maxLength={80}
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">
                            Grade Category <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {ROLE_CATEGORY_OPTIONS.map(opt => {
                                const selected = form.roles.includes(opt.value)
                                return (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => toggleRole(opt.value)}
                                        className={cn(
                                            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-colors',
                                            selected
                                                ? cn(ROLE_CATEGORY_COLORS[opt.value], ROLE_CATEGORY_BORDER_ACTIVE[opt.value], 'shadow-sm')
                                                : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted/70 hover:border-foreground/40',
                                        )}
                                    >
                                        {selected && <Check className="h-3 w-3" />}
                                        {opt.label}
                                    </button>
                                )
                            })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Tag which category of staff this grade applies to — used to filter grades in employee forms.
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">
                            Salary Range <span className="text-muted-foreground font-normal text-xs">(AED / month)</span>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <NumericInput
                                decimal={false}
                                placeholder="Min"
                                value={form.salaryMin}
                                onChange={e => { setForm(f => ({ ...f, salaryMin: e.target.value })); setSalaryError('') }}
                            />
                            <NumericInput
                                decimal={false}
                                placeholder="Max"
                                value={form.salaryMax}
                                onChange={e => { setForm(f => ({ ...f, salaryMax: e.target.value })); setSalaryError('') }}
                            />
                        </div>
                        {salaryError && <p className="text-xs text-destructive">{salaryError}</p>}
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Description</label>
                        <Textarea
                            placeholder="Brief description of this grade level…"
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            maxLength={500}
                            rows={2}
                            className="resize-none"
                        />
                    </div>
                </DialogBody>
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

// ─── Grade Levels section ─────────────────────────────────────────────────────

const salaryFormatter = new Intl.NumberFormat('en-AE', { maximumFractionDigits: 0 })

function formatSalary(min: number | null, max: number | null): string {
    if (min == null && max == null) return '—'
    const fmt = (n: number) => salaryFormatter.format(n)
    if (min != null && max != null) return `AED ${fmt(min)} – ${fmt(max)}`
    if (min != null) return `AED ${fmt(min)}+`
    return `Up to AED ${fmt(max!)}`
}

function GradeLevelsSection() {
    const { data: items = [], isLoading } = useAllGradeLevels()
    const levels = sortByLevel(Array.isArray(items) ? items as GradeLevel[] : [])
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
            <Section
                icon={GraduationCap}
                title="Grade Levels"
                description="Define grades or bands that can be assigned to employees (e.g. G1, G6, Senior Level 2)."
                action={
                    <Button size="sm" className="gap-1.5" onClick={openAdd} disabled={isLoading}>
                        <Plus className="h-3.5 w-3.5" /> Add Grade Level
                    </Button>
                }
            >
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
                    <div className="rounded-xl border bg-card overflow-hidden">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b bg-muted/40">
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-16">Code</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-8">Lvl</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Name</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Grade Category</th>
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
                                            {g.roles && g.roles.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                    {g.roles.map(r => (
                                                        <span key={r} className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium', roleCategoryColor(r))}>
                                                            {roleCategoryLabel(r)}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground text-xs">—</span>
                                            )}
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
                                            <div className="flex items-center justify-end gap-1">
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
                )}
            </Section>

            <GradeLevelModal
                key={editingGrade?.id ?? '__new__'}
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

// ─── Sponsoring Entities section ──────────────────────────────────────────────

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
                                                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                                                            title="Rename"
                                                            onClick={() => onStartEdit(item)}
                                                        >
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button
                                                            size="sm" variant="ghost"
                                                            className={cn('h-7 px-2.5 text-[11px] font-medium rounded-full',
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
                                {addingNew && (
                                    <tr>
                                        <td className="px-4 py-2.5" colSpan={3}>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    className="h-8 max-w-xs"
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
                                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground" onClick={onCancelAdd}>
                                                    <XCircle className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {!addingNew && (
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
            <Section
                icon={Building2}
                title="Sponsoring Entities"
                description="Companies or entities that sponsor employee visas. Used in the Visa & ID section of employee profiles."
            >
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
            </Section>
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

            <GradeLevelsSection />
            <SponsoringEntitiesSection />
        </div>
    )
}
