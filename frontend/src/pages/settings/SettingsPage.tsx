import React, { useState, useEffect } from 'react'
import {
    Building2,
    Users,
    Bell,
    Shield,
    Globe,
    Save,
    ChevronRight,
    FileText,
    CheckCircle2,
    AlertCircle,
    UserCircle,
    Key,
    Trash2,
    Plus,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useCompanySettings, useUpdateCompanySettings, useTenantUsers } from '@/hooks/useSettings'
import type { CompanySettings } from '@/hooks/useSettings'

const roles = [
    { id: 'super_admin', label: 'Super Admin', desc: 'Full access to all modules and settings', color: 'text-red-600 bg-red-50' },
    { id: 'hr_manager', label: 'HR Manager', desc: 'Employees, leave, recruitment, onboarding', color: 'text-blue-600 bg-blue-50' },
    { id: 'payroll_officer', label: 'Payroll Officer', desc: 'Payroll runs and WPS submission', color: 'text-emerald-600 bg-emerald-50' },
    { id: 'pro_officer', label: 'PRO Officer', desc: 'Visa, documents, and compliance', color: 'text-violet-600 bg-violet-50' },
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
        <div className="space-y-6">
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary" />
                        Company Profile
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/40 border">
                        <div className="h-16 w-16 rounded-2xl bg-primary flex items-center justify-center text-white text-xl font-bold">
                            {(company?.name ?? tenant?.name ?? 'HR').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <p className="font-semibold">{company?.name ?? tenant?.name ?? 'HRHub Demo Company'}</p>
                            <p className="text-sm text-muted-foreground capitalize">
                                {company?.jurisdiction ?? 'UAE'} · {company?.industryType?.replace(/_/g, ' ')}
                            </p>
                            <Badge variant="secondary" className="mt-1 text-[10px] capitalize">
                                {company?.subscriptionPlan} plan
                            </Badge>
                        </div>
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
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Globe className="h-4 w-4 text-primary" />
                        Regional Settings
                    </CardTitle>
                </CardHeader>
                <CardContent>
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
                </CardContent>
            </Card>
            <div className="flex justify-end">
                <Button onClick={handleSave} loading={updateCompany.isPending} leftIcon={saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />} variant={saved ? 'success' : 'default'}>
                    {saved ? 'Saved!' : 'Save Changes'}
                </Button>
            </div>
        </div>
    )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab() {
    const { data: tenantUsers, isLoading } = useTenantUsers()

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

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="pb-4 flex flex-row items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        Team Members
                    </CardTitle>
                    <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />}>Invite User</Button>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="divide-y">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-3 px-6 py-3.5">
                                    <Skeleton className="h-9 w-9 rounded-full" />
                                    <div className="space-y-1 flex-1">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (tenantUsers ?? []).length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No team members found</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {(tenantUsers ?? []).map((u) => (
                                <div key={u.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-muted/30 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9">
                                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
                                                {u.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="text-sm font-medium">{u.name}</p>
                                            <p className="text-xs text-muted-foreground">{u.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="hidden sm:block text-right">
                                            <p className="text-xs text-muted-foreground">Last login</p>
                                            <p className="text-xs">{formatLastLogin(u.lastLoginAt)}</p>
                                        </div>
                                        <Badge variant={u.isActive ? 'success' : 'secondary'} className="text-[10px]">
                                            {u.isActive ? 'active' : 'inactive'}
                                        </Badge>
                                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full capitalize', getRoleStyle(u.role))}>
                                            {getRoleLabel(u.role)}
                                        </span>
                                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground">
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        Roles & Permissions
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {roles.map((role) => (
                            <div key={role.id} className="flex items-start gap-3 p-3.5 rounded-xl border hover:border-primary/30 transition-colors cursor-pointer">
                                <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0', role.color)}>
                                    <UserCircle className="h-4 w-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold">{role.label}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{role.desc}</p>
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
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
        <div className="space-y-6">
            {notifGroups.map((group) => (
                <Card key={group.title}>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                            {group.title}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="px-6 pb-2">
                            <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground text-center mb-2 pr-4">
                                <span /><span>Email</span><span>Push</span>
                            </div>
                        </div>
                        <div className="divide-y">
                            {group.items.map((item) => (
                                <div key={item.id} className="flex items-center gap-4 px-6 py-3">
                                    <div className="flex-1">
                                        <p className="text-sm font-medium">{item.label}</p>
                                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <Switch checked={settings[`${item.id}_email`]} onCheckedChange={() => toggle(`${item.id}_email`)} />
                                        <Switch checked={settings[`${item.id}_push`]} onCheckedChange={() => toggle(`${item.id}_push`)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            ))}
            <div className="flex justify-end">
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
        <div className="space-y-6">
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Key className="h-4 w-4 text-primary" />
                        Password & Authentication
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
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
                    <Button size="sm" onClick={handleUpdatePassword} loading={saving}>Update Password</Button>
                </CardContent>
            </Card>
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Shield className="h-4 w-4 text-primary" />
                        Security Policies
                    </CardTitle>
                </CardHeader>
                <CardContent className="divide-y">
                    {[
                        { id: 'session_timeout', label: 'Auto Session Timeout', desc: 'Log out after 30 minutes of inactivity', defaultChecked: true },
                        { id: 'audit_log', label: 'Audit Logging', desc: 'Track all admin actions and changes', defaultChecked: true },
                        { id: 'mfa', label: 'Two-Factor Authentication', desc: 'Require 2FA for all admin accounts (coming soon)', defaultChecked: false },
                        { id: 'ip_whitelist', label: 'IP Allowlist', desc: 'Restrict logins to specific IP ranges (coming soon)', defaultChecked: false },
                    ].map((policy) => (
                        <div key={policy.id} className="flex items-center justify-between py-3.5">
                            <div>
                                <p className="text-sm font-medium">{policy.label}</p>
                                <p className="text-xs text-muted-foreground">{policy.desc}</p>
                            </div>
                            <Switch defaultChecked={policy.defaultChecked} />
                        </div>
                    ))}
                </CardContent>
            </Card>
            <Card className="border-destructive/30">
                <CardHeader className="pb-4">
                    <CardTitle className="text-base flex items-center gap-2 text-destructive">
                        <AlertCircle className="h-4 w-4" />
                        Danger Zone
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="flex items-center justify-between p-3.5 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div>
                            <p className="text-sm font-medium">Export All Data</p>
                            <p className="text-xs text-muted-foreground">Download a complete export of your company data</p>
                        </div>
                        <Button variant="outline" size="sm" leftIcon={<FileText className="h-3.5 w-3.5" />}>Export</Button>
                    </div>
                    <div className="flex items-center justify-between p-3.5 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div>
                            <p className="text-sm font-medium text-destructive">Delete Account</p>
                            <p className="text-xs text-muted-foreground">Permanently delete this workspace and all data</p>
                        </div>
                        <Button variant="destructive" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />}>Delete</Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function SettingsPage() {
    return (
        <PageWrapper width="narrow">
            <PageHeader title="Settings" description="Manage your company profile, users, and preferences" />
            <Tabs defaultValue="company">
                <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto gap-0">
                    {[
                        { value: 'company', label: 'Company', icon: Building2 },
                        { value: 'users', label: 'Users & Roles', icon: Users },
                        { value: 'notifications', label: 'Notifications', icon: Bell },
                        { value: 'security', label: 'Security', icon: Shield },
                    ].map((tab) => (
                        <TabsTrigger key={tab.value} value={tab.value} className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-4 text-muted-foreground data-[state=active]:text-foreground">
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
                <div className="pt-6">
                    <TabsContent value="company" className="mt-0"><CompanyTab /></TabsContent>
                    <TabsContent value="users" className="mt-0"><UsersTab /></TabsContent>
                    <TabsContent value="notifications" className="mt-0"><NotificationsTab /></TabsContent>
                    <TabsContent value="security" className="mt-0"><SecurityTab /></TabsContent>
                </div>
            </Tabs>
        </PageWrapper>
    )
}
