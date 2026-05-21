import { useState } from 'react'
import { Globe, Save, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Combobox } from '@/components/ui/combobox'
import { toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'
import {
    useCompanySettings,
    useUpdateCompanySettings,
    useRegionalSettings,
    useUpdateRegionalSettings,
} from '@/hooks/useSettings'
import type { CompanySettings } from '@/hooks/useSettings'
import { labelFor } from '@/lib/enums'
import { ORG_INDUSTRY_OPTIONS, ORG_JURISDICTION_OPTIONS } from '@/lib/options'
import { CURRENCY_OPTIONS, TIMEZONE_OPTIONS } from '@/lib/regional-options'
import { Card, Section } from './_shared'
import { useTranslation } from 'react-i18next'

// ─── Profile Tab - company identity + regional settings ───────────────────────
export function ProfileTab() {
    const { t } = useTranslation()
    const { tenant } = useAuthStore()
    const { data: company, isLoading } = useCompanySettings()
    const { data: regional, isLoading: regionalLoading } = useRegionalSettings()
    const updateCompany = useUpdateCompanySettings()
    const updateRegional = useUpdateRegionalSettings()
    const [form, setForm] = useState<Partial<CompanySettings>>({})
    const [regionalForm, setRegionalForm] = useState({ timezone: 'Asia/Dubai', currency: 'AED', dateFormat: 'DD/MM/YYYY' })
    const [saved, setSaved] = useState(false)

    // Hydrate the form from server data when (and only when) the source row identity
    // changes. Tracked via a "previous" sentinel so we don't clobber in-progress
    // edits on every re-render. (React docs pattern: "Storing information from
    // previous renders" - preferred over useEffect for sync.)
    const companyId = company?.id
    const [prevCompanyId, setPrevCompanyId] = useState<string | undefined>(undefined)
    if (companyId !== undefined && companyId !== prevCompanyId) {
        setPrevCompanyId(companyId)
        setForm({
            name: company?.name ?? '',
            companyCode: company?.companyCode ?? '',
            tradeLicenseNo: company?.tradeLicenseNo ?? '',
            businessType: company?.businessType ?? '',
            industryType: company?.industryType ?? '',
            phone: company?.phone ?? '',
            address: company?.address ?? '',
            companyEmail: company?.companyEmail ?? '',
            companyWebsite: company?.companyWebsite ?? '',
        })
    }

    const loadedTz = regional?.timezone
    const [prevRegionalTz, setPrevRegionalTz] = useState<string | undefined>(undefined)
    if (loadedTz !== undefined && loadedTz !== prevRegionalTz) {
        setPrevRegionalTz(loadedTz)
        setRegionalForm({
            timezone: regional?.timezone ?? 'Asia/Dubai',
            currency: regional?.currency ?? 'AED',
            dateFormat: regional?.dateFormat ?? 'DD/MM/YYYY',
        })
    }

    const set = (field: keyof CompanySettings, value: string) => setForm(p => ({ ...p, [field]: value }))

    const handleSave = async () => {
        try {
            await Promise.all([updateCompany.mutateAsync(form), updateRegional.mutateAsync(regionalForm)])
            setSaved(true)
            toast.success(t('orgSettings.profile.settingsSaved'), t('orgSettings.profile.settingsSavedDesc'))
            setTimeout(() => setSaved(false), 2000)
        } catch {
            toast.error(t('orgSettings.profile.saveFailed'), t('orgSettings.profile.saveFailedDesc'))
        }
    }

    if (isLoading) return <div className="space-y-4"><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>

    return (
        <div className="space-y-5">
            {/* Identity strip */}
            <Card>
                <div className="flex items-center gap-4 pb-5 border-b">
                    <div className="size-12 rounded-xl bg-primary flex items-center justify-center text-primary-foreground text-base font-semibold shrink-0">
                        {(company?.name ?? tenant?.name ?? 'HR').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{company?.name ?? tenant?.name ?? t('orgSettings.profile.organization')}</p>
                        <p className="text-sm text-muted-foreground capitalize truncate">
                            {company?.businessType ?? 'UAE'}
                            {company?.industryType ? ` · ${labelFor(company.industryType)}` : ''}
                        </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="secondary" className="capitalize">
                            {company?.subscriptionPlan ?? 'free'} {t('settingsDetail.company.plan')}
                        </Badge>
                        {company?.companyCode && (
                            <span className="text-xs font-mono text-muted-foreground tracking-widest">{company.companyCode}</span>
                        )}
                    </div>
                </div>
                <div className="pt-5 space-y-4">
                    <div>
                        <h3 className="text-sm font-semibold">{t('settingsDetail.company.companyProfile')}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{t('settingsDetail.company.companyProfileDesc')}</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="org_name">{t('orgSettings.profile.companyName')}</Label>
                            <Input id="org_name" value={form.name ?? ''} onChange={e => set('name', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="company_code">{t('orgSettings.profile.companyCode')}</Label>
                            <Input
                                id="company_code"
                                value={form.companyCode ?? ''}
                                onChange={e => set('companyCode', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                                placeholder="e.g. PROP"
                                maxLength={4}
                                className="font-mono tracking-widest"
                            />
                            <p className="text-[11px] text-muted-foreground">{t('orgSettings.profile.companyCodeHint')}</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="trade_license">{t('settingsDetail.company.tradeLicense')}</Label>
                            <Input id="trade_license" value={form.tradeLicenseNo ?? ''} onChange={e => set('tradeLicenseNo', e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="business_type">{t('orgSettings.profile.businessType', 'Business Type')}</Label>
                            <Select
                                value={form.businessType ?? ''}
                                onValueChange={v => set('businessType', v)}
                            >
                                <SelectTrigger id="business_type"><SelectValue placeholder={t('orgSettings.profile.businessTypePlaceholder', 'Select business type')} /></SelectTrigger>
                                <SelectContent>
                                    {ORG_JURISDICTION_OPTIONS.map(o => (
                                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="industry">{t('settings.industry')}</Label>
                            <Select
                                value={form.industryType ?? ''}
                                onValueChange={v => set('industryType', v)}
                            >
                                <SelectTrigger id="industry"><SelectValue placeholder="Select industry" /></SelectTrigger>
                                <SelectContent>
                                    {ORG_INDUSTRY_OPTIONS.map(o => (
                                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="company_phone">{t('orgSettings.profile.companyPhone', 'Company Phone')}</Label>
                            <Input
                                id="company_phone"
                                type="tel"
                                value={form.phone ?? ''}
                                onChange={e => set('phone', e.target.value)}
                                placeholder="+971 50 123 4567"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="company_email">{t('orgSettings.profile.companyEmail', 'Company Email')}</Label>
                            <Input
                                id="company_email"
                                type="email"
                                value={form.companyEmail ?? ''}
                                onChange={e => set('companyEmail', e.target.value)}
                                placeholder="info@company.ae"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="company_website">{t('orgSettings.profile.companyWebsite', 'Company Website')}</Label>
                            <Input
                                id="company_website"
                                type="url"
                                value={form.companyWebsite ?? ''}
                                onChange={e => set('companyWebsite', e.target.value)}
                                placeholder="https://company.ae"
                            />
                        </div>
                        <div className="space-y-1.5 md:col-span-2">
                            <Label htmlFor="address">{t('orgSettings.profile.address', 'Address')}</Label>
                            <Input
                                id="address"
                                value={form.address ?? ''}
                                onChange={e => set('address', e.target.value)}
                                placeholder={t('orgSettings.profile.addressPlaceholder', 'Office address (street, city, country)')}
                            />
                        </div>
                    </div>
                </div>
            </Card>

            {/* Regional Settings */}
            <Section icon={Globe} title={t('settingsDetail.company.regionalSettings')} description={t('settingsDetail.company.regionalSettingsDesc')}>
                {regionalLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[1, 2, 3].map(n => <Skeleton key={`skeleton-${n}`} className="h-10 w-full" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="timezone">{t('settings.timezone')}</Label>
                            <Combobox
                                value={regionalForm.timezone}
                                onValueChange={v => setRegionalForm(p => ({ ...p, timezone: v }))}
                                options={TIMEZONE_OPTIONS}
                                placeholder="Select timezone"
                                searchPlaceholder="Search timezone…"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="currency">{t('settings.currency')}</Label>
                            <Combobox
                                value={regionalForm.currency}
                                onValueChange={v => setRegionalForm(p => ({ ...p, currency: v }))}
                                options={CURRENCY_OPTIONS}
                                placeholder="Select currency"
                                searchPlaceholder="Search currency…"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="dateFormat">{t('settingsDetail.company.dateFormat')}</Label>
                            <Input id="dateFormat" value={regionalForm.dateFormat} onChange={e => setRegionalForm(p => ({ ...p, dateFormat: e.target.value }))} placeholder="DD/MM/YYYY" />
                        </div>
                    </div>
                )}
            </Section>

            <div className="flex justify-end pt-2">
                <Button
                    onClick={handleSave}
                    loading={updateCompany.isPending || updateRegional.isPending}
                    leftIcon={saved ? <CheckCircle2 className="size-4" /> : <Save className="size-4" />}
                    variant={saved ? 'success' : 'default'}
                >
                    {saved ? t('settingsDetail.profile.saved') : t('settingsDetail.profile.saveChanges')}
                </Button>
            </div>
        </div>
    )
}
