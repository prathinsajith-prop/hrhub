import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react'
import { z } from 'zod'
import { Users, Plus, MoreHorizontal, UserPlus, Trash2, Pencil, Search, X, Building2, UserMinus, ChevronDown } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useTranslation } from 'react-i18next'
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
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Card } from '@/components/ui/card'
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
    name: z.string().min(1, 'Team name is required'), // validation message stays untranslated (zod fallback)
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
    const { t } = useTranslation()
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
            toast.success(isEdit ? t('team.teamUpdated') : t('team.teamCreated'))
            onClose()
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('team.saveTeamFailed'))
        }
    }

    return (
        <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{isEdit ? t('team.editTeam') : t('team.createTeam')}</DialogTitle>
                </DialogHeader>
                <form id="team-form" onSubmit={submit} className="space-y-4">
                    <FormField label={t('team.teamName')} required error={errors.name}>
                        <Input
                            id="team-name"
                            value={name}
                            onChange={e => { setName(e.target.value); setErrors(err => ({ ...err, name: '' })) }}
                            placeholder="Team name"
                            aria-invalid={!!errors.name}
                        />
                    </FormField>
                    <div className="space-y-1.5">
                        <Label htmlFor="team-desc">{t('team.description')}</Label>
                        <Textarea
                            id="team-desc"
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder={t('team.descriptionPlaceholder')}
                            rows={2}
                        />
                    </div>
                    {!isEdit && (
                        <div className="space-y-1.5">
                            <Label>{t('team.department')}</Label>
                            {lockedDepartmentId ? (
                                <p className="text-sm text-muted-foreground py-1.5">{lockedDepartmentName}</p>
                            ) : (
                                <Select
                                    value={departmentId || DEPT_NONE}
                                    onValueChange={v => setDepartmentId(v === DEPT_NONE ? '' : v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('team.noDeptFilter')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value={DEPT_NONE}>{t('team.noDeptFilterOption')}</SelectItem>
                                        {departments.map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            <p className="text-xs text-muted-foreground">{t('team.deptFilterHint')}</p>
                        </div>
                    )}
                </form>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button type="submit" form="team-form" loading={isPending}>
                        {isEdit ? t('team.saveChanges') : t('team.createTeam')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ── Add Members Dialog ────────────────────────────────────────────────────────

export function AddMembersDialog({ teamId, open, onClose }: { teamId: string; open: boolean; onClose: () => void }) {
    const { t } = useTranslation()
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
            toast.success(t('team.membersAdded', { count: selected.size, roleLabel: roleMeta(role).label }))
            handleClose()
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('team.addMembersFailed'))
        }
    }

    return (
        <Dialog open={open} onOpenChange={v => !v && handleClose()}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('team.addMembers')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    {/* Role selector */}
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border">
                        <div className="flex-1">
                            <p className="text-xs font-medium text-foreground">{t('team.assignRole')}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{t('team.assignRoleDesc')}</p>
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
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input
                            className="pl-8 h-8 text-sm"
                            placeholder={t('team.searchEmployees')}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                                <X className="size-3.5 text-muted-foreground hover:text-foreground" />
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
                            <Label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer select-none">
                                {t('team.selectAll', { count: filtered.length })}
                            </Label>
                        </div>
                    )}

                    <ScrollArea className="h-56 rounded-md border">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">{t('common.loading')}</div>
                        ) : filtered.length === 0 ? (
                            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                                {search ? t('team.noEmployeesMatch') : t('team.noEligibleEmployees')}
                            </div>
                        ) : (
                            <div className="divide-y">
                                {filtered.map(emp => (
                                    <Label
                                        key={emp.id}
                                        htmlFor={`emp-${emp.id}`}
                                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer"
                                    >
                                        <Checkbox
                                            id={`emp-${emp.id}`}
                                            checked={selected.has(emp.id)}
                                            onCheckedChange={() => toggle(emp.id)}
                                        />
                                        <Avatar className="size-7 shrink-0">
                                            {emp.avatarUrl && <AvatarImage src={emp.avatarUrl} />}
                                            <AvatarFallback className="text-[10px]">{getInitials(`${emp.firstName} ${emp.lastName}`)}</AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium leading-tight">{emp.firstName} {emp.lastName}</p>
                                            {emp.designation && <p className="text-xs text-muted-foreground truncate">{emp.designation}</p>}
                                        </div>
                                    </Label>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>{t('common.cancel')}</Button>
                    <Button onClick={submit} loading={addMut.isPending} disabled={selected.size === 0}>
                        {selected.size > 0 ? t('team.addCount', { count: selected.size }) : t('common.add')}
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
    const { t } = useTranslation()
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
            toast.success(t('team.memberRemoved'))
            setRemoveTarget(null)
        } catch {
            toast.error(t('team.removeFailed'))
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
                        <div className="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary text-sm font-semibold shrink-0 select-none">
                            {initials}
                        </div>
                        <div className="flex-1 min-w-0 pt-0.5">
                            <h3 className="text-sm font-semibold leading-snug truncate text-foreground">
                                {team.name}
                            </h3>
                            {(team.departmentId || team.department) && (
                                <div className="flex items-center gap-1 mt-0.5">
                                    <Building2 className="size-3 text-muted-foreground shrink-0" />
                                    <OrgHierarchyPath parts={orgParts.some(Boolean) ? orgParts : [null, null, team.department]} />
                                </div>
                            )}
                        </div>
                        {canManage && onEdit && onDelete && (
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                    <Button variant="ghost" size="icon" className="size-7 shrink-0 -mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <MoreHorizontal className="size-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={onEdit}>
                                        <Pencil className="size-3.5 mr-2" /> {t('team.editTeam')}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                                        <Trash2 className="size-3.5 mr-2" /> {t('team.deleteTeam')}
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

                    {/* Row 3: member avatar stack - always visible */}
                    <div className="flex items-center justify-between pt-3 border-t border-border/50">
                        <div className="flex items-center gap-2">
                            {team.memberCount === 0 ? (
                                <span className="text-xs text-muted-foreground">{t('team.noMembers')}</span>
                            ) : (
                                <>
                                    <TooltipProvider delayDuration={200}>
                                        <div className="flex -space-x-2">
                                            {membersLoaded
                                                ? previewMembers.map(m => (
                                                    <Tooltip key={m.id}>
                                                        <TooltipTrigger asChild>
                                                            <Avatar className="size-7 border-2 border-background shrink-0 cursor-default">
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
                                                    <div key={i} className="size-7 rounded-full border-2 border-background bg-muted shrink-0" />
                                                ))
                                            }
                                            {overflow > 0 && (
                                                <div className="size-7 rounded-full border-2 border-background bg-muted flex items-center justify-center shrink-0">
                                                    <span className="text-[9px] font-semibold text-muted-foreground">+{overflow}</span>
                                                </div>
                                            )}
                                        </div>
                                    </TooltipProvider>
                                    <span className="text-[11px] text-muted-foreground">
                                        {t('team.memberCount', { count: team.memberCount })}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Expand / collapse toggle ── */}
                <button
                    type="button"
                    onClick={toggleExpand}
                    className={cn(
                        'w-full flex items-center justify-center gap-1.5 py-2 border-t text-xs font-medium transition-colors',
                        expanded
                            ? 'bg-muted/50 text-foreground hover:bg-muted'
                            : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
                    )}
                >
                    {expanded ? t('team.hideMembers') : t('team.members')}
                    <ChevronDown className={cn('size-3.5 transition-transform duration-200', expanded && 'rotate-180')} />
                </button>

                {/* ── Collapsible members panel ── */}
                {expanded && (
                    <div className="border-t bg-muted/20">
                        {/* Search + Add button */}
                        <div className="flex items-center gap-2 p-3 pb-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                    className="pl-8 h-8 text-xs bg-background"
                                    placeholder={t('team.searchMembers')}
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                />
                                {search && (
                                    <button
                                        type="button"
                                        onClick={e => { e.stopPropagation(); setSearch('') }}
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="size-3.5" />
                                    </button>
                                )}
                            </div>
                            {canManage && (
                                <Button
                                    size="sm"
                                    className="h-8 shrink-0 text-xs"
                                    leftIcon={<UserPlus className="size-3.5" />}
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
                                    <div key={i} className="flex items-center gap-3 py-2.5 px-2">
                                        <Skeleton className="size-8 rounded-full shrink-0" />
                                        <div className="flex-1 space-y-1.5">
                                            <Skeleton className="h-2.5 w-32" />
                                            <Skeleton className="h-2 w-20" />
                                        </div>
                                        <Skeleton className="h-5 w-16 rounded-full shrink-0" />
                                    </div>
                                ))}
                            </div>
                        ) : filtered.length === 0 ? (
                            <EmptyState
                                icon={Users}
                                title={search ? t('team.noMembersMatch') : t('team.noMembersYet')}
                                size="sm"
                                action={canManage && !search ? (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs"
                                        leftIcon={<UserPlus className="size-3" />}
                                        onClick={e => { e.stopPropagation(); setAddOpen(true) }}
                                    >
                                        {t('team.addMembers')}
                                    </Button>
                                ) : undefined}
                            />
                        ) : (
                            <ScrollArea className={filtered.length > 5 ? 'h-[220px]' : undefined}>
                                <TooltipProvider delayDuration={300}>
                                    <div className="px-3 pb-3 space-y-0.5">
                                        {filtered.map(m => (
                                            <div
                                                key={m.id}
                                                className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-background transition-colors group/row cursor-default"
                                            >
                                                <Avatar className="size-8 shrink-0">
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

                                                {/* Role badge - clickable dropdown for managers */}
                                                {canManage ? (
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                                                            <button type="button" className="flex items-center gap-0.5 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0">
                                                                <RoleBadge role={m.role ?? 'member'} />
                                                                <ChevronDown className="size-2.5 text-muted-foreground opacity-0 group-hover/row:opacity-100 transition-opacity" />
                                                            </button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end" className="w-44" onClick={e => e.stopPropagation()}>
                                                            <p className="px-2 pt-1.5 pb-1 text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                                                                {t('team.changeRole')}
                                                            </p>
                                                            {TEAM_ROLES.map(r => (
                                                                <DropdownMenuItem
                                                                    key={r.value}
                                                                    className="gap-2 text-xs"
                                                                    disabled={updateRoleMut.isPending}
                                                                    onClick={() => updateRoleMut.mutate(
                                                                        { employeeId: m.employeeId, role: r.value },
                                                                        {
                                                                            onSuccess: () => toast.success(t('team.roleChangedTo', { role: r.label })),
                                                                            onError: () => toast.error(t('team.roleUpdateFailed')),
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
                                                                <UserMinus className="size-3" /> {t('team.removeFromTeam')}
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
                title={t('team.removeConfirmTitle')}
                description={t('team.removeConfirmDesc')}
                confirmLabel={t('common.delete')}
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
        <div className="rounded-xl border border-border/60 bg-card p-4">
            <div className="flex items-start gap-3">
                <Skeleton className="size-10 rounded-lg shrink-0" />
                <div className="flex-1 space-y-2 pt-0.5">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-2.5 w-1/2" />
                </div>
            </div>
            <div className="mt-4 pt-3 border-t border-border/50 flex items-center gap-2">
                <div className="flex -space-x-2">
                    {[0, 1, 2].map(i => <Skeleton key={`div-${i}`} className="size-7 rounded-full border-2 border-background" />)}
                </div>
                <Skeleton className="h-2.5 w-16" />
            </div>
        </div>
    )
}

// Top-level (stable identity) so React keeps card state across parent re-renders.
function TeamGrid({ teams, showControls, canManage, canViewAll, userId, orgMap, onEditTeam, onDeleteTeam }: TeamGridProps) {
    const { t } = useTranslation()
    const [visibleCount, setVisibleCount] = useState(TEAMS_PAGE_SIZE)
    const sentinelRef = useRef<HTMLDivElement>(null)

    // Reset paging when the team set changes — state-during-render (no effect).
    const [prevLen, setPrevLen] = useState(teams.length)
    if (teams.length !== prevLen) {
        setPrevLen(teams.length)
        setVisibleCount(TEAMS_PAGE_SIZE)
    }

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
                        <TeamGridSkeletonRow key={`team-skeleton-${i}`} />
                    ))}
                </div>
            )}
            {!hasMore && teams.length > TEAMS_PAGE_SIZE && (
                <p className="text-center text-xs text-muted-foreground py-4">
                    {t('team.showingAllTeams', { count: teams.length })}
                </p>
            )}
        </>
    )
}

function TeamsPanel({ canManage, canViewAll, userId }: TeamsPanelProps) {
    const { t } = useTranslation()
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
            toast.success(t('team.teamDeleted'))
            setDeleteTarget(null)
        } catch {
            toast.error(t('team.deleteTeamFailed'))
        }
    }, [deleteTarget, deleteMut, t])

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
                    <Button size="sm" leftIcon={<Plus className="size-3.5" />} onClick={() => { setEditTarget(null); setFormOpen(true) }}>
                        {t('team.createTeam')}
                    </Button>
                </div>
            )}

            {canViewAll ? (
                <Tabs defaultValue="all">
                    <TabsList className="mb-4">
                        <TabsTrigger value="all">{t('team.allTeams')}</TabsTrigger>
                        <TabsTrigger value="mine">{t('team.myTeams')}</TabsTrigger>
                    </TabsList>
                    <TabsContent value="all">
                        {teamsLoading ? (
                            <div className="text-sm text-muted-foreground py-8 text-center">{t('common.loading')}</div>
                        ) : allTeams.length === 0 ? (
                            <EmptyState
                                icon={Users}
                                title={t('team.noTeamsYet')}
                                variant="card"
                                action={canManage ? (
                                    <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
                                        {t('team.createTeam')}
                                    </Button>
                                ) : undefined}
                            />
                        ) : teamGrid(allTeams, true)}
                    </TabsContent>
                    <TabsContent value="mine">
                        {myTeamsLoading ? (
                            <div className="text-sm text-muted-foreground py-8 text-center">{t('common.loading')}</div>
                        ) : myTeams.length === 0 ? (
                            <EmptyState icon={Users} title={t('team.notAssignedToTeams')} variant="card" />
                        ) : teamGrid(myTeams, false)}
                    </TabsContent>
                </Tabs>
            ) : (
                <div className="space-y-4">
                    <h2 className="text-sm font-medium text-muted-foreground">{t('team.teamsBelongTo')}</h2>
                    {myTeamsLoading ? (
                        <div className="text-sm text-muted-foreground py-8 text-center">{t('common.loading')}</div>
                    ) : myTeams.length === 0 ? (
                        <EmptyState
                            icon={Users}
                            title={canManage ? t('team.createToGetStarted') : t('team.notAssignedToTeams')}
                            variant="card"
                            action={canManage ? (
                                <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
                                    {t('team.createTeam')}
                                </Button>
                            ) : undefined}
                        />
                    ) : teamGrid(myTeams, true)}
                </div>
            )}

            <TeamFormDialog open={formOpen} onClose={closeForm} editTeam={editTarget} />
            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={o => !o && setDeleteTarget(null)}
                title={t('team.deleteTeamTitle')}
                description={t('team.deleteTeamDesc', { name: deleteTarget?.name ?? '' })}
                confirmLabel={t('common.delete')}
                variant="destructive"
                onConfirm={handleDelete}
            />
        </>
    )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function TeamPage() {
    const { t } = useTranslation()
    const { can, hasRole } = usePermissions()
    const userId = useAuthStore(s => s.user?.id)
    const canManage = can('manage_team')
    const canManageOrg = can('manage_org') || can('manage_settings')
    // hr_manager and above can view all teams; dept_head and below see only their own
    const canViewAll = hasRole('super_admin', 'hr_manager')

    return (
        <PageWrapper>
            <PageHeader
                title={t('team.title')}
                description={t('team.orgDescription')}
            />

            {/* Teams tab hidden for now - manage teams via the Org Structure tree. */}
            {canManageOrg ? (
                <OrgStructureTab />
            ) : (
                <TeamsPanel canManage={canManage} canViewAll={canViewAll} userId={userId} />
            )}
        </PageWrapper>
    )
}
