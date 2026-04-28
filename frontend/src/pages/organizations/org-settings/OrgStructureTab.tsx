import React from 'react'
import { Plus, Trash2, Pencil, GitBranch, Check, XCircle, Layers, Users2, MapPin, ChevronDown, ChevronRight as ChevronRightIcon, Briefcase } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { toast, ConfirmDialog } from '@/components/ui/overlays'
import {
    useOrgUnits, useCreateOrgUnit, useUpdateOrgUnit, useDeleteOrgUnit,
    type OrgUnit, type OrgUnitInput, type OrgUnitType,
} from '@/hooks/useOrgUnits'
import { useDesignations, useCreateDesignation, useUpdateDesignation, useDeleteDesignation } from '@/hooks/useDesignations'
import type { Designation } from '@/hooks/useDesignations'
import { useEmployees } from '@/hooks/useEmployees'
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select'
import { Textarea as UiTextarea } from '@/components/ui/textarea'
import { Dialog as UiDialog, DialogContent as UiDialogContent, DialogHeader as UiDialogHeader, DialogTitle as UiDialogTitle, DialogFooter as UiDialogFooter, DialogDescription as UiDialogDescription } from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { Section } from './_shared'

// ─── Org Structure Tab ────────────────────────────────────────────────────────

const NONE = '__none__'

const ORG_TYPE_META: Record<OrgUnitType, { label: string; plural: string; icon: React.FC<{ className?: string }>; badgeColor: string; statColor: string }> = {
    division: { label: 'Division', plural: 'Divisions', icon: Layers, badgeColor: 'text-violet-700 bg-violet-50 border-violet-200', statColor: 'border-violet-200 bg-violet-50 text-violet-700' },
    department: { label: 'Department', plural: 'Departments', icon: Users2, badgeColor: 'text-blue-700 bg-blue-50 border-blue-200', statColor: 'border-blue-200 bg-blue-50 text-blue-700' },
    branch: { label: 'Branch', plural: 'Branches', icon: MapPin, badgeColor: 'text-emerald-700 bg-emerald-50 border-emerald-200', statColor: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
}

function genOrgCode(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean)
    if (words.length === 1) return words[0].slice(0, 5).toUpperCase()
    return words.map(w => w.slice(0, 3)).join('').toUpperCase().slice(0, 8)
}

interface OrgUnitFormState {
    name: string
    type: OrgUnitType
    parentId: string
    headEmployeeId: string
    description: string
    isActive: boolean
}

const EMPTY_ORG_FORM: OrgUnitFormState = {
    name: '', type: 'division', parentId: '', headEmployeeId: '', description: '', isActive: true,
}

