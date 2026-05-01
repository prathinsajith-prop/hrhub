import React, { useState, useMemo } from 'react'
import { Users, Plus, XCircle, CheckCircle2, UserCircle, Search, Send, MailCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast, ConfirmDialog } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'
import { useTenantUsers, useUpdateUser, useInvitableEmployees, useInviteUser, useResendInvite, type InvitableEmployee } from '@/hooks/useSettings'
import { usePermissions } from '@/hooks/usePermissions'
import { labelFor } from '@/lib/enums'
import { Card, Section } from './_shared'
import { CopyableEmail } from '@/components/shared'

// ─── Role access map ──────────────────────────────────────────────────────────
const ROLE_ACCESS_MAP: Record<string, string[]> = {
    super_admin: ['All modules', 'Settings', 'Users', 'Audit log'],
    hr_manager: ['Employees', 'Leave', 'Recruitment', 'Onboarding', 'Payroll', 'Reports'],
    pro_officer: ['Visa', 'Documents', 'Compliance'],
    dept_head: ['Onboarding', 'Leave approval', 'Attendance', 'Performance'],
    employee: ['Own leave', 'Own attendance', 'Own performance'],
}

const ALL_ROLES = [
    { id: 'super_admin', label: 'Super Admin' },
    { id: 'hr_manager', label: 'HR Manager' },
    { id: 'pro_officer', label: 'PRO Officer' },
    { id: 'dept_head', label: 'Department Manager' },
    { id: 'employee', label: 'Employee' },
]

const INVITE_ROLES = ALL_ROLES.filter(r => r.id !== 'super_admin')

// ─── Employee Picker ──────────────────────────────────────────────────────────
function EmployeePicker({
    selected,
    onSelect,
    employees,
    isLoading,
}: {
    selected: InvitableEmployee | null
    onSelect: (emp: InvitableEmployee | null) => void
    employees: InvitableEmployee[]
    isLoading: boolean
}) {
    const [search, setSearch] = useState('')
    const filtered = useMemo(() => {
        const q = search.toLowerCase()
        return employees.filter(
            (e) =>
                e.fullName.toLowerCase().includes(q) ||
                (e.department ?? '').toLowerCase().includes(q) ||
                (e.designation ?? '').toLowerCase().includes(q) ||
                (e.employeeNo ?? '').toLowerCase().includes(q),
        )
    }, [employees, search])

    if (selected) {
        return (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                <Avatar className="h-8 w-8 shrink-0">
                    {selected.avatarUrl && <AvatarImage src={selected.avatarUrl} alt={selected.fullName} />}
                    <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                        {selected.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selected.fullName}</p>
                    <p className="text-xs text-muted-foreground truncate">{selected.inviteEmail ?? 'No email on file'}</p>
                </div>
                <Button variant="ghost" size="sm" className="h-7 text-xs shrink-0" onClick={() => onSelect(null)}>
                    Change
                </Button>
            </div>
        )
    }

    return (
        <div className="space-y-2">
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
            <div className="max-h-52 overflow-y-auto rounded-lg border divide-y">
                {isLoading ? (
                    [1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                            <div className="space-y-1 flex-1">
                                <Skeleton className="h-3.5 w-28" />
                                <Skeleton className="h-3 w-40" />
                            </div>
                        </div>
                    ))
                ) : filtered.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                        {employees.length === 0 ? 'All employees already have accounts' : 'No matching employees'}
                    </div>
                ) : (
                    filtered.map((emp) => (
                        <button
                            key={emp.id}
                            type="button"
                            onClick={() => onSelect(emp)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors text-start"
                        >
                            <Avatar className="h-8 w-8 shrink-0">
                                {emp.avatarUrl && <AvatarImage src={emp.avatarUrl} alt={emp.fullName} />}
                                <AvatarFallback className="text-xs bg-primary/10 text-primary font-bold">
                                    {emp.fullName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
                                </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{emp.fullName}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                    {[emp.designation, emp.department].filter(Boolean).join(' · ')}
                                    {emp.inviteEmail && <span className="ml-1.5 opacity-70">{emp.inviteEmail}</span>}
                                </p>
                            </div>
                            {!emp.inviteEmail && (
                                <Badge variant="secondary" className="text-[9px] shrink-0">No email</Badge>
                            )}
                        </button>
                    ))
                )}
            </div>
        </div>
    )
}

