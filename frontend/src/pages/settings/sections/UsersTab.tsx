import React, { useState } from 'react'
import { Users, Plus, XCircle, CheckCircle2, UserCircle, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'
import { useTenantUsers, useUpdateUser } from '@/hooks/useSettings'
import { usePermissions } from '@/hooks/usePermissions'
import { labelFor } from '@/lib/enums'
import { api } from '@/lib/api'
import { SettingsCard, Section } from './_shared'

// ─── Users Tab ────────────────────────────────────────────────────────────────
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

const roles = [
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

export function UsersTab() {
    const { can } = usePermissions()
    const { user: me } = useAuthStore()
    const canManageUsers = can('manage_users')
    const { data: tenantUsers, isLoading } = useTenantUsers()
    const updateUser = useUpdateUser()
    const [showInvite, setShowInvite] = useState(false)
    const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'hr_manager' })
    const [inviting, setInviting] = useState(false)
    const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string; active: boolean } | null>(null)

    const getRoleStyle = (role: string) => roles.find((r) => r.id === role)?.color ?? 'bg-gray-50 text-gray-600'
    const getRoleLabel = (role: string) => roles.find((r) => r.id === role)?.label ?? labelFor(role)

    async function handleInvite(e: React.FormEvent) {
        e.preventDefault()
        if (!inviteForm.name || !inviteForm.email) return
        setInviting(true)
        try {
            await api.post('/settings/users/invite', inviteForm)
            toast.success(`Invitation sent to ${inviteForm.email}`)
            setShowInvite(false)
            setInviteForm({ name: '', email: '', role: 'hr_manager' })
        } catch {
            toast.error('Failed to send invitation')
        } finally {
            setInviting(false)
        }
    }

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

    return (
        <div className="space-y-5">
            {canManageUsers && showInvite && (
                <SettingsCard className="bg-muted/30">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">Invite User</h3>
                            <Button variant="ghost" size="sm" onClick={() => setShowInvite(false)}>Cancel</Button>
                        </div>
                        <form onSubmit={handleInvite} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="invite-name">Full Name</Label>
                                    <Input id="invite-name" value={inviteForm.name} onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" required />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="invite-email">Email Address</Label>
                                    <Input id="invite-email" type="email" value={inviteForm.email} onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" required />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="invite-role">Role</Label>
                                <select id="invite-role" value={inviteForm.role} onChange={(e) => setInviteForm((f) => ({ ...f, role: e.target.value }))} className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background">
                                    <option value="hr_manager">HR Manager</option>
                                    <option value="pro_officer">PRO Officer</option>
                                    <option value="dept_head">Department Head</option>
                                    <option value="employee">Employee</option>
                                </select>
                            </div>
                            <div className="flex justify-end">
                                <Button type="submit" disabled={inviting}>{inviting ? 'Sending…' : 'Send Invitation'}</Button>
                            </div>
                        </form>
                    </div>
                </SettingsCard>
            )}

            <Section
                icon={Users}
                title="Users"
                description="Manage roles and access for all workspace users"
                action={canManageUsers && !showInvite && (
                    <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowInvite(true)}>
                        Invite User
                    </Button>
                )}
            >
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
                                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                                {u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="text-sm font-medium truncate">{u.name}</p>
                                                {isSelf && <span className="text-[10px] text-muted-foreground">(you)</span>}
                                                {u.employeeId && (
                                                    <Badge variant="info" className="text-[9px] py-0 px-1.5 h-4 font-medium">
                                                        Employee linked
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2.5 shrink-0 flex-wrap justify-end">
                                        <span className="hidden sm:inline text-xs text-muted-foreground">
                                            {formatLastLogin(u.lastLoginAt)}
                                        </span>

                                        {/* Role — inline edit for managers on non-self rows */}
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
                                                <option value="dept_head">Dept Head</option>
                                                <option value="employee">Employee</option>
                                            </select>
                                        ) : (
                                            <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', getRoleStyle(u.role))}>
                                                {getRoleLabel(u.role)}
                                            </span>
                                        )}

                                        {/* Active badge */}
                                        <span className={cn(
                                            'text-[10px] font-medium px-2 py-0.5 rounded-full',
                                            u.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500',
                                        )}>
                                            {u.isActive ? 'Active' : 'Inactive'}
                                        </span>

                                        {/* Deactivate / Activate toggle */}
                                        {canManageUsers && !isSelf && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
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

            {/* Roles & Permissions reference */}
            <Section
                icon={Shield}
                title="Roles & Permissions"
                description="What each role is allowed to do in this workspace"
            >
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                    {roles.map((role) => (
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
            </Section>

            {/* Deactivate / activate confirm dialog */}
            {deactivateTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-background border rounded-xl shadow-lg p-6 max-w-sm w-full mx-4 space-y-4">
                        <div className="space-y-1">
                            <p className="font-semibold text-sm">
                                {deactivateTarget.active ? 'Deactivate' : 'Activate'} {deactivateTarget.name}?
                            </p>
                            <p className="text-xs text-muted-foreground">
                                {deactivateTarget.active
                                    ? 'This user will immediately lose access. They can be reactivated at any time.'
                                    : 'This user will regain access to the workspace.'}
                            </p>
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" size="sm" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
                            <Button
                                size="sm"
                                variant={deactivateTarget.active ? 'destructive' : 'default'}
                                onClick={handleToggleActive}
                                disabled={updateUser.isPending}
                            >
                                {updateUser.isPending ? 'Saving…' : deactivateTarget.active ? 'Deactivate' : 'Activate'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
