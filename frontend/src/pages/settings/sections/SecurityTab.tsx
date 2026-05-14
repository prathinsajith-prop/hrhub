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
import { useInfiniteLoginHistory, type LoginHistoryRecord } from '@/hooks/useAudit'
import { Section } from './_shared'
import { useTranslation } from 'react-i18next'

// ─── Security Policies Card ────────────────────────────────────────────────────
function SecurityPoliciesCard() {
    const { t } = useTranslation()
    const { data: security, isLoading } = useSecuritySettings()
    const updateSecurity = useUpdateSecuritySettings()

    const handleToggle = async (key: 'auditLoggingEnabled') => {
        if (!security) return
        try {
            await updateSecurity.mutateAsync({ [key]: !security[key] })
        } catch {
            toast.error(t('common.error'), t('settingsDetail.security.saveFailedDesc'))
        }
    }

    return (
        <Section icon={Shield} title={t('settingsDetail.security.policiesTitle')} description={t('settingsDetail.security.policiesDesc')}>
            <div className="divide-y border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3.5">
                    <div>
                        <p className="text-sm font-medium">{t('settingsDetail.security.sessionTimeoutTitle')}</p>
                        <p className="text-xs text-muted-foreground">
                            {(security?.sessionTimeoutMinutes ?? 0) > 0
                                ? t('settingsDetail.security.sessionTimeoutActive', { minutes: security?.sessionTimeoutMinutes ?? 480 })
                                : t('settingsDetail.security.sessionTimeoutOff')}
                        </p>
                    </div>
                    <Switch
                        checked={(security?.sessionTimeoutMinutes ?? 480) > 0}
                        onCheckedChange={async (checked) => {
                            try {
                                await updateSecurity.mutateAsync({ sessionTimeoutMinutes: checked ? 480 : 0 })
                            } catch {
                                toast.error(t('common.error'), t('settingsDetail.security.sessionTimeoutFailed'))
                            }
                        }}
                        disabled={isLoading || updateSecurity.isPending}
                        aria-label={t('settingsDetail.security.sessionTimeoutTitle')}
                    />
                </div>
                <div className="flex items-center justify-between px-4 py-3.5">
                    <div>
                        <p className="text-sm font-medium">{t('settingsDetail.security.auditLoggingTitle')}</p>
                        <p className="text-xs text-muted-foreground">{t('settingsDetail.security.auditLoggingDesc')}</p>
                    </div>
                    <Switch
                        checked={security?.auditLoggingEnabled ?? true}
                        onCheckedChange={() => handleToggle('auditLoggingEnabled')}
                        disabled={isLoading || updateSecurity.isPending}
                        aria-label={t('settingsDetail.security.auditLoggingTitle')}
                    />
                </div>
            </div>
        </Section>
    )
}

