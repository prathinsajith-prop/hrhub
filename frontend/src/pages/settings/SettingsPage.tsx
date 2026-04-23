import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Building2,
    Users,
    Bell,
    Shield,
    Globe,
    Save,
    FileText,
    CheckCircle2,
    AlertCircle,
    UserCircle,
    Key,
    Trash2,
    Plus,
    Monitor,
    Smartphone,
    LogIn,
    LogOut,
    XCircle,
    Clock,
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
import { api } from '@/lib/api'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useCompanySettings, useUpdateCompanySettings, useTenantUsers, useTwoFaStatus, useTwoFaSetup, useTwoFaVerify, useTwoFaDisable, useTwoFaRegenerateBackupCodes, useIpAllowlist, useUpdateIpAllowlist } from '@/hooks/useSettings'
import { useInfiniteLoginHistory } from '@/hooks/useAudit'
import type { CompanySettings } from '@/hooks/useSettings'

const roles = [
    { id: 'super_admin', label: 'Super Admin', desc: 'Full access to all modules and settings', color: 'text-red-600 bg-red-50' },
    { id: 'hr_manager', label: 'HR Manager', desc: 'Employees, leave, recruitment, onboarding', color: 'text-blue-600 bg-blue-50' },
    { id: 'payroll_officer', label: 'Payroll Officer', desc: 'Payroll runs and WPS submission', color: 'text-emerald-600 bg-emerald-50' },
    { id: 'pro_officer', label: 'PRO Officer', desc: 'Visa, documents, and compliance', color: 'text-primary bg-primary/10' },
    { id: 'employee', label: 'Employee', desc: 'Self-service: leaves, payslips, profile', color: 'text-gray-600 bg-gray-50' },
]

const notifGroups = [
    {
        title: 'Visa & Compliance',
        items: [
            { id: 'visa_expiry', label: 'Visa expiry reminders', desc: 'Alerts 30, 14, 7 days before expiry', email: true, push: true },
            { id: 'eid_expiry', label: 'Emirates ID expiry', desc: 'Alerts before EID expires', email: true, push: true },
            { id: 'doc_missing', label: 'Missing documents', desc: 'Notify when employee docs are incomplete', email: true, push: false },
        ],
    },
    {
        title: 'Leave & Attendance',
        items: [
            { id: 'leave_request', label: 'New leave request', desc: 'When employees submit leave requests', email: true, push: true },
            { id: 'leave_approved', label: 'Leave approved/rejected', desc: 'Notify employee of decision', email: true, push: true },
        ],
    },
    {
        title: 'Payroll',
        items: [
            { id: 'payroll_ready', label: 'Payroll run ready for approval', desc: 'Monthly payroll notification', email: true, push: true },
            { id: 'wps_submitted', label: 'WPS submission confirmation', desc: 'After successful WPS upload to MOHRE', email: true, push: false },
        ],
    },
]

