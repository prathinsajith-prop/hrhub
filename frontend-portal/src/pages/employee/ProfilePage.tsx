import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Check, Eye, EyeOff, Languages, Lock, Mail, Phone, Pencil, Save, Settings, ShieldCheck, User, X } from 'lucide-react'

import { ApiError } from '@/lib/api'
import { useMyEmployee, type UpdateMyProfileBody } from '@/hooks/useMe'
import { useSubmitChangeRequest } from '@/hooks/useProfileChanges'
import { useChangePassword } from '@/hooks/useChangePassword'
import { TwoFactorCard } from '@/components/security/TwoFactorCard'
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
import { cn, formatDate } from '@/lib/utils'

export function EmployeeProfilePage() {
    const { t } = useTranslation()
    const { data: employee, isLoading } = useMyEmployee()
    const submitChange = useSubmitChangeRequest()
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
        // Contact + personal details are employee-editable but require admin /
        // super_admin approval before they take effect. Rather than writing the
        // record directly, submit a change request per affected category — the
        // change is applied only once a reviewer approves it.
        const changedIn = (fields: readonly (keyof UpdateMyProfileBody)[]): Record<string, string | null> => {
            const out: Record<string, string | null> = {}
            const src = employee as unknown as Record<string, unknown>
            for (const f of fields) {
                const current = String(src[f] ?? '')
                const next = String(form[f] ?? '')
                if (current !== next) out[f] = next === '' ? null : next
            }
            return out
        }
        const contactChanges = changedIn(['phone', 'mobileNo', 'personalEmail'])
        const personalChanges = changedIn(['emergencyContactName', 'emergencyContactPhone', 'emergencyContact', 'homeCountryAddress'])

        const submissions: Promise<unknown>[] = []
        if (Object.keys(contactChanges).length) submissions.push(submitChange.mutateAsync({ category: 'contact', changes: contactChanges }))
        if (Object.keys(personalChanges).length) submissions.push(submitChange.mutateAsync({ category: 'personal', changes: personalChanges }))

        if (submissions.length === 0) {
            setEditing(false)
            return
        }
        Promise.all(submissions)
            .then(() => {
                toast.success(t('profile.changeSubmitted', { defaultValue: 'Submitted for approval' }))
                setEditing(false)
            })
            .catch((err: unknown) => {
                toast.error(err instanceof Error ? err.message : t('profile.changeSubmitFailed', { defaultValue: 'Could not submit changes' }))
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
                            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={submitChange.isPending}>
                                <X className="size-4" /> {t('common.cancel')}
                            </Button>
                            <Button size="sm" onClick={onSave} loading={submitChange.isPending}>
                                <Save className="size-4" /> {t('profile.submitForApproval', { defaultValue: 'Submit for approval' })}
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                            <Pencil className="size-3.5" /> {t('profile.edit')}
                        </Button>
                    )
                }
            />

            {editing ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300">
                    {t('profile.approvalNote', { defaultValue: 'Changes to your contact details are submitted for admin approval before they take effect.' })}
                </div>
            ) : null}

            <Tabs defaultValue="personal" className="space-y-5">
                <TabsList variant="underline">
                    <TabsTrigger value="personal">
                        <User className="size-3.5" /> {t('common.personal', { defaultValue: 'Personal' })}
                    </TabsTrigger>
                    <TabsTrigger value="settings">
                        <Settings className="size-3.5" /> {t('common.settings', { defaultValue: 'Settings' })}
                    </TabsTrigger>
                </TabsList>

                {/* ── Personal: Employment basics + Schedule + Contact + Address + Emergency ── */}
                <TabsContent value="personal" className="space-y-4">
                    <Card className="overflow-hidden border-border/70">
                        <CardContent className="p-5">
                            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('profile.employment')}
                            </h3>
                            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <Field label={t('profile.employeeNo', { defaultValue: 'Employee No' })} value={employee.employeeNo} />
                                <Field label={t('profile.status', { defaultValue: 'Status' })} value={statusLabel(t, employee.status)} />
                                <Field label={t('profile.joinDate', { defaultValue: 'Join date' })} value={formatDate(employee.joinDate)} />
                                <Field label={t('profile.designation', { defaultValue: 'Designation' })} value={employee.designation ?? '—'} />
                                <Field label={t('profile.nationality', { defaultValue: 'Nationality' })} value={employee.nationality ?? '—'} />
                                {/* Branch → Division → Department triad — joined
                                    from org_units server-side. We hide rows that
                                    have no value so a flat-org tenant (just one
                                    branch) doesn't show three em-dashes. */}
                                {employee.branchName ? (
                                    <Field label={t('profile.branch', { defaultValue: 'Branch' })} value={employee.branchName} />
                                ) : null}
                                {employee.divisionName ? (
                                    <Field label={t('profile.division', { defaultValue: 'Division' })} value={employee.divisionName} />
                                ) : null}
                                <Field
                                    label={t('profile.department', { defaultValue: 'Department' })}
                                    value={employee.departmentName ?? employee.department ?? '—'}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="overflow-hidden border-border/70">
                        <CardContent className="p-5">
                            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('profile.contact')}
                            </h3>
                            <div className="grid gap-4 sm:grid-cols-2">
                                <Field
                                    label={t('profile.workEmail', { defaultValue: 'Work email' })}
                                    value={employee.email ?? '—'}
                                    icon={<Mail className="size-3.5" />}
                                    locked={editing}
                                    lockedHint={t('profile.managedByHr', { defaultValue: 'Managed by HR' })}
                                />
                                <EditableField
                                    label={t('profile.personalEmail', { defaultValue: 'Personal email' })}
                                    value={form.personalEmail ?? employee.personalEmail ?? ''}
                                    editing={editing}
                                    onChange={(v) => onChange('personalEmail', v)}
                                    type="email"
                                />
                                <EditableField
                                    label={t('profile.phone', { defaultValue: 'Phone' })}
                                    value={form.phone ?? employee.phone ?? ''}
                                    editing={editing}
                                    onChange={(v) => onChange('phone', v)}
                                    icon={<Phone className="size-3.5" />}
                                />
                                <EditableField
                                    label={t('profile.mobile', { defaultValue: 'Mobile' })}
                                    value={form.mobileNo ?? employee.mobileNo ?? ''}
                                    editing={editing}
                                    onChange={(v) => onChange('mobileNo', v)}
                                />
                            </div>

                            <h3 className="mb-4 mt-6 border-t border-border/60 pt-5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('profile.address')}
                            </h3>
                            <EditableField
                                label={t('profile.homeCountryAddress', { defaultValue: 'Home country address' })}
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
                                    label={t('profile.contactName', { defaultValue: 'Contact name' })}
                                    value={form.emergencyContactName ?? ''}
                                    editing={editing}
                                    onChange={(v) => onChange('emergencyContactName', v)}
                                />
                                <EditableField
                                    label={t('profile.contactPhone', { defaultValue: 'Contact phone' })}
                                    value={form.emergencyContactPhone ?? ''}
                                    editing={editing}
                                    onChange={(v) => onChange('emergencyContactPhone', v)}
                                />
                                <EditableField
                                    label={t('profile.relationshipNotes', { defaultValue: 'Relationship / notes' })}
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

