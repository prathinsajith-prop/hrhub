import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
import { z } from 'zod'
import { Users, Plus, MoreHorizontal, UserPlus, Trash2, Pencil, Search, X, Building2, UserMinus, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import {
    useTeams, useMyTeams, useTeamMembers, useEligibleEmployees,
    useCreateTeam, useUpdateTeam, useDeleteTeam, useAddTeamMembers, useRemoveTeamMember, useUpdateTeamMemberRole,
    type TeamRow, type MyTeamRow, type TeamMemberRole,
} from '@/hooks/useTeams'
import { useOrgUnits, type OrgUnit } from '@/hooks/useOrgUnits'
import { buildOrgUnitMap, resolveOrgPathFromDeptId } from '@/lib/orgUtils'
import { OrgHierarchyPath } from '@/components/shared/OrgHierarchyPath'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { FormField } from '@/components/shared/FormField'
import { zodToFieldErrors } from '@/lib/schemas'
import { getInitials, cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { OrgStructureTab } from './org-settings/OrgStructureTab'

// ── Team role helpers ─────────────────────────────────────────────────────────

const TEAM_ROLES: { value: TeamMemberRole; label: string; color: string }[] = [
    { value: 'viewer',        label: 'Viewer',        color: 'bg-slate-100 text-slate-600' },
    { value: 'member',        label: 'Member',        color: 'bg-blue-100 text-blue-700' },
    { value: 'manager',       label: 'Manager',       color: 'bg-amber-100 text-amber-700' },
    { value: 'administrator', label: 'Administrator', color: 'bg-violet-100 text-violet-700' },
]

function roleMeta(role: TeamMemberRole) {
    return TEAM_ROLES.find(r => r.value === role) ?? TEAM_ROLES[1]
}

function RoleBadge({ role }: { role: TeamMemberRole }) {
    const m = roleMeta(role)
    return (
        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none', m.color)}>
            {m.label}
        </span>
    )
}


// ── Create / Edit Team Dialog ─────────────────────────────────────────────────

const teamFormSchema = z.object({
    name: z.string().min(1, 'Team name is required'),
    description: z.string().optional(),
    departmentId: z.string().optional(),
})

interface TeamFormDialogProps {
    open: boolean
    onClose: () => void
    editTeam?: TeamRow | null
    lockedDepartmentId?: string
    lockedDepartmentName?: string
}

const DEPT_NONE = '__none__'

export function TeamFormDialog({ open, onClose, editTeam, lockedDepartmentId, lockedDepartmentName }: TeamFormDialogProps) {
    const { data: orgUnits = [] } = useOrgUnits()
    const departments = orgUnits.filter(u => u.type === 'department' && u.isActive)
    const createMut = useCreateTeam()
    const updateMut = useUpdateTeam()

    const [name, setName] = useState('')
    const [description, setDescription] = useState('')
    const [departmentId, setDepartmentId] = useState('')
    const [errors, setErrors] = useState<Record<string, string>>({})

    const isEdit = !!editTeam
    const isPending = createMut.isPending || updateMut.isPending

    // Sync form state whenever the dialog opens (handles both create and edit transitions)
    const [prevTeamFormOpen, setPrevTeamFormOpen] = useState(false)
    const [prevEditTeamId, setPrevEditTeamId] = useState<string | undefined>(undefined)
    if ((open && !prevTeamFormOpen) || (open && editTeam?.id !== prevEditTeamId)) {
        setPrevTeamFormOpen(true)
        setPrevEditTeamId(editTeam?.id)
        setName(editTeam?.name ?? '')
        setDescription(editTeam?.description ?? '')
        setDepartmentId(editTeam?.departmentId ?? lockedDepartmentId ?? '')
        setErrors({})
    } else if (!open && prevTeamFormOpen) {
        setPrevTeamFormOpen(false)
    }

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        const result = zodToFieldErrors(teamFormSchema, { name, description, departmentId })
        if (!result.ok) { setErrors(result.errors); return }
        setErrors({})
        try {
            if (isEdit) {
                await updateMut.mutateAsync({ id: editTeam.id, name, description })
            } else {
                await createMut.mutateAsync({ name, description, departmentId: departmentId || undefined })
            }
            toast.success(isEdit ? 'Team updated' : 'Team created')
            onClose()
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Failed to save team')
        }
    }

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit Team' : 'Create Team'}</DialogTitle>
                </DialogHeader>
                <form id="team-form" onSubmit={submit} className="space-y-4">
                    <FormField label="Team Name" required error={errors.name}>
                        <Input
                            id="team-name"
                            value={name}
                            onChange={e => { setName(e.target.value); setErrors(err => ({ ...err, name: '' })) }}
                            placeholder="e.g. Frontend Squad"
                            aria-invalid={!!errors.name}
                        />
                    </FormField>
                    <div className="space-y-1.5">
                        <Label htmlFor="team-desc">Description</Label>
                        <Textarea
                            id="team-desc"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="What does this team do?"
                            rows={2}
                        />
                    </div>
                    {!isEdit && (
                        <div className="space-y-1.5">
                            <Label>Department</Label>
                            {lockedDepartmentId ? (
                                <p className="text-sm text-muted-foreground py-1.5">{lockedDepartmentName}</p>
                            ) : (
                                <Select
                                    value={departmentId || DEPT_NONE}
                                    onValueChange={v => setDepartmentId(v === DEPT_NONE ? '' : v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="No department filter" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={DEPT_NONE}>— No department filter —</SelectItem>
                                        {departments.map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            <p className="text-xs text-muted-foreground">Optionally restrict this team to employees in a specific department.</p>
                        </div>
                    )}
                </form>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                    <Button type="submit" form="team-form" loading={isPending}>
                        {isEdit ? 'Save Changes' : 'Create Team'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ── Add Members Dialog ────────────────────────────────────────────────────────

export function AddMembersDialog({ teamId, open, onClose }: { teamId: string; open: boolean; onClose: () => void }) {
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<Set<string>>(new Set())
    const [role, setRole] = useState<TeamMemberRole>('member')
    const { data: eligible = [], isLoading } = useEligibleEmployees(open ? teamId : null)
    const addMut = useAddTeamMembers(teamId)

    const filtered = useMemo(() =>
        eligible.filter(e => {
            const q = search.toLowerCase()
            return `${e.firstName} ${e.lastName}`.toLowerCase().includes(q) ||
                (e.designation ?? '').toLowerCase().includes(q)
        }), [eligible, search])

    const toggle = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev)
            if (next.has(id)) { next.delete(id) } else { next.add(id) }
            return next
        })
    }

    const toggleAll = () => {
        if (selected.size === filtered.length) {
            setSelected(new Set())
        } else {
            setSelected(new Set(filtered.map(e => e.id)))
        }
    }

    const handleClose = () => {
        setSearch('')
        setSelected(new Set())
        setRole('member')
        onClose()
    }

    const submit = async () => {
        if (selected.size === 0) return
        try {
            await addMut.mutateAsync({ employeeIds: [...selected], role })
            toast.success(`${selected.size} member${selected.size === 1 ? '' : 's'} added as ${roleMeta(role).label}`)
            handleClose()
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : 'Failed to add members')
        }
    }

    return (
        <Dialog open={open} onOpenChange={v => !v && handleClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>Add Members</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    {/* Role selector */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                        <div className="flex-1">
                            <p className="text-xs font-medium text-foreground">Assign role</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">All selected members will receive this role</p>
                        </div>
                        <Select value={role} onValueChange={v => setRole(v as TeamMemberRole)}>
                            <SelectTrigger className="w-36 h-8 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {TEAM_ROLES.map(r => (
                                    <SelectItem key={r.value} value={r.value} className="text-xs">
                                        <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium', r.color)}>
                                            {r.label}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            className="pl-8 h-8 text-sm"
                            placeholder="Search employees…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                            </button>
                        )}
                    </div>

                    {filtered.length > 1 && (
                        <div className="flex items-center gap-2 px-1">
                            <Checkbox
                                id="select-all"
                                checked={selected.size === filtered.length}
                                onCheckedChange={toggleAll}
                            />
                            <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer select-none">
                                Select all ({filtered.length})
                            </label>
                        </div>
                    )}

                    <ScrollArea className="h-56 rounded-md border">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Loading…</div>
                        ) : filtered.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                                {search ? 'No employees match your search' : 'No eligible employees'}
                            </div>
                        ) : (
                            <div className="divide-y">
                                {filtered.map(emp => (
                                    <label
                                        key={emp.id}
                                        htmlFor={`emp-${emp.id}`}
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer"
                                    >
                                        <Checkbox
                                            id={`emp-${emp.id}`}
                                            checked={selected.has(emp.id)}
                                            onCheckedChange={() => toggle(emp.id)}
                                        />
                                        <Avatar className="h-7 w-7 shrink-0">
                                            {emp.avatarUrl && <AvatarImage src={emp.avatarUrl} />}
                                            <AvatarFallback className="text-[10px]">{getInitials(`${emp.firstName} ${emp.lastName}`)}</AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium leading-tight">{emp.firstName} {emp.lastName}</p>
                                            {emp.designation && <p className="text-xs text-muted-foreground truncate">{emp.designation}</p>}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>Cancel</Button>
                    <Button onClick={submit} loading={addMut.isPending} disabled={selected.size === 0}>
                        Add {selected.size > 0 ? `(${selected.size})` : ''}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ── Team Card (collapsible member list, modern design) ────────────────────────

interface TeamCardProps {
    team: TeamRow | MyTeamRow
    canManage: boolean
    orgMap: Map<string, OrgUnit>
    onEdit?: () => void
    onDelete?: () => void
}

const TeamCard = memo(function TeamCard({ team, canManage, orgMap, onEdit, onDelete }: TeamCardProps) {
    const [expanded, setExpanded] = useState(false)
    const [addOpen, setAddOpen] = useState(false)
    const [removeTarget, setRemoveTarget] = useState<string | null>(null)
    const [search, setSearch] = useState('')

    const { data: members = [], isLoading } = useTeamMembers(team.id)
    const removeMut = useRemoveTeamMember(team.id)
    const updateRoleMut = useUpdateTeamMemberRole(team.id)
    const orgParts = resolveOrgPathFromDeptId(orgMap, team.departmentId)

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        if (!q) return members
        return members.filter(m =>
            `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
            (m.designation ?? '').toLowerCase().includes(q) ||
            (m.department ?? '').toLowerCase().includes(q)
        )
    }, [members, search])

    const handleRemove = async () => {
        if (!removeTarget) return
        try {
            await removeMut.mutateAsync(removeTarget)
            toast.success('Member removed')
            setRemoveTarget(null)
        } catch {
            toast.error('Failed to remove member')
        }
    }

    const toggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!expanded) setSearch('')
        setExpanded(v => !v)
    }

    const initials = team.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    const previewCount = Math.min(team.memberCount, 4)
    const previewMembers = members.slice(0, 4)
    const membersLoaded = !isLoading && members.length > 0
    const overflow = team.memberCount > 4 ? team.memberCount - 4 : 0

    return (
        <>
            <Card className="group relative overflow-hidden border border-border/60 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col">

                {/* ── Card body ── */}
                <div className="p-4 flex-1 space-y-3">

                    {/* Row 1: avatar + name + department + menu */}
                    <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-primary/10 text-primary text-sm font-semibold shrink-0 select-none">
                            {initials}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                            <h3 className="text-sm font-semibold leading-snug truncate text-foreground">
                                {team.name}
                            </h3>
                            {(team.departmentId || team.department) && (
                                <div className="flex items-center gap-1 mt-0.5">
                                    <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                    <OrgHierarchyPath parts={orgParts.some(Boolean) ? orgParts : [null, null, team.department]} />
                                </div>
                            )}
                        </div>
                        {canManage && onEdit && onDelete && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 -mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={onEdit}>
                                        <Pencil className="h-3.5 w-3.5 mr-2" /> Edit team
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete team
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )}
                    </div>

                    {/* Row 2: description */}
                    {team.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                            {team.description}
                        </p>
                    )}

                    {/* Row 3: member avatar stack — always visible */}
                    <div className="flex items-center justify-between pt-3 border-t border-border/50">
                        <div className="flex items-center gap-2">
                            {team.memberCount === 0 ? (
                                <span className="text-xs text-muted-foreground">No members</span>
                            ) : (
                                <>
                                    <TooltipProvider delayDuration={200}>
                                        <div className="flex -space-x-2">
                                            {membersLoaded
                                                ? previewMembers.map(m => (
                                                    <Tooltip key={m.id}>
                                                        <TooltipTrigger asChild>
                                                            <Avatar className="h-7 w-7 border-2 border-background shrink-0 cursor-default">
                                                                {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                                                                <AvatarFallback className="text-[9px] font-semibold bg-primary/10 text-primary">
                                                                    {getInitials(`${m.firstName} ${m.lastName}`)}
                                                                </AvatarFallback>
                                                            </Avatar>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="top" className="text-xs">
                                                            <p className="font-medium">{m.firstName} {m.lastName}</p>
                                                            {m.designation && <p className="text-muted-foreground text-[11px]">{m.designation}</p>}
                                                        </TooltipContent>
                                                    </Tooltip>
                                                ))
                                                : [...Array(previewCount)].map((_, i) => (
                                                    <div key={i} className="h-7 w-7 rounded-full border-2 border-background bg-muted shrink-0" />
                                                ))
                                            }
                                            {overflow > 0 && (
                                                <div className="h-7 w-7 rounded-full border-2 border-background bg-muted flex items-center justify-center shrink-0">
                                                    <span className="text-[9px] font-semibold text-muted-foreground">+{overflow}</span>
                                                </div>
                                            )}
                                        </div>
                                    </TooltipProvider>
                                    <span className="text-[11px] text-muted-foreground">
                                        {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Expand / collapse toggle ── */}
                <button
                    onClick={toggleExpand}
                    className={cn(
                        'w-full flex items-center justify-center gap-1.5 py-2 border-t text-xs font-medium transition-colors',
                        expanded
                            ? 'bg-muted/50 text-foreground hover:bg-muted'
                            : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                    )}
                >
                    {expanded ? 'Hide members' : 'Members'}
                    <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', expanded && 'rotate-180')} />
                </button>

                {/* ── Collapsible members panel ── */}
                {expanded && (
                    <div className="border-t bg-muted/20">
                        {/* Search + Add button */}
                        <div className="flex items-center gap-2 p-3 pb-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                    className="pl-8 h-8 text-xs bg-background"
                                    placeholder="Search members…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                />
                                {search && (
                                    <button
                                        onClick={e => { e.stopPropagation(); setSearch('') }}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                            {canManage && (
                                <Button
                                    size="sm"
                                    className="h-8 shrink-0 text-xs"
                                    leftIcon={<UserPlus className="h-3.5 w-3.5" />}
                                    onClick={e => { e.stopPropagation(); setAddOpen(true) }}
                                >
                                    Add
                                </Button>
                            )}
                        </div>

                        {/* Member list */}
                        {isLoading ? (
                            <div className="px-3 pb-3 space-y-0.5">
                                {[...Array(3)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-3 py-2.5 px-2 animate-pulse">
                                        <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-2.5 bg-muted rounded w-32" />
                                            <div className="h-2 bg-muted rounded w-20" />
                                        </div>
                                        <div className="h-5 w-16 bg-muted rounded-full shrink-0" />
                                    </div>
                                ))}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-8 gap-2 text-center px-4 pb-4">
                                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                                    <Users className="h-5 w-5 text-muted-foreground/40" />
                                </div>
                                <p className="text-xs text-muted-foreground font-medium">
                                    {search ? 'No members match' : 'No members yet'}
                                </p>
                                {canManage && !search && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs mt-1"
                                        leftIcon={<UserPlus className="h-3 w-3" />}
                                        onClick={e => { e.stopPropagation(); setAddOpen(true) }}
                                    >
                                        Add Members
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <ScrollArea className={filtered.length > 5 ? 'h-[220px]' : undefined}>
                                <TooltipProvider delayDuration={300}>
                                    <div className="px-3 pb-3 space-y-0.5">
                                        {filtered.map(m => (
                                            <div
                                                key={m.id}
                                                className="flex items-center gap-2.5 py-2 px-2 rounded-lg hover:bg-background transition-colors group/row cursor-default"
                                            >
                                                <Avatar className="h-8 w-8 shrink-0">
                                                    {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                                                    <AvatarFallback className="text-[10px] font-semibold bg-muted">
                                                        {getInitials(`${m.firstName} ${m.lastName}`)}
                                                    </AvatarFallback>
                                                </Avatar>

                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs font-medium leading-tight truncate text-foreground">
                                                        {m.firstName} {m.lastName}
                                                    </p>
                                                    {(m.designation || m.department) && (
                                                        <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                                            {[m.designation, m.department].filter(Boolean).join(' · ')}
                                                        </p>
                                                    )}
                                                </div>

                                                {/* Role badge — clickable dropdown for managers */}
                                                {canManage ? (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                                            <button className="flex items-center gap-0.5 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0">
                                                                <RoleBadge role={m.role ?? 'member'} />
                                                                <ChevronDown className="h-2.5 w-2.5 text-muted-foreground opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                                            </button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-44" onClick={e => e.stopPropagation()}>
                                                            <p className="px-2 pt-1.5 pb-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                                                                Change role
                                                            </p>
                                                            {TEAM_ROLES.map(r => (
                                                                <DropdownMenuItem
                                                                    key={r.value}
                                                                    className="gap-2 text-xs"
                                                                    disabled={updateRoleMut.isPending}
                                                                    onClick={() => updateRoleMut.mutate(
                                                                        { employeeId: m.employeeId, role: r.value },
                                                                        {
                                                                            onSuccess: () => toast.success(`Role changed to ${r.label}`),
                                                                            onError: () => toast.error('Failed to update role'),
                                                                        }
                                                                    )}
                                                                >
                                                                    <span className={cn('inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium', r.color)}>
                                                                        {r.label}
                                                                    </span>
                                                                    {(m.role ?? 'member') === r.value && (
                                                                        <span className="ml-auto text-[10px] text-primary font-medium">✓</span>
                                                                    )}
                                                                </DropdownMenuItem>
                                                            ))}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem
                                                                className="text-destructive focus:text-destructive text-xs gap-2"
                                                                onClick={e => { e.stopPropagation(); setRemoveTarget(m.employeeId) }}
                                                            >
                                                                <UserMinus className="h-3 w-3" /> Remove from team
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                ) : (
                                                    <RoleBadge role={m.role ?? 'member'} />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </TooltipProvider>
                            </ScrollArea>
                        )}
                    </div>
                )}
            </Card>

            {canManage && (
                <AddMembersDialog teamId={team.id} open={addOpen} onClose={() => setAddOpen(false)} />
            )}

            <ConfirmDialog
                open={!!removeTarget}
                onOpenChange={o => !o && setRemoveTarget(null)}
                title="Remove Member"
                description="Are you sure you want to remove this member from the team?"
                confirmLabel="Remove"
                variant="warning"
                onConfirm={handleRemove}
            />
        </>
    )
})

// ── Main Page ─────────────────────────────────────────────────────────────────

// ── Teams Panel ───────────────────────────────────────────────────────────────

interface TeamsPanelProps {
    canManage: boolean
    canViewAll: boolean
    userId: string | undefined
}

const TEAMS_PAGE_SIZE = 9

interface TeamGridProps {
    teams: (TeamRow | MyTeamRow)[]
    showControls: boolean
    canManage: boolean
    canViewAll: boolean
    userId: string | undefined
    orgMap: Map<string, OrgUnit>
    onEditTeam: (team: TeamRow) => void
    onDeleteTeam: (team: TeamRow) => void
}

function TeamGridSkeletonRow() {
    return (
        <div className="rounded-xl border border-border/60 bg-card p-4 animate-pulse">
            <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted shrink-0" />
                <div className="flex-1 space-y-2 pt-0.5">
                    <div className="h-3.5 bg-muted rounded w-2/3" />
                    <div className="h-2.5 bg-muted rounded w-1/2" />
                </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2">
                <div className="flex -space-x-2">
                    {[0, 1, 2].map(i => <div key={i} className="h-7 w-7 rounded-full border-2 border-background bg-muted" />)}
                </div>
                <div className="h-2.5 bg-muted rounded w-16" />
            </div>
        </div>
    )
}

// Top-level (stable identity) so React keeps card state across parent re-renders.
function TeamGrid({ teams, showControls, canManage, canViewAll, userId, orgMap, onEditTeam, onDeleteTeam }: TeamGridProps) {
    const [visibleCount, setVisibleCount] = useState(TEAMS_PAGE_SIZE)
    const sentinelRef = useRef<HTMLDivElement>(null)

    useEffect(() => { setVisibleCount(TEAMS_PAGE_SIZE) }, [teams.length])

    useEffect(() => {
        const el = sentinelRef.current
        if (!el || visibleCount >= teams.length) return
        const obs = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setVisibleCount(c => Math.min(c + TEAMS_PAGE_SIZE, teams.length))
                }
            },
            { rootMargin: '300px' },
        )
        obs.observe(el)
        return () => obs.disconnect()
    }, [teams.length, visibleCount])

    const visibleTeams = teams.slice(0, visibleCount)
    const hasMore = visibleCount < teams.length

    return (
        <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visibleTeams.map(team => {
                    const isOwner = showControls && (team as TeamRow).createdById === userId
                    const editable = canManage && (canViewAll || isOwner)
                    return (
                        <TeamCard
                            key={team.id}
                            team={team}
                            canManage={editable}
                            orgMap={orgMap}
                            onEdit={editable ? () => onEditTeam(team as TeamRow) : undefined}
                            onDelete={editable ? () => onDeleteTeam(team as TeamRow) : undefined}
                        />
                    )
                })}
            </div>
            {hasMore && (
                <div ref={sentinelRef} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-4">
                    {[...Array(Math.min(TEAMS_PAGE_SIZE, teams.length - visibleCount))].map((_, i) => (
                        <TeamGridSkeletonRow key={i} />
                    ))}
                </div>
            )}
            {!hasMore && teams.length > TEAMS_PAGE_SIZE && (
                <p className="text-center text-xs text-muted-foreground py-4">
                    Showing all {teams.length} teams
                </p>
            )}
        </>
    )
}

function TeamsPanel({ canManage, canViewAll, userId }: TeamsPanelProps) {
    const { data: allTeams = [], isLoading: teamsLoading } = useTeams()
    const { data: myTeams = [], isLoading: myTeamsLoading } = useMyTeams()
    const { data: orgUnitsRaw = [] } = useOrgUnits()
    const orgMap = useMemo(() => buildOrgUnitMap(orgUnitsRaw), [orgUnitsRaw])

    const [formOpen, setFormOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<TeamRow | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<TeamRow | null>(null)
    const deleteMut = useDeleteTeam()

    const handleDelete = useCallback(async () => {
        if (!deleteTarget) return
        try {
            await deleteMut.mutateAsync(deleteTarget.id)
            toast.success('Team deleted')
            setDeleteTarget(null)
        } catch {
            toast.error('Failed to delete team')
        }
    }, [deleteTarget, deleteMut])

    const openEdit = useCallback((team: TeamRow) => { setEditTarget(team); setFormOpen(true) }, [])
    const closeForm = useCallback(() => { setFormOpen(false); setEditTarget(null) }, [])
    const onDeleteTargetCb = useCallback((team: TeamRow) => setDeleteTarget(team), [])

    const teamGrid = (teams: (TeamRow | MyTeamRow)[], showControls: boolean) => (
        <TeamGrid
            teams={teams}
            showControls={showControls}
            canManage={canManage}
            canViewAll={canViewAll}
            userId={userId}
            orgMap={orgMap}
            onEditTeam={openEdit}
            onDeleteTeam={onDeleteTargetCb}
        />
    )

    return (
        <>
            {canManage && (
                <div className="flex justify-end mb-4">
                    <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => { setEditTarget(null); setFormOpen(true) }}>
                        Create Team
                    </Button>
                </div>
            )}

            {canViewAll ? (
                <Tabs defaultValue="all">
                    <TabsList className="mb-4">
                        <TabsTrigger value="all">All Teams</TabsTrigger>
                        <TabsTrigger value="mine">My Teams</TabsTrigger>
                    </TabsList>
                    <TabsContent value="all">
                        {teamsLoading ? (
                            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
                        ) : allTeams.length === 0 ? (
                            <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
                                <Users className="h-8 w-8 text-muted-foreground/40" />
                                <p className="text-sm text-muted-foreground">No teams yet. Create one to get started.</p>
                                {canManage && <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>Create Team</Button>}
                            </CardContent></Card>
                        ) : teamGrid(allTeams, true)}
                    </TabsContent>
                    <TabsContent value="mine">
                        {myTeamsLoading ? (
                            <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
                        ) : myTeams.length === 0 ? (
                            <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
                                <Users className="h-8 w-8 text-muted-foreground/40" />
                                <p className="text-sm text-muted-foreground">You haven't been assigned to any teams yet.</p>
                            </CardContent></Card>
                        ) : teamGrid(myTeams, false)}
                    </TabsContent>
                </Tabs>
            ) : (
                <div className="space-y-4">
                    <h2 className="text-sm font-medium text-muted-foreground">Teams you belong to</h2>
                    {myTeamsLoading ? (
                        <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
                    ) : myTeams.length === 0 ? (
                        <Card><CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
                            <Users className="h-8 w-8 text-muted-foreground/40" />
                            <p className="text-sm text-muted-foreground">
                                {canManage ? 'Create a team to get started.' : "You haven't been assigned to any teams yet."}
                            </p>
                            {canManage && <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>Create Team</Button>}
                        </CardContent></Card>
                    ) : teamGrid(myTeams, true)}
                </div>
            )}

            <TeamFormDialog open={formOpen} onClose={closeForm} editTeam={editTarget} />
            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={o => !o && setDeleteTarget(null)}
                title="Delete Team"
                description={`Delete "${deleteTarget?.name}"? All members will be removed. This cannot be undone.`}
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={handleDelete}
            />
        </>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function TeamPage() {
    const { can, hasRole } = usePermissions()
    const userId = useAuthStore(s => s.user?.id)
    const canManage = can('manage_team')
    const canManageOrg = can('manage_org') || can('manage_settings')
    // hr_manager and above can view all teams; dept_head and below see only their own
    const canViewAll = hasRole('super_admin', 'hr_manager')

    return (
        <PageWrapper>
            <PageHeader
                title="Organization"
                description="Teams, departments, and org structure"
            />

            {/* Teams tab hidden for now — manage teams via the Org Structure tree. */}
            {canManageOrg ? (
                <OrgStructureTab />
            ) : (
                <TeamsPanel canManage={canManage} canViewAll={canViewAll} userId={userId} />
            )}
        </PageWrapper>
    )
}