function OrgUnitDialog({
    open, onClose, editing, defaultType, units, employees: empList,
}: {
    open: boolean
    onClose: () => void
    editing: OrgUnit | null
    defaultType: OrgUnitType
    units: OrgUnit[]
    employees: Array<{ id: string; firstName: string; lastName: string }>
}) {
    const create = useCreateOrgUnit()
    const update = useUpdateOrgUnit()
    const [form, setForm] = React.useState<OrgUnitFormState>(EMPTY_ORG_FORM)

    React.useEffect(() => {
        if (open) {
            setForm(editing ? {
                name: editing.name,
                type: editing.type,
                parentId: editing.parentId ?? '',
                headEmployeeId: editing.headEmployeeId ?? '',
                description: editing.description ?? '',
                isActive: editing.isActive,
            } : { ...EMPTY_ORG_FORM, type: defaultType })
        }
    }, [open, editing, defaultType])

    const s = (k: keyof OrgUnitFormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(f => ({ ...f, [k]: e.target.value }))

    async function submit() {
        if (!form.name.trim()) return toast.error('Name required', 'Please enter a name.')
        const payload: OrgUnitInput = {
            name: form.name.trim(),
            code: genOrgCode(form.name),
            type: form.type,
            parentId: form.parentId || null,
            headEmployeeId: form.headEmployeeId || null,
            description: form.description.trim() || undefined,
            isActive: form.isActive,
        }
        try {
            if (editing) {
                await update.mutateAsync({ id: editing.id, data: payload })
                toast.success('Updated', `${form.name} has been updated.`)
            } else {
                await create.mutateAsync(payload)
                toast.success('Created', `${form.name} has been created.`)
            }
            onClose()
        } catch (err) {
            const msg = err instanceof ApiError ? err.message : 'Could not save org unit.'
            toast.error('Save failed', msg)
        }
    }

    const isPending = create.isPending || update.isPending
    const meta = ORG_TYPE_META[form.type]

    const parentOptions = units.filter(u => u.type === 'division' && u.id !== editing?.id)
    const PLACEHOLDERS: Record<OrgUnitType, string> = {
        division: 'e.g. Sales Division',
        department: 'e.g. Marketing',
        branch: 'e.g. Dubai Branch',
    }

    return (
        <UiDialog open={open} onOpenChange={o => { if (!o) onClose() }}>
            <UiDialogContent className="sm:max-w-lg">
                <UiDialogHeader>
                    <UiDialogTitle>{editing ? 'Edit' : 'Add'} {ORG_TYPE_META[form.type].label}</UiDialogTitle>
                    <UiDialogDescription>
                        {editing ? 'Update the details for this org unit.' : 'Create a new org unit in your structure.'}
                    </UiDialogDescription>
                </UiDialogHeader>
                <div className="space-y-4 py-1">
                    {/* Type selector — only when creating */}
                    {!editing && (
                        <div className="space-y-1.5">
                            <Label required>Type</Label>
                            <UiSelect
                                value={form.type}
                                onValueChange={v => setForm(f => ({ ...f, type: v as OrgUnitType, parentId: '' }))}
                            >
                                <UiSelectTrigger>
                                    <UiSelectValue />
                                </UiSelectTrigger>
                                <UiSelectContent>
                                    {(Object.keys(ORG_TYPE_META) as OrgUnitType[]).map(t => {
                                        const Icon = ORG_TYPE_META[t].icon
                                        return (
                                            <UiSelectItem key={t} value={t}>
                                                <span className="flex items-center gap-2">
                                                    <Icon className="h-3.5 w-3.5" />
                                                    {ORG_TYPE_META[t].label}
                                                </span>
                                            </UiSelectItem>
                                        )
                                    })}
                                </UiSelectContent>
                            </UiSelect>
                        </div>
                    )}

                    {/* Name */}
                    <div className="space-y-1.5">
                        <Label required>Name</Label>
                        <Input
                            value={form.name}
                            onChange={s('name')}
                            placeholder={PLACEHOLDERS[form.type]}
                            autoFocus
                        />
                    </div>

                    {/* Parent Division — only for departments & branches */}
                    {(form.type === 'department' || form.type === 'branch') && (
                        <div className="space-y-1.5">
                            <Label>Parent Division</Label>
                            <UiSelect
                                value={form.parentId || NONE}
                                onValueChange={v => setForm(f => ({ ...f, parentId: v === NONE ? '' : v }))}
                            >
                                <UiSelectTrigger>
                                    <UiSelectValue placeholder="No parent (standalone)" />
                                </UiSelectTrigger>
                                <UiSelectContent>
                                    <UiSelectItem value={NONE}>— No parent (standalone) —</UiSelectItem>
                                    {parentOptions.map(u => (
                                        <UiSelectItem key={u.id} value={u.id}>{u.name}</UiSelectItem>
                                    ))}
                                </UiSelectContent>
                            </UiSelect>
                            {parentOptions.length === 0 && (
                                <p className="text-[11px] text-muted-foreground">No divisions yet — create a division first to nest under it.</p>
                            )}
                        </div>
                    )}

                    {/* Head / Manager */}
                    <div className="space-y-1.5">
                        <Label>Head / Manager</Label>
                        <UiSelect
                            value={form.headEmployeeId || NONE}
                            onValueChange={v => setForm(f => ({ ...f, headEmployeeId: v === NONE ? '' : v }))}
                        >
                            <UiSelectTrigger>
                                <UiSelectValue placeholder="Unassigned" />
                            </UiSelectTrigger>
                            <UiSelectContent>
                                <UiSelectItem value={NONE}>— Unassigned —</UiSelectItem>
                                {empList.map(e => (
                                    <UiSelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</UiSelectItem>
                                ))}
                            </UiSelectContent>
                        </UiSelect>
                    </div>

                    {/* Description */}
                    <div className="space-y-1.5">
                        <Label>Description</Label>
                        <UiTextarea
                            value={form.description}
                            onChange={s('description')}
                            rows={2}
                            placeholder="Optional description…"
                        />
                    </div>

                    {/* Active toggle */}
                    <div className="flex items-center gap-2 pt-1">
                        <Switch
                            checked={form.isActive}
                            onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))}
                            id="ou-active"
                        />
                        <Label htmlFor="ou-active" className="cursor-pointer">Active</Label>
                    </div>
                </div>
                <UiDialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={submit} disabled={isPending}>
                        {isPending ? 'Saving…' : editing ? 'Save Changes' : `Create ${meta.label}`}
                    </Button>
                </UiDialogFooter>
            </UiDialogContent>
        </UiDialog>
    )
}

