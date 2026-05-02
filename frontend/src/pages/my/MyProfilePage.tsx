import { useState, useEffect, useRef } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
    User, Briefcase, Phone, CreditCard, Calendar, Building2, Hash,
    Mail, MapPin, Shield, Pencil, X, AlertTriangle, TrendingDown,
    Landmark, CalendarDays, CheckCircle2, Clock, IdCard, Camera, Loader2,
} from 'lucide-react'
import { toast } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { useMyEmployee, useUpdateMyProfile } from '@/hooks/useMe'
import { useLeaveBalance } from '@/hooks/useLeave'
import { labelFor } from '@/lib/enums'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'
import type { Employee } from '@/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso?: string | null) {
    if (!iso) return null
    return new Date(iso).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysUntil(iso?: string | null) {
    if (!iso) return null
    return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)
}

function serviceLength(joinDate?: string) {
    if (!joinDate) return null
    const yrs = (Date.now() - new Date(joinDate).getTime()) / (365.25 * 86_400_000)
    if (yrs < 1) { const m = Math.floor(yrs * 12); return m <= 0 ? '< 1 month' : `${m} month${m !== 1 ? 's' : ''}` }
    const y = Math.floor(yrs), m = Math.floor((yrs - y) * 12)
    return m > 0 ? `${y}y ${m}mo` : `${y} year${y !== 1 ? 's' : ''}`
}

const STATUS_CONFIG: Record<Employee['status'], { variant: 'success' | 'warning' | 'info' | 'destructive' | 'secondary'; dot: string }> = {
    active:      { variant: 'success',     dot: 'bg-emerald-500' },
    onboarding:  { variant: 'info',        dot: 'bg-blue-500'    },
    probation:   { variant: 'warning',     dot: 'bg-amber-500'   },
    suspended:   { variant: 'secondary',   dot: 'bg-orange-500'  },
    terminated:  { variant: 'destructive', dot: 'bg-red-500'     },
    visa_expired:{ variant: 'destructive', dot: 'bg-red-600'     },
}

// ─── Atoms ────────────────────────────────────────────────────────────────────

function InfoRow({ icon: Icon, label, value, mono }: {
    icon: React.ElementType; label: string; value?: string | null; mono?: boolean
}) {
    return (
        <div className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0">
            <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground w-40 shrink-0">{label}</span>
            <span className={cn('text-sm font-medium text-foreground flex-1 truncate', mono && 'font-mono text-xs')}>
                {value || '—'}
            </span>
        </div>
    )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
    return (
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 mt-5 first:mt-0">
            {children}
        </p>
    )
}

