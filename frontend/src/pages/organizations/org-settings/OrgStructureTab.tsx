import { useState, useMemo, type ChangeEvent } from 'react'
import { Plus, Trash2, Pencil, GitBranch, ChevronDown, ChevronRight as ChevronRightIcon, Users, UserPlus, Settings2, UserCog, X as XIcon, Crown } from 'lucide-react'
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
import {
    useTeams, useTeamMembers, useUpdateTeam, useDeleteTeam,
    useRemoveTeamMember, useUpdateTeamMemberRole,
    type TeamRow, type TeamMemberRole,
} from '@/hooks/useTeams'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { getInitials } from '@/lib/utils'
import { useEmployees } from '@/hooks/useEmployees'
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select'
import { Textarea as UiTextarea } from '@/components/ui/textarea'
import { Dialog as UiDialog, DialogContent as UiDialogContent, DialogHeader as UiDialogHeader, DialogTitle as UiDialogTitle, DialogFooter as UiDialogFooter, DialogDescription as UiDialogDescription } from '@/components/ui/dialog'
import { ApiError } from '@/lib/api'
import { ORG_TYPE_META, ORG_HIERARCHY, type OrgUnitType } from '@/lib/org-unit-meta'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { TeamFormDialog, AddMembersDialog } from '../TeamPage'

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

    const [prevOrgFormOpen, setPrevOrgFormOpen] = useState(false)
    const [prevEditingId, setPrevEditingId] = useState<string | undefined>(undefined)
    if ((open && !prevOrgFormOpen) || (open && editing?.id !== prevEditingId)) {
        setPrevOrgFormOpen(open)
        setPrevEditingId(editing?.id)
        setForm(editing ? {
            name: editing.name,
            type: editing.type,
            parentId: editing.parentId ?? '',
            headEmployeeId: editing.headEmployeeId ?? '',
            description: editing.description ?? '',
            isActive: editing.isActive,
        } : { ...EMPTY_FORM, type: defaultType })
    } else if (!open && prevOrgFormOpen) {
        setPrevOrgFormOpen(false)
    }

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
                        <Input value={form.name} onChange={field('name')} placeholder={PLACEHOLDERS[form.type]} />
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

// ─── Team subrow shown under an expanded department ──────────────────────────

const TEAM_ROLE_COLOR: Record<string, string> = {
    viewer:        'bg-slate-100 text-slate-700',
    member:        'bg-blue-100 text-blue-800',
    manager:       'bg-amber-100 text-amber-800',
    administrator: 'bg-violet-100 text-violet-800',
}

const TEAM_ROLE_OPTIONS: { value: TeamMemberRole; label: string }[] = [
    { value: 'viewer', label: 'Viewer' },
    { value: 'member', label: 'Member' },
    { value: 'manager', label: 'Manager' },
    { value: 'administrator', label: 'Administrator' },
]

// ─── Manage Team Dialog (rename + member roster + remove) ─────────────────────

