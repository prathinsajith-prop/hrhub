import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Copy, Download, KeyRound, Loader2, Smartphone } from 'lucide-react'

import { ApiError } from '@/lib/api'
import {
    useTwoFactorStatus,
    useSetupTwoFactor,
    useVerifyTwoFactor,
    useDisableTwoFactor,
    useRegenerateBackupCodes,
} from '@/hooks/useTwoFactor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'

/** Normalize an API/unknown error into a user-facing message. */
function twoFaError(err: unknown, fallback: string): string {
    return err instanceof ApiError ? err.message : fallback
}

/**
 * Self-contained 2FA (TOTP) management card for the employee portal.
 * Owns the setup mutation + which inline panel is open; the enrollment and
 * code-prompt panels render inline in the page (no modal). Backed by useTwoFactor.
 */
export function TwoFactorCard() {
    const { t } = useTranslation()
    const { data: status, isLoading } = useTwoFactorStatus()
    const setup = useSetupTwoFactor()
    // Inline panels rendered IN the card (no modal): one open at a time.
    const [panel, setPanel] = useState<'none' | 'enroll' | 'disable' | 'regenerate'>('none')
    // QR + secret captured from the setup response (only while enrolling).
    const [enrollData, setEnrollData] = useState<{ qrDataUrl: string; secret: string } | null>(null)
    const enabled = status?.enabled ?? false

    // NOTE: do NOT auto-close panels when `enabled` flips. Enabling refetches the
    // status (enabled→true) while the enroll panel is still showing the one-time
    // backup codes — closing here would destroy them before the user saves them.
    // Each panel closes itself explicitly (savedThem / disable success / cancel).

    // Trigger /2fa/setup from the CLICK handler (not an effect) so it fires
    // exactly once on the live component — avoids React StrictMode's
    // mount/unmount/remount dropping the mutation result. The panel only opens
    // once we have the QR, so it can never show an empty placeholder.
    function startEnroll() {
        if (panel === 'enroll') { setPanel('none'); return }
        setup.mutate(undefined, {
            onSuccess: (d) => { setEnrollData({ qrDataUrl: d.qrDataUrl, secret: d.secret }); setPanel('enroll') },
            onError: () => toast.error(t('security.setupFailed')),
        })
    }

    return (
        <Card className="overflow-hidden border-border/70">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        <Smartphone className="size-5" />
                    </span>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-semibold">{t('security.mfaTitle')}</h3>
                            {!isLoading && (
                                <Badge variant={enabled ? 'default' : 'secondary'} className="text-[10px]">
                                    {enabled ? t('security.mfaOn') : t('security.mfaOff')}
                                </Badge>
                            )}
                        </div>
                        <p className="max-w-md text-xs text-muted-foreground">{t('security.mfaDesc')}</p>
                        {enabled && (
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                {t('security.backupCodesRemaining', { count: status?.backupCodesRemaining ?? 0 })}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {enabled ? (
                        <>
                            <Button variant="outline" size="sm" onClick={() => setPanel(panel === 'regenerate' ? 'none' : 'regenerate')}>
                                <KeyRound className="size-3.5" /> {t('security.regenerate')}
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setPanel(panel === 'disable' ? 'none' : 'disable')}>
                                {t('security.disable')}
                            </Button>
                        </>
                    ) : (
                        <Button size="sm" disabled={isLoading || setup.isPending} onClick={startEnroll}>
                            {setup.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                            {t('security.enable')}
                        </Button>
                    )}
                </div>
            </CardContent>

            {/* Inline panels — rendered in the page, not a modal. */}
            {panel === 'enroll' && enrollData && (
                <div className="border-t bg-muted/20 p-5">
                    <EnrollTwoFactor
                        qrDataUrl={enrollData.qrDataUrl}
                        secret={enrollData.secret}
                        onCancel={() => { setPanel('none'); setEnrollData(null) }}
                    />
                </div>
            )}
            {panel === 'disable' && (
                <div className="border-t bg-muted/20 p-5">
                    <CodePromptInline mode="disable" onCancel={() => setPanel('none')} />
                </div>
            )}
            {panel === 'regenerate' && (
                <div className="border-t bg-muted/20 p-5">
                    <CodePromptInline mode="regenerate" onCancel={() => setPanel('none')} />
                </div>
            )}
        </Card>
    )
}

/** Shows a one-time list of backup codes with copy-to-clipboard. */
function BackupCodes({ codes }: { codes: string[] }) {
    const { t } = useTranslation()
    const [copied, setCopied] = useState(false)

    function copy() {
        navigator.clipboard?.writeText(codes.join('\n')).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        }).catch(() => {})
    }

    /** Save the codes as a plain-text file (AWS-style), with a dated header + note. */
    function download() {
        const stamp = new Date().toISOString().slice(0, 10)
        const body = [
            `${t('app.name', { defaultValue: 'HRHub' })} — ${t('security.mfaTitle')}`,
            `${t('security.codesGeneratedOn', { defaultValue: 'Generated' })}: ${stamp}`,
            '',
            t('security.backupCodesDesc'),
            '',
            ...codes,
            '',
        ].join('\n')
        const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }))
        const a = document.createElement('a')
        a.href = url
        a.download = `hrhub-backup-codes-${stamp}.txt`
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
    }

    return (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
            <p className="text-xs text-amber-800 dark:text-amber-200">{t('security.backupCodesDesc')}</p>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-sm">
                {codes.map((c) => <span key={c} className="rounded bg-background/70 px-2 py-1 text-center tracking-wider">{c}</span>)}
            </div>
            <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={copy} className="flex-1">
                    <Copy className="size-3.5" /> {copied ? t('security.copied') : t('security.copyCodes')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={download} className="flex-1">
                    <Download className="size-3.5" /> {t('security.downloadCodes')}
                </Button>
            </div>
        </div>
    )
}

