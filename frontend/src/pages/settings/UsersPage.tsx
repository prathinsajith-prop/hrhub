import { useState, useMemo } from 'react'
import {
    Users, Plus, XCircle, CheckCircle2, UserCircle, Shield,
    Search, MailCheck, UserPlus, Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'
import {
    useTenantUsers, useUpdateUser, useInvitableEmployees,
    useInviteUserBulk, useResendInvite,
    type InvitableEmployee,
} from '@/hooks/useSettings'
import { usePermissions } from '@/hooks/usePermissions'
import { labelFor } from '@/lib/enums'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { CopyableEmail } from '@/components/shared'

// ─── Constants ────────────────────────────────────────────────────────────────
function formatLastLogin(lastLoginAt: string | null): string {
    if (!lastLoginAt) return 'Never'
    const diff = Date.now() - new Date(lastLoginAt).getTime()
    const hours = Math.floor(diff / 3600000)
    if (hours < 1) return 'Just now'
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return `${Math.floor(days / 7)}w ago`
}

function initials(name: string) {
    return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
}

const ROLES = [
    { id: 'super_admin', label: 'Super Admin', desc: 'Full access to all modules and settings', color: 'text-red-600 bg-red-50' },
    { id: 'hr_manager', label: 'HR Manager', desc: 'Employees, leave, recruitment, onboarding', color: 'text-blue-600 bg-blue-50' },
    { id: 'payroll_officer', label: 'Payroll Officer', desc: 'Payroll runs and WPS submission', color: 'text-emerald-600 bg-emerald-50' },
    { id: 'pro_officer', label: 'PRO Officer', desc: 'Visa, documents, and compliance', color: 'text-primary bg-primary/10' },
    { id: 'employee', label: 'Employee', desc: 'Self-service: leaves, payslips, profile', color: 'text-gray-600 bg-gray-50' },
]

const ROLE_ACCESS_MAP: Record<string, string[]> = {
    super_admin: ['All modules', 'User management', 'Settings', 'Audit logs'],
    hr_manager: ['Employees', 'Recruitment', 'Leave', 'Payroll', 'Onboarding', 'Reports'],
    pro_officer: ['Visa & Compliance', 'Documents', 'Employee view'],
    dept_head: ['Team attendance', 'Leave approval', 'Performance', 'Onboarding'],
    employee: ['Own leave', 'Own attendance', 'Own performance'],
}

const INVITE_ROLES = [
    { id: 'hr_manager', label: 'HR Manager' },
    { id: 'pro_officer', label: 'PRO Officer' },
    { id: 'dept_head', label: 'Department Manager' },
    { id: 'employee', label: 'Employee' },
]

// ─── Grant Access Modal ───────────────────────────────────────────────────────
function GrantAccessModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { data: invitableEmployees = [], isLoading } = useInvitableEmployees({ enabled: open })
    const inviteBulk = useInviteUserBulk()
    const [search, setSearch] = useState('')
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [role, setRole] = useState('employee')

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
        setRole('employee')
        onClose()
    }

    async function handleGrantAccess() {
        const employeeIds = Array.from(selectedIds)
        if (employeeIds.length === 0) return
        try {
            const result = await inviteBulk.mutateAsync({ employeeIds, role })
            const { succeeded, failed } = result
            if (succeeded.length > 0) {
                toast.success(
                    succeeded.length === 1
                        ? `Access granted to ${succeeded[0].name}`
                        : `Access granted to ${succeeded.length} employees`,
                )
            }
            if (failed.length > 0) {
                toast.error(
                    `${failed.length} invite${failed.length > 1 ? 's' : ''} failed`,
                    failed.map((f: { reason: string }) => f.reason).join('; '),
                )
            }
            handleClose()
        } catch (err) {
            toast.error((err as Error)?.message ?? 'Failed to send invitations')
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
                        <UserPlus className="h-4 w-4 text-primary" />
                        Grant Access
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Select employees to invite. Each will receive a secure link to set up their login.
                    </p>
                </DialogHeader>

                <div className="px-5 pt-4 pb-3 border-b bg-muted/30 flex items-center gap-3">
                    <p className="text-xs font-medium text-muted-foreground shrink-0">Assign role</p>
                    <select
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                        className="flex-1 border border-input rounded-md px-3 py-1.5 text-sm bg-background"
                    >
                        {INVITE_ROLES.map((r) => (
                            <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                    </select>
                </div>

                <div className="px-5 pt-3 pb-2 space-y-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                        <Input
                            className="pl-8 h-8 text-sm"
                            placeholder="Search by name, department…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            autoFocus
                        />
                    </div>
                    {!isLoading && invitableEmployees.length > 0 && (
                        <button
                            type="button"
                            onClick={toggleAll}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                            <div className={cn(
                                'h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0',
                                allVisibleSelected ? 'bg-primary border-primary' : 'border-border',
                            )}>
                                {allVisibleSelected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                            </div>
                            {allVisibleSelected ? 'Deselect all' : 'Select all'}
                        </button>
                    )}
                </div>

                <div className="overflow-y-auto max-h-72 px-5 pb-2 divide-y">
                    {isLoading ? (
                        [1, 2, 3, 4].map((i) => (
                            <div key={i} className="flex items-center gap-3 py-2.5">
                                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                                <div className="space-y-1.5 flex-1">
                                    <Skeleton className="h-3.5 w-32" />
                                    <Skeleton className="h-3 w-44" />
                                </div>
                            </div>
                        ))
                    ) : filtered.length === 0 ? (
                        <div className="py-8 text-center text-xs text-muted-foreground">
                            {invitableEmployees.length === 0
                                ? 'All employees already have accounts'
                                : 'No matching employees'}
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
                                    title={noEmail ? 'No email on file — add one to the employee profile first' : undefined}
                                    className={cn(
                                        'w-full flex items-center gap-3 py-2.5 text-start transition-colors',
                                        noEmail ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/30 cursor-pointer',
                                    )}
                                >
                                    <div className={cn(
                                        'h-4 w-4 rounded border flex items-center justify-center shrink-0 transition-colors',
                                        isSelected ? 'bg-primary border-primary' : 'border-border',
                                    )}>
                                        {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                                    </div>
                                    <Avatar className="h-8 w-8 shrink-0">
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
                                        <Badge variant="secondary" className="text-[10px] shrink-0">No email</Badge>
                                    )}
                                </button>
                            )
                        })
                    )}
                </div>

                <div className="px-5 py-4 border-t bg-muted/20 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                        {selectedCount === 0
                            ? 'No employees selected'
                            : `${selectedCount} employee${selectedCount > 1 ? 's' : ''} selected`}
                        {hasEmailless && (
                            <span className="ml-1.5 text-amber-600">(some lack an email)</span>
                        )}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={handleClose}>Cancel</Button>
                        <Button
                            size="sm"
                            disabled={selectedCount === 0 || inviteBulk.isPending}
                            onClick={handleGrantAccess}
                            leftIcon={<UserPlus className="h-3.5 w-3.5" />}
                        >
                            {inviteBulk.isPending
                                ? 'Sending…'
                                : selectedCount > 1
                                    ? `Grant Access (${selectedCount})`
                                    : 'Grant Access'}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function UsersPage() {
    const { can } = usePermissions()
    const { user: me } = useAuthStore()
    const canManageUsers = can('manage_users')
    const { data: tenantUsers, isLoading } = useTenantUsers()
    const updateUser = useUpdateUser()
    const resendInvite = useResendInvite()
    const [showInvite, setShowInvite] = useState(false)
    const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string; active: boolean } | null>(null)

    const getRoleStyle = (role: string) => ROLES.find((r) => r.id === role)?.color ?? 'bg-gray-50 text-gray-600'
    const getRoleLabel = (role: string) => ROLES.find((r) => r.id === role)?.label ?? labelFor(role)

    async function handleRoleChange(userId: string, newRole: string) {
        try {
            await updateUser.mutateAsync({ id: userId, role: newRole })
            toast.success('Role updated successfully')
        } catch {
            toast.error('Failed to update role')
        }
    }

    async function handleToggleActive() {
        if (!deactivateTarget) return
        try {
            await updateUser.mutateAsync({ id: deactivateTarget.id, isActive: !deactivateTarget.active })
            toast.success(deactivateTarget.active ? 'User deactivated' : 'User activated')
            setDeactivateTarget(null)
        } catch {
            toast.error('Failed to update user status')
        }
    }

    async function handleResendInvite(employeeId: string, name: string) {
        try {
            await resendInvite.mutateAsync(employeeId)
            toast.success(`Invite resent to ${name}`)
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to resend invite')
        }
    }

    return (
        <PageWrapper>
            <PageHeader
                title="Users & Roles"
                description="Manage system access, roles, and permissions for your workspace."
                actions={canManageUsers && (
                    <Button
                        size="sm"
                        leftIcon={<Plus className="h-3.5 w-3.5" />}
                        onClick={() => setShowInvite(true)}
                    >
                        Grant Access
                    </Button>
                )}
            />

            <div className="space-y-8">
                {/* ── User List ─────────────────────────────────────────── */}
                <section className="space-y-3">
                    <div>
                        <h2 className="text-sm font-semibold">Users</h2>
                        <p className="text-xs text-muted-foreground">All accounts with access to this workspace.</p>
                    </div>

                    {isLoading ? (
                        <div className="divide-y border rounded-lg">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <div className="space-y-1 flex-1">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (tenantUsers ?? []).length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground border rounded-lg">
                            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No users found</p>
                        </div>
                    ) : (
                        <div className="divide-y border rounded-lg overflow-hidden">
                            {(tenantUsers ?? []).map((u) => {
                                const isSelf = u.id === me?.id
                                return (
                                    <div key={u.id} className={cn(
                                        'flex items-center justify-between gap-3 px-4 py-3 transition-colors',
                                        u.isActive ? 'hover:bg-muted/30' : 'bg-muted/20 opacity-60',
                                    )}>
                                        <div className="flex items-center gap-3 min-w-0">
                                            <Avatar className="h-9 w-9 shrink-0">
                                                {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.name} />}
                                                <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                                    {initials(u.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <p className="text-sm font-medium truncate">{u.name}</p>
                                                    {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
                                                    {!u.isActive && (
                                                        <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    <CopyableEmail email={u.email} className="text-xs text-muted-foreground" />
                                                    {u.department && <span className="ml-1.5 opacity-70">· {u.department}</span>}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2.5 shrink-0 flex-wrap justify-end">
                                            <span className="hidden sm:inline text-xs text-muted-foreground">
                                                {formatLastLogin(u.lastLoginAt)}
                                            </span>

                                            {canManageUsers && !isSelf ? (
                                                <select
                                                    value={u.role}
                                                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                                    className="h-7 rounded-md border border-input bg-background px-2 py-0 text-xs font-medium"
                                                    disabled={updateUser.isPending}
                                                >
                                                    <option value="super_admin">Super Admin</option>
                                                    <option value="hr_manager">HR Manager</option>
                                                    <option value="pro_officer">PRO Officer</option>
                                                    <option value="dept_head">Department Manager</option>
                                                    <option value="employee">Employee</option>
                                                </select>
                                            ) : (
                                                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', getRoleStyle(u.role))}>
                                                    {getRoleLabel(u.role)}
                                                </span>
                                            )}

                                            <span className={cn(
                                                'text-[10px] font-medium px-2 py-0.5 rounded-full',
                                                u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500',
                                            )}>
                                                {u.isActive ? 'Active' : 'Inactive'}
                                            </span>

                                            {canManageUsers && !isSelf && !u.isActive && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-7 text-xs text-sky-600 hover:bg-sky-50"
                                                    title="Resend invite"
                                                    onClick={() => handleResendInvite(u.employeeId, u.name)}
                                                    disabled={resendInvite.isPending}
                                                >
                                                    <MailCheck className="h-3.5 w-3.5" />
                                                </Button>
                                            )}

                                            {canManageUsers && !isSelf && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className={cn('h-7 text-xs', u.isActive
                                                        ? 'text-destructive hover:text-destructive hover:bg-destructive/10'
                                                        : 'text-emerald-600 hover:bg-emerald-50',
                                                    )}
                                                    onClick={() => setDeactivateTarget({ id: u.id, name: u.name, active: u.isActive })}
                                                >
                                                    {u.isActive
                                                        ? <XCircle className="h-3.5 w-3.5" />
                                                        : <CheckCircle2 className="h-3.5 w-3.5" />}
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </section>

                {/* ── Roles & Permissions ───────────────────────────────── */}
                <section className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <div>
                            <h2 className="text-sm font-semibold">Roles & Permissions</h2>
                            <p className="text-xs text-muted-foreground">What each role is allowed to do in this workspace.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {ROLES.map((role) => (
                            <div key={role.id} className="rounded-lg border p-4 hover:border-primary/30 hover:bg-muted/20 transition-colors">
                                <div className="flex items-center gap-2.5 mb-3">
                                    <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', role.color)}>
                                        <UserCircle className="h-4 w-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold leading-tight">{role.label}</p>
                                        <p className="text-[10px] text-muted-foreground">{role.desc}</p>
                                    </div>
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {(ROLE_ACCESS_MAP[role.id] ?? []).map((access) => (
                                        <span key={access} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                            {access}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>

            <GrantAccessModal open={showInvite} onClose={() => setShowInvite(false)} />
            <ConfirmDialog
                open={!!deactivateTarget}
                onOpenChange={(v) => { if (!v) setDeactivateTarget(null) }}
                title={deactivateTarget ? `${deactivateTarget.active ? 'Deactivate' : 'Activate'} ${deactivateTarget.name}?` : ''}
                description={deactivateTarget?.active
                    ? 'This user will immediately lose access. They can be reactivated at any time.'
                    : 'This user will regain access to the workspace.'}
                confirmLabel={updateUser.isPending ? 'Saving…' : deactivateTarget?.active ? 'Deactivate' : 'Activate'}
                onConfirm={handleToggleActive}
                variant={deactivateTarget?.active ? 'destructive' : 'success'}
            />
        </PageWrapper>
    )
}