function QuickStat({ label, value, accent }: { label: string; value?: string | null; accent?: string }) {
    if (!value) return null
    return (
        <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</span>
            <span className={cn('text-sm font-semibold', accent)}>{value}</span>
        </div>
    )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function MyProfileContent() {
    const { data: employee, isLoading } = useMyEmployee()
    const { data: leaveData } = useLeaveBalance(employee?.id)
    const update = useUpdateMyProfile()
    const { user, setUser } = useAuthStore()
    const qc = useQueryClient()
    const [editing, setEditing] = useState(false)
    const [uploading, setUploading] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    const [form, setForm] = useState({
        phone: '', mobileNo: '', personalEmail: '',
        emergencyContactName: '', emergencyContactPhone: '',
        homeCountryAddress: '',
    })

    useEffect(() => {
        if (employee) setForm({
            phone: employee.phone ?? '',
            mobileNo: employee.mobileNo ?? '',
            personalEmail: employee.personalEmail ?? '',
            emergencyContactName: (employee as any).emergencyContactName ?? '',
            emergencyContactPhone: (employee as any).emergencyContactPhone ?? '',
            homeCountryAddress: employee.homeCountryAddress ?? '',
        })
    }, [employee])

    const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
        setForm(f => ({ ...f, [k]: e.target.value }))

    async function save() {
        try {
            await update.mutateAsync(form as any)
            toast.success('Saved', 'Your profile has been updated.')
            setEditing(false)
        } catch { toast.error('Error', 'Could not update profile.') }
    }

    async function handleFile(file: File) {
        const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
        if (!allowed.includes(file.type)) { toast.error('Unsupported file', 'Please choose a JPEG, PNG, WEBP, or GIF image.'); return }
        if (file.size > 5 * 1024 * 1024) { toast.error('File too large', 'Maximum size is 5 MB.'); return }
        try {
            setUploading(true)
            const fd = new FormData()
            fd.append('file', file)
            const res = await api.upload<{ data: { avatarUrl: string } }>('/auth/me/avatar', fd)
            const fresh = `${res.data.avatarUrl}?t=${Date.now()}`
            setUser({ avatarUrl: fresh })
            qc.invalidateQueries({ queryKey: ['employees', 'me'] })
            toast.success('Profile photo updated')
        } catch {
            toast.error('Upload failed', 'Could not update your profile photo.')
        } finally {
            setUploading(false)
            if (fileRef.current) fileRef.current.value = ''
        }
    }

    if (isLoading) return (
        <div className="space-y-4">
            <Skeleton className="h-44 rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-64 rounded-xl" />)}
            </div>
        </div>
    )

    if (!employee) return (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <User className="h-8 w-8 opacity-30" />
            <p className="text-sm">No employee record linked to your account.</p>
        </div>
    )

    const e = employee
    const sc = e.status ? STATUS_CONFIG[e.status] : null
    const initials = `${e.firstName?.[0] ?? ''}${e.lastName?.[0] ?? ''}`.toUpperCase()
    const hasBankDetails = !!(e.bankName || e.iban || e.accountName || e.accountNumber || e.swiftCode || e.bankBranch)
    const leaveEntries = leaveData?.balance
        ? Object.entries(leaveData.balance).filter(([, b]) => b.entitled !== 0)
        : []

    const visaD = daysUntil(e.visaExpiry)
    const visaAccent = visaD !== null && visaD <= 30 ? 'text-destructive' : visaD !== null && visaD <= 90 ? 'text-amber-600' : undefined

    const expiryAlerts = [
        { label: 'Visa', date: e.visaExpiry },
        { label: 'Passport', date: e.passportExpiry },
        { label: 'Emirates ID', date: e.emiratesIdExpiry },
    ].filter(x => { const d = daysUntil(x.date); return d !== null && d <= 90 })

    return (
        <div className="space-y-4">

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <Card>
                <CardContent className="p-5 sm:p-6">
                    <div className="flex flex-col sm:flex-row gap-5">
                        <div className="relative shrink-0 self-start">
                            <Avatar className="h-20 w-20 sm:h-24 sm:w-24">
                                {(user?.avatarUrl ?? e.avatarUrl) && <AvatarImage src={user?.avatarUrl ?? e.avatarUrl} alt={e.fullName} />}
                                <AvatarFallback className="text-2xl font-bold bg-primary text-primary-foreground">
                                    {initials}
                                </AvatarFallback>
                            </Avatar>
                            {sc && <span className={cn('absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-card', sc.dot)} />}
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                disabled={uploading}
                                className="absolute -bottom-1.5 -end-1.5 h-7 w-7 rounded-full bg-primary text-primary-foreground border-2 border-card shadow-sm flex items-center justify-center hover:bg-primary/90 disabled:opacity-50 transition-colors"
                                aria-label="Change profile photo"
                            >
                                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                            </button>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/jpeg,image/png,image/webp,image/gif"
                                className="hidden"
                                onChange={ev => { const f = ev.target.files?.[0]; if (f) handleFile(f) }}
                            />
                        </div>

                        <div className="flex-1 min-w-0">
                            {sc && <Badge variant={sc.variant} className="mb-1.5 text-[10px]">{labelFor(e.status)}</Badge>}
                            <h1 className="text-xl sm:text-2xl font-bold tracking-tight font-display">
                                {e.fullName ?? `${e.firstName} ${e.lastName}`}
                            </h1>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {[e.designation, e.department].filter(Boolean).join(' · ') || '—'}
                            </p>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                                {e.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{e.email}</span>}
                                {(e.mobileNo ?? e.phone) && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{e.mobileNo ?? e.phone}</span>}
                            </div>

                            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 pt-4 border-t border-border/60">
                                <QuickStat label="Employee No."  value={e.employeeNo} />
                                <QuickStat label="Joined"        value={fmt(e.joinDate)} />
                                <QuickStat label="Service"       value={serviceLength(e.joinDate)} />
                                <QuickStat label="Reports To"    value={e.managerName} />
                                <QuickStat label="Work Location" value={e.workLocation} />
                                <QuickStat label="Visa Expiry"   value={fmt(e.visaExpiry)} accent={visaAccent} />
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ── Expiry alerts ────────────────────────────────────────────── */}
            {expiryAlerts.length > 0 && (
                <div className="space-y-2">
                    {expiryAlerts.map(({ label, date }) => {
                        const d = daysUntil(date)!
                        const expired = d <= 0
                        const cls = expired || d <= 14
                            ? 'border-destructive/30 bg-destructive/5 text-destructive'
                            : d <= 30
                            ? 'border-orange-200 bg-orange-50 text-orange-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                        return (
                            <div key={label} className={cn('flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm', cls)}>
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                <span className="font-medium">{label} expiry</span>
                                <span className="text-xs ml-auto">
                                    {expired ? `Expired ${fmt(date)}` : `${d} day${d !== 1 ? 's' : ''} left · ${fmt(date)}`}
                                </span>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ── Detail grid ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Employment */}
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                            <Briefcase className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-semibold">Employment</p>
                        </div>
                        <SectionTitle>Role</SectionTitle>
                        <InfoRow icon={Briefcase}  label="Designation"    value={e.designation} />
                        <InfoRow icon={Building2}  label="Department"     value={e.department} />
                        <InfoRow icon={MapPin}     label="Work Location"  value={e.workLocation} />
                        <InfoRow icon={User}       label="Reports To"     value={e.managerName} />
                        <InfoRow icon={Shield}     label="Grade Level"    value={e.gradeLevel} />
                        <SectionTitle>Contract</SectionTitle>
                        <InfoRow icon={Shield}     label="Contract Type"  value={labelFor(e.contractType)} />
                        <InfoRow icon={Calendar}   label="Join Date"      value={fmt(e.joinDate)} />
                        <InfoRow icon={Calendar}   label="Contract End"   value={fmt(e.contractEndDate)} />
                        <InfoRow icon={Calendar}   label="Probation End"  value={fmt(e.probationEndDate)} />
                    </CardContent>
                </Card>

                {/* Personal */}
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                            <User className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-semibold">Personal Details</p>
                        </div>
                        <SectionTitle>Info</SectionTitle>
                        <InfoRow icon={Calendar}  label="Date of Birth"   value={fmt(e.dateOfBirth)} />
                        <InfoRow icon={User}      label="Gender"          value={labelFor(e.gender)} />
                        <InfoRow icon={User}      label="Marital Status"  value={labelFor(e.maritalStatus)} />
                        <InfoRow icon={MapPin}    label="Nationality"     value={e.nationality} />
                        <SectionTitle>Passport</SectionTitle>
                        <InfoRow icon={Hash}      label="Passport No."   value={e.passportNo} mono />
                        <InfoRow icon={Calendar}  label="Expiry"         value={fmt(e.passportExpiry)} />
                        <InfoRow icon={MapPin}    label="Sponsoring"     value={e.sponsoringEntity} />
                    </CardContent>
                </Card>

                {/* Identity */}
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                            <IdCard className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-semibold">Identity Documents</p>
                        </div>
                        <SectionTitle>Emirates ID</SectionTitle>
                        <InfoRow icon={Hash}      label="Emirates ID"    value={e.emiratesId} mono />
                        <InfoRow icon={Calendar}  label="EID Expiry"     value={fmt(e.emiratesIdExpiry)} />
                        <InfoRow icon={Hash}      label="Labour Card"    value={e.labourCardNumber} mono />
                        <SectionTitle>Visa</SectionTitle>
                        <InfoRow icon={Hash}      label="Visa Number"    value={e.visaNumber} mono />
                        <InfoRow icon={Shield}    label="Visa Type"      value={labelFor(e.visaType)} />
                        <InfoRow icon={Calendar}  label="Issue Date"     value={fmt(e.visaIssueDate)} />
                        <InfoRow icon={Calendar}  label="Visa Expiry"    value={fmt(e.visaExpiry)} />
                    </CardContent>
                </Card>

                {/* Contact */}
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/60">
                            <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <p className="text-sm font-semibold">Contact Information</p>
                            </div>
                            {!editing
                                ? <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setEditing(true)}>
                                    <Pencil className="h-3 w-3" />Edit
                                  </Button>
                                : <div className="flex gap-1">
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(false)}>
                                        <X className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button size="sm" className="h-7 gap-1 text-xs" onClick={save} disabled={update.isPending}>
                                        {update.isPending
                                            ? <><Clock className="h-3 w-3 animate-spin" />Saving</>
                                            : <><CheckCircle2 className="h-3 w-3" />Save</>}
                                    </Button>
                                  </div>}
                        </div>

                        {!editing ? (
                            <>
                                <SectionTitle>Email</SectionTitle>
                                <InfoRow icon={Mail}  label="Work Email"     value={e.email} />
                                <InfoRow icon={Mail}  label="Personal Email" value={e.personalEmail} />
                                <SectionTitle>Phone</SectionTitle>
                                <InfoRow icon={Phone} label="Phone"          value={e.phone} />
                                <InfoRow icon={Phone} label="Mobile"         value={e.mobileNo} />
                                <SectionTitle>Emergency Contact</SectionTitle>
                                <InfoRow icon={User}  label="Contact Name"   value={(e as any).emergencyContactName} />
                                <InfoRow icon={Phone} label="Contact Phone"  value={(e as any).emergencyContactPhone} />
                                <SectionTitle>Address</SectionTitle>
                                <InfoRow icon={MapPin} label="Home Address"  value={e.homeCountryAddress} />
                            </>
                        ) : (
                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Work Email</Label>
                                    <Input value={e.email} disabled className="h-9 text-sm opacity-60" />
                                    <p className="text-[11px] text-muted-foreground">Contact HR to change your work email.</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Personal Email</Label>
                                        <Input type="email" value={form.personalEmail} onChange={set('personalEmail')} placeholder="personal@example.com" className="h-9 text-sm" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Phone</Label>
                                        <Input value={form.phone} onChange={set('phone')} placeholder="+971 4 000 0000" className="h-9 text-sm" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Mobile</Label>
                                        <Input value={form.mobileNo} onChange={set('mobileNo')} placeholder="+971 50 000 0000" className="h-9 text-sm" />
                                    </div>
                                    <div className="space-y-1.5 sm:col-span-2">
                                        <Label className="text-xs">Home Country Address</Label>
                                        <Textarea value={form.homeCountryAddress} onChange={e => setForm(f => ({ ...f, homeCountryAddress: e.target.value }))} placeholder="Street, City, Country" rows={2} className="text-sm resize-none" />
                                    </div>
                                </div>
                                <p className="text-[11px] font-medium text-muted-foreground pt-1">Emergency Contact</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Contact Name</Label>
                                        <Input value={form.emergencyContactName} onChange={set('emergencyContactName')} placeholder="Full name" className="h-9 text-sm" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Contact Phone</Label>
                                        <Input value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} placeholder="+971 50 000 0000" className="h-9 text-sm" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Bank Details ─────────────────────────────────────────────── */}
            {hasBankDetails && (
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                            <Landmark className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-semibold">Bank Details</p>
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10">
                            <div>
                                <SectionTitle>Account</SectionTitle>
                                <InfoRow icon={User}       label="Account Name"   value={e.accountName} />
                                <InfoRow icon={Hash}       label="Account No."    value={e.accountNumber} mono />
                                <InfoRow icon={CreditCard} label="IBAN"           value={e.iban} mono />
                            </div>
                            <div>
                                <SectionTitle>Bank</SectionTitle>
                                <InfoRow icon={Building2}  label="Bank Name"      value={e.bankName} />
                                <InfoRow icon={Hash}       label="Swift Code"     value={e.swiftCode} mono />
                                <InfoRow icon={Building2}  label="Branch"         value={e.bankBranch} />
                            </div>
                        </div>
                        <p className="mt-4 pt-3 border-t border-border/60 text-xs text-muted-foreground">
                            To update banking details, please contact your HR team.
                        </p>
                    </CardContent>
                </Card>
            )}

            {/* ── Leave Balance ─────────────────────────────────────────────── */}
            {leaveEntries.length > 0 && (
                <Card>
                    <CardContent className="p-5">
                        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border/60">
                            <CalendarDays className="h-4 w-4 text-muted-foreground" />
                            <p className="text-sm font-semibold">Leave Balance — {new Date().getFullYear()}</p>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                            {leaveEntries.map(([type, b]) => {
                                const unlimited = b.entitled === -1
                                const pct = unlimited ? 0 : Math.min(100, Math.round((b.taken / (b.entitled || 1)) * 100))
                                const low = !unlimited && b.available <= 3 && b.entitled > 0
                                return (
                                    <div key={type} className={cn('rounded-xl border p-4 space-y-2', low ? 'border-destructive/30 bg-destructive/5' : 'bg-muted/20')}>
                                        <div className="flex items-center justify-between">
                                            <p className="text-xs font-medium text-muted-foreground capitalize">{labelFor(type)}</p>
                                            {low && <TrendingDown className="h-3 w-3 text-destructive" />}
                                        </div>
                                        <div className="flex items-baseline gap-1">
                                            <span className={cn('text-2xl font-bold tabular-nums', low ? 'text-destructive' : '')}>
                                                {unlimited ? '∞' : b.available}
                                            </span>
                                            <span className="text-xs text-muted-foreground">/ {unlimited ? '∞' : b.entitled} days</span>
                                        </div>
                                        {!unlimited && (
                                            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                                <div
                                                    className={cn('h-full rounded-full', pct >= 80 ? 'bg-destructive' : pct >= 50 ? 'bg-amber-400' : 'bg-emerald-500')}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        )}
                                        <div className="flex gap-3 text-[10px] text-muted-foreground">
                                            <span>Used <strong className="text-foreground">{b.taken}</strong></span>
                                            {b.pending > 0 && <span className="text-amber-600 font-medium">{b.pending} pending</span>}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </CardContent>
                </Card>
            )}

        </div>
    )
}

export function MyProfilePage() {
    return (
        <PageWrapper>
            <PageHeader title="My Profile" description="Your employment record, documents, and personal details." />
            <MyProfileContent />
        </PageWrapper>
    )
}
