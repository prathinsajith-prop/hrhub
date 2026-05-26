import { useState, useMemo, type KeyboardEvent } from 'react'
import {
    Users, Plus, CheckCircle2, Shield, ShieldOff, ShieldCheck,
    Search, MailCheck, UserPlus, Check, Mail, Clock,
    AlertCircle, MinusCircle, KeyRound, Timer, Pencil, UserX, UserCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
import { useOrgUnits, type OrgUnit } from '@/hooks/useOrgUnits'
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

/**
 * Build a "branch → division → department" path string for a leaf
 * department name by walking the org-unit parent chain. Returns the bare
 * department name if no ancestors are found, or `null` when the input
 * isn't a known department.
 *
 * Memoise the returned function at the call site with `useMemo` so we
 * don't rebuild the id-index on every render.
 */
function buildDepartmentPathLookup(orgUnits: OrgUnit[]): (departmentName: string | null | undefined) => string | null {
    const byId = new Map<string, OrgUnit>()
    for (const u of orgUnits) byId.set(u.id, u)
    // The user model carries `department` as a string — match by name so we
    // don't need an extra id on the user payload. Tenant-wide unique names
    // for departments is the existing convention.
    const departmentsByName = new Map<string, OrgUnit>()
    for (const u of orgUnits) {
        if (u.type === 'department') departmentsByName.set(u.name.toLowerCase(), u)
    }
    return (departmentName) => {
        if (!departmentName) return null
        const dept = departmentsByName.get(departmentName.toLowerCase())
        if (!dept) return departmentName // not a known department — render as-is
        const chain: string[] = []
        let cursor: OrgUnit | null = dept
        // Walk parents until we hit the root. Cap at 6 hops as a paranoia
        // guard against a malformed cycle in the data.
        for (let i = 0; i < 6 && cursor; i++) {
            chain.unshift(cursor.name)
            cursor = cursor.parentId ? byId.get(cursor.parentId) ?? null : null
        }
        return chain.join(' → ')
    }
}

const ROLE_LABEL: Record<UserRole, string> = {
    super_admin: 'Super Admin',
    hr_manager: 'HR Manager',
    pro_officer: 'PRO Officer',
    dept_head: 'Department Manager',
    employee: 'Employee',
}

/**
 * Inline role-chip row that renders EVERY assignable role and styles the
 * ones the user currently holds as filled badges. Clicking a chip toggles
 * that role for the user — same mutation as the Manage Access modal, just
 * without leaving the list.
 *
 * Constraints enforced inline:
 *   - At least one role must remain selected (last chip is non-clickable).
 *   - When `disabled` is true (read-only viewers, or row belongs to caller)
 *     all chips render as static badges.
 *   - Super Admin chip is only visible when the caller is themselves a
 *     super admin (matches the Manage Access modal's `availableOptions`).
 */
function RoleChipToggleRow({
    user,
    canManage,
    disabled,
}: {
    user: TenantUser
    canManage: boolean
    disabled: boolean
}) {
    const { t } = useTranslation()
    const updateUser = useUpdateUser()
    const callerRole = useAuthStore((s) => s.user?.role)
    const callerIsSuperAdmin = callerRole === 'super_admin'
    const availableOptions = callerIsSuperAdmin ? MULTI_ROLE_OPTIONS_WITH_SUPER : MULTI_ROLE_OPTIONS

    const assigned = useMemo<UserRole[]>(
        () => ((user.roles?.length ? user.roles : [user.role]) as UserRole[]),
        [user.roles, user.role],
    )
    const assignedSet = useMemo(() => new Set(assigned), [assigned])
    const interactive = canManage && !disabled

    async function toggleRole(role: UserRole) {
        const isActive = assignedSet.has(role)
        // Prevent removing the last role — every user must keep at least one.
        if (isActive && assigned.length === 1) {
            toast.error('A user must keep at least one role.')
            return
        }
        const next: UserRole[] = isActive ? assigned.filter((r) => r !== role) : [...assigned, role]
        const optLabel =
            MULTI_ROLE_OPTIONS_WITH_SUPER.find((o) => o.id === role)?.label ?? ROLE_LABEL[role] ?? role
        try {
            await updateUser.mutateAsync({ id: user.id, roles: next, role: next[0] })
            // Errors get auto-toasted via the global MutationCache; success
            // toasts must be explicit so HR sees the action landed. The
            // user's name goes in the toast title and the role in the body
            // so HR knows immediately *who* was changed and *what*.
            const userName = user.name || user.email
            toast.success(
                isActive
                    ? t('settingsDetail.users.roleRemovedTitle', {
                        name: userName, role: optLabel,
                        defaultValue: `${optLabel} removed from ${userName}`,
                    })
                    : t('settingsDetail.users.roleAssignedTitle', {
                        name: userName, role: optLabel,
                        defaultValue: `${optLabel} assigned to ${userName}`,
                    }),
            )
        } catch {
            // No-op — the MutationCache handler already surfaced the error.
        }
    }

    return (
        <div className="flex items-center gap-1 flex-wrap min-w-0">
            {availableOptions.map((opt) => {
                const role = opt.id as UserRole
                const active = assignedSet.has(role)
                const isLastActive = active && assigned.length === 1
                // Static badge when caller can't manage — keeps the visual
                // grammar identical to the editable case so the column never
                // shifts on permission changes.
                if (!interactive) {
                    return active ? (
                        <span
                            key={role}
                            className={cn(
                                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border whitespace-nowrap',
                                ROLE_BADGE_STYLE[role] ?? 'border-border text-foreground/70',
                            )}
                        >
                            {opt.label}
                        </span>
                    ) : null
                }
                return (
                    <button
                        key={role}
                        type="button"
                        onClick={() => void toggleRole(role)}
                        disabled={isLastActive || updateUser.isPending}
                        title={
                            active
                                ? isLastActive
                                    ? 'A user must keep at least one role'
                                    : `Remove ${opt.label}`
                                : `Assign ${opt.label}`
                        }
                        className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border whitespace-nowrap transition-all',
                            active
                                ? cn(
                                    ROLE_BADGE_STYLE[role] ?? 'border-border text-foreground/70',
                                    'shadow-sm',
                                    !isLastActive && 'hover:opacity-70 hover:scale-[0.97]',
                                )
                                : 'border-dashed border-border bg-transparent text-muted-foreground/70 hover:text-foreground hover:border-foreground/40 hover:bg-muted/40',
                            isLastActive && 'cursor-not-allowed opacity-90',
                            updateUser.isPending && 'cursor-progress',
                        )}
                    >
                        {opt.label}
                    </button>
                )
            })}
        </div>
    )
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
    // Org-unit tree is loaded so we can render the user's full
    // branch → division → department path instead of just the leaf name.
    // Cached at 5min so it doesn't refetch when switching tabs.
    const { data: orgUnits = [] } = useOrgUnits()
    const departmentPath = useMemo(() => buildDepartmentPathLookup(orgUnits), [orgUnits])
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
                                // Resolve the user's full org path (Branch → Division → Department)
                                // so the row carries hierarchy context instead of just the leaf
                                // department name. Falls back to the bare department name when
                                // the user sits at the root or the unit hasn't loaded yet.
                                const fullPath = departmentPath(u.department) ?? u.department ?? null
                                // Whole-row click opens the Manage Access modal — the
                                // same destination as the shield button. Saves HR from
                                // having to hit the tiny icon target. Gated by the
                                // same permission as the button (can-manage + not-self)
                                // so read-only viewers and the user's own row stay
                                // inert. Inline interactive elements (role chips, the
                                // shield button, the email-copy control) stop
                                // propagation in their own handlers, so the row click
                                // only fires from "dead space".
                                const rowClickable = canManageUsers && !isSelf
                                const openAccess = () => { if (rowClickable) setAccessTarget(u) }
                                // Only wire interactive props when the row is
                                // clickable. Always-on handlers tripped the
                                // `no-static-element-interactions` lint even though
                                // they short-circuited internally — and conceptually,
                                // a non-clickable row shouldn't claim keyboard /
                                // mouse semantics at all.
                                const interactiveProps = rowClickable ? {
                                    role: 'button' as const,
                                    tabIndex: 0,
                                    onClick: openAccess,
                                    onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            // Skip when focus is inside an interactive
                                            // child (chip / button / link) — let that
                                            // element own the key event.
                                            if (e.target !== e.currentTarget) return
                                            e.preventDefault()
                                            openAccess()
                                        }
                                    },
                                } : {}
                                return (
                                    <div
                                        key={u.id}
                                        {...interactiveProps}
                                        className={cn(
                                        // Three-column row: identity (left, flex) — roles (middle,
                                        // flex) — actions (right, intrinsic). The middle column
                                        // surfaces every assigned role inline so HR can scan
                                        // who-has-what without opening a popover.
                                        'grid items-center gap-4 px-4 py-3 transition-colors',
                                        'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]',
                                        u.isActive ? 'hover:bg-muted/30' : 'bg-muted/20 opacity-70',
                                        rowClickable && 'cursor-pointer focus:bg-muted/40 focus:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                                    )}>
                                        {/* ── Left: identity ─────────────────────────────────── */}
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Avatar className="size-9 shrink-0">
                                                {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.name} />}
                                                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                                    {initials(u.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0 flex-1">
                                                {/* Name line — name on the left, status icon
                                                    cluster on the right. A thin vertical bar
                                                    visually separates the two so the cluster
                                                    reads as "status of THIS user" and never
                                                    bleeds into the email/path subline below.
                                                    Icons collapse into a tight 1px gap so two
                                                    chips look like one unit, not two ornaments. */}
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-medium truncate">{u.name}</p>
                                                    {isSelf && (
                                                        <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                                            {t('settingsDetail.users.youLabel')}
                                                        </span>
                                                    )}
                                                    <span aria-hidden className="h-3.5 w-px bg-border/60" />
                                                    <span className="inline-flex items-center gap-1">
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
                                                        {/* Active/inactive uses the same visual
                                                            grammar as the feature flags — a 5x5
                                                            ring-pill. Both states render so HR
                                                            can confirm at a glance: emerald
                                                            check = active, rose X = inactive.
                                                            Hiding the active state used to feel
                                                            "clean" but it left HR inferring
                                                            health from absence, which is the
                                                            opposite of self-evident. */}
                                                        <span
                                                            title={u.isActive ? (t('common.active') as string) : (t('common.inactive') as string)}
                                                            aria-label={u.isActive ? (t('common.active') as string) : (t('common.inactive') as string)}
                                                            className={cn(
                                                                'inline-flex items-center justify-center size-5 rounded-md ring-1',
                                                                u.isActive
                                                                    ? 'bg-emerald-50 text-emerald-600 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900/60'
                                                                    : 'bg-rose-50 text-rose-600 ring-rose-200/70 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-900/60',
                                                            )}
                                                        >
                                                            {u.isActive ? <UserCheck className="size-3" /> : <UserX className="size-3" />}
                                                        </span>
                                                    </span>
                                                </div>
                                                {/* Email + designation + full org path.
                                                    CopyableEmail's copy button is an interactive
                                                    target — wrap in stopPropagation so copying
                                                    the email doesn't also trigger the row-level
                                                    open-Manage-Access click. */}
                                                <div className="text-xs text-muted-foreground truncate flex items-center gap-1.5 flex-wrap">
                                                    <span onClick={(e) => e.stopPropagation()}>
                                                        <CopyableEmail email={u.email} className="text-xs text-muted-foreground" />
                                                    </span>
                                                    {u.designation && (
                                                        <>
                                                            <span aria-hidden className="opacity-50">·</span>
                                                            <span className="opacity-80 truncate">{u.designation}</span>
                                                        </>
                                                    )}
                                                    {fullPath && (
                                                        <>
                                                            <span aria-hidden className="opacity-50">·</span>
                                                            <span className="opacity-80 truncate" title={fullPath}>{fullPath}</span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── Middle: every assignable role as a toggle chip ─
                                             Filled = assigned, dashed-outline = unassigned. Click
                                             a chip to flip its state — same backend mutation as
                                             the Manage Access modal. Hidden on narrow screens so
                                             the action button can't get pushed off the row. */}
                                        <div className="hidden md:flex min-w-0" onClick={(e) => e.stopPropagation()}>
                                            <RoleChipToggleRow
                                                user={u}
                                                canManage={canManageUsers}
                                                disabled={isSelf}
                                            />
                                        </div>

                                        {/* ── Right: status chips + last-login + manage-access ────
                                             Status icons (self-punch / manual entry) and the
                                             Inactive badge live here, grouped with the action
                                             button so HR scans "state + controls" in one place.
                                             stopPropagation: clicks inside this cluster
                                             (shield button, future per-icon controls) should
                                             NOT also fire the row-level "open Manage Access"
                                             — the shield already targets the same modal,
                                             and a double-trigger feels janky. */}
                                        <div
                                            className="flex items-center gap-2.5 shrink-0 flex-wrap justify-end"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {/* Last-login is purely informational — kept compact
                                                so the action button stays the dominant element. */}
                                            <span
                                                className="hidden md:inline text-[11px] text-muted-foreground tabular-nums"
                                                title={u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : undefined}
                                            >
                                                {formatLastLogin(u.lastLoginAt, t)}
                                            </span>

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
    // Single visual signal — colour fill — to show state. The old design
    // layered a tiny absolute-positioned check / minus dot on top of every
    // icon, which made a row of two chips read as "what are all these dots?"
    // before HR could parse the actual icon. One signal per chip is enough:
    // emerald = enabled, muted = disabled. Tooltip carries the precise
    // meaning for anyone who hovers.
    return (
        <span
            title={enabled ? onLabel : offLabel}
            aria-label={enabled ? onLabel : offLabel}
            className={cn(
                'inline-flex items-center justify-center size-5 rounded-md transition-colors ring-1',
                enabled
                    ? 'bg-emerald-50 text-emerald-600 ring-emerald-200/70 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-900/60'
                    : 'bg-muted/30 text-muted-foreground/50 ring-border/60',
            )}
        >
            <Icon className="size-3" />
        </span>
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
                {/* Header — identity block.
                    The active/inactive indicator went through two iterations:
                    first as a chunky pill in the top-right corner (clashed
                    with the X close); then as a dot-chip inline with the
                    name (got pushed off-screen when the name was long).
                    Final form is a small absolute-positioned status dot
                    on the avatar — the universal "online indicator" pattern
                    from chat apps. It's instantly readable, never collides
                    with the close button, and survives any name length. The
                    Last login meta strip in the body re-states "Active"/
                    "Inactive" in words for users who want the explicit
                    label rather than the colour cue. */}
                <DialogHeader className="px-6 py-5 border-b">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="relative shrink-0">
                            <Avatar className="size-10">
                                {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
                                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                    {initials(user.name)}
                                </AvatarFallback>
                            </Avatar>
                            <span
                                title={user.isActive ? (t('common.active') as string) : (t('common.inactive') as string)}
                                aria-label={user.isActive ? (t('common.active') as string) : (t('common.inactive') as string)}
                                className={cn(
                                    'absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-background',
                                    user.isActive ? 'bg-emerald-500' : 'bg-rose-500',
                                )}
                            />
                        </div>
                        <div className="min-w-0 flex-1">
                            <DialogTitle className="text-sm font-semibold truncate">
                                {user.name}
                            </DialogTitle>
                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1.5 mt-0.5">
                                <Mail className="size-3 shrink-0" />
                                <span className="truncate">{user.email}</span>
                            </p>
                        </div>
                    </div>
                </DialogHeader>

                {/* Body */}
                <div className="overflow-y-auto px-6 py-5 space-y-5">
                    {/* Meta strip — last login + explicit Active/Inactive
                        label. The avatar dot is the at-a-glance cue; this
                        text is the screen-reader-friendly fallback for
                        anyone who can't (or doesn't want to) parse the
                        colour. Separator dot ties them visually. */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <Clock className="size-3.5 shrink-0" />
                            {t('settingsDetail.users.lastLogin', { defaultValue: 'Last login' })}:{' '}
                            {user.lastLoginAt ? formatDate(user.lastLoginAt) : t('settingsDetail.users.lastLoginNever')}
                        </span>
                        <span aria-hidden className="opacity-40">·</span>
                        <span className="inline-flex items-center gap-1.5">
                            <span
                                className={cn(
                                    'size-1.5 rounded-full',
                                    user.isActive ? 'bg-emerald-500' : 'bg-rose-500',
                                )}
                            />
                            <span className={cn(
                                'font-medium',
                                user.isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400',
                            )}>
                                {user.isActive ? t('common.active') : t('common.inactive')}
                            </span>
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