// ─── Company Settings Tab ─────────────────────────────────────────────────────
function CompanyTab() {
    const { tenant } = useAuthStore()
    const { data: company, isLoading } = useCompanySettings()
    const updateCompany = useUpdateCompanySettings()
    const [form, setForm] = useState<Partial<CompanySettings>>({})
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        if (company) {
            setForm({
                name: company.name,
                tradeLicenseNo: company.tradeLicenseNo,
                jurisdiction: company.jurisdiction,
                industryType: company.industryType,
            })
        }
    }, [company])

    const set = (field: keyof CompanySettings, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }))

    const handleSave = async () => {
        try {
            await updateCompany.mutateAsync(form)
            setSaved(true)
            toast.success('Settings saved', 'Company profile has been updated successfully.')
            setTimeout(() => setSaved(false), 2000)
        } catch {
            toast.error('Save failed', 'Could not update company profile.')
        }
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* Card 1: Identity strip + Company Profile */}
            <SettingsCard>
                <div className="flex items-center gap-4 pb-5 border-b">
                    <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-base font-semibold shrink-0">
                        {(company?.name ?? tenant?.name ?? 'HR').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{company?.name ?? tenant?.name ?? 'HRHub Demo Company'}</p>
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
                            <Label htmlFor="company_name">Company Name</Label>
                            <Input id="company_name" value={form.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="trade_license">Trade License No.</Label>
                            <Input id="trade_license" value={form.tradeLicenseNo ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('tradeLicenseNo', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="jurisdiction">Jurisdiction</Label>
                            <Input id="jurisdiction" value={form.jurisdiction ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('jurisdiction', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="industry">Industry Type</Label>
                            <Input id="industry" value={form.industryType ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('industryType', e.target.value)} />
                        </div>
                    </div>
                </div>
            </SettingsCard>

            {/* Card 2: Regional Settings */}
            <SettingsCard>
                <div className="space-y-4">
                    <div>
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            Regional Settings
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Defaults applied across the workspace</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                            { id: 'timezone', label: 'Time Zone', value: 'Asia/Dubai (UTC+4)' },
                            { id: 'currency', label: 'Currency', value: 'AED – UAE Dirham' },
                            { id: 'date_format', label: 'Date Format', value: 'DD/MM/YYYY' },
                        ].map((f) => (
                            <div key={f.id} className="space-y-1.5">
                                <Label htmlFor={f.id}>{f.label}</Label>
                                <Input id={f.id} defaultValue={f.value} readOnly className="bg-muted/40" />
                            </div>
                        ))}
                    </div>
                </div>
            </SettingsCard>

            {/* Save bar — outside the cards */}
            <div className="flex justify-end pt-2">
                <Button onClick={handleSave} loading={updateCompany.isPending} leftIcon={saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />} variant={saved ? 'success' : 'default'}>
                    {saved ? 'Saved!' : 'Save Changes'}
                </Button>
            </div>
        </div>
    )
}

// ─── Reusable settings card wrapper ──────────────────────────────────────────────
function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
    return (
        <div className={cn('rounded-xl border bg-card shadow-sm p-6', className)}>
            {children}
        </div>
    )
}

// ─── Section helper — renders a card with title + optional action ─────────────
function Section({ icon: Icon, title, description, action, children, className }: {
    icon: React.ComponentType<{ className?: string }>
    title: string
    description?: string
    action?: React.ReactNode
    children: React.ReactNode
    className?: string
}) {
    return (
        <SettingsCard className={className}>
            <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                            {title}
                        </h3>
                        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
                    </div>
                    {action && <div className="shrink-0">{action}</div>}
                </div>
                {children}
            </div>
        </SettingsCard>
    )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab() {
    const { data: tenantUsers, isLoading } = useTenantUsers()
    const [showInvite, setShowInvite] = useState(false)
    const [inviteForm, setInviteForm] = useState({ name: '', email: '', role: 'hr_manager' })
    const [inviting, setInviting] = useState(false)

    const getRoleStyle = (role: string) => roles.find((r) => r.id === role)?.color ?? 'bg-gray-50 text-gray-600'
    const getRoleLabel = (role: string) => roles.find((r) => r.id === role)?.label ?? role.replace(/_/g, ' ')

    const formatLastLogin = (lastLoginAt: string | null) => {
        if (!lastLoginAt) return 'Never'
        const diff = Date.now() - new Date(lastLoginAt).getTime()
        const hours = Math.floor(diff / 3600000)
        if (hours < 1) return 'Just now'
        if (hours < 24) return `${hours}h ago`
        const days = Math.floor(hours / 24)
        if (days < 7) return `${days}d ago`
        return `${Math.floor(days / 7)}w ago`
    }

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

    return (
        <div className="space-y-5">
            {showInvite && (
                <SettingsCard className="bg-muted/30">
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">Invite Team Member</h3>
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
                title="Team Members"
                description="People with access to this workspace"
                action={!showInvite && (
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
                        <p className="text-sm">No team members found</p>
                    </div>
                ) : (
                    <div className="divide-y border rounded-lg overflow-hidden">
                        {(tenantUsers ?? []).map((u) => (
                            <div key={u.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                    <Avatar className="h-9 w-9">
                                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                            {u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="text-sm font-medium truncate">{u.name}</p>
                                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className="hidden sm:inline text-xs text-muted-foreground">
                                        {formatLastLogin(u.lastLoginAt)}
                                    </span>
                                    <Badge variant={u.isActive ? 'success' : 'secondary'} className="text-[10px]">
                                        {u.isActive ? 'active' : 'inactive'}
                                    </Badge>
                                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', getRoleStyle(u.role))}>
                                        {getRoleLabel(u.role)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Section>

            <Section
                icon={Shield}
                title="Roles & Permissions"
                description="What each role is allowed to do in the workspace"
            >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {roles.map((role) => (
                        <div key={role.id} className="flex items-start gap-3 p-3.5 rounded-lg border hover:border-primary/30 hover:bg-muted/30 transition-colors">
                            <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', role.color)}>
                                <UserCircle className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold">{role.label}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">{role.desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </Section>
        </div>
    )
}

// ─── Notifications Tab ────────────────────────────────────────────────────────
function NotificationsTab() {
    const [settings, setSettings] = useState(() =>
        notifGroups.flatMap((g) => g.items).reduce(
            (acc, item) => ({ ...acc, [`${item.id}_email`]: item.email, [`${item.id}_push`]: item.push }),
            {} as Record<string, boolean>,
        ),
    )

    const toggle = (key: string) => setSettings((prev) => ({ ...prev, [key]: !prev[key] }))

    return (
        <div className="space-y-5">
            {notifGroups.map((group) => (
                <SettingsCard key={group.title}>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-semibold">{group.title}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">Choose how you'd like to be notified</p>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                <span className="w-12 text-center">Email</span>
                                <span className="w-12 text-center">Push</span>
                            </div>
                        </div>
                        <div className="divide-y border rounded-lg overflow-hidden">
                            {group.items.map((item) => (
                                <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium leading-tight">{item.label}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="w-12 flex justify-center">
                                            <Switch
                                                checked={settings[`${item.id}_email`]}
                                                onCheckedChange={() => toggle(`${item.id}_email`)}
                                                aria-label={`${item.label} — Email`}
                                            />
                                        </div>
                                        <div className="w-12 flex justify-center">
                                            <Switch
                                                checked={settings[`${item.id}_push`]}
                                                onCheckedChange={() => toggle(`${item.id}_push`)}
                                                aria-label={`${item.label} — Push`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </SettingsCard>
            ))}
            <div className="flex justify-end pt-2">
                <Button onClick={() => toast.success('Preferences saved', 'Your notification settings have been updated.')} leftIcon={<Save className="h-4 w-4" />}>
                    Save Preferences
                </Button>
            </div>
        </div>
    )
}

// ─── Security Tab ─────────────────────────────────────────────────────────────
function SecurityTab() {
    const [currentPw, setCurrentPw] = useState('')
    const [newPw, setNewPw] = useState('')
    const [confirmPw, setConfirmPw] = useState('')
    const [saving, setSaving] = useState(false)

    const handleUpdatePassword = async () => {
        if (!currentPw || !newPw || !confirmPw) { toast.warning('Missing fields', 'Please fill in all password fields.'); return }
        if (newPw !== confirmPw) { toast.warning('Passwords do not match', 'New password and confirmation must match.'); return }
        if (newPw.length < 8) { toast.warning('Password too short', 'New password must be at least 8 characters.'); return }
        setSaving(true)
        try {
            await api.post('/auth/change-password', { currentPassword: currentPw, newPassword: newPw })
            toast.success('Password updated', 'Your password has been changed successfully.')
            setCurrentPw(''); setNewPw(''); setConfirmPw('')
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Current password may be incorrect.'
            toast.error('Update failed', msg)
        } finally { setSaving(false) }
    }

    return (
        <div className="space-y-5">
            <Section
                icon={Key}
                title="Password"
                description="Change your account password. Use at least 8 characters."
            >
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label htmlFor="current_password">Current Password</Label>
                        <Input id="current_password" type="password" placeholder="••••••••" value={currentPw} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPw(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="new_password">New Password</Label>
                            <Input id="new_password" type="password" placeholder="Min. 8 characters" value={newPw} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPw(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm_password">Confirm New Password</Label>
                            <Input id="confirm_password" type="password" placeholder="Repeat new password" value={confirmPw} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPw(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button size="sm" onClick={handleUpdatePassword} loading={saving}>Update Password</Button>
                    </div>
                </div>
            </Section>

            <Section
                icon={Shield}
                title="Security Policies"
                description="Workspace-wide protection rules"
            >
                <div className="divide-y border rounded-lg overflow-hidden">
                    {[
                        { id: 'session_timeout', label: 'Auto Session Timeout', desc: 'Log out after 30 minutes of inactivity', defaultChecked: true },
                        { id: 'audit_log', label: 'Audit Logging', desc: 'Track all admin actions and changes', defaultChecked: true },
                    ].map((policy) => (
                        <div key={policy.id} className="flex items-center justify-between px-4 py-3.5">
                            <div>
                                <p className="text-sm font-medium">{policy.label}</p>
                                <p className="text-xs text-muted-foreground">{policy.desc}</p>
                            </div>
                            <Switch defaultChecked={policy.defaultChecked} aria-label={policy.label} />
                        </div>
                    ))}
                </div>
            </Section>

            <TwoFactorCard />
            <IpAllowlistCard />

            <Section
                icon={AlertCircle}
                title="Danger Zone"
                description="Irreversible workspace actions"
                className="border-destructive/30"
            >
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div className="min-w-0">
                            <p className="text-sm font-medium">Export All Data</p>
                            <p className="text-xs text-muted-foreground">Download a complete export of your company data</p>
                        </div>
                        <Button variant="outline" size="sm" leftIcon={<FileText className="h-3.5 w-3.5" />} className="shrink-0">Export</Button>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-destructive">Delete Account</p>
                            <p className="text-xs text-muted-foreground">Permanently delete this workspace and all data</p>
                        </div>
                        <Button variant="destructive" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} className="shrink-0">Delete</Button>
                    </div>
                </div>
            </Section>
        </div>
    )
}

// ─── Activity Tab ─────────────────────────────────────────────────────────────
function ActivityTab() {
    return (
        <div className="space-y-6">
            <LoginHistoryCard />
        </div>
    )
}

// ─── Two-Factor Authentication Card ──────────────────────────────────────────
function TwoFactorCard() {
    const { data: status, isLoading } = useTwoFaStatus()
    const setup = useTwoFaSetup()
    const verify = useTwoFaVerify()
    const disable = useTwoFaDisable()
    const regenerate = useTwoFaRegenerateBackupCodes()

    const [step, setStep] = useState<'idle' | 'setup' | 'disable' | 'regenerate'>('idle')
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
    const [secret, setSecret] = useState<string | null>(null)
    const [token, setToken] = useState('')
    // Plaintext backup codes returned ONCE after enable/regenerate. Cleared when user dismisses.
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

    const enabled = status?.enabled ?? false
    const backupRemaining = status?.backupCodesRemaining ?? 0

    const handleSetup = async () => {
        try {
            const result = await setup.mutateAsync()
            setQrDataUrl(result.qrDataUrl)
            setSecret(result.secret)
            setStep('setup')
        } catch {
            toast.error('Setup failed', 'Could not generate 2FA setup.')
        }
    }

    const handleVerify = async () => {
        if (token.length !== 6) { toast.warning('Invalid code', 'Enter the 6-digit code from your authenticator app.'); return }
        try {
            const result = await verify.mutateAsync(token)
            toast.success('2FA enabled', 'Two-factor authentication is now active.')
            setStep('idle'); setToken(''); setQrDataUrl(null); setSecret(null)
            // Show backup codes — user must save them now
            if (result.backupCodes?.length) setBackupCodes(result.backupCodes)
        } catch {
            toast.error('Verification failed', 'The code was incorrect. Please try again.')
        }
    }

    const handleDisable = async () => {
        if (token.length !== 6) { toast.warning('Invalid code', 'Enter the 6-digit code from your authenticator app.'); return }
        try {
            await disable.mutateAsync(token)
            toast.success('2FA disabled', 'Two-factor authentication has been turned off.')
            setStep('idle'); setToken('')
        } catch {
            toast.error('Verification failed', 'The code was incorrect. Please try again.')
        }
    }

    const handleRegenerate = async () => {
        if (token.length !== 6) { toast.warning('Invalid code', 'Enter the 6-digit code from your authenticator app.'); return }
        try {
            const result = await regenerate.mutateAsync(token)
            toast.success('Backup codes regenerated', 'Old codes are now invalid. Save the new ones.')
            setStep('idle'); setToken('')
            setBackupCodes(result.backupCodes)
        } catch {
            toast.error('Regeneration failed', 'The code was incorrect. Please try again.')
        }
    }

    const copySecret = () => {
        if (!secret) return
        navigator.clipboard.writeText(secret).then(
            () => toast.success('Copied', 'Secret key copied to clipboard.'),
            () => toast.error('Copy failed', 'Could not copy secret key.'),
        )
    }

    const copyBackupCodes = () => {
        if (!backupCodes) return
        navigator.clipboard.writeText(backupCodes.join('\n')).then(
            () => toast.success('Copied', 'All backup codes copied to clipboard.'),
            () => toast.error('Copy failed', 'Could not copy codes.'),
        )
    }

    const downloadBackupCodes = () => {
        if (!backupCodes) return
        const content = [
            'HRHub — Two-Factor Authentication Backup Codes',
            `Generated: ${new Date().toISOString()}`,
            '',
            'Each code can be used only once. Keep them somewhere safe.',
            '',
            ...backupCodes,
        ].join('\n')
        const blob = new Blob([content], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `hrhub-backup-codes-${new Date().toISOString().split('T')[0]}.txt`
        a.click()
        URL.revokeObjectURL(url)
    }

    const cancel = () => { setStep('idle'); setToken(''); setQrDataUrl(null); setSecret(null) }

    return (
        <Section
            icon={Shield}
            title="Two-Factor Authentication"
            description="Add an extra security layer with a 6-digit code from your authenticator app."
            action={!isLoading && (
                <Badge variant={enabled ? 'success' : 'secondary'} className="gap-1">
                    {enabled && <CheckCircle2 className="h-3 w-3" />}
                    {enabled ? 'Active' : 'Off'}
                </Badge>
            )}
        >
            {isLoading ? (
                <Skeleton className="h-12 w-full" />
            ) : (
                <>
                    {step === 'idle' && (
                        <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium leading-tight">Authenticator App</p>
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                        Google Authenticator · Authy · 1Password · any TOTP app
                                    </p>
                                </div>
                            </div>
                            {enabled ? (
                                <Button variant="outline" size="sm" onClick={() => setStep('disable')} className="shrink-0">
                                    Turn Off
                                </Button>
                            ) : (
                                <Button size="sm" onClick={handleSetup} loading={setup.isPending} className="shrink-0">
                                    Set Up
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Backup-codes status (only shown when 2FA is on and we're idle) */}
                    {step === 'idle' && enabled && !backupCodes && (
                        <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                                <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium leading-tight">Recovery Backup Codes</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {backupRemaining > 0
                                            ? `${backupRemaining} unused code${backupRemaining === 1 ? '' : 's'} remaining`
                                            : 'No active codes — generate new ones to protect against device loss.'}
                                    </p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setStep('regenerate')} className="shrink-0">
                                {backupRemaining > 0 ? 'Regenerate' : 'Generate'}
                            </Button>
                        </div>
                    )}

                    {/* One-time display of plaintext backup codes */}
                    {backupCodes && (
                        <div className="space-y-3 rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-4">
                            <div className="flex items-start gap-2">
                                <Key className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground">Save these codes now</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Each code can be used <span className="font-medium text-foreground">once</span> to sign in if you lose access to your authenticator. They will not be shown again.
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 rounded-md border border-border bg-background p-3">
                                {backupCodes.map((c) => (
                                    <code key={c} className="text-sm font-mono text-foreground tracking-wider text-center py-1">
                                        {c}
                                    </code>
                                ))}
                            </div>
                            <div className="flex gap-2 justify-end pt-1">
                                <Button size="sm" variant="outline" onClick={copyBackupCodes}>Copy all</Button>
                                <Button size="sm" variant="outline" onClick={downloadBackupCodes}>Download .txt</Button>
                                <Button size="sm" onClick={() => setBackupCodes(null)}>I've saved them</Button>
                            </div>
                        </div>
                    )}

                    {step === 'regenerate' && (
                        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                            <p className="text-sm text-foreground">
                                Enter your current 6-digit code to generate a fresh set of backup codes. <span className="font-medium">All previous codes will stop working.</span>
                            </p>
                            <div className="space-y-2">
                                <Label htmlFor="regen_token" className="text-xs">Verification Code</Label>
                                <Input
                                    id="regen_token"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="000000"
                                    maxLength={6}
                                    value={token}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value.replace(/\D/g, ''))}
                                    className="text-center tracking-[0.4em] text-base font-mono w-40"
                                />
                            </div>
                            <div className="flex gap-2 justify-end pt-1">
                                <Button size="sm" variant="ghost" onClick={() => { setStep('idle'); setToken('') }}>Cancel</Button>
                                <Button size="sm" onClick={handleRegenerate} loading={regenerate.isPending} disabled={token.length !== 6}>
                                    Generate New Codes
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'setup' && qrDataUrl && (
                        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                            <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                                <li>Scan the QR with your authenticator app</li>
                                <li>Enter the 6-digit code below to confirm</li>
                            </ol>

                            <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
                                <div className="rounded-lg bg-background border border-border p-2 mx-auto sm:mx-0">
                                    <img src={qrDataUrl} alt="2FA QR Code" className="rounded w-40 h-40 block" />
                                </div>
                                {secret && (
                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">Or enter this key manually</Label>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono break-all leading-relaxed">
                                                {secret}
                                            </code>
                                            <Button type="button" variant="outline" size="sm" onClick={copySecret} className="shrink-0">
                                                Copy
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2 pt-2 border-t border-border">
                                <Label htmlFor="totp_token" className="text-xs">Verification Code</Label>
                                <Input
                                    id="totp_token"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="000000"
                                    maxLength={6}
                                    value={token}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value.replace(/\D/g, ''))}
                                    className="text-center tracking-[0.4em] text-base font-mono w-40"
                                />
                            </div>

                            <div className="flex gap-2 justify-end pt-1">
                                <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
                                <Button size="sm" onClick={handleVerify} loading={verify.isPending} disabled={token.length !== 6}>
                                    Confirm &amp; Enable
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'disable' && (
                        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                            <p className="text-sm text-foreground">
                                Enter your current 6-digit code to turn off two-factor authentication.
                            </p>
                            <div className="space-y-2">
                                <Label htmlFor="disable_token" className="text-xs">Verification Code</Label>
                                <Input
                                    id="disable_token"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder="000000"
                                    maxLength={6}
                                    value={token}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value.replace(/\D/g, ''))}
                                    className="text-center tracking-[0.4em] text-base font-mono w-40"
                                />
                            </div>
                            <div className="flex gap-2 justify-end pt-1">
                                <Button size="sm" variant="ghost" onClick={() => { setStep('idle'); setToken('') }}>Cancel</Button>
                                <Button size="sm" variant="destructive" onClick={handleDisable} loading={disable.isPending} disabled={token.length !== 6}>
                                    Turn Off 2FA
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </Section>
    )
}

// ─── IP Allowlist Card ────────────────────────────────────────────────────────
function IpAllowlistCard() {
    const { data, isLoading } = useIpAllowlist()
    const updateList = useUpdateIpAllowlist()
    const [newEntry, setNewEntry] = useState('')
    const list: string[] = data?.ipAllowlist ?? []

    const isValidCidr = (val: string) =>
        /^(\d{1, 3}\.){3}\d{1, 3}(\/\d{1, 2})?$/.test(val.trim())

    const handleAdd = async () => {
        const trimmed = newEntry.trim()
        if (!isValidCidr(trimmed)) { toast.warning('Invalid entry', 'Enter a valid IP address or CIDR range (e.g. 192.168.1.0/24).'); return }
        if (list.includes(trimmed)) { toast.warning('Duplicate', 'This IP/range is already in the allowlist.'); return }
        try {
            await updateList.mutateAsync([...list, trimmed])
            setNewEntry('')
            toast.success('IP added', `${trimmed} added to allowlist.`)
        } catch {
            toast.error('Update failed', 'Could not update IP allowlist.')
        }
    }

    const handleRemove = async (ip: string) => {
        try {
            await updateList.mutateAsync(list.filter((x) => x !== ip))
            toast.success('IP removed', `${ip} removed from allowlist.`)
        } catch {
            toast.error('Update failed', 'Could not update IP allowlist.')
        }
    }

    return (
        <Section
            icon={Globe}
            title="IP Allowlist"
            description="Restrict access to specific IP addresses or CIDR ranges. Leave empty to allow all IPs."
        >
            {isLoading ? (
                <Skeleton className="h-20 w-full" />
            ) : (
                <div className="space-y-4">
                    {list.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">No restrictions — all IPs are allowed.</p>
                    ) : (
                        <div className="divide-y border rounded-lg overflow-hidden">
                            {list.map((ip) => (
                                <div key={ip} className="flex items-center justify-between px-3 py-2">
                                    <span className="text-sm font-mono">{ip}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                        onClick={() => handleRemove(ip)}
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
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewEntry(e.target.value)}
                            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') handleAdd() }}
                            className="font-mono"
                        />
                        <Button size="sm" onClick={handleAdd} loading={updateList.isPending} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                            Add
                        </Button>
                    </div>
                </div>
            )}
        </Section>
    )
}

function LoginHistoryCard() {
    const {
        data,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteLoginHistory({ pageSize: 10 })
    const history = (data?.pages.flat() ?? []) as any[]

    const sentinelRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        const el = sentinelRef.current
        if (!el || !hasNextPage) return
        const obs = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage()
            },
            { rootMargin: '120px' },
        )
        obs.observe(el)
        return () => obs.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    const eventIcon = (type: string) => {
        if (type === 'login') return <LogIn className="h-3.5 w-3.5 text-green-600" />
        if (type === 'logout') return <LogOut className="h-3.5 w-3.5 text-gray-500" />
        if (type === 'failed_login') return <XCircle className="h-3.5 w-3.5 text-red-500" />
        return <Shield className="h-3.5 w-3.5 text-blue-500" />
    }

    const deviceIcon = (type: string) => {
        if (type === 'mobile' || type === 'tablet') return <Smartphone className="h-3.5 w-3.5 text-muted-foreground" />
        return <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
    }

    return (
        <Section
            icon={Clock}
            title="Login History"
            description="Recent sign-in activity for your account"
        >
            {isLoading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
            ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-10 border rounded-lg">No login history found.</p>
            ) : (
                <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-[480px] overflow-y-auto divide-y text-sm">
                        {history.map((h: any) => (
                            <div key={h.id} className="flex items-start justify-between px-4 py-3 gap-3 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                                    {eventIcon(h.eventType)}
                                    {deviceIcon(h.deviceType)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium capitalize">{h.eventType.replace('_', ' ')}</p>
                                    <p className="text-xs text-muted-foreground truncate">{h.browser} on {h.os} · {h.ipAddress ?? 'unknown IP'}</p>
                                    {h.failureReason && <p className="text-xs text-red-500">{h.failureReason.replace('_', ' ')}</p>}
                                </div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                    {new Date(h.createdAt).toLocaleString('en-AE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        ))}
                        <div ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
                            {isFetchingNextPage
                                ? 'Loading more…'
                                : hasNextPage
                                    ? 'Scroll to load more'
                                    : history.length > 0 ? 'You\u2019ve reached the end' : ''}
                        </div>
                    </div>
                </div>
            )}
        </Section>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function SettingsPage() {
    const { t } = useTranslation()

    const tabs = [
        { value: 'company', label: 'Company', icon: Building2, desc: 'Profile, regional & legal info' },
        { value: 'users', label: 'Users & Roles', icon: Users, desc: 'Team members, permissions' },
        { value: 'notifications', label: 'Notifications', icon: Bell, desc: 'Email & push preferences' },
        { value: 'security', label: 'Security', icon: Shield, desc: 'Password, 2FA, IP allowlist' },
        { value: 'activity', label: 'Activity', icon: Clock, desc: 'Login & session history' },
    ] as const

    return (
        <PageWrapper width="default">
            <PageHeader
                eyebrow="Workspace"
                title={t('settings.title')}
                description={t('settings.description')}
            />

            <Tabs
                defaultValue="company"
                orientation="vertical"
                className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 lg:items-start"
            >
                {/* ─── Mobile: horizontal underline tabs ────────────────────── */}
                <TabsList className="lg:hidden w-full justify-start border-b rounded-none bg-transparent p-0 h-auto gap-0 overflow-x-auto">
                    {tabs.map((tab) => (
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

                {/* ─── Desktop: sticky vertical nav rail in its own card ───── */}
                <aside className="hidden lg:block sticky top-20 self-start">
                    <div className="rounded-xl border bg-card shadow-sm p-3">
                        <TabsList className="flex flex-col items-stretch h-auto bg-transparent p-0 gap-0.5 w-full">
                            {tabs.map((tab) => (
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

                {/* ─── Content: full width, no width cap ─── */}
                <div className="pt-6 lg:pt-0">
                    <TabsContent value="company" className="mt-0"><CompanyTab /></TabsContent>
                    <TabsContent value="users" className="mt-0"><UsersTab /></TabsContent>
                    <TabsContent value="notifications" className="mt-0"><NotificationsTab /></TabsContent>
                    <TabsContent value="security" className="mt-0"><SecurityTab /></TabsContent>
                    <TabsContent value="activity" className="mt-0"><ActivityTab /></TabsContent>
                </div>
            </Tabs>
        </PageWrapper>
    )
}
