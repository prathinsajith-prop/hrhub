import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Building2,
    Globe,
    Users,
    Shield,
    Save,
    CheckCircle2,
    Plus,
    Trash2,
    XCircle,
    AlertCircle,
    FileText,
    UserCircle,
    ArrowRightLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'
import {
    useCompanySettings,
    useUpdateCompanySettings,
    useTenantUsers,
    useUpdateUser,
    useIpAllowlist,
    useUpdateIpAllowlist,
    useSecuritySettings,
    useUpdateSecuritySettings,
    useRegionalSettings,
    useUpdateRegionalSettings,
} from '@/hooks/useSettings'
import { usePermissions } from '@/hooks/usePermissions'
import type { CompanySettings } from '@/hooks/useSettings'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useNavigate } from 'react-router-dom'
import { useMyTenants, useSwitchTenant } from '@/hooks/useTenants'
import { api } from '@/lib/api'

// ─── Shared layout primitives ─────────────────────────────────────────────────
function Card({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('rounded-xl border bg-card shadow-sm p-5', className)}>
            {children}
        </div>
    )
}

function Section({
    icon: Icon,
    title,
    description,
    action,
    children,
    className,
}: {
    icon: React.ElementType
    title: string
    description?: string
    action?: React.ReactNode
    children?: React.ReactNode
    className?: string
}) {
    return (
        <Card className={className}>
            <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                        <p className="text-sm font-semibold leading-tight">{title}</p>
                        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                    </div>
                </div>
                {action}
            </div>
            {children}
        </Card>
    )
}