function OrgUnitRow({ unit, units, empList, depth = 0 }: {
    unit: OrgUnit
    units: OrgUnit[]
    empList: Array<{ id: string; firstName: string; lastName: string }>
    depth?: number
}) {
    const deleteMut = useDeleteOrgUnit()
    const [editing, setEditing] = React.useState(false)
    const [expanded, setExpanded] = React.useState(true)
    const [confirmDelete, setConfirmDelete] = React.useState(false)
    const meta = ORG_TYPE_META[unit.type]
    const Icon = meta.icon
    const children = units.filter(u => u.parentId === unit.id)

    return (
        <div>
            <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5 mb-1.5 bg-card hover:bg-muted/30 transition-colors" style={{ marginLeft: `${depth * 24}px` }}>
                {children.length > 0 ? (
                    <button onClick={() => setExpanded(e => !e)} className="shrink-0 text-muted-foreground hover:text-foreground">
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
                    </button>
                ) : <div className="w-3.5 shrink-0" />}
                <div className={`flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-md border text-xs font-medium ${meta.badgeColor}`}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                </div>
                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{unit.name}</span>
                    {unit.code && <span className="ml-2 text-[11px] text-muted-foreground font-mono">{unit.code}</span>}
                    {unit.headEmployeeName && (
                        <span className="ml-2 text-[11px] text-muted-foreground">· {unit.headEmployeeName}</span>
                    )}
                </div>
                {!unit.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)}>
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        disabled={deleteMut.isPending}
                        onClick={() => setConfirmDelete(true)}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>
            {expanded && children.length > 0 && (
                <div className="relative">
                    <div className="absolute left-[11px] top-0 bottom-1 w-px bg-border" />
                    {children
                        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                        .map(child => (
                            <OrgUnitRow key={child.id} unit={child} units={units} empList={empList} depth={depth + 1} />
                        ))}
                </div>
            )}
            {editing && (
                <OrgUnitDialog
                    open={editing} onClose={() => setEditing(false)}
                    editing={unit} defaultType={unit.type} units={units} employees={empList}
                />
            )}
            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={`Delete "${unit.name}"?`}
                description="Its child units will become standalone. This action cannot be undone."
                confirmLabel="Delete"
                onConfirm={() => {
                    deleteMut.mutate(unit.id, {
                        onSuccess: () => {
                            toast.success('Deleted', `${unit.name} has been removed.`)
                            setConfirmDelete(false)
                        },
                        onError: () => toast.error('Error', 'Could not delete org unit.'),
                    })
                }}
            />
        </div>
    )
}