const LANGUAGES: { code: 'en' | 'ar'; label: string }[] = [
    { code: 'en', label: 'English' },
    { code: 'ar', label: 'العربية' },
]

function LanguageCard() {
    const { t, i18n } = useTranslation()
    const current = (i18n.language?.slice(0, 2) ?? 'en') as 'en' | 'ar'
    return (
        <Card className="overflow-hidden border-border/70">
            <CardContent className="p-5">
                <div className="mb-3 flex items-center gap-2">
                    <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <Languages className="size-5" />
                    </span>
                    <div>
                        <h3 className="font-display text-sm font-semibold">
                            {t('profile.language', { defaultValue: 'Language' })}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {t('profile.languageDesc', { defaultValue: 'Choose the interface language.' })}
                        </p>
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
                        <h3 className="font-display text-sm font-semibold">{t('security.title')}</h3>
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
                                aria-label={show ? t('common.hidePassword', { defaultValue: 'Hide password' }) : t('common.showPassword', { defaultValue: 'Show password' })}
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

// Humanize the raw employee status enum (e.g. "on_leave" → "On leave"), preferring
// a translated label when one exists for the value.
function statusLabel(t: (key: string, opts?: Record<string, unknown>) => string, status: string): string {
    const titleCased = status
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    return t(`profile.statusValue.${status}`, { defaultValue: titleCased })
}

function Field({
    label,
    value,
    icon,
    locked,
    lockedHint,
}: {
    label: string
    value: string
    icon?: React.ReactNode
    /** When true (i.e. the surrounding form is in edit mode), render the value
        as a disabled Input with a lock icon so it reads as intentionally
        non-editable alongside the live inputs rather than looking forgotten. */
    locked?: boolean
    lockedHint?: string
}) {
    return (
        <div>
            <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {icon}
                {label}
            </div>
            {locked ? (
                <div className="relative mt-1.5">
                    <Input value={value} disabled readOnly className="pe-9" />
                    <Lock
                        className="pointer-events-none absolute end-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-label={lockedHint}
                    />
                </div>
            ) : (
                <div className="mt-1 text-sm font-medium">{value}</div>
            )}
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
            <Label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
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