// ─── Profile Tab — company identity + regional settings ───────────────────────
function ProfileTab() {
    const { tenant } = useAuthStore()
    const { data: company, isLoading } = useCompanySettings()
    const { data: regional, isLoading: regionalLoading } = useRegionalSettings()
    const updateCompany = useUpdateCompanySettings()
    const updateRegional = useUpdateRegionalSettings()
    const [form, setForm] = useState<Partial<CompanySettings>>({})
    const [regionalForm, setRegionalForm] = useState({ timezone: 'Asia/Dubai', currency: 'AED', dateFormat: 'DD/MM/YYYY' })
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        if (company) setForm({ name: company.name, tradeLicenseNo: company.tradeLicenseNo, jurisdiction: company.jurisdiction, industryType: company.industryType })
    }, [company])

    useEffect(() => {
        if (regional) setRegionalForm({ timezone: regional.timezone, currency: regional.currency, dateFormat: regional.dateFormat })
    }, [regional])

    const set = (field: keyof CompanySettings, value: string) => setForm(p => ({ ...p, [field]: value }))

    const handleSave = async () => {
        try {
            await Promise.all([updateCompany.mutateAsync(form), updateRegional.mutateAsync(regionalForm)])
            setSaved(true)
            toast.success('Settings saved', 'Organization profile updated successfully.')
            setTimeout(() => setSaved(false), 2000)
        } catch {
            toast.error('Save failed', 'Could not update organization profile.')
        }
    }

    if (isLoading) return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>

    return (
        <div className="space-y-5">
            {/* Identity strip */}
            <Card>
                <div className="flex items-center gap-4 pb-5 border-b">
                    <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-base font-semibold shrink-0">
                        {(company?.name ?? tenant?.name ?? 'HR').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{company?.name ?? tenant?.name ?? 'Organization'}</p>
                        <p className="text-sm text-muted-foreground capitalize truncate">
                            {company?.jurisdiction ?? 'UAE'}
                            {company?.industryType ? ` · ${company.industryType.replace(/_/g, ' ')}` : ''}
                        </p>
                    </div>
                    <Badge variant="secondary" className="capitalize shrink-0">
                        {company?.subscriptionPlan ?? 'free'} plan
                    </Badge>
                </div>
                <div className="pt-5 space-y-4">
                    <div>
                        <h3 className="text-sm font-semibold">Company Profile</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Legal name, license, and jurisdiction details</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="org_name">Company Name</Label>
                            <Input id="org_name" value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="trade_license">Trade License No.</Label>
                            <Input id="trade_license" value={form.tradeLicenseNo ?? ''} onChange={e => set('tradeLicenseNo', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="jurisdiction">Jurisdiction</Label>
                            <Input id="jurisdiction" value={form.jurisdiction ?? ''} onChange={e => set('jurisdiction', e.target.value)} placeholder="e.g. Dubai Mainland" />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="industry">Industry Type</Label>
                            <Input id="industry" value={form.industryType ?? ''} onChange={e => set('industryType', e.target.value)} placeholder="e.g. Technology" />
                        </div>
                    </div>
                </div>
            </Card>

            {/* Regional Settings */}
            <Section icon={Globe} title="Regional Settings" description="Defaults applied across the workspace">
                {regionalLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="timezone">Time Zone</Label>
                            <Input id="timezone" value={regionalForm.timezone} onChange={e => setRegionalForm(p => ({ ...p, timezone: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="currency">Currency</Label>
                            <Input id="currency" value={regionalForm.currency} onChange={e => setRegionalForm(p => ({ ...p, currency: e.target.value }))} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="dateFormat">Date Format</Label>
                            <Input id="dateFormat" value={regionalForm.dateFormat} onChange={e => setRegionalForm(p => ({ ...p, dateFormat: e.target.value }))} placeholder="DD/MM/YYYY" />
                        </div>
                    </div>
                )}
            </Section>

            <div className="flex justify-end pt-2">
                <Button
                    onClick={handleSave}
                    loading={updateCompany.isPending || updateRegional.isPending}
                    leftIcon={saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                    variant={saved ? 'success' : 'default'}
                >
                    {saved ? 'Saved!' : 'Save Changes'}
                </Button>
            </div>
        </div>
    )
}

// ─── Members Tab ──────────────────────────────────────────────────────────────
const ROLE_ACCESS_MAP: Record<string, string[]> = {
    super_admin: ['All modules', 'Settings', 'Users', 'Audit log'],
    hr_manager: ['Employees', 'Leave', 'Recruitment', 'Onboarding', 'Payroll', 'Reports'],
    pro_officer: ['Visa', 'Documents', 'Compliance'],
    dept_head: ['Onboarding', 'Leave approval', 'Attendance', 'Performance'],
    employee: ['Own leave', 'Own attendance', 'Own performance'],
}

function MembersTab() {
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
                            <h3 className="text-sm font-semibold">Invite Team Member</h3>
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
                title="Team Members"
                description="Manage roles and access for all workspace members"
                action={canManageUsers && !showInvite ? (
                    <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setShowInvite(true)}>
                        Invite
                    </Button>
                ) : undefined}
            >
                {isLoading ? (
                    <div className="divide-y border rounded-lg">
                        {[1, 2, 3].map(i => (
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
                        <p className="text-sm">No team members found</p>
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
                                            <Badge variant="outline" className="text-xs capitalize">{u.role?.replace('_', ' ')}</Badge>
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
                            <p className="text-sm font-semibold mb-1.5 capitalize">{roleId.replace('_', ' ')}</p>
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

// ─── Security Tab ─────────────────────────────────────────────────────────────
function isValidCidr(value: string) {
    return /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(value)
}

function SecurityTab() {
    const { data: security, isLoading: secLoading } = useSecuritySettings()
    const updateSecurity = useUpdateSecuritySettings()
    const { data: ipList, isLoading: ipLoading } = useIpAllowlist()
    const updateList = useUpdateIpAllowlist()
    const [list, setList] = useState<string[]>([])
    const [newEntry, setNewEntry] = useState('')

    useEffect(() => { if (ipList?.ipAllowlist) setList(ipList.ipAllowlist) }, [ipList])

    const handleSessionToggle = async (checked: boolean) => {
        try {
            await updateSecurity.mutateAsync({ sessionTimeoutMinutes: checked ? 480 : 0 })
        } catch {
            toast.error('Save failed', 'Could not update session timeout.')
        }
    }

    const handleAuditToggle = async () => {
        if (!security) return
        try {
            await updateSecurity.mutateAsync({ auditLoggingEnabled: !security.auditLoggingEnabled })
        } catch {
            toast.error('Save failed', 'Could not update audit logging.')
        }
    }

    const handleAddIp = async () => {
        const trimmed = newEntry.trim()
        if (!trimmed) return
        if (!isValidCidr(trimmed)) { toast.warning('Invalid entry', 'Enter a valid IP address or CIDR range.'); return }
        if (list.includes(trimmed)) { toast.warning('Duplicate', 'This IP is already in the allowlist.'); return }
        try {
            await updateList.mutateAsync([...list, trimmed])
            setNewEntry('')
            toast.success('IP added', `${trimmed} added to allowlist.`)
        } catch {
            toast.error('Update failed', 'Could not update IP allowlist.')
        }
    }

    const handleRemoveIp = async (ip: string) => {
        try {
            await updateList.mutateAsync(list.filter(x => x !== ip))
            toast.success('IP removed')
        } catch {
            toast.error('Update failed', 'Could not update IP allowlist.')
        }
    }

    return (
        <div className="space-y-5">
            <Section icon={Shield} title="Security Policies" description="Workspace-wide protection rules">
                {secLoading ? (
                    <Skeleton className="h-20 w-full" />
                ) : (
                    <div className="divide-y border rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3.5">
                            <div>
                                <p className="text-sm font-medium">Auto Session Timeout</p>
                                <p className="text-xs text-muted-foreground">
                                    Log out after {security?.sessionTimeoutMinutes ?? 480} minutes of inactivity
                                </p>
                            </div>
                            <Switch
                                checked={(security?.sessionTimeoutMinutes ?? 480) < 1440}
                                onCheckedChange={handleSessionToggle}
                                disabled={updateSecurity.isPending}
                            />
                        </div>
                        <div className="flex items-center justify-between px-4 py-3.5">
                            <div>
                                <p className="text-sm font-medium">Audit Logging</p>
                                <p className="text-xs text-muted-foreground">Record all admin actions for compliance</p>
                            </div>
                            <Switch
                                checked={security?.auditLoggingEnabled ?? true}
                                onCheckedChange={handleAuditToggle}
                                disabled={updateSecurity.isPending}
                            />
                        </div>
                    </div>
                )}
            </Section>

            <Section icon={Globe} title="IP Allowlist" description="Restrict logins to specific IP addresses or CIDR ranges. Leave empty to allow all IPs.">
                {ipLoading ? (
                    <Skeleton className="h-20 w-full" />
                ) : (
                    <div className="space-y-4">
                        {list.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">No restrictions — all IPs are allowed.</p>
                        ) : (
                            <div className="divide-y border rounded-lg overflow-hidden">
                                {list.map(ip => (
                                    <div key={ip} className="flex items-center justify-between px-3 py-2">
                                        <span className="text-sm font-mono">{ip}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleRemoveIp(ip)}
                                            disabled={updateList.isPending}
                                            aria-label={`Remove ${ip}`}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Input
                                placeholder="e.g. 192.168.1.0/24"
                                value={newEntry}
                                onChange={e => setNewEntry(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddIp() }}
                                className="font-mono"
                            />
                            <Button size="sm" onClick={handleAddIp} loading={updateList.isPending} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                                Add
                            </Button>
                        </div>
                    </div>
                )}
            </Section>

            <Section icon={AlertCircle} title="Danger Zone" description="Irreversible workspace actions" className="border-destructive/30">
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div className="min-w-0">
                            <p className="text-sm font-medium">Export All Data</p>
                            <p className="text-xs text-muted-foreground">Download a complete export of your organization data</p>
                        </div>
                        <Button variant="outline" size="sm" leftIcon={<FileText className="h-3.5 w-3.5" />} className="shrink-0">Export</Button>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-destructive">Delete Organization</p>
                            <p className="text-xs text-muted-foreground">Permanently delete this workspace and all its data</p>
                        </div>
                        <Button variant="destructive" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} className="shrink-0">Delete</Button>
                    </div>
                </div>
            </Section>
        </div>
    )
}

// ─── Switch Organizations Tab ─────────────────────────────────────────────────
function SwitchTab() {
    const navigate = useNavigate()
    const { data: tenants, isLoading } = useMyTenants()
    const switchMut = useSwitchTenant()
    const { tenant: currentTenant } = useAuthStore()

    const handleSwitch = async (tenantId: string, name: string) => {
        if (tenantId === currentTenant?.id) return
        try {
            await switchMut.mutateAsync(tenantId)
            toast.success('Switched', `Now working in ${name}`)
            navigate('/dashboard', { replace: true })
        } catch {
            toast.error('Switch failed', 'Could not switch organization.')
        }
    }

    return (
        <div className="space-y-5">
            <Section icon={ArrowRightLeft} title="Switch Organization" description="Select a workspace to switch into">
                {isLoading ? (
                    <div className="grid sm:grid-cols-2 gap-3">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 w-full" />)}
                    </div>
                ) : (tenants ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">You don't belong to any organization yet.</p>
                ) : (
                    <div className="grid sm:grid-cols-2 gap-3">
                        {(tenants ?? []).map((m: any) => {
                            const isActive = currentTenant?.id === m.tenantId
                            return (
                                <div
                                    key={m.membershipId}
                                    className={cn(
                                        'flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors',
                                        isActive ? 'border-primary/40 bg-primary/5' : 'hover:border-primary/30 hover:bg-muted/30 cursor-pointer',
                                    )}
                                    onClick={() => !isActive && handleSwitch(m.tenantId, m.tenantName)}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-sm font-semibold text-muted-foreground">
                                            {m.tenantName?.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">{m.tenantName}</p>
                                            <p className="text-xs text-muted-foreground capitalize">{m.role?.replace('_', ' ')}</p>
                                        </div>
                                    </div>
                                    {isActive ? (
                                        <Badge variant="secondary" className="text-[10px] shrink-0">Current</Badge>
                                    ) : (
                                        <Button size="sm" variant="outline" disabled={switchMut.isPending} className="shrink-0 h-7 text-xs">
                                            Switch
                                        </Button>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </Section>
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
const tabs = [
    { value: 'profile', label: 'Organization Profile', desc: 'Company details & regional settings', icon: Building2 },
    { value: 'members', label: 'Members', desc: 'Team members, roles & access', icon: Users },
    { value: 'security', label: 'Security', desc: 'Policies, IP allowlist & data', icon: Shield },
    { value: 'switch', label: 'Switch Organization', desc: 'Change active workspace', icon: ArrowRightLeft },
]

export function OrganizationSettingsPage() {
    const { t } = useTranslation()

    return (
        <PageWrapper width="default">
            <PageHeader
                eyebrow="Organization"
                title={t('organizations.settings', { defaultValue: 'Organization Settings' })}
                description={t('organizations.settingsDescription', { defaultValue: 'Manage your organization profile, members, and security.' })}
            />

            <Tabs
                defaultValue="profile"
                orientation="vertical"
                className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 lg:items-start"
            >
                {/* Mobile: horizontal tabs */}
                <TabsList className="lg:hidden w-full justify-start border-b rounded-none bg-transparent p-0 h-auto gap-0 overflow-x-auto">
                    {tabs.map(tab => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-4 text-muted-foreground data-[state=active]:text-foreground"
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/* Desktop: sticky vertical nav rail */}
                <aside className="hidden lg:block sticky top-20 self-start">
                    <div className="rounded-xl border bg-card shadow-sm p-3">
                        <TabsList className="flex flex-col items-stretch h-auto bg-transparent p-0 gap-0.5 w-full">
                            {tabs.map(tab => (
                                <TabsTrigger
                                    key={tab.value}
                                    value={tab.value}
                                    className="group justify-start gap-3 px-3 py-2.5 h-auto rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none transition-colors"
                                >
                                    <tab.icon className="h-4 w-4 shrink-0 text-muted-foreground group-data-[state=active]:text-primary" />
                                    <div className="flex flex-col items-start min-w-0 text-start">
                                        <span className="text-sm leading-tight">{tab.label}</span>
                                        <span className="text-[11px] text-muted-foreground/80 group-data-[state=active]:text-muted-foreground leading-tight mt-0.5 truncate max-w-[180px]">
                                            {tab.desc}
                                        </span>
                                    </div>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>
                </aside>

                {/* Content */}
                <div className="pt-6 lg:pt-0">
                    <TabsContent value="profile" className="mt-0"><ProfileTab /></TabsContent>
                    <TabsContent value="members" className="mt-0"><MembersTab /></TabsContent>
                    <TabsContent value="security" className="mt-0"><SecurityTab /></TabsContent>
                    <TabsContent value="switch" className="mt-0"><SwitchTab /></TabsContent>
                </div>
            </Tabs>
        </PageWrapper>
    )
}
