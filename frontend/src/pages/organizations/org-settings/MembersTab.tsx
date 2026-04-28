import React, { useState } from 'react'
import { Users, Plus, XCircle, CheckCircle2, UserCircle } from 'lucide-react'
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
import { Card, Section } from './_shared'

// ─── Members Tab ──────────────────────────────────────────────────────────────
const ROLE_ACCESS_MAP: Record<string, string[]> = {
    super_admin: ['All modules', 'Settings', 'Users', 'Audit log'],
    hr_manager: ['Employees', 'Leave', 'Recruitment', 'Onboarding', 'Payroll', 'Reports'],
    pro_officer: ['Visa', 'Documents', 'Compliance'],
    dept_head: ['Onboarding', 'Leave approval', 'Attendance', 'Performance'],
    employee: ['Own leave', 'Own attendance', 'Own performance'],
}

export function MembersTab() {
    const me = useAuthStore(s => s.user)
    const { can } = usePermissions()
    const canManageUsers = can('manage_users')
    const { data: tenantUsers, isLoading } = useTenantUsers()
    const updateUser = useUpdateUser()
    const [showInvite, setShowInvite] = useState(false)
    const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'hr_manager' })
    const [inviting, setInviting] = useState(false)
    const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; name: string; active: boolean } | null>(null)

    const handleInvite = async (e: React.FormEvent) => {
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

    const handleRoleChange = async (userId: string, newRole: string) => {
        try {
            await updateUser.mutateAsync({ id: userId, role: newRole })
            toast.success('Role updated')
        } catch {
            toast.error('Failed to update role')
        }
    }

    const handleToggleActive = async () => {
        if (!deactivateTarget) return
        try {
            await updateUser.mutateAsync({ id: deactivateTarget.id, isActive: !deactivateTarget.active })
            toast.success(deactivateTarget.active ? 'User deactivated' : 'User activated')
            setDeactivateTarget(null)
        } catch {
            toast.error('Failed to update user')
        }
    }

    return (
        <div className="space-y-5">
            {canManageUsers && showInvite && (
                <Card className="bg-muted/30">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">Invite User</h3>
                            <Button variant="ghost" size="sm" onClick={() => setShowInvite(false)}>Cancel</Button>
                        </div>
                        <form onSubmit={handleInvite} className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label htmlFor="inv-name">Full Name</Label>
                                    <Input id="inv-name" value={inviteForm.name} onChange={e => setInviteForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" required />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="inv-email">Email Address</Label>
                                    <Input id="inv-email" type="email" value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@company.com" required />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="inv-role">Role</Label>
                                <select id="inv-role" value={inviteForm.role} onChange={e => setInviteForm(f => ({ ...f, role: e.target.value }))} className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background">
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
                </Card>
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
                        {(tenantUsers ?? []).map((u: any) => {
                            const isSelf = u.id === me?.id
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
                                            <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2.5 shrink-0">
                                        {canManageUsers && !isSelf ? (
                                            <select
                                                value={u.role}
                                                onChange={e => handleRoleChange(u.id, e.target.value)}
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
                                            <Badge variant="outline" className="text-xs capitalize">{labelFor(u.role)}</Badge>
                                        )}
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

            {deactivateTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                    <div className="bg-background border rounded-xl shadow-lg p-6 max-w-sm w-full mx-4 space-y-4">
                        <p className="font-semibold text-sm">
                            {deactivateTarget.active ? 'Deactivate' : 'Activate'} {deactivateTarget.name}?
                        </p>
                        <p className="text-xs text-muted-foreground">
                            {deactivateTarget.active
                                ? 'This user will immediately lose access. They can be reactivated at any time.'
                                : 'This user will regain access to the workspace.'}
                        </p>
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
