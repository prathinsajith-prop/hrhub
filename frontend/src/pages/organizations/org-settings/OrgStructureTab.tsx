import { useState, useEffect, useMemo, type ChangeEvent } from 'react'
import { Plus, Trash2, Pencil, GitBranch, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { toast, ConfirmDialog } from '@/components/ui/overlays'
import {
    useOrgUnits, useCreateOrgUnit, useUpdateOrgUnit, useDeleteOrgUnit, useCascadeManager,
    type OrgUnit, type OrgUnitInput,
} from '@/hooks/useOrgUnits'
import { useEmployees } from '@/hooks/useEmployees'
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select'
import { Textarea as UiTextarea } from '@/components/ui/textarea'
import { Dialog as UiDialog, DialogContent as UiDialogContent, DialogHeader as UiDialogHeader, DialogTitle as UiDialogTitle, DialogFooter as UiDialogFooter, DialogDescription as UiDialogDescription } from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { ORG_TYPE_META, ORG_HIERARCHY, type OrgUnitType } from '@/lib/org-unit-meta'
import { KpiCardCompact } from '@/components/shared/KpiCard'

// ─── Org Unit Dialog ──────────────────────────────────────────────────────────

const NONE = '__none__'

interface OrgUnitFormState {
    name: string
    type: OrgUnitType
    parentId: string
    headEmployeeId: string
    description: string
    isActive: boolean
}

const EMPTY_FORM: OrgUnitFormState = {
    name: '', type: 'branch', parentId: '', headEmployeeId: '', description: '', isActive: true,
}

const PLACEHOLDERS: Record<OrgUnitType, string> = {
    branch: 'e.g. Dubai Branch',
    division: 'e.g. Enterprise Solutions Division',
    department: 'e.g. Backend Engineering',
}

const PARENT_LABEL: Partial<Record<OrgUnitType, string>> = {
    division: 'Parent Branch',
    department: 'Parent Division',
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
    const cascade = useCascadeManager()
    const [form, setForm] = useState<OrgUnitFormState>(EMPTY_FORM)
    const [cascadePrompt, setCascadePrompt] = useState<{ departmentId: string; newManagerName: string } | null>(null)

    useEffect(() => {
        if (open) {
            setForm(editing ? {
                name: editing.name,
                type: editing.type,
                parentId: editing.parentId ?? '',
                headEmployeeId: editing.headEmployeeId ?? '',
                description: editing.description ?? '',
                isActive: editing.isActive,
            } : { ...EMPTY_FORM, type: defaultType })
        }
    }, [open, editing, defaultType])

    const field = (k: keyof OrgUnitFormState) =>
        (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setForm(f => ({ ...f, [k]: e.target.value }))

    async function submit() {
        if (!form.name.trim()) return toast.error('Name required', 'Please enter a name.')
        const payload: OrgUnitInput = {
            name: form.name.trim(),
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
                // If this is a department and the head changed, offer to cascade
                const headChanged = editing.type === 'department' && form.headEmployeeId && form.headEmployeeId !== (editing.headEmployeeId ?? '')
                if (headChanged) {
                    const newManager = empList.find(e => e.id === form.headEmployeeId)
                    const newManagerName = newManager ? `${newManager.firstName} ${newManager.lastName}` : 'the new manager'
                    setCascadePrompt({ departmentId: editing.id, newManagerName })
                    return // keep dialog open for cascade prompt
                }
            } else {
                await create.mutateAsync(payload)
                toast.success('Created', `${form.name} has been created.`)
            }
            onClose()
        } catch (err) {
            toast.error('Save failed', err instanceof ApiError ? err.message : 'Could not save org unit.')
        }
    }

    async function handleCascadeConfirm() {
        if (!cascadePrompt) return
        try {
            const res = await cascade.mutateAsync(cascadePrompt.departmentId)
            const count = res?.data?.updated ?? 0
            toast.success('Reporting managers updated', `${count} employee${count !== 1 ? 's' : ''} now report to ${cascadePrompt.newManagerName}.`)
        } catch {
            toast.error('Cascade failed', 'Could not update reporting managers.')
        } finally {
            setCascadePrompt(null)
            onClose()
        }
    }

    const isPending = create.isPending || update.isPending
    const meta = ORG_TYPE_META[form.type]
    const parentBranches = units.filter(u => u.type === 'branch' && u.id !== editing?.id)
    const parentDivisions = units.filter(u => u.type === 'division' && u.id !== editing?.id)
    const parentOptions = form.type === 'division' ? parentBranches : parentDivisions
    const parentLabel = PARENT_LABEL[form.type]
    const noParentHint = form.type === 'division'
        ? 'No branches yet — create a branch first to nest divisions under it.'
        : 'No divisions yet — create a division first to nest departments under it.'

    return (
        <UiDialog open={open} onOpenChange={o => { if (!o) onClose() }}>
            <UiDialogContent className="sm:max-w-lg">
                <UiDialogHeader>
                    <UiDialogTitle>{editing ? 'Edit' : 'Add'} {meta.label}</UiDialogTitle>
                    <UiDialogDescription>
                        {editing ? 'Update the details for this org unit.' : 'Create a new org unit in your structure.'}
                    </UiDialogDescription>
                </UiDialogHeader>
                <div className="space-y-4 py-1">
                    {!editing && (
                        <div className="space-y-1.5">
                            <Label required>Type</Label>
                            <UiSelect
                                value={form.type}
                                onValueChange={v => setForm(f => ({ ...f, type: v as OrgUnitType, parentId: '' }))}
                            >
                                <UiSelectTrigger><UiSelectValue /></UiSelectTrigger>
                                <UiSelectContent>
                                    {ORG_HIERARCHY.map(t => {
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
                            <p className="text-[11px] text-muted-foreground">
                                Hierarchy:{' '}
                                <span className="text-emerald-600 font-medium">Branch</span>
                                {' → '}
                                <span className="text-violet-600 font-medium">Division</span>
                                {' → '}
                                <span className="text-blue-600 font-medium">Department</span>
                            </p>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label required>Name</Label>
                        <Input value={form.name} onChange={field('name')} placeholder={PLACEHOLDERS[form.type]} autoFocus />
                    </div>

                    {(form.type === 'division' || form.type === 'department') && (
                        <div className="space-y-1.5">
                            <Label>{parentLabel}</Label>
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
                                <p className="text-[11px] text-muted-foreground">{noParentHint}</p>
                            )}
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <Label>Head / Manager</Label>
                        <UiSelect
                            value={form.headEmployeeId || NONE}
                            onValueChange={v => setForm(f => ({ ...f, headEmployeeId: v === NONE ? '' : v }))}
                        >
                            <UiSelectTrigger><UiSelectValue placeholder="Unassigned" /></UiSelectTrigger>
                            <UiSelectContent>
                                <UiSelectItem value={NONE}>— Unassigned —</UiSelectItem>
                                {empList.map(e => (
                                    <UiSelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</UiSelectItem>
                                ))}
                            </UiSelectContent>
                        </UiSelect>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Description</Label>
                        <UiTextarea value={form.description} onChange={field('description')} rows={2} placeholder="Optional description…" />
                    </div>

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

            {/* Cascade reporting manager confirmation */}
            {cascadePrompt && (
                <ConfirmDialog
                    open={!!cascadePrompt}
                    onOpenChange={o => { if (!o) { setCascadePrompt(null); onClose() } }}
                    title="Update reporting managers?"
                    description={`All employees in this department currently report to the previous manager. Would you like to update their reporting person to ${cascadePrompt.newManagerName}?`}
                    confirmLabel={cascade.isPending ? 'Updating…' : 'Yes, update all'}
                    variant="warning"
                    onConfirm={handleCascadeConfirm}
                />
            )}
        </UiDialog>
    )
}

// ─── Org Unit Tree Row ────────────────────────────────────────────────────────

function OrgUnitRow({ unit, units, empList }: {
    unit: OrgUnit
    units: OrgUnit[]
    empList: Array<{ id: string; firstName: string; lastName: string }>
}) {
    const deleteMut = useDeleteOrgUnit()
    const [editing, setEditing] = useState(false)
    const [expanded, setExpanded] = useState(true)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const meta = ORG_TYPE_META[unit.type]
    const Icon = meta.icon
    const children = units.filter(u => u.parentId === unit.id)

    return (
        <div>
            <div className={cn(
                'flex items-center gap-3 rounded-lg border px-3 py-2.5 mb-1.5 bg-card hover:bg-muted/30 transition-colors',
                meta.treeIndent,
            )}>
                {children.length > 0 ? (
                    <button onClick={() => setExpanded(e => !e)} className="shrink-0 text-muted-foreground hover:text-foreground">
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
                    </button>
                ) : <div className="w-3.5 shrink-0" />}

                <div className={cn('flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-md border text-xs font-medium', meta.badge)}>
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
                            <OrgUnitRow key={child.id} unit={child} units={units} empList={empList} />
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
                        onSuccess: () => { toast.success('Deleted', `${unit.name} has been removed.`); setConfirmDelete(false) },
                        onError: () => toast.error('Error', 'Could not delete org unit.'),
                    })
                }}
            />
        </div>
    )
}

// ─── Org Structure Tab ────────────────────────────────────────────────────────

export function OrgStructureTab() {
    const { data: units = [], isLoading } = useOrgUnits()
    const { data: employees } = useEmployees({ limit: 100 })
    const [adding, setAdding] = useState<OrgUnitType | null>(null)

    const empList = useMemo(
        () => Array.isArray(employees) ? employees : (employees as { data?: Array<{ id: string; firstName: string; lastName: string }> } | undefined)?.data ?? [],
        [employees],
    )

    const roots = units.filter(u => !u.parentId)
    const counts: Record<OrgUnitType, number> = {
        branch: units.filter(u => u.type === 'branch').length,
        division: units.filter(u => u.type === 'division').length,
        department: units.filter(u => u.type === 'department').length,
    }

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-base font-semibold">Organization Structure</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                    Three-level hierarchy:{' '}
                    <span className="text-emerald-600 font-medium">Branch</span>
                    {' → '}
                    <span className="text-violet-600 font-medium">Division</span>
                    {' → '}
                    <span className="text-blue-600 font-medium">Department</span>.
                    {' '}Start with branches, add divisions under each branch, then departments under each division.
                </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiCardCompact label="Branches" value={counts.branch} icon={ORG_TYPE_META.branch.icon} color="green" loading={isLoading} />
                <KpiCardCompact label="Divisions" value={counts.division} icon={ORG_TYPE_META.division.icon} color="purple" loading={isLoading} />
                <KpiCardCompact label="Departments" value={counts.department} icon={ORG_TYPE_META.department.icon} color="blue" loading={isLoading} />
            </div>

            <div className="flex gap-2 flex-wrap">
                {ORG_HIERARCHY.map(type => {
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
                        <p className="text-sm text-muted-foreground mt-1">
                            Start by adding a Branch, then add Divisions under it, then Departments under each Division.
                        </p>
                    </div>
                    <Button size="sm" onClick={() => setAdding('branch')} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                        Add your first Branch
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

        </div>
    )
}