function ManageTeamDialog({ team, open, onClose, onAddMembers }: {
    team: TeamRow
    open: boolean
    onClose: () => void
    onAddMembers: () => void
}) {
    const updateTeam = useUpdateTeam()
    const deleteTeam = useDeleteTeam()
    const removeMember = useRemoveTeamMember(team.id)
    const updateRole = useUpdateTeamMemberRole(team.id)
    const { data: members = [], isLoading } = useTeamMembers(open ? team.id : null)

    const [name, setName] = useState(team.name)
    const [description, setDescription] = useState(team.description ?? '')
    const [confirmDelete, setConfirmDelete] = useState(false)

    // Reset form when reopened with a different team
    const [prevTeamId, setPrevTeamId] = useState<string | undefined>(undefined)
    if (open && team.id !== prevTeamId) {
        setPrevTeamId(team.id)
        setName(team.name)
        setDescription(team.description ?? '')
    }

    const dirty = name !== team.name || (description ?? '') !== (team.description ?? '')

    async function handleSave() {
        if (!name.trim()) return toast.error('Name required')
        try {
            await updateTeam.mutateAsync({ id: team.id, name: name.trim(), description: description.trim() })
            toast.success('Team updated')
        } catch (err) {
            toast.error('Save failed', err instanceof ApiError ? err.message : 'Could not update team.')
        }
    }

    async function handleRemove(employeeId: string) {
        try {
            await removeMember.mutateAsync(employeeId)
            toast.success('Member removed')
        } catch (err) {
            toast.error('Remove failed', err instanceof ApiError ? err.message : 'Could not remove member.')
        }
    }

    async function handleRoleChange(employeeId: string, role: TeamMemberRole) {
        try {
            await updateRole.mutateAsync({ employeeId, role })
        } catch (err) {
            toast.error('Update failed', err instanceof ApiError ? err.message : 'Could not change role.')
        }
    }

    async function handleDeleteTeam() {
        try {
            await deleteTeam.mutateAsync(team.id)
            toast.success('Team deleted')
            setConfirmDelete(false)
            onClose()
        } catch (err) {
            toast.error('Delete failed', err instanceof ApiError ? err.message : 'Could not delete team.')
        }
    }

    return (
        <UiDialog open={open} onOpenChange={o => { if (!o) onClose() }}>
            <UiDialogContent className="sm:max-w-xl">
                <UiDialogHeader>
                    <UiDialogTitle className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        Manage Team
                    </UiDialogTitle>
                    <UiDialogDescription>Rename, edit, and assign members for this team.</UiDialogDescription>
                </UiDialogHeader>

                <div className="space-y-5 py-1">
                    {/* Team identity */}
                    <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="team-name" required>Name</Label>
                            <Input id="team-name" value={name} onChange={e => setName(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="team-desc">Description</Label>
                            <UiTextarea id="team-desc" value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="What does this team do?" />
                        </div>
                        <div className="flex justify-end">
                            <Button size="sm" disabled={!dirty || updateTeam.isPending} onClick={handleSave}>
                                {updateTeam.isPending ? 'Saving…' : 'Save changes'}
                            </Button>
                        </div>
                    </div>

                    {/* Members */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-semibold">Members</p>
                                <p className="text-[11px] text-muted-foreground">{members.length} {members.length === 1 ? 'person' : 'people'} assigned to this team</p>
                            </div>
                            <Button size="sm" onClick={onAddMembers} leftIcon={<UserPlus className="h-3.5 w-3.5" />}>
                                Add members
                            </Button>
                        </div>

                        <div className="rounded-lg border max-h-72 overflow-y-auto">
                            {isLoading ? (
                                <div className="p-3 space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-9 rounded bg-muted animate-pulse" />)}</div>
                            ) : members.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Users className="h-7 w-7 mx-auto mb-1.5 opacity-30" />
                                    <p className="text-sm font-medium">No members yet</p>
                                    <p className="text-xs mt-0.5">Click "Add members" to assign people to this team.</p>
                                </div>
                            ) : (
                                <ul className="divide-y">
                                    {members.map(m => (
                                        <li key={m.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40">
                                            <Avatar className="h-8 w-8 shrink-0">
                                                {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                                                <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                                                    {getInitials(`${m.firstName} ${m.lastName}`)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-sm font-medium leading-tight truncate">{m.firstName} {m.lastName}</p>
                                                <p className="text-[11px] text-muted-foreground leading-tight truncate">{m.designation ?? m.department ?? '—'}</p>
                                            </div>
                                            <UiSelect
                                                value={m.role}
                                                onValueChange={v => handleRoleChange(m.employeeId, v as TeamMemberRole)}
                                            >
                                                <UiSelectTrigger className="h-7 w-32 text-xs shrink-0">
                                                    <UiSelectValue />
                                                </UiSelectTrigger>
                                                <UiSelectContent>
                                                    {TEAM_ROLE_OPTIONS.map(r => (
                                                        <UiSelectItem key={r.value} value={r.value} className="text-xs">{r.label}</UiSelectItem>
                                                    ))}
                                                </UiSelectContent>
                                            </UiSelect>
                                            <Button
                                                size="icon" variant="ghost"
                                                className="h-7 w-7 text-destructive hover:text-destructive shrink-0"
                                                onClick={() => handleRemove(m.employeeId)}
                                                disabled={removeMember.isPending}
                                                title="Remove from team"
                                            >
                                                <XIcon className="h-3.5 w-3.5" />
                                            </Button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>

                <UiDialogFooter className="justify-between sm:justify-between">
                    <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete team
                    </Button>
                    <Button variant="outline" onClick={onClose}>Close</Button>
                </UiDialogFooter>

                <ConfirmDialog
                    open={confirmDelete}
                    onOpenChange={setConfirmDelete}
                    title={`Delete "${team.name}"?`}
                    description="All members will be removed from this team. This action cannot be undone."
                    confirmLabel={deleteTeam.isPending ? 'Deleting…' : 'Delete'}
                    variant="destructive"
                    onConfirm={handleDeleteTeam}
                />
            </UiDialogContent>
        </UiDialog>
    )
}

// ─── Inline Head Assignment Popover ───────────────────────────────────────────

function HeadAssignDialog({ unit, open, onClose, empList }: {
    unit: OrgUnit
    open: boolean
    onClose: () => void
    empList: Array<{ id: string; firstName: string; lastName: string }>
}) {
    const update = useUpdateOrgUnit()
    const cascade = useCascadeManager()
    const [headId, setHeadId] = useState<string>(unit.headEmployeeId ?? '')
    const [pendingCascade, setPendingCascade] = useState(false)

    const [prevId, setPrevId] = useState<string | undefined>(undefined)
    if (open && unit.id !== prevId) {
        setPrevId(unit.id)
        setHeadId(unit.headEmployeeId ?? '')
    }

    async function handleSave() {
        const newId = headId || null
        const previousHead = unit.headEmployeeId ?? null
        if (newId === previousHead) {
            onClose()
            return
        }
        try {
            await update.mutateAsync({
                id: unit.id,
                data: {
                    name: unit.name,
                    type: unit.type,
                    parentId: unit.parentId ?? null,
                    headEmployeeId: newId,
                    description: unit.description ?? undefined,
                    isActive: unit.isActive,
                },
            })
            const newHead = empList.find(e => e.id === newId)
            const label = newHead ? `${newHead.firstName} ${newHead.lastName}` : 'unassigned'
            toast.success('Head updated', `${unit.name} → ${label}.`)

            // Offer to cascade for departments when head was changed (not just cleared)
            if (unit.type === 'department' && newId && newId !== previousHead) {
                setPendingCascade(true)
            } else {
                onClose()
            }
        } catch (err) {
            toast.error('Update failed', err instanceof ApiError ? err.message : 'Could not save head.')
        }
    }

    async function handleCascade() {
        try {
            const res = await cascade.mutateAsync(unit.id)
            const count = res?.data?.updated ?? 0
            toast.success('Reporting managers updated', `${count} employee${count !== 1 ? 's' : ''} now report to the new head.`)
        } catch {
            toast.error('Cascade failed')
        } finally {
            setPendingCascade(false)
            onClose()
        }
    }

    const newHeadName = empList.find(e => e.id === headId)
    const newHeadLabel = newHeadName ? `${newHeadName.firstName} ${newHeadName.lastName}` : 'the new head'

    return (
        <UiDialog open={open} onOpenChange={o => { if (!o) onClose() }}>
            <UiDialogContent className="sm:max-w-md">
                <UiDialogHeader>
                    <UiDialogTitle className="flex items-center gap-2">
                        <Crown className="h-4 w-4 text-amber-500" />
                        {unit.headEmployeeId ? 'Change Head' : 'Assign Head'}
                    </UiDialogTitle>
                    <UiDialogDescription>{unit.name}</UiDialogDescription>
                </UiDialogHeader>
                <div className="space-y-3 py-1">
                    <div className="space-y-1.5">
                        <Label>Head / Manager</Label>
                        <UiSelect value={headId || NONE} onValueChange={v => setHeadId(v === NONE ? '' : v)}>
                            <UiSelectTrigger><UiSelectValue placeholder="Unassigned" /></UiSelectTrigger>
                            <UiSelectContent>
                                <UiSelectItem value={NONE}>— Unassigned —</UiSelectItem>
                                {empList.map(e => (
                                    <UiSelectItem key={e.id} value={e.id}>{e.firstName} {e.lastName}</UiSelectItem>
                                ))}
                            </UiSelectContent>
                        </UiSelect>
                    </div>
                </div>
                <UiDialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} disabled={update.isPending}>
                        {update.isPending ? 'Saving…' : 'Save'}
                    </Button>
                </UiDialogFooter>

                <ConfirmDialog
                    open={pendingCascade}
                    onOpenChange={(o) => { if (!o) { setPendingCascade(false); onClose() } }}
                    title="Update reporting managers?"
                    description={`All employees in ${unit.name} currently report to the previous head. Would you like to update their reporting person to ${newHeadLabel}?`}
                    confirmLabel={cascade.isPending ? 'Updating…' : 'Yes, update all'}
                    variant="warning"
                    onConfirm={handleCascade}
                />
            </UiDialogContent>
        </UiDialog>
    )
}

function TeamSubRow({ team, canManage }: { team: TeamRow; canManage: boolean }) {
    const { data: members = [] } = useTeamMembers(team.id)
    const [manageOpen, setManageOpen] = useState(false)
    const [addMembersOpen, setAddMembersOpen] = useState(false)

    const total = members.length || team.memberCount
    const previewMembers = members.slice(0, 5)
    const placeholderCount = Math.min(total, 5)
    const overflow = total > 5 ? total - 5 : 0

    return (
        <>
            <div className="relative flex items-center gap-3 rounded-lg border border-dashed border-border/80 px-3 py-2.5 mb-1.5 bg-card/60 transition-colors ms-[4.5rem] hover:bg-muted/40 hover:border-border">
                {/* Horizontal tree connector — matches the vertical line in the parent container */}
                <span
                    aria-hidden="true"
                    className="absolute -start-[2.65rem] top-1/2 h-px w-9 bg-border"
                />
                <div className="w-3.5 shrink-0" />

                {/* Team type badge — distinct amber tone, same shape as branch/division/department */}
                <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-md border text-xs font-medium text-amber-700 bg-amber-50 border-amber-200">
                    <Users className="h-3 w-3" />
                    Team
                </div>

                {/* Name + member count */}
                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{team.name}</span>
                    <span className="ml-2 text-[11px] text-muted-foreground">
                        · {total} {total === 1 ? 'member' : 'members'}
                    </span>
                </div>

                {/* Avatar stack */}
                {total > 0 && (
                    <TooltipProvider delayDuration={150}>
                        <div className="flex -space-x-2 shrink-0">
                            {members.length === 0
                                ? [...Array(placeholderCount)].map((_, i) => (
                                    <div key={i} className="h-6 w-6 rounded-full border-2 border-card bg-muted shrink-0" />
                                ))
                                : previewMembers.map(m => (
                                    <Tooltip key={m.id}>
                                        <TooltipTrigger asChild>
                                            <Avatar className="h-6 w-6 border-2 border-card shrink-0 cursor-pointer hover:z-10 hover:scale-110 transition-transform">
                                                {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                                                <AvatarFallback className="text-[8px] font-semibold bg-primary/10 text-primary">
                                                    {getInitials(`${m.firstName} ${m.lastName}`)}
                                                </AvatarFallback>
                                            </Avatar>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" sideOffset={8} className="px-3 py-2.5 max-w-[260px]">
                                            <div className="flex items-start gap-3">
                                                <Avatar className="h-9 w-9 shrink-0 border border-border">
                                                    {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                                                    <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
                                                        {getInitials(`${m.firstName} ${m.lastName}`)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="min-w-0 space-y-1">
                                                    <p className="text-sm font-semibold leading-tight truncate">
                                                        {m.firstName} {m.lastName}
                                                    </p>
                                                    {m.designation && (
                                                        <p className="text-[11px] text-muted-foreground leading-tight truncate">
                                                            {m.designation}
                                                        </p>
                                                    )}
                                                    <span className={cn(
                                                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none mt-0.5',
                                                        TEAM_ROLE_COLOR[m.role ?? 'member'] ?? TEAM_ROLE_COLOR.member,
                                                    )}>
                                                        {(m.role ?? 'member').replace(/^./, c => c.toUpperCase())}
                                                    </span>
                                                </div>
                                            </div>
                                        </TooltipContent>
                                    </Tooltip>
                                ))
                            }
                            {overflow > 0 && (
                                <div className="h-6 w-6 rounded-full border-2 border-card bg-muted flex items-center justify-center shrink-0">
                                    <span className="text-[9px] font-semibold text-muted-foreground tabular-nums">+{overflow}</span>
                                </div>
                            )}
                        </div>
                    </TooltipProvider>
                )}

                {/* Actions */}
                {canManage && (
                    <div className="flex gap-1 shrink-0">
                        <Button
                            size="sm" variant="ghost" className="h-7 w-7 p-0"
                            title="Add members"
                            onClick={() => setAddMembersOpen(true)}
                        >
                            <UserPlus className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            size="sm" variant="ghost" className="h-7 w-7 p-0"
                            title="Manage team"
                            onClick={() => setManageOpen(true)}
                        >
                            <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                )}
            </div>

            {manageOpen && (
                <ManageTeamDialog
                    team={team}
                    open={manageOpen}
                    onClose={() => setManageOpen(false)}
                    onAddMembers={() => setAddMembersOpen(true)}
                />
            )}
            {addMembersOpen && (
                <AddMembersDialog
                    teamId={team.id}
                    open={addMembersOpen}
                    onClose={() => setAddMembersOpen(false)}
                />
            )}
        </>
    )
}

// ─── Org Unit Tree Row ────────────────────────────────────────────────────────

function OrgUnitRow({ unit, units, empList, teamsByDept }: {
    unit: OrgUnit
    units: OrgUnit[]
    empList: Array<{ id: string; firstName: string; lastName: string }>
    teamsByDept: Map<string, TeamRow[]>
}) {
    const deleteMut = useDeleteOrgUnit()
    const [editing, setEditing] = useState(false)
    const [addTeamOpen, setAddTeamOpen] = useState(false)
    const [headDialogOpen, setHeadDialogOpen] = useState(false)
    const isDept = unit.type === 'department'
    // Departments stay collapsed by default — open on explicit click.
    const [expanded, setExpanded] = useState(!isDept)
    const [confirmDelete, setConfirmDelete] = useState(false)
    const meta = ORG_TYPE_META[unit.type]
    const Icon = meta.icon
    const children = units.filter(u => u.parentId === unit.id)
    const deptTeams = isDept ? teamsByDept.get(unit.id) ?? [] : []
    const hasContent = children.length > 0 || deptTeams.length > 0

    return (
        <div>
            <div
                className={cn(
                    'flex items-center gap-3 rounded-lg border px-3 py-2.5 mb-1.5 bg-card transition-colors',
                    meta.treeIndent,
                    hasContent ? 'cursor-pointer hover:bg-muted/40' : 'hover:bg-muted/20',
                )}
                onClick={hasContent ? () => setExpanded(e => !e) : undefined}
                role={hasContent ? 'button' : undefined}
                aria-expanded={hasContent ? expanded : undefined}
            >
                {hasContent ? (
                    <span className="shrink-0 text-muted-foreground">
                        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRightIcon className="h-3.5 w-3.5" />}
                    </span>
                ) : <div className="w-3.5 shrink-0" />}

                <div className={cn('flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-md border text-xs font-medium', meta.badge)}>
                    <Icon className="h-3 w-3" />
                    {meta.label}
                </div>

                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{unit.name}</span>
                    {unit.code && <span className="ml-2 text-[11px] text-muted-foreground font-mono">{unit.code}</span>}
                    {unit.headEmployeeName ? (
                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setHeadDialogOpen(true) }}
                            className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground hover:underline transition-colors"
                            title="Change head"
                        >
                            <Crown className="h-3 w-3 text-amber-500" />
                            {unit.headEmployeeName}
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setHeadDialogOpen(true) }}
                            className="ml-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground/70 hover:text-primary hover:underline transition-colors italic"
                            title="Assign head"
                        >
                            <UserCog className="h-3 w-3" />
                            Assign head
                        </button>
                    )}
                </div>

                {/* Team count chip — department only */}
                {isDept && deptTeams.length > 0 && (
                    <span className="inline-flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium bg-primary/10 text-primary border border-primary/20">
                        <Users className="h-3 w-3" />
                        {deptTeams.length} {deptTeams.length === 1 ? 'team' : 'teams'}
                    </span>
                )}

                {!unit.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}

                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    {isDept && (
                        <Button
                            size="sm" variant="ghost"
                            className="h-7 px-2 gap-1 text-primary hover:text-primary"
                            onClick={() => setAddTeamOpen(true)}
                            title="Add team"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            <span className="text-[11px] font-medium">Team</span>
                        </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(true)} title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        size="sm" variant="ghost"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        disabled={deleteMut.isPending}
                        onClick={() => setConfirmDelete(true)}
                        title="Delete"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
            </div>

            {expanded && hasContent && (
                <div className="relative">
                    <div className="absolute left-[11px] top-0 bottom-1 w-px bg-border" />
                    {children
                        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
                        .map(child => (
                            <OrgUnitRow key={child.id} unit={child} units={units} empList={empList} teamsByDept={teamsByDept} />
                        ))}
                    {/* Team rows nested under department — same tree visual as org units */}
                    {isDept && deptTeams.length > 0 && deptTeams.map(team => (
                        <TeamSubRow key={team.id} team={team} canManage />
                    ))}
                </div>
            )}

            {editing && (
                <OrgUnitDialog
                    open={editing} onClose={() => setEditing(false)}
                    editing={unit} defaultType={unit.type} units={units} employees={empList}
                />
            )}

            {addTeamOpen && isDept && (
                <TeamFormDialog
                    open={addTeamOpen}
                    onClose={() => setAddTeamOpen(false)}
                    lockedDepartmentId={unit.id}
                    lockedDepartmentName={unit.name}
                />
            )}

            {headDialogOpen && (
                <HeadAssignDialog
                    unit={unit}
                    open={headDialogOpen}
                    onClose={() => setHeadDialogOpen(false)}
                    empList={empList}
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
    const { data: teams = [] } = useTeams()
    const [adding, setAdding] = useState<OrgUnitType | null>(null)
    const [addTeamOpen, setAddTeamOpen] = useState(false)

    const empList = useMemo(
        () => Array.isArray(employees) ? employees : (employees as { data?: Array<{ id: string; firstName: string; lastName: string }> } | undefined)?.data ?? [],
        [employees],
    )

    // Group teams by department once → O(1) lookup per row
    const teamsByDept = useMemo(() => {
        const map = new Map<string, TeamRow[]>()
        for (const t of teams) {
            if (!t.departmentId) continue
            const arr = map.get(t.departmentId) ?? []
            arr.push(t)
            map.set(t.departmentId, arr)
        }
        for (const arr of map.values()) arr.sort((a, b) => a.name.localeCompare(b.name))
        return map
    }, [teams])

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

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCardCompact label="Branches" value={counts.branch} icon={ORG_TYPE_META.branch.icon} color="green" loading={isLoading} />
                <KpiCardCompact label="Divisions" value={counts.division} icon={ORG_TYPE_META.division.icon} color="purple" loading={isLoading} />
                <KpiCardCompact label="Departments" value={counts.department} icon={ORG_TYPE_META.department.icon} color="blue" loading={isLoading} />
                <KpiCardCompact label="Teams" value={teams.length} icon={Users} color="amber" loading={isLoading} />
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
                <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddTeamOpen(true)}
                    leftIcon={<Users className="h-3.5 w-3.5" />}
                    disabled={counts.department === 0}
                    title={counts.department === 0 ? 'Create a department first' : undefined}
                >
                    Add Team
                </Button>
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
                            <OrgUnitRow key={unit.id} unit={unit} units={units} empList={empList} teamsByDept={teamsByDept} />
                        ))}
                </div>
            )}

            {adding && (
                <OrgUnitDialog
                    open={!!adding} onClose={() => setAdding(null)}
                    editing={null} defaultType={adding} units={units} employees={empList}
                />
            )}

            {addTeamOpen && (
                <TeamFormDialog
                    open={addTeamOpen}
                    onClose={() => setAddTeamOpen(false)}
                />
            )}

        </div>
    )
}
