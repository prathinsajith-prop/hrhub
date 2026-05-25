import { useState, useMemo } from 'react'
import {
    Users, Plus, CheckCircle2, Shield, ShieldOff, ShieldCheck,
    Search, MailCheck, UserPlus, Check, Mail, Clock,
    AlertCircle, MinusCircle, KeyRound, Timer, Pencil,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { cn, formatDate } from '@/lib/utils'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'
import {
    useTenantUsers, useUpdateUser, useInvitableEmployees,
    useInviteUserBulk, useResendUserInvite,
    type InvitableEmployee, type TenantUser,
} from '@/hooks/useSettings'
import { usePermissions } from '@/hooks/usePermissions'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { CopyableEmail, MultiRoleToggle, MULTI_ROLE_OPTIONS, MULTI_ROLE_OPTIONS_WITH_SUPER } from '@/components/shared'
import {
    ALL_ROLES, ALL_PERMISSIONS, getRolePermissionMatrix,
    type Permission,
} from '@/lib/permissions'
import { labelFor, ROLE_BADGE_STYLE } from '@/lib/enums'
import type { UserRole } from '@/types'
import { useTranslation } from 'react-i18next'

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatLastLogin(lastLoginAt: string | null, t: (k: string) => string): string {
    if (!lastLoginAt) return t('settingsDetail.users.lastLoginNever')
    const diff = Date.now() - new Date(lastLoginAt).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return t('settingsDetail.users.lastLoginJustNow')
    if (hours < 24) return `${hours}h`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d`
    return `${Math.floor(days / 7)}w`
}

function initials(name: string) {
    return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

const ROLE_LABEL: Record<UserRole, string> = {
    super_admin: 'Super Admin',
    hr_manager: 'HR Manager',
    pro_officer: 'PRO Officer',
    dept_head: 'Department Manager',
    employee: 'Employee',
}

type PermGroupKey = 'people' | 'time' | 'payroll' | 'compliance' | 'hiring' | 'assets' | 'admin' | 'reports' | 'other'

function permGroup(p: Permission): PermGroupKey {
    if (p.includes('employee') || p.includes('org_chart') || p.includes('exit')) return 'people'
    if (p.includes('leave') || p.includes('attendance') || p.includes('performance')) return 'time'
    if (p.includes('payroll')) return 'payroll'
    if (p.includes('document') || p.includes('visa') || p.includes('compliance')) return 'compliance'
    if (p.includes('recruitment') || p.includes('onboarding')) return 'hiring'
    if (p.includes('asset')) return 'assets'
    if (p.includes('settings') || p.includes('user') || p.includes('audit')) return 'admin'
    if (p.includes('report')) return 'reports'
    return 'other'
}

// ─── Manage Roles Modal — read-only built-in matrix viewer ────────────────────
function ManageRolesModal({
    open,
    onClose,
    initialRole = 'super_admin',
}: {
    open: boolean
    onClose: () => void
    initialRole?: UserRole
}) {
    const { t } = useTranslation()
    const matrix = getRolePermissionMatrix()

    const [selectedRole, setSelectedRole] = useState<UserRole>(initialRole)
    const [search, setSearch] = useState('')

    // State-during-render sync: reset to `initialRole` whenever the modal opens.
    const [lastOpen, setLastOpen] = useState(open)
    if (open !== lastOpen) {
        setLastOpen(open)
        if (open) {
            setSelectedRole(initialRole)
            setSearch('')
        }
    }

    const grouped = useMemo(() => {
        return ALL_PERMISSIONS.reduce<Record<PermGroupKey, Permission[]>>((acc, p) => {
            const g = permGroup(p)
            if (!acc[g]) acc[g] = []
            acc[g].push(p)
            return acc
        }, {} as Record<PermGroupKey, Permission[]>)
    }, [])

    const granted = matrix[selectedRole] ?? []
    const q = search.trim().toLowerCase()

    return (
        <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
            <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-4 border-b">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <Shield className="size-4 text-primary" />
                        {t('settingsDetail.users.manageRoles')}
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {t('settingsDetail.users.manageRolesDesc')}
                    </p>
                </DialogHeader>

                <div className="grid grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)] divide-y md:divide-y-0 md:divide-x max-h-[60vh]">
                    {/* Left rail – role picker */}
                    <div className="md:overflow-y-auto p-2.5 space-y-1 bg-muted/20">
                        {ALL_ROLES.map((r) => {
                            const isActive = r === selectedRole
                            const count = matrix[r]?.length ?? 0
                            return (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setSelectedRole(r)}
                                    className={cn(
                                        'w-full text-start px-3 py-2 rounded-lg transition-colors flex items-center justify-between gap-2',
                                        isActive
                                            ? 'bg-background shadow-sm border'
                                            : 'hover:bg-background/80 border border-transparent',
                                    )}
                                >
                                    <div className="min-w-0">
                                        <p className={cn(
                                            'text-sm font-medium truncate',
                                            isActive ? 'text-foreground' : 'text-muted-foreground',
                                        )}>
                                            {ROLE_LABEL[r]}
                                        </p>
                                        <p className="text-[10px] text-muted-foreground">
                                            {t('settingsDetail.users.permissionCount', { count })}
                                        </p>
                                    </div>
                                    {isActive && <span className="size-1.5 rounded-full bg-primary shrink-0" />}
                                </button>
                            )
                        })}
                    </div>

                    {/* Right pane – permissions of the selected role, grouped */}
                    <div className="md:overflow-y-auto">
                        <div className="sticky top-0 bg-background border-b px-4 py-3 z-10 space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className={cn(
                                    'text-[10px] font-semibold px-2 py-0.5 rounded-full border',
                                    ROLE_BADGE_STYLE[selectedRole],
                                )}>
                                    {ROLE_LABEL[selectedRole]}
                                </span>
                                <span className="text-[11px] text-muted-foreground">
                                    {t(`settingsDetail.users.roleDesc.${selectedRole}`)}
                                </span>
                            </div>
                            <div className="relative">
                                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                    className="ps-8 h-8 text-sm"
                                    placeholder={t('settingsDetail.users.searchPermissions')}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="px-4 py-3 space-y-4">
                            {(Object.keys(grouped) as PermGroupKey[]).map((group) => {
                                const perms = grouped[group]
                                const visible = perms.filter((p) => !q || labelFor(p).toLowerCase().includes(q))
                                if (visible.length === 0) return null
                                const grantedCount = visible.filter((p) => granted.includes(p)).length
                                return (
                                    <div key={group}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                                                {t(`settingsDetail.users.permissionGroup.${group}`)}
                                            </p>
                                            <span className="text-[10px] text-muted-foreground tabular-nums">
                                                {grantedCount}/{visible.length}
                                            </span>
                                        </div>
                                        <ul className="space-y-1">
                                            {visible.map((p) => {
                                                const has = granted.includes(p)
                                                return (
                                                    <li
                                                        key={p}
                                                        className={cn(
                                                            'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs border',
                                                            has
                                                                ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900'
                                                                : 'bg-muted/30 border-transparent',
                                                        )}
                                                    >
                                                        {has ? (
                                                            <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" aria-label={t('settingsDetail.users.granted')} />
                                                        ) : (
                                                            <MinusCircle className="size-3.5 text-muted-foreground/40 shrink-0" aria-label={t('settingsDetail.users.notGranted')} />
                                                        )}
                                                        <span className={cn('truncate', !has && 'text-muted-foreground')}>
                                                            {labelFor(p)}
                                                        </span>
                                                    </li>
                                                )
                                            })}
                                        </ul>
                                    </div>
                                )
                            })}
                            {q && Object.values(grouped).every(perms => perms.filter(p => labelFor(p).toLowerCase().includes(q)).length === 0) && (
                                <p className="py-6 text-center text-xs text-muted-foreground">
                                    {t('settingsDetail.users.noMatchingPermissions')}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="px-5 py-3 border-t bg-muted/20 flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-300 max-w-md">
                        <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                        <span>{t('settingsDetail.users.manageRolesReadOnly')}</span>
                    </div>
                    <Button variant="outline" size="sm" onClick={onClose}>{t('common.close')}</Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ─── Grant Access Modal ───────────────────────────────────────────────────────
function GrantAccessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation()
    const { data: invitableEmployees = [], isLoading } = useInvitableEmployees({ enabled: open })
    const inviteBulk = useInviteUserBulk()
    const [search, setSearch] = useState('')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [roles, setRoles] = useState<string[]>(['employee'])

    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return invitableEmployees.filter(
            (e: InvitableEmployee) =>
                e.fullName.toLowerCase().includes(q) ||
                (e.department ?? '').toLowerCase().includes(q) ||
                (e.designation ?? '').toLowerCase().includes(q) ||
                (e.employeeNo ?? '').toLowerCase().includes(q),
        )
    }, [invitableEmployees, search])

    const allVisibleSelected = filtered.length > 0 && filtered.every((e: InvitableEmployee) => selectedIds.has(e.id))

    function toggle(id: string) {
        setSelectedIds((prev) => {
            const next = new Set(prev)
            if (next.has(id)) { next.delete(id) } else { next.add(id) }
            return next
        })
    }

    function toggleAll() {
        if (allVisibleSelected) {
            setSelectedIds((prev) => {
                const next = new Set(prev)
                filtered.forEach((e: InvitableEmployee) => next.delete(e.id))
                return next
            })
        } else {
            setSelectedIds((prev) => {
                const next = new Set(prev)
                filtered.forEach((e: InvitableEmployee) => { if (e.inviteEmail) next.add(e.id) })
                return next
            })
        }
    }

    function handleClose() {
        setSearch('')
        setSelectedIds(new Set())
        setRoles(['employee'])
        onClose()
    }

    async function handleGrantAccess() {
        const employeeIds = Array.from(selectedIds)
        if (employeeIds.length === 0) return
        try {
            const result = await inviteBulk.mutateAsync({ employeeIds, role: roles[0], roles })
            const { succeeded, failed } = result
            if (succeeded.length > 0) {
                toast.success(
                    succeeded.length === 1
                        ? t('settingsDetail.users.accessGrantedOne', { name: succeeded[0].name })
                        : t('settingsDetail.users.accessGrantedMany', { count: succeeded.length }),
                )
            }
            if (failed.length > 0) {
                toast.error(
                    t('settingsDetail.users.invitesFailed', { count: failed.length }),
                    failed.map((f: { reason: string }) => f.reason).join('; '),
                )
            }
            handleClose()
        } catch (err) {
            toast.error((err as Error)?.message ?? t('settingsDetail.users.failedToSendInvitations'))
        }
    }

    const selectedCount = selectedIds.size
    const hasEmailless = Array.from(selectedIds).some(
        (id) => !invitableEmployees.find((e: InvitableEmployee) => e.id === id)?.inviteEmail,
    )

    return (
        <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
            <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-4 border-b">
                    <DialogTitle className="flex items-center gap-2 text-base">
                        <UserPlus className="size-4 text-primary" />
                        {t('settingsDetail.users.grantAccess')}
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {t('settingsDetail.users.grantAccessDesc')}
                    </p>
                </DialogHeader>

                <div className="px-5 pt-4 pb-3 border-b bg-muted/30 flex items-center gap-3 flex-wrap">
                    <p className="text-xs font-medium text-muted-foreground shrink-0">{t('settingsDetail.users.assignRoles')}</p>
                    <MultiRoleToggle roles={roles} onChange={setRoles} availableRoles={MULTI_ROLE_OPTIONS} />
                </div>

                <div className="px-5 pt-3 pb-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                            className="pl-8 h-8 text-sm"
                            placeholder={t('settingsDetail.users.searchPlaceholder')}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    {!isLoading && invitableEmployees.length > 0 && (
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <div className={cn(
                                'size-3.5 rounded border flex items-center justify-center shrink-0',
                                allVisibleSelected ? 'bg-primary border-primary' : 'border-border',
                            )}>
                                {allVisibleSelected && <Check className="size-2.5 text-primary-foreground" />}
                            </div>
                            {allVisibleSelected ? t('settingsDetail.users.deselectAll') : t('settingsDetail.users.selectAll')}
                        </button>
                    )}
                </div>

                <div className="overflow-y-auto max-h-72 px-5 pb-2 divide-y">
                    {isLoading ? (
                        [1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-3 py-2.5">
                                <Skeleton className="size-8 rounded-full shrink-0" />
                                <div className="space-y-1.5 flex-1">
                                    <Skeleton className="h-3.5 w-32" />
                                    <Skeleton className="h-3 w-44" />
                                </div>
                            </div>
                        ))
                    ) : filtered.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                            {invitableEmployees.length === 0
                                ? t('settingsDetail.users.allHaveAccounts')
                                : t('settingsDetail.users.noMatchingEmployees')}
                        </div>
                    ) : (
                        filtered.map((emp: InvitableEmployee) => {
                            const isSelected = selectedIds.has(emp.id)
                            const noEmail = !emp.inviteEmail
                            return (
                                <button
                                    key={emp.id}
                                    type="button"
                                    disabled={noEmail}
                                    onClick={() => toggle(emp.id)}
                                    title={noEmail ? t('settingsDetail.users.noEmailTitle') : undefined}
                                    className={cn(
                                        'w-full flex items-center gap-3 py-2.5 text-start transition-colors',
                                        noEmail ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/30 cursor-pointer',
                                    )}
                                >
                                    <div className={cn(
                                        'size-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                                        isSelected ? 'bg-primary border-primary' : 'border-border',
                                    )}>
                                        {isSelected && <Check className="size-3 text-primary-foreground" />}
                                    </div>
                                    <Avatar className="size-8 shrink-0">
                                        {emp.avatarUrl && <AvatarImage src={emp.avatarUrl} alt={emp.fullName} />}
                                        <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                                            {initials(emp.fullName)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium truncate">{emp.fullName}</p>
                                        <p className="text-xs text-muted-foreground truncate">
                                            {[emp.designation, emp.department].filter(Boolean).join(' · ')}
                                            {emp.inviteEmail && (
                                                <span className="ml-1.5 opacity-70">{emp.inviteEmail}</span>
                                            )}
                                        </p>
                                    </div>
                                    {noEmail && (
                                        <Badge variant="secondary" className="text-[10px] shrink-0">{t('settingsDetail.users.noEmail')}</Badge>
                                    )}
                                </button>
                            )
                        })
                    )}
                </div>

                <div className="px-5 py-4 border-t bg-muted/20 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                        {selectedCount === 0
                            ? t('settingsDetail.users.noEmployeesSelected')
                            : t('settingsDetail.users.employeesSelected', { count: selectedCount })}
                        {hasEmailless && (
                            <span className="ml-1.5 text-amber-600">{t('settingsDetail.users.someLackEmail')}</span>
                        )}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleClose}>{t('common.cancel')}</Button>
                        <Button
                            size="sm"
                            disabled={selectedCount === 0 || inviteBulk.isPending}
                            onClick={handleGrantAccess}
                            leftIcon={<UserPlus className="size-3.5" />}
                        >
                            {inviteBulk.isPending
                                ? t('settingsDetail.users.sending')
                                : selectedCount > 1
                                    ? t('settingsDetail.users.grantAccessCount', { count: selectedCount })
                                    : t('settingsDetail.users.grantAccess')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type StatusFilter = 'all' | 'active' | 'inactive'

export function UsersPage() {
    const { t } = useTranslation()
    const { can } = usePermissions()
    const { user: me } = useAuthStore()
    const canManageUsers = can('manage_users')
    const { data: tenantUsers, isLoading } = useTenantUsers()
    const updateUser = useUpdateUser()
    const resendInvite = useResendUserInvite()
    const [showInvite, setShowInvite] = useState(false)
    const [manageRoles, setManageRoles] = useState<{ open: boolean; initialRole: UserRole }>({ open: false, initialRole: 'super_admin' })
    const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string; active: boolean } | null>(null)
    // Per-user "Manage Access" dialog — opened from a row-level button so all
    // access actions (roles, activate/deactivate) live in one focused place
    // instead of being spread across inline controls.
    const [accessTarget, setAccessTarget] = useState<TenantUser | null>(null)

    // ─── Filter state ────────────────────────────────────────────────────────
    const [search, setSearch] = useState('')
    const [roleFilter, setRoleFilter] = useState<UserRole | null>(null)
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

    // ─── Filter pipeline ────────────────────────────────────────────────────
    const allUsers = useMemo<TenantUser[]>(() => tenantUsers ?? [], [tenantUsers])
    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase()
        return allUsers
            .filter((u: TenantUser) => {
                if (statusFilter === 'active' && !u.isActive) return false
                if (statusFilter === 'inactive' && u.isActive) return false
                if (roleFilter) {
                    const userRoles = u.roles?.length ? u.roles : [u.role]
                    if (!userRoles.includes(roleFilter)) return false
                }
                if (q) {
                    const hay = [u.name, u.email, u.department ?? '', u.designation ?? ''].join(' ').toLowerCase()
                    if (!hay.includes(q)) return false
                }
                return true
            })
            .sort((a: TenantUser, b: TenantUser) => {
                if (a.isActive !== b.isActive) return a.isActive ? -1 : 1
                return a.name.localeCompare(b.name)
            })
    }, [allUsers, search, roleFilter, statusFilter])

    const hasActiveFilters = search.trim() !== '' || roleFilter !== null || statusFilter !== 'all'
    const matrix = getRolePermissionMatrix()

    function clearFilters() {
        setSearch('')
        setRoleFilter(null)
        setStatusFilter('all')
    }

    async function handleToggleActive() {
        if (!deactivateTarget) return
        try {
            await updateUser.mutateAsync({ id: deactivateTarget.id, isActive: !deactivateTarget.active })
            toast.success(deactivateTarget.active ? t('settingsDetail.users.userDeactivated') : t('settingsDetail.users.userActivated'))
            setDeactivateTarget(null)
        } catch {
            toast.error(t('settingsDetail.users.statusUpdateFailed'))
        }
    }

    async function handleResendInvite(employeeId: string, name: string) {
        try {
            await resendInvite.mutateAsync(employeeId)
            toast.success(t('settingsDetail.users.inviteResent', { name }))
        } catch (err) {
            toast.error(err instanceof Error ? err.message : t('settingsDetail.users.resendInviteFailed'))
        }
    }

    return (
        <PageWrapper>
            <PageHeader
                title={t('settings.users')}
                description={t('settingsDetail.users.pageDesc')}
                actions={
                    <div className="flex items-center gap-2 flex-wrap">
                        <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<KeyRound className="size-3.5" />}
                            onClick={() => setManageRoles({ open: true, initialRole: 'super_admin' })}
                        >
                            {t('settingsDetail.users.manageRoles')}
                        </Button>
                        {canManageUsers && (
                            <Button
                                size="sm"
                                leftIcon={<Plus className="size-3.5" />}
                                onClick={() => setShowInvite(true)}
                            >
                                {t('settingsDetail.users.grantAccess')}
                            </Button>
                        )}
                    </div>
                }
            />

            <div className="space-y-6">
                {/* ── User List ─────────────────────────────────────────── */}
                <section className="space-y-3">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <div>
                            <h2 className="text-sm font-semibold">{t('settingsDetail.users.usersTitle')}</h2>
                            <p className="text-xs text-muted-foreground">{t('settingsDetail.users.usersDesc')}</p>
                        </div>
                        {!isLoading && allUsers.length > 0 && (
                            <p className="text-[11px] text-muted-foreground tabular-nums">
                                {t('settingsDetail.users.usersCount', { filtered: filteredUsers.length, total: allUsers.length })}
                            </p>
                        )}
                    </div>

                    {/* Filter toolbar */}
                    {!isLoading && allUsers.length > 0 && (
                        <div className="rounded-lg border bg-muted/20 p-2.5 space-y-2.5">
                            {/* Row 1: search */}
                            <div className="relative">
                                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                                <Input
                                    className="ps-8 h-8 text-sm bg-background"
                                    placeholder={t('settingsDetail.users.searchUsersPlaceholder')}
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                            {/* Row 2: role + status pills */}
                            <div className="flex items-center gap-2 flex-wrap">
                                <FilterChip
                                    label={t('common.all')}
                                    active={roleFilter === null}
                                    onClick={() => setRoleFilter(null)}
                                />
                                {ALL_ROLES.map((r) => (
                                    <FilterChip
                                        key={r}
                                        label={ROLE_LABEL[r]}
                                        active={roleFilter === r}
                                        onClick={() => setRoleFilter(r)}
                                        accentClassName={ROLE_BADGE_STYLE[r]}
                                    />
                                ))}
                                <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                                <StatusFilterChip
                                    label={t('common.all')}
                                    active={statusFilter === 'all'}
                                    onClick={() => setStatusFilter('all')}
                                />
                                <StatusFilterChip
                                    label={t('common.active')}
                                    active={statusFilter === 'active'}
                                    tone="emerald"
                                    onClick={() => setStatusFilter('active')}
                                />
                                <StatusFilterChip
                                    label={t('common.inactive')}
                                    active={statusFilter === 'inactive'}
                                    tone="slate"
                                    onClick={() => setStatusFilter('inactive')}
                                />
                                {hasActiveFilters && (
                                    <button
                                        type="button"
                                        onClick={clearFilters}
                                        className="ml-auto text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors"
                                    >
                                        {t('common.clear')}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {isLoading ? (
                        <div className="divide-y border rounded-lg">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                                    <Skeleton className="size-9 rounded-full" />
                                    <div className="space-y-1 flex-1">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : allUsers.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground border rounded-lg">
                            <Users className="size-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">{t('settingsDetail.users.noUsersFound')}</p>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground border rounded-lg space-y-3">
                            <Search className="size-8 mx-auto opacity-30" />
                            <p className="text-sm">{t('settingsDetail.users.noUsersMatch')}</p>
                            <Button variant="outline" size="sm" onClick={clearFilters}>
                                {t('common.clear')}
                            </Button>
                        </div>
                    ) : (
                        <div className="divide-y border rounded-lg overflow-hidden">
                            {filteredUsers.map((u) => {
                                const isSelf = u.id === me?.id
                                return (
                                    <div key={u.id} className={cn(
                                        'flex items-center justify-between gap-3 px-4 py-3 transition-colors',
                                        u.isActive ? 'hover:bg-muted/30' : 'bg-muted/20 opacity-70',
                                    )}>
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <Avatar className="size-9 shrink-0">
                                                {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.name} />}
                                                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                                    {initials(u.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-medium truncate">{u.name}</p>
                                                    {isSelf && (
                                                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                                            {t('settingsDetail.users.youLabel')}
                                                        </span>
                                                    )}
                                                    {!u.isActive && (
                                                        <Badge variant="secondary" className="text-[10px]">{t('common.inactive')}</Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5 flex-wrap">
                                                    <CopyableEmail email={u.email} className="text-xs text-muted-foreground" />
                                                    {(u.designation || u.department) && (
                                                        <>
                                                            <span aria-hidden className="opacity-50">·</span>
                                                            <span className="opacity-80 truncate">
                                                                {[u.designation, u.department].filter(Boolean).join(' · ')}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2.5 shrink-0 flex-wrap justify-end">
                                            <span
                                                className="hidden md:inline text-[11px] text-muted-foreground tabular-nums"
                                                title={u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : undefined}
                                            >
                                                {formatLastLogin(u.lastLoginAt, t)}
                                            </span>

                                            {/* Feature switches — small icon chips so HR can see
                                                punch / manual-entry state at a glance without
                                                opening Manage Access. Green = on, slate = off.
                                                Tooltip surfaces the long-form label on hover. */}
                                            <FeatureFlagChip
                                                icon={Timer}
                                                enabled={u.attendancePunchEnabled !== false}
                                                onLabel={t('settingsDetail.users.flagPunchOn', { defaultValue: 'Self check-in / check-out enabled' })}
                                                offLabel={t('settingsDetail.users.flagPunchOff', { defaultValue: 'Self check-in / check-out disabled' })}
                                            />
                                            <FeatureFlagChip
                                                icon={Pencil}
                                                enabled={u.attendanceManualEntryEnabled !== false}
                                                onLabel={t('settingsDetail.users.flagManualOn', { defaultValue: 'Manual attendance entry enabled' })}
                                                offLabel={t('settingsDetail.users.flagManualOff', { defaultValue: 'Manual attendance entry disabled' })}
                                            />

                                            {/* Roles popover — click to see the full assigned set.
                                                Keeps the row tidy when employees stack many roles. */}
                                            <RolesPopoverButton
                                                roles={(u.roles?.length ? u.roles : [u.role]) as string[]}
                                            />

                                            {canManageUsers && !isSelf ? (
                                                <Button
                                                    variant="info"
                                                    size="icon"
                                                    className="size-8"
                                                    title={t('settingsDetail.users.manageAccess', 'Manage Access')}
                                                    aria-label={t('settingsDetail.users.manageAccess', 'Manage Access')}
                                                    onClick={() => setAccessTarget(u)}
                                                >
                                                    <Shield className="size-4" />
                                                </Button>
                                            ) : (
                                                <Badge variant="secondary" className="text-[10px]">
                                                    {isSelf
                                                        ? t('settingsDetail.users.youLabel')
                                                        : t('settingsDetail.users.readOnly', 'Read-only')}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </section>

                {/* ── Roles summary ─ click to inspect ───────────────────── */}
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Shield className="size-4 text-muted-foreground" />
                            <div>
                                <h2 className="text-sm font-semibold">{t('settingsDetail.users.rolesPermissionsTitle')}</h2>
                                <p className="text-xs text-muted-foreground">{t('settingsDetail.users.rolesPermissionsDesc')}</p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-primary hover:bg-primary/10"
                            leftIcon={<KeyRound className="size-3.5" />}
                            onClick={() => setManageRoles({ open: true, initialRole: 'super_admin' })}
                        >
                            {t('settingsDetail.users.manageRoles')}
                        </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                        {ALL_ROLES.map((r) => {
                            const count = matrix[r]?.length ?? 0
                            const assigned = allUsers.filter((u: TenantUser) => {
                                const userRoles = u.roles?.length ? u.roles : [u.role]
                                return userRoles.includes(r)
                            }).length
                            return (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setManageRoles({ open: true, initialRole: r })}
                                    className="text-start rounded-lg border p-3.5 hover:border-primary/40 hover:bg-muted/30 transition-colors group"
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={cn(
                                            'text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0',
                                            ROLE_BADGE_STYLE[r],
                                        )}>
                                            {ROLE_LABEL[r]}
                                        </span>
                                        <span className="ml-auto text-[10px] text-muted-foreground group-hover:text-foreground transition-colors">
                                            {t('settingsDetail.users.viewDetails')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                        {t(`settingsDetail.users.roleDesc.${r}`)}
                                    </p>
                                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                                        <span className="inline-flex items-center gap-1">
                                            <KeyRound className="size-3" />
                                            {t('settingsDetail.users.permissionCount', { count })}
                                        </span>
                                        <span className="inline-flex items-center gap-1">
                                            <Users className="size-3" />
                                            {t('settingsDetail.users.usersAssignedCount', { count: assigned })}
                                        </span>
                                    </div>
                                </button>
                            )
                        })}
                    </div>
                </section>
            </div>

            <GrantAccessModal open={showInvite} onClose={() => setShowInvite(false)} />
            <ManageRolesModal
                open={manageRoles.open}
                initialRole={manageRoles.initialRole}
                onClose={() => setManageRoles((s) => ({ ...s, open: false }))}
            />
            <ManageUserAccessModal
                user={accessTarget}
                onClose={() => setAccessTarget(null)}
                onResendInvite={(employeeId, name) => handleResendInvite(employeeId, name)}
                onToggleActive={(u) => setDeactivateTarget({ id: u.id, name: u.name, active: u.isActive })}
            />
            <ConfirmDialog
                open={!!deactivateTarget}
                onOpenChange={(v) => { if (!v) setDeactivateTarget(null) }}
                title={deactivateTarget
                    ? t(deactivateTarget.active ? 'settingsDetail.users.deactivateTitle' : 'settingsDetail.users.activateTitle', { name: deactivateTarget.name })
                    : ''}
                description={deactivateTarget
                    ? t(deactivateTarget.active ? 'settingsDetail.users.deactivateDesc' : 'settingsDetail.users.activateDesc', { name: deactivateTarget.name })
                    : ''}
                confirmLabel={updateUser.isPending
                    ? t('settingsDetail.users.saving')
                    : deactivateTarget?.active
                        ? t('settingsDetail.users.deactivate')
                        : t('settingsDetail.users.activate')}
                onConfirm={handleToggleActive}
                variant={deactivateTarget?.active ? 'destructive' : 'success'}
            />
        </PageWrapper>
    )
}

// ─── Small filter-chip primitives (kept local to this page) ──────────────────
function FilterChip({
    label,
    active,
    accentClassName,
    onClick,
}: {
    label: string
    active: boolean
    accentClassName?: string
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors',
                active
                    ? cn(accentClassName ?? 'bg-primary/10 text-primary border-primary/30', 'shadow-sm')
                    : 'bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground',
            )}
        >
            {label}
        </button>
    )
}

function StatusFilterChip({
    label,
    active,
    tone,
    onClick,
}: {
    label: string
    active: boolean
    tone?: 'emerald' | 'slate'
    onClick: () => void
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors inline-flex items-center gap-1',
                active
                    ? tone === 'emerald'
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800'
                        : tone === 'slate'
                            ? 'bg-slate-200 text-slate-700 border-slate-400 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700'
                            : 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-background text-muted-foreground border-border hover:border-foreground/40 hover:text-foreground',
            )}
        >
            {tone && active && (
                <span className={cn(
                    'size-1.5 rounded-full',
                    tone === 'emerald' ? 'bg-emerald-500' : 'bg-slate-400',
                )} />
            )}
            {label}
        </button>
    )
}

// ─── Small row-level components ──────────────────────────────────────────────

/**
 * Compact status chip for the per-user feature switches (attendance check-in,
 * manual entry). Visually:
 *   - enabled  → emerald background + emerald icon + check dot in the corner
 *   - disabled → muted background + muted icon + faint "off" slash
 * Tooltip carries the human label so HR doesn't have to memorise the icons.
 */
function FeatureFlagChip({
    icon: Icon,
    enabled,
    onLabel,
    offLabel,
}: {
    icon: React.ComponentType<{ className?: string }>
    enabled: boolean
    onLabel: string
    offLabel: string
}) {
    return (
        <span
            title={enabled ? onLabel : offLabel}
            aria-label={enabled ? onLabel : offLabel}
            className={cn(
                'relative inline-flex items-center justify-center size-7 rounded-md border transition-colors',
                enabled
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:text-emerald-300'
                    : 'bg-muted/40 border-border text-muted-foreground/60',
            )}
        >
            <Icon className="size-3.5" />
            {enabled ? (
                <span className="absolute -top-1 -right-1 inline-flex size-3 items-center justify-center rounded-full bg-emerald-500 text-white shadow ring-2 ring-background">
                    <Check className="size-2" />
                </span>
            ) : (
                <span className="absolute -top-1 -right-1 inline-flex size-3 items-center justify-center rounded-full bg-muted text-muted-foreground border border-border">
                    <MinusCircle className="size-2" />
                </span>
            )}
        </span>
    )
}

/**
 * Click-to-reveal popover that surfaces a user's full role list. Lives on the
 * row instead of inline chips so HR stays focused on the user's *identity*
 * and can drill into roles only when they need to.
 */
function RolesPopoverButton({ roles }: { roles: string[] }) {
    const { t } = useTranslation()
    if (roles.length === 0) return null
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border bg-background text-[11px] font-medium text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors"
                >
                    <KeyRound className="size-3" />
                    {t('settingsDetail.users.rolesCount', { count: roles.length, defaultValue: '{{count}} role(s)' })}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 p-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 pb-1.5">
                    {t('settingsDetail.users.assignedRoles', { defaultValue: 'Assigned roles' })}
                </p>
                <div className="flex flex-col gap-1">
                    {roles.map((r) => (
                        <span
                            key={r}
                            className={cn(
                                'text-[11px] font-semibold px-2 py-1 rounded-md border',
                                ROLE_BADGE_STYLE[r as UserRole] ?? 'bg-muted text-muted-foreground border-border',
                            )}
                        >
                            {ROLE_LABEL[r as UserRole] ?? r}
                        </span>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    )
}

// ─── Per-user Manage Access modal ────────────────────────────────────────────
//
// Mirrors the InviteEmployeeDialog pattern used on EmployeeDetailPage: opens
// against a single user, shows the access summary, and consolidates role +
// active-state edits into one focused surface. The row remains read-only —
// HR opens this modal whenever they want to *change* anything.

function ManageUserAccessModal({
    user,
    onClose,
    onResendInvite,
    onToggleActive,
}: {
    user: TenantUser | null
    onClose: () => void
    onResendInvite: (employeeId: string, name: string) => void
    onToggleActive: (u: TenantUser) => void
}) {
    const { t } = useTranslation()
    const updateUser = useUpdateUser()
    const callerRole = useAuthStore(s => s.user?.role)
    const callerIsSuperAdmin = callerRole === 'super_admin'
    const availableOptions = callerIsSuperAdmin ? MULTI_ROLE_OPTIONS_WITH_SUPER : MULTI_ROLE_OPTIONS

    // Local draft of the user's roles. Reset whenever the modal target changes
    // (different user clicked) — using a "lastSyncedId" sentinel rather than
    // useEffect to avoid the double-render.
    const initialRoles = useMemo<string[]>(
        () => (user?.roles?.length ? user.roles : user?.role ? [user.role] : ['employee']),
        [user],
    )
    const [draftRoles, setDraftRoles] = useState<string[]>(initialRoles)
    const initialPunchEnabled = user?.attendancePunchEnabled ?? true
    const initialManualEnabled = user?.attendanceManualEntryEnabled ?? true
    const [draftPunchEnabled, setDraftPunchEnabled] = useState<boolean>(initialPunchEnabled)
    const [draftManualEnabled, setDraftManualEnabled] = useState<boolean>(initialManualEnabled)
    const [syncedId, setSyncedId] = useState<string | null>(null)
    if (user && user.id !== syncedId) {
        setSyncedId(user.id)
        setDraftRoles(initialRoles)
        setDraftPunchEnabled(user.attendancePunchEnabled ?? true)
        setDraftManualEnabled(user.attendanceManualEntryEnabled ?? true)
    }

    if (!user) return null

    const rolesDirty = JSON.stringify([...draftRoles].sort()) !== JSON.stringify([...initialRoles].sort())
    const punchDirty = draftPunchEnabled !== initialPunchEnabled
    const manualDirty = draftManualEnabled !== initialManualEnabled
    const isDirty = rolesDirty || punchDirty || manualDirty

    async function handleSave() {
        if (!user) return
        try {
            await updateUser.mutateAsync({
                id: user.id,
                ...(rolesDirty ? { roles: draftRoles, role: draftRoles[0] } : {}),
                ...(punchDirty ? { attendancePunchEnabled: draftPunchEnabled } : {}),
                ...(manualDirty ? { attendanceManualEntryEnabled: draftManualEnabled } : {}),
            })
            toast.success(t('settingsDetail.users.accessUpdated', { defaultValue: 'Access updated' }))
            onClose()
        } catch {
            toast.error(t('settingsDetail.users.rolesUpdateFailed'))
        }
    }

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-lg p-0 overflow-hidden gap-0 max-h-[90vh] flex flex-col">
                {/* Header */}
                <DialogHeader className="px-6 py-5 border-b">
                    <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="size-10 shrink-0">
                            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                {initials(user.name)}
                            </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-sm font-semibold truncate">{user.name}</DialogTitle>
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5">
                                <Mail className="size-3 shrink-0" />
                                {user.email}
                            </p>
                        </div>
                        <Badge
                            variant={user.isActive ? 'success' : 'destructive'}
                            className="text-[10px] shrink-0"
                        >
                            {user.isActive ? t('common.active') : t('common.inactive')}
                        </Badge>
                    </div>
                </DialogHeader>

                {/* Body */}
                <div className="overflow-y-auto px-6 py-5 space-y-5">
                    {/* Meta strip */}
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Clock className="size-3.5 shrink-0" />
                        <span>
                            {t('settingsDetail.users.lastLogin', { defaultValue: 'Last login' })}:{' '}
                            {user.lastLoginAt ? formatDate(user.lastLoginAt) : t('settingsDetail.users.lastLoginNever')}
                        </span>
                    </div>

                    {/* Roles */}
                    <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('settingsDetail.users.assignRoles')}
                        </p>
                        <MultiRoleToggle
                            roles={draftRoles}
                            onChange={setDraftRoles}
                            availableRoles={availableOptions}
                            disabled={updateUser.isPending}
                        />
                    </div>

                    {/* Feature switches — both default ON. Toggling either pushes
                        immediately to the employee portal via /auth/me. */}
                    <div className="space-y-2">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {t('settingsDetail.users.featuresLabel', { defaultValue: 'Features' })}
                        </p>
                        <div className="rounded-lg border bg-muted/20 divide-y">
                            <label
                                htmlFor="punch-switch"
                                className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-medium">
                                        {t('settingsDetail.users.allowSelfPunchTitle', { defaultValue: 'Attendance check-in / check-out' })}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground leading-snug">
                                        {t('settingsDetail.users.allowSelfPunchDesc', { defaultValue: 'When off, the live check-in / check-out buttons are hidden on the employee portal.' })}
                                    </p>
                                </div>
                                <Switch
                                    id="punch-switch"
                                    checked={draftPunchEnabled}
                                    onCheckedChange={setDraftPunchEnabled}
                                    disabled={updateUser.isPending}
                                />
                            </label>
                            <label
                                htmlFor="manual-switch"
                                className="flex items-center justify-between gap-3 px-3 py-2.5 cursor-pointer"
                            >
                                <div className="min-w-0">
                                    <p className="text-sm font-medium">
                                        {t('settingsDetail.users.allowManualEntryTitle', { defaultValue: 'Manual entry' })}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground leading-snug">
                                        {t('settingsDetail.users.allowManualEntryDesc', { defaultValue: 'When off, the back-fill panel that lets the user add a past check-in / check-out is hidden on the employee portal.' })}
                                    </p>
                                </div>
                                <Switch
                                    id="manual-switch"
                                    checked={draftManualEnabled}
                                    onCheckedChange={setDraftManualEnabled}
                                    disabled={updateUser.isPending}
                                />
                            </label>
                        </div>
                    </div>
                </div>

                {/* Footer — destructive actions on the left, primary on the right */}
                <div className="flex items-center justify-between gap-2 px-6 py-4 border-t bg-muted/30">
                    <div className="flex items-center gap-2">
                        {!user.isActive && (
                            <Button
                                size="sm"
                                variant="ghost"
                                className="text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                                leftIcon={<MailCheck className="size-3.5" />}
                                onClick={() => onResendInvite(user.employeeId, user.name)}
                            >
                                {t('settingsDetail.users.resendInvite')}
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant={user.isActive ? 'destructive' : 'success'}
                            leftIcon={user.isActive
                                ? <ShieldOff className="size-3.5" />
                                : <ShieldCheck className="size-3.5" />}
                            onClick={() => onToggleActive(user)}
                        >
                            {user.isActive
                                ? t('settingsDetail.users.deactivate')
                                : t('settingsDetail.users.activate')}
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={onClose}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            size="sm"
                            disabled={!isDirty || draftRoles.length === 0}
                            loading={updateUser.isPending}
                            onClick={handleSave}
                        >
                            {t('common.save')}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
