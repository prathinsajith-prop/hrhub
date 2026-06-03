import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CalendarDays, Check, Clock, Eye, EyeOff, Languages, Lock, Mail, Phone, Pencil, Save, ShieldCheck, X } from 'lucide-react'

import { ApiError } from '@/lib/api'
import { useMyEmployee, useUpdateMyProfile, type UpdateMyProfileBody } from '@/hooks/useMe'
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
                    <TabsTrigger value="personal">{t('common.personal', { defaultValue: 'Personal' })}</TabsTrigger>
                    <TabsTrigger value="settings">{t('common.settings', { defaultValue: 'Settings' })}</TabsTrigger>
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

                    <ScheduleCard shift={employee.shift ?? null} />

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

// Day-name ordering used by the weekly-off chips. Mirrors the
// backend's WEEKDAY_NAMES table so casing of the saved strings doesn't matter.
const WEEK_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const

// 2024-01-07 is a Sunday, so each index lands on the matching weekday. We format
// these reference dates through Intl so the short names follow the active locale
// (e.g. Arabic) rather than hard-coded English abbreviations.
function localizedWeekdayShort(locale: string): Record<(typeof WEEK_DAYS)[number], string> {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    const out = {} as Record<(typeof WEEK_DAYS)[number], string>
    WEEK_DAYS.forEach((day, i) => {
        out[day] = fmt.format(new Date(Date.UTC(2024, 0, 7 + i)))
    })
    return out
}

// Humanize the raw employee status enum (e.g. "on_leave" → "On leave"), preferring
// a translated label when one exists for the value.
function statusLabel(t: (key: string, opts?: Record<string, unknown>) => string, status: string): string {
    const titleCased = status
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
    return t(`profile.statusValue.${status}`, { defaultValue: titleCased })
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
    const { t, i18n } = useTranslation()
    const range = shift ? formatShiftRange(shift.startTime, shift.endTime) : null
    const offSet = new Set((shift?.weeklyOffDays ?? []).map((d) => d.toLowerCase()))
    const weekdayShort = localizedWeekdayShort(i18n.language)

    return (
        <Card className="overflow-hidden border-border/70">
            <CardContent className="p-5">
                <div className="mb-4 flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        <Clock className="size-3.5" /> {t('profile.schedule', { defaultValue: 'Schedule' })}
                    </h3>
                    {shift ? (
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                            {shift.name}
                        </span>
                    ) : (
                        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                            {t('profile.defaultWorkingHours', { defaultValue: 'Default working hours' })}
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
                            <div className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                                <CalendarDays className="size-3" /> {t('profile.weeklyOff', { defaultValue: 'Weekly off' })}
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
                                            {weekdayShort[d]}
                                        </span>
                                    )
                                })}
                            </div>
                            {offSet.size === 0 ? (
                                <p className="mt-2 text-xs text-muted-foreground">
                                    {t('profile.noWeeklyOff', { defaultValue: 'No weekly off days configured for this shift.' })}
                                </p>
                            ) : null}
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {t('profile.defaultWeekHint', { defaultValue: "You're on the tenant's default working week. Ask HR if you need a custom shift." })}
                    </p>
                )}
            </CardContent>
        </Card>
    )
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