function DesignationsSection() {
    const { data: items = [], isLoading } = useDesignations()
    const designations = Array.isArray(items) ? items as Designation[] : []
    const create = useCreateDesignation()
    const update = useUpdateDesignation()
    const del = useDeleteDesignation()

    const [newName, setNewName] = React.useState('')
    const [addingNew, setAddingNew] = React.useState(false)
    const [editingId, setEditingId] = React.useState<string | null>(null)
    const [editName, setEditName] = React.useState('')

    function handleAdd() {
        const name = newName.trim()
        if (!name) return
        create.mutate({ name }, {
            onSuccess: () => { setNewName(''); setAddingNew(false); toast.success('Designation added') },
            onError: (err: Error & { message?: string }) => toast.error(err?.message?.includes('unique') ? 'Designation already exists' : 'Failed to add'),
        })
    }

    function handleUpdate(id: string) {
        const name = editName.trim()
        if (!name) return
        update.mutate({ id, data: { name } }, {
            onSuccess: () => { setEditingId(null); toast.success('Updated') },
            onError: (err: Error & { message?: string }) => toast.error(err?.message?.includes('unique') ? 'Name already exists' : 'Failed to update'),
        })
    }

    function handleToggle(d: Designation) {
        update.mutate({ id: d.id, data: { isActive: !d.isActive } })
    }

    function handleDelete(d: Designation) {
        del.mutate(d.id, {
            onSuccess: () => toast.success(`"${d.name}" removed`),
            onError: () => toast.error('Failed to delete'),
        })
    }

    return (
        <Section icon={Briefcase} title="Designations" description="Define job titles employees can be assigned. These appear as a dropdown when adding or editing employees.">
            <div className="space-y-2">
                {isLoading ? (
                    <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-9 rounded-lg bg-muted animate-pulse" />)}</div>
                ) : designations.length === 0 && !addingNew ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No designations yet. Add one to get started.</p>
                ) : (
                    <div className="divide-y divide-border/50 rounded-lg border bg-background">
                        {designations.map(d => (
                            <div key={d.id} className="flex items-center gap-3 px-3 py-2.5">
                                {editingId === d.id ? (
                                    <>
                                        <input
                                            autoFocus
                                            className="flex-1 rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                            value={editName}
                                            onChange={e => setEditName(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleUpdate(d.id); if (e.key === 'Escape') setEditingId(null) }}
                                        />
                                        <button onClick={() => handleUpdate(d.id)} className="text-success hover:text-success/80 shrink-0">
                                            <Check className="h-4 w-4" />
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground shrink-0">
                                            <XCircle className="h-4 w-4" />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <span className={cn('flex-1 text-sm font-medium', !d.isActive && 'line-through text-muted-foreground')}>{d.name}</span>
                                        {!d.isActive && (
                                            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium shrink-0">Inactive</span>
                                        )}
                                        <button
                                            onClick={() => { setEditingId(d.id); setEditName(d.name) }}
                                            className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
                                            title="Rename"
                                        >
                                            <Pencil className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                            onClick={() => handleToggle(d)}
                                            className={cn('text-xs shrink-0 px-2 py-0.5 rounded-full border font-medium transition-colors', d.isActive ? 'border-success/30 text-success hover:bg-success/10' : 'border-muted-foreground/30 text-muted-foreground hover:bg-muted')}
                                            title={d.isActive ? 'Deactivate' : 'Activate'}
                                        >
                                            {d.isActive ? 'Active' : 'Inactive'}
                                        </button>
                                        <button
                                            onClick={() => handleDelete(d)}
                                            className="text-muted-foreground hover:text-destructive shrink-0 transition-colors"
                                            title="Delete"
                                            disabled={del.isPending}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {addingNew ? (
                    <div className="flex items-center gap-2 mt-2">
                        <input
                            autoFocus
                            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                            placeholder="e.g. Senior Engineer"
                            value={newName}
                            onChange={e => setNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') { setAddingNew(false); setNewName('') } }}
                        />
                        <button
                            onClick={handleAdd}
                            disabled={!newName.trim() || create.isPending}
                            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-50 hover:bg-primary/90 transition-colors"
                        >
                            {create.isPending ? '…' : 'Add'}
                        </button>
                        <button onClick={() => { setAddingNew(false); setNewName('') }} className="text-muted-foreground hover:text-foreground transition-colors">
                            <XCircle className="h-4 w-4" />
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => setAddingNew(true)}
                        className="flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 font-medium mt-1 transition-colors"
                    >
                        <Plus className="h-3.5 w-3.5" /> Add designation
                    </button>
                )}
            </div>
        </Section>
    )
}

export function OrgStructureTab() {
    const { data: units = [], isLoading } = useOrgUnits()
    const { data: employees } = useEmployees({ limit: 100 })
    const [adding, setAdding] = React.useState<OrgUnitType | null>(null)

    const empList = React.useMemo(
        () => Array.isArray(employees) ? employees : (employees as { data?: Array<{ id: string; firstName: string; lastName: string }> } | undefined)?.data ?? [],
        [employees],
    )

    const roots = units.filter(u => !u.parentId)
    const stats = {
        divisions: units.filter(u => u.type === 'division').length,
        departments: units.filter(u => u.type === 'department').length,
        branches: units.filter(u => u.type === 'branch').length,
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-base font-semibold">Organization Structure</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Define your company hierarchy — divisions, departments, and branches. Employees can be assigned to these units during onboarding.
                </p>
            </div>

            {/* Summary stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(Object.keys(ORG_TYPE_META) as OrgUnitType[]).map(type => {
                    const meta = ORG_TYPE_META[type]
                    const Icon = meta.icon
                    return (
                        <div key={type} className={`rounded-xl border p-4 flex items-center gap-3 ${meta.statColor}`}>
                            <Icon className="h-5 w-5 shrink-0" />
                            <div>
                                <p className="text-xl font-bold">{{ division: stats.divisions, department: stats.departments, branch: stats.branches }[type]}</p>
                                <p className="text-xs font-medium">{meta.plural}</p>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 flex-wrap">
                {(Object.keys(ORG_TYPE_META) as OrgUnitType[]).map(type => {
                    const meta = ORG_TYPE_META[type]
                    const Icon = meta.icon
                    return (
                        <Button key={type} size="sm" variant="outline" onClick={() => setAdding(type)}
                            leftIcon={<Icon className="h-3.5 w-3.5" />}>
                            Add {meta.label}
                        </Button>
                    )
                })}
            </div>

            {/* Tree */}
            {isLoading ? (
                <div className="space-y-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-11 rounded-lg bg-muted animate-pulse" />
                    ))}
                </div>
            ) : roots.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <GitBranch className="h-10 w-10 text-muted-foreground" />
                    <div>
                        <p className="font-medium text-sm">No structure defined yet</p>
                        <p className="text-sm text-muted-foreground mt-1">Start by adding a Division, then nest Departments and Branches under it.</p>
                    </div>
                    <Button size="sm" onClick={() => setAdding('division')} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                        Add your first Division
                    </Button>
                </div>
            ) : (
                <div className="space-y-1">
                    {roots
                        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                        .map(unit => (
                            <OrgUnitRow key={unit.id} unit={unit} units={units} empList={empList} />
                        ))}
                </div>
            )}

            {adding && (
                <OrgUnitDialog
                    open={!!adding} onClose={() => setAdding(null)}
                    editing={null} defaultType={adding} units={units} employees={empList}
                />
            )}

            <DesignationsSection />
        </div>
    )
}
