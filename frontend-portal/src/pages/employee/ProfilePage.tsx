import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CalendarDays, Check, Clock, Copy, Eye, EyeOff, KeyRound, Languages, Loader2, Mail, Phone, Pencil, Save, ShieldCheck, Smartphone, X } from 'lucide-react'

import { ApiError } from '@/lib/api'
import { useMyEmployee, useUpdateMyProfile, type UpdateMyProfileBody } from '@/hooks/useMe'
import { useChangePassword } from '@/hooks/useChangePassword'
import {
    useTwoFactorStatus,
    useSetupTwoFactor,
    useVerifyTwoFactor,
    useDisableTwoFactor,
    useRegenerateBackupCodes,
} from '@/hooks/useTwoFactor'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/shared/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn, formatDate, formatShiftRange } from '@/lib/utils'

export function EmployeeProfilePage() {
    const { t } = useTranslation()
    const { data: employee, isLoading } = useMyEmployee()
    const update = useUpdateMyProfile()
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState<UpdateMyProfileBody>({})

    // State-during-render pattern (React docs): when the server-returned
    // `employee` changes, push its values into local form state. The state
    // value itself is consumed by the `!==` check on this very line — that
    // counts as a render-time read, so this isn't a refs-only situation.
    const [lastSyncedEmployeeId, setLastSyncedEmployeeId] = useState<string | null>(null)
    if (employee && employee.id !== lastSyncedEmployeeId) {
        setLastSyncedEmployeeId(employee.id)
        setForm({
            phone: employee.phone ?? '',
            mobileNo: employee.mobileNo ?? '',
            personalEmail: employee.personalEmail ?? '',
            emergencyContact: employee.emergencyContact ?? '',
            emergencyContactName: employee.emergencyContactName ?? '',
            emergencyContactPhone: employee.emergencyContactPhone ?? '',
            homeCountryAddress: employee.homeCountryAddress ?? '',
        })
    }

    if (isLoading || !employee) return <ProfileSkeleton />

    function onChange(field: keyof UpdateMyProfileBody, value: string) {
        setForm((prev) => ({ ...prev, [field]: value }))
    }

    function onSave() {
        // Strip empty strings so we don't store ""
        const cleaned: UpdateMyProfileBody = {}
        for (const k of Object.keys(form) as (keyof UpdateMyProfileBody)[]) {
            const v = form[k]
            if (v !== undefined && v !== '') cleaned[k] = v as string
        }
        if (Object.keys(cleaned).length === 0) {
            setEditing(false)
            return
        }
        update.mutate(cleaned, {
            onSuccess: () => {
                toast.success(t('profile.updated'))
                setEditing(false)
            },
        })
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`${employee.firstName} ${employee.lastName}`}
                subtitle={[employee.designation, employee.departmentName ?? employee.department].filter(Boolean).join(' · ') || undefined}
                action={
                    editing ? (
                        <>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={update.isPending}>
                                <X className="size-4" /> {t('common.cancel')}
                            </Button>
                            <Button size="sm" onClick={onSave} loading={update.isPending}>
                                <Save className="size-4" /> {t('profile.saveChanges')}
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                            <Pencil className="size-3.5" /> {t('profile.edit')}
                        </Button>
                    )
                }
            />

            <Tabs defaultValue="personal">
                <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto">
                    <TabsTrigger value="personal">Personal</TabsTrigger>
                    <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                {/* ── Personal: Employment basics + Schedule + Contact + Address + Emergency ── */}
                <TabsContent value="personal" className="space-y-4">
                    <Card className="overflow-hidden border-border/70">
                        <CardContent className="p-5">
                            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('profile.employment')}
                            </h3>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <Field label="Employee No" value={employee.employeeNo} />
                                <Field label="Status" value={employee.status} />
                                <Field label="Join date" value={formatDate(employee.joinDate)} />
                                <Field label="Designation" value={employee.designation ?? '—'} />
                                <Field label="Nationality" value={employee.nationality ?? '—'} />
                                {/* Branch → Division → Department triad — joined
                                    from org_units server-side. We hide rows that
                                    have no value so a flat-org tenant (just one
                                    branch) doesn't show three em-dashes. */}
                                {employee.branchName ? (
                                    <Field label="Branch" value={employee.branchName} />
                                ) : null}
                                {employee.divisionName ? (
                                    <Field label="Division" value={employee.divisionName} />
                                ) : null}
                                <Field
                                    label="Department"
                                    value={employee.departmentName ?? employee.department ?? '—'}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <ScheduleCard shift={employee.shift ?? null} />

                    <Card className="overflow-hidden border-border/70">
                        <CardContent className="p-5">
                            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('profile.contact')}
                            </h3>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field label="Work email" value={employee.email ?? '—'} icon={<Mail className="size-3.5" />} />
                                <EditableField
                                    label="Personal email"
                                    value={form.personalEmail ?? employee.personalEmail ?? ''}
                                    editing={editing}
                                    onChange={(v) => onChange('personalEmail', v)}
                                    type="email"
                                />
                                <EditableField
                                    label="Phone"
                                    value={form.phone ?? employee.phone ?? ''}
                                    editing={editing}
                                    onChange={(v) => onChange('phone', v)}
                                    icon={<Phone className="size-3.5" />}
                                />
                                <EditableField
                                    label="Mobile"
                                    value={form.mobileNo ?? employee.mobileNo ?? ''}
                                    editing={editing}
                                    onChange={(v) => onChange('mobileNo', v)}
                                />
                            </div>

                            <h3 className="mb-4 mt-6 border-t border-border/60 pt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('profile.address')}
                            </h3>
                            <EditableField
                                label="Home country address"
                                value={form.homeCountryAddress ?? ''}
                                editing={editing}
                                onChange={(v) => onChange('homeCountryAddress', v)}
                            />

                            {/* Emergency contact merged in here — it's part of the
                                employee's personal record, not a separate tab worth
                                of content. */}
                            <h3 className="mb-4 mt-6 border-t border-border/60 pt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('profile.emergency')}
                            </h3>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <EditableField
                                    label="Contact name"
                                    value={form.emergencyContactName ?? ''}
                                    editing={editing}
                                    onChange={(v) => onChange('emergencyContactName', v)}
                                />
                                <EditableField
                                    label="Contact phone"
                                    value={form.emergencyContactPhone ?? ''}
                                    editing={editing}
                                    onChange={(v) => onChange('emergencyContactPhone', v)}
                                />
                                <EditableField
                                    label="Relationship / notes"
                                    value={form.emergencyContact ?? ''}
                                    editing={editing}
                                    onChange={(v) => onChange('emergencyContact', v)}
                                    className="sm:col-span-2"
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Settings: Language + Security ── */}
                <TabsContent value="settings" className="space-y-4">
                    <LanguageCard />
                    <SecurityCard />
                    <TwoFactorCard />
                </TabsContent>
            </Tabs>
        </div>
    )
}