// ─── Two-Factor Authentication Card ──────────────────────────────────────────
function TwoFactorCard() {
    const { t } = useTranslation()
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
            toast.error(t('settingsDetail.security.mfaSetupFailed'), t('settingsDetail.security.mfaSetupFailedDesc'))
        }
    }

    const handleVerify = async () => {
        if (token.length !== 6) { toast.warning(t('settingsDetail.security.invalidCode'), t('settingsDetail.security.invalidCodeDesc')); return }
        try {
            const result = await verify.mutateAsync(token)
            toast.success(t('settingsDetail.security.mfaEnabled'), t('settingsDetail.security.mfaEnabledDesc'))
            setStep('idle'); setToken(''); setQrDataUrl(null); setSecret(null)
            // Show backup codes — user must save them now
            if (result.backupCodes?.length) setBackupCodes(result.backupCodes)
        } catch {
            toast.error(t('settingsDetail.security.verificationFailed'), t('settingsDetail.security.verificationFailedDesc'))
        }
    }

    const handleDisable = async () => {
        if (token.length !== 6) { toast.warning(t('settingsDetail.security.invalidCode'), t('settingsDetail.security.invalidCodeDesc')); return }
        try {
            await disable.mutateAsync(token)
            toast.success(t('settingsDetail.security.mfaDisabled'), t('settingsDetail.security.mfaDisabledDesc'))
            setStep('idle'); setToken('')
        } catch {
            toast.error(t('settingsDetail.security.verificationFailed'), t('settingsDetail.security.verificationFailedDesc'))
        }
    }

    const handleRegenerate = async () => {
        if (token.length !== 6) { toast.warning(t('settingsDetail.security.invalidCode'), t('settingsDetail.security.invalidCodeDesc')); return }
        try {
            const result = await regenerate.mutateAsync(token)
            toast.success(t('settingsDetail.security.backupCodesRegenerated'), t('settingsDetail.security.backupCodesRegeneratedDesc'))
            setStep('idle'); setToken('')
            setBackupCodes(result.backupCodes)
        } catch {
            toast.error(t('settingsDetail.security.regenerationFailed'), t('settingsDetail.security.verificationFailedDesc'))
        }
    }

    const copySecret = () => {
        if (!secret) return
        navigator.clipboard.writeText(secret).then(
            () => toast.success(t('settingsDetail.security.copied'), t('settingsDetail.security.secretCopied')),
            () => toast.error(t('settingsDetail.security.copyFailed'), t('settingsDetail.security.copyFailedDesc')),
        )
    }

    const copyBackupCodes = () => {
        if (!backupCodes) return
        navigator.clipboard.writeText(backupCodes.join('\n')).then(
            () => toast.success(t('settingsDetail.security.copied'), t('settingsDetail.security.allCodesCopied')),
            () => toast.error(t('settingsDetail.security.copyFailed'), t('settingsDetail.security.copyCodesFailed')),
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
            title={t('settingsDetail.security.mfaTitle')}
            description={t('settingsDetail.security.mfaDesc')}
            action={!isLoading && (
                <Badge variant={enabled ? 'success' : 'secondary'} className="gap-1">
                    {enabled && <CheckCircle2 className="h-3 w-3" />}
                    {enabled ? t('common.active') : t('settingsDetail.security.mfaOff')}
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
                                    <p className="text-sm font-medium leading-tight">{t('settingsDetail.security.authenticatorApp')}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                        {t('settingsDetail.security.authenticatorAppDesc')}
                                    </p>
                                </div>
                            </div>
                            {enabled ? (
                                <Button variant="outline" size="sm" onClick={() => setStep('disable')} className="shrink-0">
                                    {t('settingsDetail.security.turnOff')}
                                </Button>
                            ) : (
                                <Button size="sm" onClick={handleSetup} loading={setup.isPending} className="shrink-0">
                                    {t('settingsDetail.security.setUp')}
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
                                    <p className="text-sm font-medium leading-tight">{t('settingsDetail.security.recoveryBackupCodes')}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {backupRemaining > 0
                                            ? t('settingsDetail.security.backupCodesRemaining', { count: backupRemaining })
                                            : t('settingsDetail.security.noActiveCodes')}
                                    </p>
                                </div>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setStep('regenerate')} className="shrink-0">
                                {backupRemaining > 0 ? t('settingsDetail.security.regenerate') : t('settingsDetail.security.generate')}
                            </Button>
                        </div>
                    )}

                    {/* One-time display of plaintext backup codes */}
                    {backupCodes && (
                        <div className="space-y-3 rounded-lg border-2 border-amber-500/30 bg-amber-500/5 p-4">
                            <div className="flex items-start gap-2">
                                <Key className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-foreground">{t('settingsDetail.security.saveCodesNow')}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {t('settingsDetail.security.saveCodesDesc')}
                                    </p>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border border-border bg-background p-3">
                                {backupCodes.map((c) => (
                                    <code key={c} className="text-sm font-mono text-foreground tracking-wider text-center py-1">
                                        {c}
                                    </code>
                                ))}
                            </div>
                            <div className="flex gap-2 justify-end pt-1">
                                <Button size="sm" variant="outline" onClick={copyBackupCodes}>{t('settingsDetail.security.copyAll')}</Button>
                                <Button size="sm" variant="outline" onClick={downloadBackupCodes}>{t('settingsDetail.security.downloadTxt')}</Button>
                                <Button size="sm" onClick={() => setBackupCodes(null)}>{t('settingsDetail.security.iSavedThem')}</Button>
                            </div>
                        </div>
                    )}

                    {step === 'regenerate' && (
                        <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                            <p className="text-sm text-foreground">
                                {t('settingsDetail.security.regenPrompt')}
                            </p>
                            <div className="space-y-2">
                                <Label htmlFor="regen_token" className="text-xs">{t('settingsDetail.security.verificationCode')}</Label>
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
                                <Button size="sm" variant="ghost" onClick={() => { setStep('idle'); setToken('') }}>{t('common.cancel')}</Button>
                                <Button size="sm" onClick={handleRegenerate} loading={regenerate.isPending} disabled={token.length !== 6}>
                                    {t('settingsDetail.security.generateNewCodes')}
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'setup' && qrDataUrl && (
                        <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                            <ol className="space-y-1 text-xs text-muted-foreground list-decimal list-inside">
                                <li>{t('settingsDetail.security.setupStep1')}</li>
                                <li>{t('settingsDetail.security.setupStep2')}</li>
                            </ol>

                            <div className="grid sm:grid-cols-[auto_1fr] gap-4 items-start">
                                <div className="rounded-lg bg-background border border-border p-2 mx-auto sm:mx-0">
                                    <img src={qrDataUrl} alt={t('settingsDetail.security.qrAlt')} className="rounded w-40 h-40 block" />
                                </div>
                                {secret && (
                                    <div className="space-y-2">
                                        <Label className="text-xs text-muted-foreground">{t('settingsDetail.security.orEnterManually')}</Label>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono break-all leading-relaxed">
                                                {secret}
                                            </code>
                                            <Button type="button" variant="outline" size="sm" onClick={copySecret} className="shrink-0">
                                                {t('settingsDetail.security.copy')}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2 pt-2 border-t border-border">
                                <Label htmlFor="totp_token" className="text-xs">{t('settingsDetail.security.verificationCode')}</Label>
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
                                <Button size="sm" variant="ghost" onClick={cancel}>{t('common.cancel')}</Button>
                                <Button size="sm" onClick={handleVerify} loading={verify.isPending} disabled={token.length !== 6}>
                                    {t('settingsDetail.security.confirmEnable')}
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 'disable' && (
                        <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                            <p className="text-sm text-foreground">
                                {t('settingsDetail.security.disablePrompt')}
                            </p>
                            <div className="space-y-2">
                                <Label htmlFor="disable_token" className="text-xs">{t('settingsDetail.security.verificationCode')}</Label>
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
                                <Button size="sm" variant="ghost" onClick={() => { setStep('idle'); setToken('') }}>{t('common.cancel')}</Button>
                                <Button size="sm" variant="destructive" onClick={handleDisable} loading={disable.isPending} disabled={token.length !== 6}>
                                    {t('settingsDetail.security.turnOff2fa')}
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
    const { t } = useTranslation()
    const { data, isLoading } = useIpAllowlist()
    const updateList = useUpdateIpAllowlist()
    const [newEntry, setNewEntry] = useState('')
    const list: string[] = data?.ipAllowlist ?? []

    const isValidCidr = (val: string) =>
        /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(val.trim())

    const handleAdd = async () => {
        const trimmed = newEntry.trim()
        if (!isValidCidr(trimmed)) { toast.warning(t('settingsDetail.security.invalidEntry'), t('settingsDetail.security.invalidEntryDesc')); return }
        if (list.includes(trimmed)) { toast.warning(t('settingsDetail.security.duplicate'), t('settingsDetail.security.duplicateDesc')); return }
        try {
            await updateList.mutateAsync([...list, trimmed])
            setNewEntry('')
            toast.success(t('settingsDetail.security.ipAdded'), t('settingsDetail.security.ipAddedDesc', { ip: trimmed }))
        } catch {
            toast.error(t('settingsDetail.security.updateFailed'), t('settingsDetail.security.ipUpdateFailedDesc'))
        }
    }

    const handleRemove = async (ip: string) => {
        try {
            await updateList.mutateAsync(list.filter((x) => x !== ip))
            toast.success(t('settingsDetail.security.ipRemoved'), t('settingsDetail.security.ipRemovedDesc', { ip }))
        } catch {
            toast.error(t('settingsDetail.security.updateFailed'), t('settingsDetail.security.ipUpdateFailedDesc'))
        }
    }

    return (
        <Section
            icon={Globe}
            title={t('settingsDetail.security.ipAllowlistTitle')}
            description={t('settingsDetail.security.ipAllowlistDesc')}
        >
            {isLoading ? (
                <Skeleton className="h-20 w-full" />
            ) : (
                <div className="space-y-4">
                    {list.length === 0 ? (
                        <p className="text-sm text-muted-foreground italic">{t('settingsDetail.security.noIpRestrictions')}</p>
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
                                        aria-label={t('settingsDetail.security.removeIp', { ip })}
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
                            {t('common.add')}
                        </Button>
                    </div>
                </div>
            )}
        </Section>
    )
}

// ─── Login History Card ───────────────────────────────────────────────────────
function LoginHistoryCard() {
    const { t } = useTranslation()
    const {
        data,
        isLoading,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useInfiniteLoginHistory({ pageSize: 10 })
    const history = (data?.pages.flat() ?? []) as LoginHistoryRecord[]

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
            title={t('settingsDetail.security.loginHistoryTitle')}
            description={t('settingsDetail.security.loginHistoryDesc')}
        >
            {isLoading ? (
                <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-12 rounded bg-muted animate-pulse" />)}</div>
            ) : history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-10 border rounded-lg">{t('settingsDetail.security.noLoginHistory')}</p>
            ) : (
                <div className="border rounded-lg overflow-hidden">
                    <div className="max-h-[480px] overflow-y-auto divide-y text-sm">
                        {history.map((h) => (
                            <div key={h.id} className="flex items-start justify-between px-4 py-3 gap-3 hover:bg-muted/30 transition-colors">
                                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                                    {eventIcon(h.eventType)}
                                    {deviceIcon(h.deviceType ?? 'unknown')}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-medium capitalize">{labelFor(h.eventType)}</p>
                                    <p className="text-xs text-muted-foreground truncate">{h.browser} on {h.os} · {h.ipAddress ?? t('settingsDetail.security.unknownIp')}</p>
                                    {h.failureReason && <p className="text-xs text-red-500">{labelFor(h.failureReason)}</p>}
                                </div>
                                <div className="text-xs text-muted-foreground whitespace-nowrap">
                                    {new Date(h.createdAt).toLocaleString('en-AE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        ))}
                        <div ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
                            {isFetchingNextPage
                                ? t('settingsDetail.security.loadingMore')
                                : hasNextPage
                                    ? t('settingsDetail.security.scrollToLoad')
                                    : history.length > 0 ? t('settingsDetail.security.reachedEnd') : ''}
                        </div>
                    </div>
                </div>
            )}
        </Section>
    )
}

// ─── Security Tab ─────────────────────────────────────────────────────────────
export function SecurityTab() {
    const { t } = useTranslation()
    const { user } = useAuthStore()
    const [currentPw, setCurrentPw] = useState('')
    const [newPw, setNewPw] = useState('')
    const [confirmPw, setConfirmPw] = useState('')
    const [saving, setSaving] = useState(false)

    const handleUpdatePassword = async () => {
        if (!currentPw || !newPw || !confirmPw) { toast.warning(t('settingsDetail.security.missingFields'), t('settingsDetail.security.missingFieldsDesc')); return }
        if (newPw !== confirmPw) { toast.warning(t('settingsDetail.security.passwordMismatch'), t('settingsDetail.security.passwordMismatchDesc')); return }
        if (newPw.length < 8) { toast.warning(t('settingsDetail.security.passwordTooShort'), t('settingsDetail.security.passwordTooShortDesc')); return }
        setSaving(true)
        try {
            await api.post('/auth/change-password', { currentPassword: currentPw, newPassword: newPw })
            toast.success(t('settingsDetail.security.passwordUpdated'), t('settingsDetail.security.passwordUpdatedDesc'))
            setCurrentPw(''); setNewPw(''); setConfirmPw('')
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('settingsDetail.security.passwordUpdateDefaultError')
            toast.error(t('settingsDetail.security.updateFailed'), msg)
        } finally { setSaving(false) }
    }

    return (
        <div className="space-y-5">
            <Section
                icon={Key}
                title={t('settings.updatePassword')}
                description={t('settingsDetail.security.passwordDesc')}
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
                        <Label htmlFor="current_password">{t('auth.currentPassword')}</Label>
                        <Input id="current_password" name="current_password" type="password" autoComplete="current-password" placeholder="••••••••" value={currentPw} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrentPw(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="new_password">{t('auth.newPassword')}</Label>
                            <Input id="new_password" name="new_password" type="password" autoComplete="new-password" placeholder={t('settingsDetail.security.minCharsPlaceholder')} value={newPw} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPw(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm_password">{t('settingsDetail.security.confirmNewPassword')}</Label>
                            <Input id="confirm_password" name="confirm_password" type="password" autoComplete="new-password" placeholder={t('settingsDetail.security.repeatNewPassword')} value={confirmPw} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPw(e.target.value)} />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <Button type="submit" size="sm" loading={saving}>{t('auth.updatePassword')}</Button>
                    </div>
                </form>
            </Section>

            <SecurityPoliciesCard />
            <TwoFactorCard />
            <IpAllowlistCard />

            <Section
                icon={AlertCircle}
                title={t('settingsDetail.security.dangerZoneTitle')}
                description={t('settingsDetail.security.dangerZoneDesc')}
                className="border-destructive/30"
            >
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div className="min-w-0">
                            <p className="text-sm font-medium">{t('settingsDetail.security.exportAllData')}</p>
                            <p className="text-xs text-muted-foreground">{t('settingsDetail.security.exportAllDataDesc')}</p>
                        </div>
                        <Button variant="outline" size="sm" leftIcon={<FileText className="h-3.5 w-3.5" />} className="shrink-0">{t('common.export')}</Button>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-destructive">{t('settings.deleteAccount')}</p>
                            <p className="text-xs text-muted-foreground">{t('settingsDetail.security.deleteAccountDesc')}</p>
                        </div>
                        <Button variant="destructive" size="sm" leftIcon={<Trash2 className="h-3.5 w-3.5" />} className="shrink-0">{t('common.delete')}</Button>
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
