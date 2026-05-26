import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Pencil, Check, XCircle, GraduationCap, Building2, Trash2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, toast, ConfirmDialog } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import {
    useAllGradeLevels, useCreateGradeLevel, useUpdateGradeLevel, useDeleteGradeLevel, useSeedDefaultGradeLevels,
    type GradeLevel, type GradeLevelInput,
} from '@/hooks/useGradeLevels'
import { useSponsoringEntities, useCreateSponsoringEntity, useUpdateSponsoringEntity, type SponsoringEntity } from '@/hooks/useSponsoringEntities'
import { Section } from './_shared'
import { Label } from '@/components/ui/label'

// ─── Role categories ──────────────────────────────────────────────────────────

const ROLE_CATEGORY_OPTIONS = [
    { value: 'employee',  labelKey: 'orgSettings.gradeLevels.roleEmployee' },
    { value: 'manager',   labelKey: 'orgSettings.gradeLevels.roleManager' },
    { value: 'director',  labelKey: 'orgSettings.gradeLevels.roleDirector' },
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

function roleCategoryColor(value: string): string {
    return ROLE_CATEGORY_COLORS[value as RoleCategory] ?? 'bg-muted text-muted-foreground'
}

// Values accepted by the current backend Zod schema - filter out legacy system-role strings
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
    const { t } = useTranslation()
    const [form, setForm] = useState<ModalState>(() => editing ? gradeLevelToModal(editing) : EMPTY_MODAL)
    const [salaryError, setSalaryError] = useState('')

    // Sync form every time the modal opens - handles reopening on the same grade after edits
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
            return { ok: false, salaryError: t('orgSettings.gradeLevels.minSalaryError') }
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
                    <DialogTitle>{editing ? t('orgSettings.gradeLevels.editGradeLevel') : t('orgSettings.gradeLevels.addGradeLevel')}</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">
                                {t('orgSettings.gradeLevels.levelLabel')} <span className="text-muted-foreground font-normal text-xs">{t('orgSettings.gradeLevels.levelHint')}</span>
                            </Label>
                            <NumericInput
                                decimal={false}
                                placeholder="e.g. 6"
                                value={form.level}
                                onChange={e => handleLevelChange(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-sm font-medium">
                                {t('orgSettings.gradeLevels.codeLabel')} <span className="text-muted-foreground font-normal text-xs">{t('orgSettings.gradeLevels.codeHint')}</span>
                            </Label>
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
                        <Label className="text-sm font-medium">
                            {t('orgSettings.gradeLevels.nameLabel')} <span className="text-destructive">*</span>
                        </Label>
                        <Input
                            placeholder="e.g. Mid Level 1"
                            value={form.name}
                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                            maxLength={80}
                            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium">
                            {t('orgSettings.gradeLevels.gradeCategoryLabel')} <span className="text-muted-foreground font-normal text-xs">{t('orgSettings.gradeLevels.gradeCategoryHint')}</span>
                        </Label>
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
                                        {selected && <Check className="size-3" />}
                                        {t(opt.labelKey)}
                                    </button>
                                )
                            })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {t('orgSettings.gradeLevels.gradeCategoryDesc')}
                        </p>
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-sm font-medium">
                            {t('orgSettings.gradeLevels.salaryRangeLabel')} <span className="text-muted-foreground font-normal text-xs">{t('orgSettings.gradeLevels.salaryRangeHint')}</span>
                        </Label>
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
                        <Label className="text-sm font-medium">{t('orgSettings.gradeLevels.descriptionLabel')}</Label>
                        <Textarea
                            placeholder={t('orgSettings.gradeLevels.descriptionPlaceholder')}
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            maxLength={500}
                            rows={2}
                            className="resize-none"
                        />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={!form.name.trim() || isPending}>
                        {isPending
                            ? t('orgSettings.gradeLevels.saving')
                            : editing
                                ? t('orgSettings.gradeLevels.saveChanges')
                                : t('orgSettings.gradeLevels.addGradeLevel')}
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
    const { t } = useTranslation()
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
            onSuccess: () => { setModalOpen(false); toast.success(t('orgSettings.gradeLevels.added')) },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? t('orgSettings.gradeLevels.codeOrNameExists') : t('orgSettings.gradeLevels.failedToAdd')),
        })
    }

    function handleUpdate(id: string, data: Partial<GradeLevelInput>) {
        update.mutate({ id, data }, {
            onSuccess: () => { setModalOpen(false); toast.success(t('orgSettings.gradeLevels.updated')) },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? t('orgSettings.gradeLevels.codeOrNameExists') : t('orgSettings.gradeLevels.failedToUpdate')),
        })
    }

    function handleToggle() {
        if (!toggleTarget) return
        update.mutate({ id: toggleTarget.id, data: { isActive: !toggleTarget.isActive } }, {
            onSuccess: () => {
                toast.success(
                    toggleTarget.isActive
                        ? t('orgSettings.gradeLevels.deactivated', { name: toggleTarget.name })
                        : t('orgSettings.gradeLevels.activated', { name: toggleTarget.name }),
                )
                setToggleTarget(null)
            },
            onError: () => { toast.error(t('orgSettings.gradeLevels.failedToToggle')); setToggleTarget(null) },
        })
    }

    function handleDelete() {
        if (!deleteTarget) return
        remove.mutate(deleteTarget.id, {
            onSuccess: () => { toast.success(t('orgSettings.gradeLevels.deleted', { name: deleteTarget.name })); setDeleteTarget(null) },
            onError: () => { toast.error(t('orgSettings.gradeLevels.failedToDelete')); setDeleteTarget(null) },
        })
    }

    function handleSeedDefaults() {
        seed.mutate(undefined, {
            onSuccess: () => toast.success(t('orgSettings.gradeLevels.defaultsLoaded')),
            onError: (err: Error) => toast.error(err.message.includes('409') || err.message.includes('already exist') ? t('orgSettings.gradeLevels.alreadyExist') : t('orgSettings.gradeLevels.failedToLoadDefaults')),
        })
    }

    const getRoleCategoryLabel = (value: string) => {
        const opt = ROLE_CATEGORY_OPTIONS.find(o => o.value === value)
        return opt ? t(opt.labelKey) : value
    }

    return (
        <>
            <Section
                icon={GraduationCap}
                title={t('orgSettings.gradeLevels.sectionTitle')}
                description={t('orgSettings.gradeLevels.sectionDescription')}
                action={
                    <Button size="sm" className="gap-1.5" onClick={openAdd} disabled={isLoading}>
                        <Plus className="size-3.5" /> {t('orgSettings.gradeLevels.addGradeLevel')}
                    </Button>
                }
            >
                {isLoading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map(i => <Skeleton key={`div-${i}`} className="h-12 rounded-lg" />)}
                    </div>
                ) : levels.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-muted/30 flex flex-col items-center justify-center py-12 text-center gap-4">
                        <div className="space-y-1">
                            <p className="text-sm font-medium">{t('orgSettings.gradeLevels.noGradeLevels')}</p>
                            <p className="text-xs text-muted-foreground">{t('orgSettings.gradeLevels.noGradeLevelsHint')}</p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" className="gap-1.5" onClick={handleSeedDefaults} disabled={seed.isPending}>
                                <Sparkles className="size-3.5" />
                                {seed.isPending ? t('orgSettings.gradeLevels.loading') : t('orgSettings.gradeLevels.loadDefaults')}
                            </Button>
                            <Button size="sm" className="gap-1.5" onClick={openAdd}>
                                <Plus className="size-3.5" /> {t('orgSettings.gradeLevels.addGradeLevel')}
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-xl border bg-card overflow-hidden">
                        <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm">
                            <thead>
                                <tr className="border-b bg-muted/40">
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-16">{t('orgSettings.gradeLevels.codeCol')}</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-8">{t('orgSettings.gradeLevels.levelCol')}</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t('orgSettings.gradeLevels.nameCol')}</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t('orgSettings.gradeLevels.gradeCategoryCol')}</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-44">{t('orgSettings.gradeLevels.salaryRangeCol')}</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-20">{t('orgSettings.gradeLevels.statusCol')}</th>
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
                                                            {getRoleCategoryLabel(r)}
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
                                                {g.isActive ? t('common.active') : t('common.inactive')}
                                            </Badge>
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center justify-end gap-1">
                                                <Button
                                                    size="sm" variant="ghost"
                                                    className="size-7 p-0 text-muted-foreground hover:text-foreground"
                                                    title={t('common.edit')}
                                                    onClick={() => openEdit(g)}
                                                >
                                                    <Pencil className="size-3.5" />
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
                                                    {g.isActive ? t('orgSettings.gradeLevels.deactivate') : t('orgSettings.gradeLevels.activate')}
                                                </Button>
                                                <Button
                                                    size="sm" variant="ghost"
                                                    className="size-7 p-0 text-muted-foreground hover:text-destructive"
                                                    title={t('common.delete')}
                                                    onClick={() => setDeleteTarget(g)}
                                                >
                                                    <Trash2 className="size-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
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
                title={toggleTarget?.isActive
                    ? t('orgSettings.gradeLevels.deactivateTitle', { name: toggleTarget?.name })
                    : t('orgSettings.gradeLevels.activateTitle', { name: toggleTarget?.name })}
                description={toggleTarget?.isActive
                    ? t('orgSettings.gradeLevels.deactivateDesc')
                    : t('orgSettings.gradeLevels.activateDesc')}
                confirmLabel={toggleTarget?.isActive ? t('orgSettings.gradeLevels.deactivate') : t('orgSettings.gradeLevels.activate')}
                variant={toggleTarget?.isActive ? 'destructive' : 'success'}
                onConfirm={handleToggle}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={o => !o && setDeleteTarget(null)}
                title={t('orgSettings.gradeLevels.deleteTitle', { name: deleteTarget?.name })}
                description={t('orgSettings.gradeLevels.deleteDesc')}
                confirmLabel={t('common.delete')}
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
    const { t } = useTranslation()
    return (
        <div className="space-y-3">
            {isLoading ? (
                <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={`div-${i}`} className="h-10 rounded-lg" />)}
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
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t('orgSettings.gradeLevels.masterList.nameCol')}</th>
                                    <th className="text-left px-4 py-2.5 font-medium text-muted-foreground w-24">{t('orgSettings.gradeLevels.masterList.statusCol')}</th>
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
                                                    {item.isActive ? t('orgSettings.gradeLevels.masterList.activeStatus') : t('orgSettings.gradeLevels.masterList.inactiveStatus')}
                                                </Badge>
                                            )}
                                        </td>
                                        <td className="px-4 py-2.5">
                                            <div className="flex items-center justify-end gap-1">
                                                {editingId === item.id ? (
                                                    <>
                                                        <Button size="sm" variant="ghost" className="size-7 p-0 text-emerald-600 hover:text-emerald-700" onClick={() => onSaveEdit(item.id)}>
                                                            <Check className="size-3.5" />
                                                        </Button>
                                                        <Button size="sm" variant="ghost" className="size-7 p-0 text-muted-foreground" onClick={onCancelEdit}>
                                                            <XCircle className="size-3.5" />
                                                        </Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Button
                                                            size="sm" variant="ghost"
                                                            className="size-7 p-0 text-muted-foreground hover:text-foreground"
                                                            title={t('orgSettings.gradeLevels.rename')}
                                                            onClick={() => onStartEdit(item)}
                                                        >
                                                            <Pencil className="size-3.5" />
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
                                                            {item.isActive ? t('orgSettings.gradeLevels.deactivate') : t('orgSettings.gradeLevels.activate')}
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
                                                    placeholder={t('orgSettings.gradeLevels.masterList.enterName')}
                                                    value={newName}
                                                    onChange={e => onNewNameChange(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') onAdd()
                                                        if (e.key === 'Escape') onCancelAdd()
                                                    }}
                                                />
                                                <Button size="sm" onClick={onAdd} disabled={!newName.trim() || addPending}>
                                                    {addPending ? '…' : t('common.add')}
                                                </Button>
                                                <Button size="sm" variant="ghost" className="size-8 p-0 text-muted-foreground" onClick={onCancelAdd}>
                                                    <XCircle className="size-4" />
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
                    <Plus className="size-3.5" /> {addLabel}
                </Button>
            )}
        </div>
    )
}

