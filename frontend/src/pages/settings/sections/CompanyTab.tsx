import React, { useState, useEffect } from 'react'
import { Globe, Save, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'
import { useCompanySettings, useUpdateCompanySettings, useRegionalSettings, useUpdateRegionalSettings } from '@/hooks/useSettings'
import type { CompanySettings } from '@/hooks/useSettings'
import { labelFor } from '@/lib/enums'
import { usePermissions } from '@/hooks/usePermissions'
import { SettingsCard } from './_shared'

// ─── Company Settings Tab ─────────────────────────────────────────────────────────
export function CompanyTab() {
    const { tenant } = useAuthStore()
    const { can } = usePermissions()
    const canEdit = can('manage_settings')
    const { data: company, isLoading } = useCompanySettings()
    const updateCompany = useUpdateCompanySettings()
    const { data: regional, isLoading: regionalLoading } = useRegionalSettings()
    const updateRegional = useUpdateRegionalSettings()
    const [form, setForm] = useState<Partial<CompanySettings>>({})
    const [regionalForm, setRegionalForm] = useState({ timezone: 'Asia/Dubai', currency: 'AED', dateFormat: 'DD/MM/YYYY' })
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        if (company) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setForm({
                name: company.name,
                tradeLicenseNo: company.tradeLicenseNo,
                jurisdiction: company.jurisdiction,
                industryType: company.industryType,
            })
        }
    }, [company])

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (regional) setRegionalForm({ timezone: regional.timezone, currency: regional.currency, dateFormat: regional.dateFormat })
    }, [regional])

    const set = (field: keyof CompanySettings, value: string) =>
        setForm((prev) => ({ ...prev, [field]: value }))

    const handleSave = async () => {
        try {
            await Promise.all([
                updateCompany.mutateAsync(form),
                updateRegional.mutateAsync(regionalForm),
            ])
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
        <div className="space-y-5">
            {!canEdit && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>You have view-only access. Contact a workspace administrator to update company details.</span>
                </div>
            )}
            {/* Card 1: Identity strip + Company Profile */}
            <SettingsCard>
                <div className="flex items-center gap-4 pb-5 border-b">
                    <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-base font-semibold shrink-0">
                        {(company?.name ?? tenant?.name ?? 'HR').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{company?.name ?? tenant?.name ?? 'HRHub Demo Company'}</p>
                        <p className="text-sm text-muted-foreground capitalize truncate">
                            {company?.jurisdiction ?? 'UAE'}
                            {company?.industryType ? ` · ${labelFor(company.industryType)}` : ''}
                        </p>
                    </div>
                    <Badge variant="secondary" className="capitalize shrink-0">
                        {company?.subscriptionPlan ?? 'free'} plan
                    </Badge>
                </div>
                <div className="pt-5 space-y-4">
                    <div>
                        <h3 className="text-sm font-semibold">Company Profile</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Legal name, license, and jurisdiction details</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="company_name">Company Name</Label>
                            <Input id="company_name" value={form.name ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('name', e.target.value)} disabled={!canEdit} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="trade_license">Trade License No.</Label>
                            <Input id="trade_license" value={form.tradeLicenseNo ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('tradeLicenseNo', e.target.value)} disabled={!canEdit} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="jurisdiction">Jurisdiction</Label>
                            <Input id="jurisdiction" value={form.jurisdiction ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('jurisdiction', e.target.value)} disabled={!canEdit} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="industry">Industry Type</Label>
                            <Input id="industry" value={form.industryType ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => set('industryType', e.target.value)} disabled={!canEdit} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="plan">Subscription Plan</Label>
                            <Input id="plan" value={company?.subscriptionPlan ?? 'free'} disabled readOnly className="bg-muted/40 capitalize" />
                            <p className="text-[11px] text-muted-foreground">Managed by billing. Contact support to change.</p>
                        </div>
                    </div>
                </div>
            </SettingsCard>

            {/* Card 2: Regional Settings */}
            <SettingsCard>
                <div className="space-y-4">
                    <div>
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                            <Globe className="h-4 w-4 text-muted-foreground" />
                            Regional Settings
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">Defaults applied across the workspace</p>
                    </div>
                    {regionalLoading ? (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="timezone">Time Zone</Label>
                                <Input id="timezone" value={regionalForm.timezone} onChange={e => setRegionalForm(p => ({ ...p, timezone: e.target.value }))} disabled={!canEdit} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="currency">Currency</Label>
                                <Input id="currency" value={regionalForm.currency} onChange={e => setRegionalForm(p => ({ ...p, currency: e.target.value }))} disabled={!canEdit} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="dateFormat">Date Format</Label>
                                <Input id="dateFormat" value={regionalForm.dateFormat} onChange={e => setRegionalForm(p => ({ ...p, dateFormat: e.target.value }))} placeholder="DD/MM/YYYY" disabled={!canEdit} />
                            </div>
                        </div>
                    )}
                </div>
            </SettingsCard>

            {/* Save bar — outside the cards */}
            {canEdit && (
                <div className="flex justify-end pt-2">
                    <Button onClick={handleSave} loading={updateCompany.isPending} leftIcon={saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />} variant={saved ? 'success' : 'default'}>
                        {saved ? 'Saved!' : 'Save Changes'}
                    </Button>
                </div>
            )}
        </div>
    )
}
