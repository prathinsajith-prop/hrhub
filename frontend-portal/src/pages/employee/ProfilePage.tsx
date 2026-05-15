import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Eye, EyeOff, Mail, Phone, Pencil, Save, ShieldCheck, X } from 'lucide-react'

import { ApiError } from '@/lib/api'
import { useMyEmployee, useUpdateMyProfile, type UpdateMyProfileBody } from '@/hooks/useMe'
import { useChangePassword } from '@/hooks/useChangePassword'
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
import { formatDate } from '@/lib/utils'

export function EmployeeProfilePage() {
    const { t } = useTranslation()
    const { data: employee, isLoading } = useMyEmployee()
    const update = useUpdateMyProfile()
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState<UpdateMyProfileBody>({})

    // State-during-render: re-sync form when the employee record loads or changes externally.
    // The "last synced id" tracker is held in a ref because it's only read+written here —
    // never consumed by render — so it doesn't need to trigger a re-render itself.
    const lastSyncedEmployeeId = useRef<string | null>(null)
    if (employee && employee.id !== lastSyncedEmployeeId.current) {
        lastSyncedEmployeeId.current = employee.id
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
                subtitle={[employee.designation, employee.department].filter(Boolean).join(' · ') || undefined}
                action={
                    editing ? (
                        <>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={update.isPending}>
                                <X className="h-4 w-4" /> {t('common.cancel')}
                            </Button>
                            <Button size="sm" onClick={onSave} loading={update.isPending}>
                                <Save className="h-4 w-4" /> {t('profile.saveChanges')}
                            </Button>
                        </>
                    ) : (
                        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                            <Pencil className="h-3.5 w-3.5" /> {t('profile.edit')}
                        </Button>
                    )
                }
            />

            <Card className="overflow-hidden border-border/70">
                <CardContent className="p-5">
                    <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('profile.employment')}
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Employee No" value={employee.employeeNo} />
                        <Field label="Status" value={employee.status} />
                        <Field label="Join date" value={formatDate(employee.joinDate)} />
                        <Field label="Designation" value={employee.designation ?? '—'} />
                        <Field label="Department" value={employee.department ?? '—'} />
                        <Field label="Nationality" value={employee.nationality ?? '—'} />
                    </div>
                </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/70">
                <CardContent className="p-5">
                    <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('profile.contact')}
                    </h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Work email" value={employee.email ?? '—'} icon={<Mail className="h-3.5 w-3.5" />} />
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
                            icon={<Phone className="h-3.5 w-3.5" />}
                        />
                        <EditableField
                            label="Mobile"
                            value={form.mobileNo ?? employee.mobileNo ?? ''}
                            editing={editing}
                            onChange={(v) => onChange('mobileNo', v)}
                        />
                    </div>
                </CardContent>
            </Card>

            <Card className="overflow-hidden border-border/70">
                <CardContent className="p-5">
                    <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
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

            <Card className="overflow-hidden border-border/70">
                <CardContent className="p-5">
                    <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('profile.address')}
                    </h3>
                    <EditableField
                        label="Home country address"
                        value={form.homeCountryAddress ?? ''}
                        editing={editing}
                        onChange={(v) => onChange('homeCountryAddress', v)}
                    />
                </CardContent>
            </Card>

            <SecurityCard />
        </div>
    )
}

function SecurityCard() {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    return (
        <Card className="overflow-hidden border-border/70">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                        <ShieldCheck className="h-5 w-5" />
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
                                className="absolute end-0 top-0 flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
                            >
                                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