// ─── Invite Panel ─────────────────────────────────────────────────────────────
function InvitePanel({ onClose }: { onClose: () => void }) {
    const { data: invitableEmployees = [], isLoading: loadingEmployees } = useInvitableEmployees()
    const inviteUser = useInviteUser()
    const [selected, setSelected] = useState<InvitableEmployee | null>(null)
    const [role, setRole] = useState('hr_manager')

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!selected) return
        if (!selected.inviteEmail) {
            toast.error('This employee has no email address. Add one to their profile first.')
            return
        }
        try {
            await inviteUser.mutateAsync({ employeeId: selected.id, role })
            toast.success(`Invitation sent to ${selected.inviteEmail}`)
            onClose()
        } catch (err: any) {
            toast.error(err?.message ?? 'Failed to send invitation')
        }
    }

    return (
        <Card className="bg-muted/30">
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Invite Employee</h3>
                    <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Employee</p>
                        <EmployeePicker
                            selected={selected}
                            onSelect={setSelected}
                            employees={invitableEmployees}
                            isLoading={loadingEmployees}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Role</p>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
                        >
                            {INVITE_ROLES.map((r) => (
                                <option key={r.id} value={r.id}>{r.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end">
                        <Button
                            type="submit"
                            disabled={!selected || !selected.inviteEmail || inviteUser.isPending}
                            leftIcon={<Send className="h-3.5 w-3.5" />}
                        >
                            {inviteUser.isPending ? 'Sending…' : 'Send Invitation'}
                        </Button>
                    </div>
                </form>
            </div>
        </Card>
    )
}

// ─── Members Tab ──────────────────────────────────────────────────────────────
export function MembersTab() {
    const me = useAuthStore(s => s.user)
    const { can } = usePermissions()
    const canManageUsers = can('manage_users')
    const { data: tenantUsers, isLoading } = useTenantUsers()
    const updateUser = useUpdateUser()
    const resendInvite = useResendInvite()
    const [showInvite, setShowInvite] = useState(false)
    const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string; active: boolean } | null>(null)

    async function handleRoleChange(userId: string, newRole: string) {
        try {
            await updateUser.mutateAsync({ id: userId, role: newRole })
            toast.success('Role updated')
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
            toast.error('Failed to update user')
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
        <div className="space-y-5">
            {canManageUsers && showInvite && (
                <InvitePanel onClose={() => setShowInvite(false)} />
            )}

            <Section
                icon={Users}
                title="Users"
                description="Manage roles and access for all workspace users"
                action={canManageUsers && !showInvite ? (
                    <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowInvite(true)}>
                        Invite
                    </Button>
                ) : undefined}
            >
                {isLoading ? (
                    <div className="divide-y border rounded-lg">
                        {[1, 2, 3].map(n => (
                            <div key={n} className="flex items-center gap-3 px-4 py-3.5">
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
                            const isSuperAdmin = u.role === 'super_admin'
                            const callerIsSuperAdmin = me?.role === 'super_admin'
                            // hr_manager cannot edit super_admin users at all
                            const canEditThisUser = canManageUsers && !isSelf && (callerIsSuperAdmin || !isSuperAdmin)
                            // roles available depend on caller's own role
                            const availableRoles = callerIsSuperAdmin ? ALL_ROLES : INVITE_ROLES
                            // true pending invite = has account but never logged in; deactivated = had access, now revoked
                            const isPendingInvite = !u.isActive && !u.lastLoginAt
                            const isDeactivated = !u.isActive && !!u.lastLoginAt
                            return (
                                <div
                                    key={u.id}
                                    className={cn(
                                        'flex items-center justify-between gap-3 px-4 py-3 transition-colors',
                                        u.isActive ? 'hover:bg-muted/30' : 'bg-muted/20 opacity-60',
                                    )}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <Avatar className="h-9 w-9 shrink-0">
                                            {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.name} />}
                                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                                {u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium truncate">{u.name}</p>
                                                {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
                                                {!u.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate">
                                                <CopyableEmail email={u.email} className="text-xs text-muted-foreground" />
                                                {u.department && <span className="ml-1.5 opacity-70">· {u.department}</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2.5 shrink-0">
                                        {canEditThisUser ? (
                                            <select
                                                value={u.role}
                                                onChange={e => handleRoleChange(u.id, e.target.value)}
                                                className="h-7 rounded-md border border-input bg-background px-2 py-0 text-xs font-medium"
                                                disabled={updateUser.isPending}
                                            >
                                                {availableRoles.map(r => (
                                                    <option key={r.id} value={r.id}>{r.label}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <Badge variant="outline" className="text-xs capitalize">{labelFor(u.role)}</Badge>
                                        )}

                                        {canEditThisUser && isPendingInvite && (
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

                                        {canEditThisUser && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                title={isDeactivated ? 'Restore access' : u.isActive ? 'Revoke access' : 'Restore access'}
                                                className={cn('h-7 text-xs', u.isActive ? 'text-destructive hover:text-destructive hover:bg-destructive/10' : 'text-emerald-600 hover:bg-emerald-50')}
                                                onClick={() => setDeactivateTarget({ id: u.id, name: u.name, active: u.isActive })}
                                            >
                                                {u.isActive ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </Section>

            {/* Roles reference */}
            <Section icon={UserCircle} title="Roles & Permissions" description="Access levels for each role in this workspace">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {Object.entries(ROLE_ACCESS_MAP).map(([roleId, accesses]) => (
                        <div key={roleId} className="rounded-lg border p-4 hover:border-primary/30 hover:bg-muted/20 transition-colors">
                            <p className="text-sm font-semibold mb-1.5 capitalize">{labelFor(roleId)}</p>
                            <div className="flex flex-wrap gap-1">
                                {accesses.map(a => (
                                    <span key={a} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{a}</span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </Section>

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
        </div>
    )
}
