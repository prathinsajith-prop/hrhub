import { useState, useMemo, useEffect } from 'react'
import { z } from 'zod'
import { Users, Plus, MoreHorizontal, UserPlus, Trash2, Pencil, Search, X, Building2, Calendar, UserMinus } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import {
    useTeams, useMyTeams, useTeamMembers, useEligibleEmployees,
    useCreateTeam, useUpdateTeam, useDeleteTeam, useAddTeamMembers, useRemoveTeamMember,
    type TeamRow, type MyTeamRow,
} from '@/hooks/useTeams'
import { useOrgUnits, type OrgUnit } from '@/hooks/useOrgUnits'
import { buildOrgUnitMap, resolveOrgPathFromDeptId } from '@/lib/orgUtils'
import { OrgHierarchyPath } from '@/components/shared/OrgHierarchyPath'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { FormField } from '@/components/shared/FormField'
import { zodToFieldErrors } from '@/lib/schemas'
import { getInitials } from '@/lib/utils'
import { ApiError } from '@/lib/api'

/** Deterministic pastel background colour from a string — for team avatar. */
function teamColor(name: string) {
    const palette = [
        'bg-blue-100 text-blue-700',
        'bg-violet-100 text-violet-700',
        'bg-emerald-100 text-emerald-700',
        'bg-amber-100 text-amber-700',
        'bg-rose-100 text-rose-700',
        'bg-cyan-100 text-cyan-700',
        'bg-indigo-100 text-indigo-700',
        'bg-pink-100 text-pink-700',
    ]
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return palette[Math.abs(hash) % palette.length]
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

function TeamFormDialog({ open, onClose, editTeam, lockedDepartmentId, lockedDepartmentName }: TeamFormDialogProps) {
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
    useEffect(() => {
        if (open) {
            setName(editTeam?.name ?? '')
            setDescription(editTeam?.description ?? '')
            setDepartmentId(editTeam?.departmentId ?? lockedDepartmentId ?? '')
            setErrors({})
        }
    }, [open, editTeam, lockedDepartmentId])

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
                            autoFocus
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

function AddMembersDialog({ teamId, open, onClose }: { teamId: string; open: boolean; onClose: () => void }) {
    const [search, setSearch] = useState('')
    const [selected, setSelected] = useState<Set<string>>(new Set())
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
        onClose()
    }

    const submit = async () => {
        if (selected.size === 0) return
        try {
            await addMut.mutateAsync([...selected])
            toast.success(`${selected.size} member${selected.size === 1 ? '' : 's'} added`)
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
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            className="pl-8 h-8 text-sm"
                            placeholder="Search employees..."
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

                    <ScrollArea className="h-64 rounded-md border">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Loading...</div>
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

// ── Team Detail Dialog ────────────────────────────────────────────────────────

interface TeamDetailDialogProps {
    team: TeamRow | MyTeamRow | null
    open: boolean
    onClose: () => void
    canManage: boolean
    orgMap: Map<string, OrgUnit>
}

function TeamDetailDialog({ team, open, onClose, canManage, orgMap }: TeamDetailDialogProps) {
    const { data: members = [], isLoading } = useTeamMembers(open && team ? team.id : null)
    const removeMut = useRemoveTeamMember(team?.id ?? '')
    const [addOpen, setAddOpen] = useState(false)
    const [removeTarget, setRemoveTarget] = useState<string | null>(null)
    const [search, setSearch] = useState('')

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

    const handleClose = () => {
        setSearch('')
        onClose()
    }

    if (!team) return null

    const colorClass = teamColor(team.name)
    const initials = team.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

    return (
        <>
            <Dialog open={open} onOpenChange={v => !v && handleClose()}>
                <DialogContent className="sm:max-w-xl p-0 overflow-hidden gap-0">

                    {/* ── Header banner ── */}
                    <div className="px-6 pt-6 pb-5 border-b bg-muted/30">
                        <div className="flex items-start gap-4">
                            <div className={`flex items-center justify-center h-12 w-12 rounded-xl text-lg font-bold shrink-0 ${colorClass}`}>
                                {initials}
                            </div>
                            <div className="flex-1 min-w-0 pt-0.5">
                                <DialogTitle className="text-base font-semibold leading-snug truncate pr-6">
                                    {team.name}
                                </DialogTitle>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {(team.departmentId || team.department) && (() => {
                                        const parts = resolveOrgPathFromDeptId(orgMap, team.departmentId)
                                        return (
                                            <div className="flex items-center gap-1">
                                                <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                                                <OrgHierarchyPath parts={parts.some(Boolean) ? parts : [null, null, team.department]} />
                                            </div>
                                        )
                                    })()}
                                    {(team.departmentId || team.department) && <span className="text-muted-foreground/40 text-xs">·</span>}
                                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                        <Users className="h-3 w-3" />
                                        {members.length} {members.length === 1 ? 'member' : 'members'}
                                    </div>
                                </div>
                                {team.description && (
                                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed line-clamp-2">
                                        {team.description}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── Members section ── */}
                    <div className="px-6 pt-4 pb-2">
                        <div className="flex items-center justify-between gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                    className="pl-8 h-8 text-sm"
                                    placeholder="Search members…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                                {search && (
                                    <button
                                        onClick={() => setSearch('')}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                            {canManage && (
                                <Button
                                    size="sm"
                                    leftIcon={<UserPlus className="h-3.5 w-3.5" />}
                                    onClick={() => setAddOpen(true)}
                                >
                                    Add Members
                                </Button>
                            )}
                        </div>
                    </div>

                    <ScrollArea className="h-72 px-2">
                        {isLoading ? (
                            <div className="space-y-1 px-4 py-2">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="flex items-center gap-3 py-2.5 px-2 animate-pulse">
                                        <div className="h-9 w-9 rounded-full bg-muted shrink-0" />
                                        <div className="flex-1 space-y-1.5">
                                            <div className="h-3 bg-muted rounded w-32" />
                                            <div className="h-2.5 bg-muted rounded w-20" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
                                <Users className="h-8 w-8 text-muted-foreground/30" />
                                <p className="text-sm text-muted-foreground">
                                    {search ? 'No members match your search.' : 'No members yet.'}
                                </p>
                                {canManage && !search && (
                                    <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                                        Add Members
                                    </Button>
                                )}
                            </div>
                        ) : (
                            <TooltipProvider delayDuration={300}>
                                <div className="px-2 py-1">
                                    {filtered.map((m, idx) => (
                                        <div key={m.id}>
                                            <div className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/50 transition-colors group">
                                                <Avatar className="h-9 w-9 shrink-0">
                                                    {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                                                    <AvatarFallback className="text-xs font-medium">
                                                        {getInitials(`${m.firstName} ${m.lastName}`)}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium leading-tight truncate">
                                                        {m.firstName} {m.lastName}
                                                    </p>
                                                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                        {m.designation && (
                                                            <span className="text-xs text-muted-foreground truncate">{m.designation}</span>
                                                        )}
                                                        {m.designation && m.department && (
                                                            <span className="text-muted-foreground/40 text-xs">·</span>
                                                        )}
                                                        {m.department && (
                                                            <span className="text-xs text-muted-foreground/70 truncate">{m.department}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <Calendar className="h-3 w-3" />
                                                        {new Date(m.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </div>
                                                    {canManage && (
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    onClick={() => setRemoveTarget(m.employeeId)}
                                                                >
                                                                    <UserMinus className="h-3.5 w-3.5" />
                                                                </Button>
                                                            </TooltipTrigger>
                                                            <TooltipContent side="left">Remove from team</TooltipContent>
                                                        </Tooltip>
                                                    )}
                                                </div>
                                            </div>
                                            {idx < filtered.length - 1 && (
                                                <Separator className="mx-2 opacity-50" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </TooltipProvider>
                        )}
                    </ScrollArea>

                    {/* ── Footer ── */}
                    <div className="px-6 py-4 border-t bg-muted/20 flex justify-end">
                        <Button variant="outline" size="sm" onClick={handleClose}>Close</Button>
                    </div>
                </DialogContent>
            </Dialog>

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
}

// ── Team Card ─────────────────────────────────────────────────────────────────

interface TeamCardProps {
    team: TeamRow | MyTeamRow
    canManage: boolean
    orgMap: Map<string, OrgUnit>
    onView: () => void
    onEdit?: () => void
    onDelete?: () => void
}

function TeamCard({ team, canManage, orgMap, onView, onEdit, onDelete }: TeamCardProps) {
    const orgParts = resolveOrgPathFromDeptId(orgMap, team.departmentId)
    return (
        <Card
            className="cursor-pointer hover:shadow-md transition-shadow group relative"
            onClick={onView}
        >
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-semibold truncate">{team.name}</CardTitle>
                        {(team.departmentId || team.department) && (
                            <div className="mt-1">
                                <OrgHierarchyPath parts={orgParts.some(Boolean) ? orgParts : [null, null, team.department]} />
                            </div>
                        )}
                    </div>
                    {canManage && onEdit && onDelete && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100">
                                    <MoreHorizontal className="h-4 w-4" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                                <DropdownMenuItem onClick={onEdit}>
                                    <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </CardHeader>
            <CardContent className="pt-0">
                {team.description && (
                    <CardDescription className="text-xs line-clamp-2 mb-2">{team.description}</CardDescription>
                )}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    {team.memberCount} {team.memberCount === 1 ? 'member' : 'members'}
                </div>
            </CardContent>
        </Card>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function TeamPage() {
    const me = useAuthStore(s => s.user)
    const { can } = usePermissions()
    const canManage = can('manage_team')
    const canViewAll = me?.role === 'super_admin' || me?.role === 'hr_manager'

    const { data: allTeams = [], isLoading: teamsLoading } = useTeams()
    const { data: myTeams = [], isLoading: myTeamsLoading } = useMyTeams()
    const { data: orgUnitsRaw = [] } = useOrgUnits()
    const orgMap = useMemo(() => buildOrgUnitMap(orgUnitsRaw), [orgUnitsRaw])

    const [formOpen, setFormOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<TeamRow | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<TeamRow | null>(null)
    const [detailTeam, setDetailTeam] = useState<TeamRow | MyTeamRow | null>(null)

    const deleteMut = useDeleteTeam()

    const handleDelete = async () => {
        if (!deleteTarget) return
        try {
            await deleteMut.mutateAsync(deleteTarget.id)
            toast.success('Team deleted')
            setDeleteTarget(null)
        } catch {
            toast.error('Failed to delete team')
        }
    }

    const openEdit = (team: TeamRow) => {
        setEditTarget(team)
        setFormOpen(true)
    }

    const closeForm = () => {
        setFormOpen(false)
        setEditTarget(null)
    }

    return (
        <PageWrapper>
            <PageHeader
                title="Teams"
                description="Department-scoped work groups"
                actions={canManage && (
                    <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => { setEditTarget(null); setFormOpen(true) }}>
                        Create Team
                    </Button>
                )}
            />

            {canViewAll ? (
                // hr_manager / super_admin: tabs for All Teams and My Teams
                <Tabs defaultValue="all">
                    <TabsList className="mb-4">
                        <TabsTrigger value="all">All Teams</TabsTrigger>
                        <TabsTrigger value="mine">My Teams</TabsTrigger>
                    </TabsList>

                    <TabsContent value="all">
                        {teamsLoading ? (
                            <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
                        ) : allTeams.length === 0 ? (
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
                                    <Users className="h-8 w-8 text-muted-foreground/40" />
                                    <p className="text-sm text-muted-foreground">No teams yet. Create one to get started.</p>
                                    <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>Create Team</Button>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {allTeams.map(team => (
                                    <TeamCard
                                        key={team.id}
                                        team={team}
                                        canManage={canManage}
                                        orgMap={orgMap}
                                        onView={() => setDetailTeam(team)}
                                        onEdit={() => openEdit(team)}
                                        onDelete={() => setDeleteTarget(team)}
                                    />
                                ))}
                            </div>
                        )}
                    </TabsContent>

                    <TabsContent value="mine">
                        {myTeamsLoading ? (
                            <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
                        ) : myTeams.length === 0 ? (
                            <Card>
                                <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
                                    <Users className="h-8 w-8 text-muted-foreground/40" />
                                    <p className="text-sm text-muted-foreground">You haven't been assigned to any teams yet.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {myTeams.map(team => (
                                    <TeamCard
                                        key={team.id}
                                        team={team}
                                        canManage={false}
                                        orgMap={orgMap}
                                        onView={() => setDetailTeam(team)}
                                    />
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            ) : (
                // dept_head / employee: only teams they belong to
                <div className="space-y-4">
                    <h2 className="text-sm font-medium text-muted-foreground">Teams you belong to</h2>
                    {myTeamsLoading ? (
                        <div className="text-sm text-muted-foreground py-8 text-center">Loading...</div>
                    ) : myTeams.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-2">
                                <Users className="h-8 w-8 text-muted-foreground/40" />
                                <p className="text-sm text-muted-foreground">
                                    {canManage ? 'Create a team to get started.' : "You haven't been assigned to any teams yet."}
                                </p>
                                {canManage && (
                                    <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>Create Team</Button>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {myTeams.map(team => {
                                const isOwner = team.createdById === me?.id
                                return (
                                    <TeamCard
                                        key={team.id}
                                        team={team}
                                        canManage={canManage}
                                        orgMap={orgMap}
                                        onView={() => setDetailTeam(team)}
                                        onEdit={canManage && isOwner ? () => openEdit(team as unknown as TeamRow) : undefined}
                                        onDelete={canManage && isOwner ? () => setDeleteTarget(team as unknown as TeamRow) : undefined}
                                    />
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            <TeamFormDialog
                open={formOpen}
                onClose={closeForm}
                editTeam={editTarget}
            />

            <TeamDetailDialog
                team={detailTeam}
                open={!!detailTeam}
                onClose={() => setDetailTeam(null)}
                canManage={canManage}
                orgMap={orgMap}
            />

            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={o => !o && setDeleteTarget(null)}
                title="Delete Team"
                description={`Delete "${deleteTarget?.name}"? All members will be removed. This cannot be undone.`}
                confirmLabel="Delete"
                variant="destructive"
                onConfirm={handleDelete}
            />
        </PageWrapper>
    )
}
