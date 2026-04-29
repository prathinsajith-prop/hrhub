import { useState, useMemo } from 'react'
import { Users, Plus, MoreHorizontal, UserPlus, Trash2, Pencil, Search, X } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import {
    useTeams, useMyTeams, useTeamMembers, useEligibleEmployees,
    useCreateTeam, useUpdateTeam, useDeleteTeam, useAddTeamMembers, useRemoveTeamMember,
    type TeamRow, type MyTeamRow,
} from '@/hooks/useTeams'
import { useOrgUnits } from '@/hooks/useOrgUnits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { getInitials } from '@/lib/utils'
import { ApiError } from '@/lib/api'

// ── Create / Edit Team Dialog ─────────────────────────────────────────────────

interface TeamFormDialogProps {
    open: boolean
    onClose: () => void
    editTeam?: TeamRow | null
    lockedDepartmentId?: string
    lockedDepartmentName?: string
}

function TeamFormDialog({ open, onClose, editTeam, lockedDepartmentId, lockedDepartmentName }: TeamFormDialogProps) {
    const { data: orgUnits = [] } = useOrgUnits()
    const departments = orgUnits.filter(u => u.type === 'department' && u.isActive)
    const createMut = useCreateTeam()
    const updateMut = useUpdateTeam()

    const [name, setName] = useState(editTeam?.name ?? '')
    const [description, setDescription] = useState(editTeam?.description ?? '')
    const [departmentId, setDepartmentId] = useState(editTeam?.departmentId ?? lockedDepartmentId ?? '')

    const isEdit = !!editTeam
    const isPending = createMut.isPending || updateMut.isPending

    const handleOpen = (v: boolean) => {
        if (!v) {
            onClose()
            setName(editTeam?.name ?? '')
            setDescription(editTeam?.description ?? '')
            setDepartmentId(editTeam?.departmentId ?? lockedDepartmentId ?? '')
        }
    }

    const submit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return
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
        <Dialog open={open} onOpenChange={handleOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEdit ? 'Edit Team' : 'Create Team'}</DialogTitle>
                </DialogHeader>
                <form id="team-form" onSubmit={submit} className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="team-name">Team Name *</Label>
                        <Input
                            id="team-name"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. Frontend Squad"
                            required
                        />
                    </div>
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
                                <Select value={departmentId} onValueChange={setDepartmentId}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All departments (optional)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">All departments</SelectItem>
                                        {departments.map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            <p className="text-xs text-muted-foreground">Only employees in this department can join the team.</p>
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
            next.has(id) ? next.delete(id) : next.add(id)
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
}

function TeamDetailDialog({ team, open, onClose, canManage }: TeamDetailDialogProps) {
    const { data: members = [], isLoading } = useTeamMembers(open && team ? team.id : null)
    const removeMut = useRemoveTeamMember(team?.id ?? '')
    const [addOpen, setAddOpen] = useState(false)
    const [removeTarget, setRemoveTarget] = useState<string | null>(null)

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

    if (!team) return null

    return (
        <>
            <Dialog open={open} onOpenChange={v => !v && onClose()}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {team.name}
                            {team.department && (
                                <Badge variant="secondary" className="text-xs font-normal">{team.department}</Badge>
                            )}
                        </DialogTitle>
                        {team.description && (
                            <p className="text-sm text-muted-foreground mt-1">{team.description}</p>
                        )}
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-medium">Members ({members.length})</p>
                            {canManage && (
                                <Button size="sm" variant="outline" leftIcon={<UserPlus className="h-3.5 w-3.5" />} onClick={() => setAddOpen(true)}>
                                    Add Members
                                </Button>
                            )}
                        </div>

                        <ScrollArea className="h-72 rounded-md border">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Loading...</div>
                            ) : members.length === 0 ? (
                                <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">No members yet</div>
                            ) : (
                                <div className="divide-y">
                                    {members.map(m => (
                                        <div key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                                            <Avatar className="h-8 w-8 shrink-0">
                                                {m.avatarUrl && <AvatarImage src={m.avatarUrl} />}
                                                <AvatarFallback className="text-xs">{getInitials(`${m.firstName} ${m.lastName}`)}</AvatarFallback>
                                            </Avatar>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium leading-tight">{m.firstName} {m.lastName}</p>
                                                {m.designation && <p className="text-xs text-muted-foreground">{m.designation}</p>}
                                            </div>
                                            {canManage && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                                                    onClick={() => setRemoveTarget(m.employeeId)}
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </ScrollArea>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={onClose}>Close</Button>
                    </DialogFooter>
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
                variant="destructive"
                onConfirm={handleRemove}
            />
        </>
    )
}

// ── Team Card ─────────────────────────────────────────────────────────────────

interface TeamCardProps {
    team: TeamRow | MyTeamRow
    canManage: boolean
    onView: () => void
    onEdit?: () => void
    onDelete?: () => void
}

function TeamCard({ team, canManage, onView, onEdit, onDelete }: TeamCardProps) {
    return (
        <Card
            className="cursor-pointer hover:shadow-md transition-shadow group relative"
            onClick={onView}
        >
            <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                        <CardTitle className="text-sm font-semibold truncate">{team.name}</CardTitle>
                        {team.department && (
                            <Badge variant="outline" className="mt-1 text-[10px] font-normal">{team.department}</Badge>
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

    // dept_head: restrict to their department
    const deptHeadDepartmentId = me?.role === 'dept_head' ? (me as any).department : undefined

    const { data: allTeams = [], isLoading: teamsLoading } = useTeams(
        me?.role === 'dept_head' ? deptHeadDepartmentId : undefined
    )
    const { data: myTeams = [], isLoading: myTeamsLoading } = useMyTeams()

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

    const isEmployee = !canManage

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

            {isEmployee ? (
                // Employee-only view: just their teams
                <div className="space-y-4">
                    <h2 className="text-sm font-medium text-muted-foreground">Teams you belong to</h2>
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
                                    onView={() => setDetailTeam(team)}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                // Manager view: tabs for All Teams and My Teams
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
                                        onView={() => setDetailTeam(team)}
                                    />
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
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