function SponsoringEntitiesSection() {
    const { t } = useTranslation()
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
            onSuccess: () => { setNewName(''); setAddingNew(false); toast.success(t('orgSettings.gradeLevels.sponsoring.added')) },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? t('orgSettings.gradeLevels.sponsoring.entityExists') : t('orgSettings.gradeLevels.sponsoring.failedToAdd')),
        })
    }

    function handleUpdate(id: string) {
        const name = editName.trim()
        if (!name) return
        update.mutate({ id, data: { name } }, {
            onSuccess: () => { setEditingId(null); toast.success(t('orgSettings.gradeLevels.sponsoring.updated')) },
            onError: (err: Error) => toast.error(err.message.includes('unique') ? t('orgSettings.gradeLevels.sponsoring.nameExists') : t('orgSettings.gradeLevels.sponsoring.failedToUpdate')),
        })
    }

    function handleToggle() {
        if (!toggleTarget) return
        update.mutate({ id: toggleTarget.id, data: { isActive: !toggleTarget.isActive } }, {
            onSuccess: () => {
                toast.success(
                    toggleTarget.isActive
                        ? t('orgSettings.gradeLevels.sponsoring.deactivated', { name: toggleTarget.name })
                        : t('orgSettings.gradeLevels.sponsoring.activated', { name: toggleTarget.name }),
                )
                setToggleTarget(null)
            },
            onError: () => { toast.error(t('orgSettings.gradeLevels.sponsoring.failedToToggle')); setToggleTarget(null) },
        })
    }

    return (
        <>
            <Section
                icon={Building2}
                title={t('orgSettings.gradeLevels.sponsoring.sectionTitle')}
                description={t('orgSettings.gradeLevels.sponsoring.sectionDescription')}
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
                    addLabel={t('orgSettings.gradeLevels.sponsoring.addLabel')}
                    emptyMessage={t('orgSettings.gradeLevels.sponsoring.emptyMessage')}
                />
            </Section>
            <ConfirmDialog
                open={!!toggleTarget}
                onOpenChange={o => !o && setToggleTarget(null)}
                title={toggleTarget?.isActive
                    ? t('orgSettings.gradeLevels.sponsoring.deactivateTitle', { name: toggleTarget?.name })
                    : t('orgSettings.gradeLevels.sponsoring.activateTitle', { name: toggleTarget?.name })}
                description={toggleTarget?.isActive
                    ? t('orgSettings.gradeLevels.sponsoring.deactivateDesc')
                    : t('orgSettings.gradeLevels.sponsoring.activateDesc')}
                confirmLabel={toggleTarget?.isActive ? t('orgSettings.gradeLevels.deactivate') : t('orgSettings.gradeLevels.activate')}
                variant={toggleTarget?.isActive ? 'destructive' : 'success'}
                onConfirm={handleToggle}
            />
        </>
    )
}

// ─── Tab ──────────────────────────────────────────────────────────────────────

export function GradeLevelsTab() {
    const { t } = useTranslation()
    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-base font-semibold">{t('orgSettings.gradeLevels.title')}</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                    {t('orgSettings.gradeLevels.description')}
                </p>
            </div>

            <GradeLevelsSection />
            <SponsoringEntitiesSection />
        </div>
    )
}
