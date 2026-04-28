import React, { useState, useEffect, useRef } from 'react'
import { Shield, Key, Globe, AlertCircle, FileText, Trash2, Plus, Smartphone, Monitor, CheckCircle2, LogIn, LogOut, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { labelFor } from '@/lib/enums'
import { useSecuritySettings, useUpdateSecuritySettings, useIpAllowlist, useUpdateIpAllowlist, useTwoFaStatus, useTwoFaSetup, useTwoFaVerify, useTwoFaDisable, useTwoFaRegenerateBackupCodes } from '@/hooks/useSettings'
import { useInfiniteLoginHistory } from '@/hooks/useAudit'
import { Section } from './_shared'

// ─── Security Policies Card ────────────────────────────────────────────────────
function SecurityPoliciesCard() {
    const { data: security, isLoading } = useSecuritySettings()
    const updateSecurity = useUpdateSecuritySettings()

    const handleToggle = async (key: 'auditLoggingEnabled') => {
        if (!security) return
        try {
            await updateSecurity.mutateAsync({ [key]: !security[key] })
        } catch {
            toast.error('Save failed', 'Could not update security settings.')
        }
    }

    return (
        <Section icon={Shield} title="Security Policies" description="Workspace-wide protection rules">
            <div className="divide-y border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5">
                    <div>
                        <p className="text-sm font-medium">Auto Session Timeout</p>
                        <p className="text-xs text-muted-foreground">
                            {(security?.sessionTimeoutMinutes ?? 0) > 0
                                ? `Log out after ${security?.sessionTimeoutMinutes ?? 480} minutes of inactivity`
                                : 'Sessions never time out automatically'}
                        </p>
                    </div>
                    <Switch
                        checked={(security?.sessionTimeoutMinutes ?? 480) > 0}
                        onCheckedChange={async (checked) => {
                            try {
                                await updateSecurity.mutateAsync({ sessionTimeoutMinutes: checked ? 480 : 0 })
                            } catch {
                                toast.error('Save failed', 'Could not update session timeout.')
                            }
                        }}
                        disabled={isLoading || updateSecurity.isPending}
                        aria-label="Auto Session Timeout"
                    />
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                    <div>
                        <p className="text-sm font-medium">Audit Logging</p>
                        <p className="text-xs text-muted-foreground">Track all admin actions and changes</p>
                    </div>
                    <Switch
                        checked={security?.auditLoggingEnabled ?? true}
                        onCheckedChange={() => handleToggle('auditLoggingEnabled')}
                        disabled={isLoading || updateSecurity.isPending}
                        aria-label="Audit Logging"
                    />
                </div>
            </div>
        </Section>
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
        /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(val.trim())

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

// ─── Login History Card ───────────────────────────────────────────────────────
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
                                    <p className="font-medium capitalize">{labelFor(h.eventType)}</p>
                                    <p className="text-xs text-muted-foreground truncate">{h.browser} on {h.os} · {h.ipAddress ?? 'unknown IP'}</p>
                                    {h.failureReason && <p className="text-xs text-red-500">{labelFor(h.failureReason)}</p>}
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
                                    : history.length > 0 ? 'You’ve reached the end' : ''}
                        </div>
                    </div>
                </div>
            )}
        </Section>
    )
}

// ─── Security Tab ─────────────────────────────────────────────────────────────
export function SecurityTab() {
    const { user } = useAuthStore()
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
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault()
                        if (!saving) handleUpdatePassword()
                    }}
                >
                    {/* Hidden username helps password managers associate the change with this account. */}
                    <input
                        type="text"
                        name="username"
                        autoComplete="username"
                        value={user?.email ?? ''}
                        readOnly
                        hidden
                        aria-hidden="true"
                        tabIndex={-1}
                    />
                    <div className="space-y-1.5">
                        <Label htmlFor="current_password">Current Password</Label>
                        <Input id="current_password" name="current_password" type="password" autoComplete="current-password" placeholder="••••••••" value={currentPw} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPw(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="new_password">New Password</Label>
                            <Input id="new_password" name="new_password" type="password" autoComplete="new-password" placeholder="Min. 8 characters" value={newPw} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPw(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm_password">Confirm New Password</Label>
                            <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" placeholder="Repeat new password" value={confirmPw} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPw(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit" size="sm" loading={saving}>Update Password</Button>
                    </div>
                </form>
            </Section>

            <SecurityPoliciesCard />
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
export function ActivityTab() {
    return (
        <div className="space-y-6">
            <LoginHistoryCard />
        </div>
    )
}