/** A centered 6-digit code input, shared by every 2FA form (auto-focused on mount). */
function CodeInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
    return (
        <Input
            id={id}
            value={value}
            // Digits-only TOTP entry; focus on mount so the user can type immediately.
            onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="6-digit code"
            maxLength={6}
            className="text-center text-lg tracking-[0.3em]"
        />
    )
}

/** Inline 2FA enrollment: QR + secret → confirm code → one-time backup codes.
 *  The QR/secret are passed in as props (already fetched by the parent on click),
 *  so this component never fires a mount-time mutation and the QR is always ready. */
function EnrollTwoFactor({ qrDataUrl, secret, onCancel }: { qrDataUrl: string; secret: string; onCancel: () => void }) {
    const { t } = useTranslation()
    const verify = useVerifyTwoFactor()
    const [code, setCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [backupCodes, setBackupCodes] = useState<string[] | null>(null)

    function onVerify(e: FormEvent) {
        e.preventDefault()
        setError(null)
        verify.mutate(code, {
            onSuccess: (res) => { setBackupCodes(res.backupCodes); toast.success(t('security.enabledToast')) },
            onError: (err) => setError(twoFaError(err, t('security.invalidCode'))),
        })
    }

    if (backupCodes) {
        return (
            <div className="space-y-3">
                <p className="text-sm font-medium">{t('security.backupCodesTitle')}</p>
                <BackupCodes codes={backupCodes} />
                <Button className="w-full" onClick={onCancel}>{t('security.savedThem')}</Button>
            </div>
        )
    }

    return (
        <form className="space-y-4" onSubmit={onVerify}>
            {error ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
            ) : null}
            <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">{t('security.setupStep1')}</p>
                <div className="flex justify-center">
                    <img src={qrDataUrl} alt="2FA QR code" className="size-44 rounded-xl border bg-white p-2" />
                </div>
                <p className="text-center text-[11px] text-muted-foreground">
                    {t('security.orEnterSecret')}<br />
                    <code className="select-all font-mono text-xs tracking-wider text-foreground">{secret}</code>
                </p>
            </div>
            <div className="space-y-1.5">
                <Label htmlFor="enableCode">{t('security.setupStep2')}</Label>
                <CodeInput id="enableCode" value={code} onChange={(v) => { setCode(v); if (error) setError(null) }} />
            </div>
            <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onCancel}>{t('security.cancel')}</Button>
                <Button type="submit" disabled={verify.isPending || code.length < 6}>
                    {verify.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {t('security.confirmEnable')}
                </Button>
            </div>
        </form>
    )
}

/** Inline current-code prompt for disabling 2FA or regenerating backup codes. */
function CodePromptInline({ mode, onCancel }: { mode: 'disable' | 'regenerate'; onCancel: () => void }) {
    const { t } = useTranslation()
    const disable = useDisableTwoFactor()
    const regen = useRegenerateBackupCodes()
    const [code, setCode] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [newCodes, setNewCodes] = useState<string[] | null>(null)
    const pending = disable.isPending || regen.isPending

    function onSubmit(e: FormEvent) {
        e.preventDefault()
        setError(null)
        if (mode === 'disable') {
            disable.mutate(code, {
                onSuccess: () => { toast.success(t('security.disabledToast')); onCancel() },
                onError: (err) => setError(twoFaError(err, t('security.invalidCode'))),
            })
        } else {
            regen.mutate(code, {
                onSuccess: (res) => setNewCodes(res.backupCodes),
                onError: (err) => setError(twoFaError(err, t('security.invalidCode'))),
            })
        }
    }

    if (newCodes) {
        return (
            <div className="space-y-3">
                <BackupCodes codes={newCodes} />
                <Button className="w-full" onClick={onCancel}>{t('security.savedThem')}</Button>
            </div>
        )
    }

    return (
        <form className="space-y-3" onSubmit={onSubmit}>
            {error ? (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>
            ) : null}
            <div className="space-y-1.5">
                <Label htmlFor="promptCode">{t('security.currentCode')}</Label>
                <CodeInput id="promptCode" value={code} onChange={(v) => { setCode(v); if (error) setError(null) }} />
            </div>
            <div className="flex items-center justify-end gap-2">
                <Button type="button" variant="ghost" onClick={onCancel}>{t('security.cancel')}</Button>
                <Button type="submit" disabled={pending || code.length < 6}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {mode === 'disable' ? t('security.disable') : t('security.regenerate')}
                </Button>
            </div>
        </form>
    )
}