const LANGUAGES: { code: 'en' | 'ar'; label: string; native: string }[] = [
    { code: 'en', label: 'English', native: 'EN' },
    { code: 'ar', label: 'العربية', native: 'AR' },
]

function LanguageCard() {
    const { i18n } = useTranslation()
    const current = (i18n.language?.slice(0, 2) ?? 'en') as 'en' | 'ar'
    return (
        <Card className="overflow-hidden border-border/70">
            <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <Languages className="size-5" />
                    </span>
                    <div>
                        <h3 className="text-sm font-semibold">Language</h3>
                        <p className="text-xs text-muted-foreground">Choose the interface language.</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    {LANGUAGES.map((l) => {
                        const active = current === l.code
                        return (
                            <button
                                key={l.code}
                                type="button"
                                onClick={() => i18n.changeLanguage(l.code)}
                                className={cn(
                                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                                    active
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border hover:border-primary/40 hover:bg-muted',
                                )}
                                aria-pressed={active}
                            >
                                {active ? <Check className="size-3.5" /> : null}
                                <span>{l.label}</span>
                                <span className="text-[10px] tracking-wider text-muted-foreground">{l.native}</span>
                            </button>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}

function SecurityCard() {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    return (
        <Card className="overflow-hidden border-border/70">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <ShieldCheck className="size-5" />
                    </span>
                    <div>
                        <h3 className="text-sm font-semibold">{t('security.title')}</h3>
                        <p className="text-xs text-muted-foreground">{t('security.changePassword')}</p>
                    </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                    {t('security.changePassword')}
                </Button>
            </CardContent>
            <ChangePasswordDialog open={open} onOpenChange={setOpen} />
        </Card>
    )
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
    const { t } = useTranslation()
    const change = useChangePassword()
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirm, setConfirm] = useState('')
    const [show, setShow] = useState(false)
    const [error, setError] = useState<string | null>(null)

    function reset() {
        setCurrentPassword('')
        setNewPassword('')
        setConfirm('')
        setShow(false)
        setError(null)
    }

    function onSubmit(e: FormEvent) {
        e.preventDefault()
        setError(null)
        if (newPassword.length < 8) {
            setError(t('auth.passwordTooShort'))
            return
        }
        if (newPassword !== confirm) {
            setError(t('security.passwordsDontMatch'))
            return
        }
        change.mutate(
            { currentPassword, newPassword },
            {
                onSuccess: () => {
                    toast.success(t('security.passwordChanged'))
                    reset()
                    onOpenChange(false)
                },
                onError: (err) => {
                    setError(err instanceof ApiError ? err.message : (err as Error).message)
                },
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v) }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('security.changePassword')}</DialogTitle>
                </DialogHeader>
                <form className="space-y-3" onSubmit={onSubmit}>
                    {error ? (
                        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                            {error}
                        </p>
                    ) : null}
                    <div className="space-y-1.5">
                        <Label>{t('security.currentPassword')}</Label>
                        <Input
                            type={show ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>{t('security.newPassword')}</Label>
                        <div className="relative">
                            <Input
                                type={show ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                autoComplete="new-password"
                                minLength={8}
                                required
                                className="pe-11"
                            />
                            <button
                                type="button"
                                onClick={() => setShow((v) => !v)}
                                aria-label={show ? 'Hide password' : 'Show password'}
                                aria-pressed={show}
                                className="absolute end-0 top-0 flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>{t('security.confirmNew')}</Label>
                        <Input
                            type={show ? 'text' : 'password'}
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            autoComplete="new-password"
                            minLength={8}
                            required
                        />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => { reset(); onOpenChange(false) }}>
                            {t('common.cancel')}
                        </Button>
                        <Button type="submit" loading={change.isPending}>
                            {t('security.changePassword')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

// Day-name ordering used by the weekly-off chips. Mirrors the
// backend's WEEKDAY_NAMES table so casing of the saved strings doesn't matter.
const WEEK_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const WEEK_DAY_SHORT: Record<(typeof WEEK_DAYS)[number], string> = {
    sunday: 'Sun', monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
    thursday: 'Thu', friday: 'Fri', saturday: 'Sat',
}

interface ShiftInfo {
    name: string
    startTime: string
    endTime: string
    weeklyOffDays: string[]
}

/**
 * Dedicated schedule card — surfaces the shift name, work hours, and which
 * days of the week are off. When the employee has no shift assigned, falls
 * back to a short hint about tenant-default hours so the panel isn't blank.
 */
function ScheduleCard({ shift }: { shift: ShiftInfo | null }) {
    const range = shift ? formatShiftRange(shift.startTime, shift.endTime) : null
    const offSet = new Set((shift?.weeklyOffDays ?? []).map((d) => d.toLowerCase()))

    return (
        <Card className="overflow-hidden border-border/70">
            <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Clock className="size-3.5" /> Schedule
                    </h3>
                    {shift ? (
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                            {shift.name}
                        </span>
                    ) : (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            Default working hours
                        </span>
                    )}
                </div>

                {shift ? (
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 text-sm">
                            <Clock className="size-4 text-muted-foreground" />
                            <span className="font-display text-base font-semibold tabular-figures">
                                {range ?? '—'}
                            </span>
                        </div>

                        <div>
                            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                                <CalendarDays className="size-3" /> Weekly off
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {WEEK_DAYS.map((d) => {
                                    const isOff = offSet.has(d)
                                    return (
                                        <span
                                            key={d}
                                            className={
                                                isOff
                                                    ? 'inline-flex h-7 min-w-[44px] items-center justify-center rounded-md bg-rose-100 px-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                                                    : 'inline-flex h-7 min-w-[44px] items-center justify-center rounded-md border border-border bg-card/50 px-2 text-xs text-muted-foreground'
                                            }
                                        >
                                            {WEEK_DAY_SHORT[d]}
                                        </span>
                                    )
                                })}
                            </div>
                            {offSet.size === 0 ? (
                                <p className="mt-2 text-[11px] text-muted-foreground">
                                    No weekly off days configured for this shift.
                                </p>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        You're on the tenant's default working week. Ask HR if you need a custom shift.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

function Field({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
    return (
        <div>
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {icon}
                {label}
            </div>
            <div className="mt-1 text-sm font-medium">{value}</div>
        </div>
    )
}

function EditableField({
    label,
    value,
    editing,
    onChange,
    icon,
    type,
    className,
}: {
    label: string
    value: string
    editing: boolean
    onChange: (v: string) => void
    icon?: React.ReactNode
    type?: string
    className?: string
}) {
    return (
        <div className={className}>
            <Label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                {icon}
                {label}
            </Label>
            {editing ? (
                <Input
                    type={type ?? 'text'}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    className="mt-1.5"
                />
            ) : (
                <div className="mt-1 text-sm font-medium">{value || '—'}</div>
            )}
        </div>
    )
}

function ProfileSkeleton() {
    return (
        <div className="space-y-6">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
        </div>
    )
}

// ── Two-factor authentication ────────────────────────────────────────────────

/** Normalize an API/unknown error into a user-facing message. */
function twoFaError(err: unknown, fallback: string): string {
    return err instanceof ApiError ? err.message : fallback
}

function TwoFactorCard() {
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
    return (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-950/30">
            <p className="text-xs text-amber-800 dark:text-amber-200">{t('security.backupCodesDesc')}</p>
            <div className="grid grid-cols-2 gap-1.5 font-mono text-sm">
                {codes.map((c) => <span key={c} className="rounded bg-background/70 px-2 py-1 text-center tracking-wider">{c}</span>)}
            </div>
            <Button type="button" variant="outline" size="sm" onClick={copy} className="w-full">
                <Copy className="size-3.5" /> {copied ? t('security.copied') : t('security.copyCodes')}
            </Button>
        </div>
    )
}

/** A centered 6-digit / backup code input, shared by every 2FA form. */
function CodeInput({ id, value, onChange, placeholder = '123456', maxLength = 6 }: {
    id: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number
}) {
    return (
        <Input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={placeholder}
            maxLength={maxLength}
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
        verify.mutate(code.replace(/\D/g, ''), {
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
                <Button type="submit" disabled={verify.isPending || !qrDataUrl || code.replace(/\D/g, '').length < 6}>
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
        const token = code.replace(/\D/g, '')
        if (mode === 'disable') {
            disable.mutate(token, {
                onSuccess: () => { toast.success(t('security.disabledToast')); onCancel() },
                onError: (err) => setError(twoFaError(err, t('security.invalidCode'))),
            })
        } else {
            regen.mutate(token, {
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
                <Button type="submit" disabled={pending || code.replace(/\D/g, '').length < 6}>
                    {pending ? <Loader2 className="size-4 animate-spin" /> : null}
                    {mode === 'disable' ? t('security.disable') : t('security.regenerate')}
                </Button>
            </div>
        </form>
    )
}
