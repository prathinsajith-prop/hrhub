import { useState, useEffect } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

import { UserCircle, Pencil, Save, X } from 'lucide-react'
import { toast } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { useMyEmployee, useUpdateMyProfile } from '@/hooks/useMe'
import type { Employee } from '@/types'

function Field({ label, value }: { label: string; value?: string | null }) {
    return (
        <div>
            <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
            <p className="text-sm font-medium">{value || <span className="text-muted-foreground italic">Not set</span>}</p>
        </div>
    )
}

function EditableField({
    label, value, name, onChange, placeholder, type = 'text',
}: {
    label: string; value: string; name: string
    onChange: (k: string, v: string) => void; placeholder?: string; type?: string
}) {
    return (
        <div className="space-y-1.5">
            <Label>{label}</Label>
            <Input type={type} value={value} onChange={e => onChange(name, e.target.value)} placeholder={placeholder} />
        </div>
    )
}

export function MyProfileContent() {
    const { data: employee, isLoading } = useMyEmployee()
    const update = useUpdateMyProfile()
    const [editing, setEditing] = useState(false)
    const [form, setForm] = useState({ phone: '', mobileNo: '', personalEmail: '', emergencyContact: '', homeCountryAddress: '' })

    useEffect(() => {
        if (employee) {
            setForm({
                phone: employee.phone ?? '',
                mobileNo: employee.mobileNo ?? '',
                personalEmail: employee.personalEmail ?? '',
                emergencyContact: employee.emergencyContact ?? '',
                homeCountryAddress: employee.homeCountryAddress ?? '',
            })
        }
    }, [employee])

    function setField(k: string, v: string) {
        setForm(f => ({ ...f, [k]: v }))
    }

    async function save() {
        try {
            await update.mutateAsync(form)
            toast.success('Saved', 'Your profile has been updated.')
            setEditing(false)
        } catch {
            toast.error('Error', 'Could not update profile.')
        }
    }

    const statusColors: Record<Employee['status'], string> = {
        active: 'text-emerald-700 bg-emerald-50 border-emerald-200',
        onboarding: 'text-blue-700 bg-blue-50 border-blue-200',
        probation: 'text-amber-700 bg-amber-50 border-amber-200',
        suspended: 'text-orange-700 bg-orange-50 border-orange-200',
        terminated: 'text-red-700 bg-red-50 border-red-200',
        visa_expired: 'text-red-600 bg-red-50 border-red-200',
    }

    return (
        <div>
            <div className="flex justify-end mb-4">
                {!editing ? (
                    <Button variant="outline" onClick={() => setEditing(true)} leftIcon={<Pencil className="h-4 w-4" />}>
                        Edit Contact Info
                    </Button>
                ) : (
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setEditing(false)} leftIcon={<X className="h-4 w-4" />}>Cancel</Button>
                        <Button onClick={save} disabled={update.isPending} leftIcon={<Save className="h-4 w-4" />}>
                            {update.isPending ? 'Saving…' : 'Save'}
                        </Button>
                    </div>
                )}
            </div>

            {isLoading ? (
                <div className="space-y-4">
                    <Skeleton className="h-24 rounded-xl" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
                </div>
            ) : !employee ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <UserCircle className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No employee record linked to your account.</p>
                </div>
            ) : (
                <div className="space-y-5">
                    {/* Identity card */}
                    <div className="rounded-xl border bg-card p-5 flex items-center gap-4">
                        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
                            {employee.firstName?.[0]}{employee.lastName?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-lg font-bold">{employee.fullName ?? `${employee.firstName} ${employee.lastName}`}</p>
                            <p className="text-sm text-muted-foreground">{employee.designation ?? '—'} {employee.department ? `· ${employee.department}` : ''}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">Employee No: {employee.employeeNo}</p>
                        </div>
                        {employee.status && (
                            <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', statusColors[employee.status])}>
                                {employee.status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                            </span>
                        )}
                    </div>

                    {/* Employment details (read-only) */}
                    <div className="rounded-xl border bg-card p-5">
                        <p className="text-sm font-semibold mb-4">Employment Details</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                            <Field label="Join Date" value={employee.joinDate} />
                            <Field label="Contract Type" value={employee.contractType} />
                            <Field label="Work Location" value={employee.workLocation} />
                            <Field label="Nationality" value={employee.nationality} />
                            <Field label="Visa Status" value={employee.visaStatus?.replace(/_/g, ' ')} />
                            <Field label="Visa Expiry" value={employee.visaExpiry} />
                        </div>
                    </div>

                    {/* Editable contact info */}
                    <div className="rounded-xl border bg-card p-5">
                        <p className="text-sm font-semibold mb-4">Contact Information</p>
                        {!editing ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
                                <Field label="Work Email" value={employee.email} />
                                <Field label="Personal Email" value={employee.personalEmail} />
                                <Field label="Phone" value={employee.phone} />
                                <Field label="Mobile" value={employee.mobileNo} />
                                <Field label="Emergency Contact" value={employee.emergencyContact} />
                                <Field label="Home Country Address" value={employee.homeCountryAddress} />
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <Label>Work Email</Label>
                                    <Input value={employee.email} disabled className="opacity-60" />
                                    <p className="text-[11px] text-muted-foreground">Contact HR to change your work email.</p>
                                </div>
                                <EditableField label="Personal Email" name="personalEmail" value={form.personalEmail} onChange={setField} placeholder="personal@example.com" type="email" />
                                <EditableField label="Phone" name="phone" value={form.phone} onChange={setField} placeholder="+971 50 000 0000" />
                                <EditableField label="Mobile" name="mobileNo" value={form.mobileNo} onChange={setField} placeholder="+971 55 000 0000" />
                                <EditableField label="Emergency Contact" name="emergencyContact" value={form.emergencyContact} onChange={setField} placeholder="Name — +971 50 000 0000" />
                                <EditableField label="Home Country Address" name="homeCountryAddress" value={form.homeCountryAddress} onChange={setField} placeholder="Street, City, Country" />
                            </div>
                        )}
                    </div>

                    {/* Banking (read-only — HR manages this) */}
                    {(employee.bankName || employee.iban) && (
                        <div className="rounded-xl border bg-card p-5">
                            <p className="text-sm font-semibold mb-4">Banking</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                                <Field label="Bank" value={employee.bankName} />
                                <Field label="IBAN" value={employee.iban} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-3">Contact HR to update banking details.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export function MyProfilePage() {
    return (
        <PageWrapper>
            <PageHeader title="My Profile" description="View your employment details and update your personal contact information." />
            <MyProfileContent />
        </PageWrapper>
    )
}
