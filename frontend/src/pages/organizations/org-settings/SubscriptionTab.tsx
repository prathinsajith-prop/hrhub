import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import {
    Zap, CreditCard, Building, Users2, AlertCircle, CheckCircle, Send,
    ExternalLink, Plus, Minus, ShieldCheck, FileText, Calendar, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'
import { ApiError } from '@/lib/api'
import {
    useSubscription, useUpgradeRequest, useEnterpriseContact,
    useCheckoutSession, useUpdateQuota, useSubscriptionEvents, downloadInvoicePdf,
} from '@/hooks/useSubscription'
import type { PlanInfo, SubscriptionEvent } from '@/hooks/useSubscription'

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_ICONS: Record<string, typeof Zap> = {
    starter: Zap,
    growth: CreditCard,
    enterprise: Building,
}

const PLAN_COLORS: Record<string, { badge: string; ring: string; button: string; bg: string; icon: string }> = {
    starter: { badge: 'bg-slate-100 text-slate-700', ring: 'ring-slate-200', button: '', bg: '#f8fafc', icon: '#6b7280' },
    growth: { badge: 'bg-blue-100 text-blue-700', ring: 'ring-blue-300', button: 'bg-blue-600 hover:bg-blue-700 text-white', bg: '#eff6ff', icon: '#2563eb' },
    enterprise: { badge: 'bg-purple-100 text-purple-700', ring: 'ring-purple-300', button: 'bg-purple-600 hover:bg-purple-700 text-white', bg: '#f5f3ff', icon: '#7c3aed' },
}

const EVENT_BADGE: Record<string, string> = {
    plan_activated: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
    quota_updated: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    upgrade_request: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    enterprise_contact: 'bg-purple-50 text-purple-700 ring-1 ring-purple-200',
    checkout_created: 'bg-slate-100 text-slate-600',
}

// ─── Invoice Row ──────────────────────────────────────────────────────────────

function InvoiceRow({ event }: { event: SubscriptionEvent }) {
    const { t } = useTranslation()
    const [downloading, setDownloading] = useState(false)
    const meta = event.metadata ?? {}
    const invoiceRef = (meta.invoiceRef as string) ?? `INV-${event.id.slice(0, 8).toUpperCase()}`
    const isDownloadable = ['plan_activated', 'quota_updated'].includes(event.eventType)

    const EVENT_LABELS: Record<string, string> = {
        plan_activated: t('orgSettings.subscription.eventPlanActivation'),
        quota_updated: t('orgSettings.subscription.eventCapacityUpdate'),
        upgrade_request: t('orgSettings.subscription.eventUpgradeRequest'),
        enterprise_contact: t('orgSettings.subscription.eventEnterpriseEnquiry'),
        checkout_created: t('orgSettings.subscription.eventCheckoutInitiated'),
    }

    async function handleDownload() {
        setDownloading(true)
        try {
            await downloadInvoicePdf(event.id, invoiceRef)
        } catch {
            toast.error(t('orgSettings.subscription.downloadFailed'), t('orgSettings.subscription.downloadFailedDesc'))
        } finally {
            setDownloading(false)
        }
    }

    return (
        <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs font-mono font-medium">{invoiceRef}</span>
                </div>
            </td>
            <td className="px-4 py-3">
                <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-medium', EVENT_BADGE[event.eventType] ?? 'bg-muted text-muted-foreground')}>
                    {EVENT_LABELS[event.eventType] ?? event.eventType}
                </span>
            </td>
            <td className="px-4 py-3">
                {event.employeeQuota
                    ? <div className="flex items-center gap-1 text-xs"><Users2 className="h-3 w-3 text-muted-foreground" />{event.employeeQuota}</div>
                    : <span className="text-xs text-muted-foreground">—</span>}
            </td>
            <td className="px-4 py-3 text-right">
                {event.monthlyCost
                    ? <span className="text-xs font-semibold">AED {event.monthlyCost.toLocaleString()}</span>
                    : <span className="text-xs text-muted-foreground">—</span>}
            </td>
            <td className="px-4 py-3">
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Calendar className="h-3 w-3 shrink-0" />
                    {new Date(event.createdAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
            </td>
            <td className="px-4 py-3 text-right">
                {isDownloadable ? (
                    <Button
                        variant="outline" size="sm"
                        className="h-7 gap-1.5 text-xs border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300"
                        onClick={handleDownload}
                        disabled={downloading}
                    >
                        <Download className="h-3.5 w-3.5" />
                        {downloading ? t('orgSettings.subscription.downloading') : t('orgSettings.subscription.downloadPdf')}
                    </Button>
                ) : (
                    <span className="text-xs text-muted-foreground/40">—</span>
                )}
            </td>
        </tr>
    )
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function SubscriptionTab() {
    const { t } = useTranslation()
    const { data: sub, isLoading, refetch } = useSubscription()
    const { data: events = [], isLoading: eventsLoading } = useSubscriptionEvents()
    const checkoutMut = useCheckoutSession()
    const updateQuotaMut = useUpdateQuota()
    const upgradeMut = useUpgradeRequest()
    const contactMut = useEnterpriseContact()
    const user = useAuthStore(s => s.user)
    const [searchParams, setSearchParams] = useSearchParams()

    const checkoutResult = searchParams.get('checkout')
    useEffect(() => {
        if (checkoutResult === 'upgraded') {
            toast.success(t('orgSettings.subscription.professionalActivated'), t('orgSettings.subscription.professionalActivatedDesc'))
            refetch()
            const next = new URLSearchParams(searchParams)
            next.delete('checkout')
            setSearchParams(next, { replace: true })
        } else if (checkoutResult === 'quota') {
            toast.success(t('orgSettings.subscription.capacityUpdated'), t('orgSettings.subscription.capacityUpdatedDesc'))
            refetch()
            const next = new URLSearchParams(searchParams)
            next.delete('checkout')
            setSearchParams(next, { replace: true })
        }
    }, [checkoutResult]) // eslint-disable-line react-hooks/exhaustive-deps

    const [upgradeModal, setUpgradeModal] = useState<false | 'plans' | 'quota'>(false)
    const [enterpriseModal, setEnterpriseModal] = useState(false)
    const [desiredQuota, setDesiredQuota] = useState(10)
    const [contactForm, setContactForm] = useState({
        contactName: user?.name ?? '',
        contactEmail: user?.email ?? '',
        companySize: '',
        message: '',
    })

    const isOnProfessional = sub?.current.plan === 'growth'
    const stripeEnabled = sub?.stripeEnabled ?? false
    const pricing = sub?.pricing
    // Per-user pricing model — AED 15 / user / month (server is source of truth).
    const pricePerUser = pricing?.pricePerUser ?? Math.round((pricing?.pricePerFiveEmployees ?? 75) / 5)
    const monthlyCost = desiredQuota * pricePerUser

    const handlePay = async () => {
        const action: 'upgrade' | 'quota_update' = isOnProfessional ? 'quota_update' : 'upgrade'
        try {
            if (stripeEnabled) {
                const result = await checkoutMut.mutateAsync({ desiredQuota, action })
                window.location.href = result.url
            } else if (isOnProfessional) {
                const result = await updateQuotaMut.mutateAsync(desiredQuota)
                toast.success(t('orgSettings.subscription.capacityUpdated'), result.message)
                setUpgradeModal(false)
                refetch()
            } else {
                const result = await upgradeMut.mutateAsync(desiredQuota)
                toast.success(t('orgSettings.subscription.upgradeRequestSent'), result.message)
                setUpgradeModal(false)
            }
        } catch (err) {
            const msg = err instanceof ApiError ? err.message : t('common.error')
            toast.error(isOnProfessional ? t('orgSettings.subscription.failedToUpdateCapacity') : t('orgSettings.subscription.upgradeFailed'), msg)
        }
    }

    const handleEnterpriseContact = async () => {
        if (!contactForm.contactName || !contactForm.contactEmail || !contactForm.companySize || !contactForm.message) {
            toast.error(t('orgSettings.subscription.allFieldsRequired'), t('orgSettings.subscription.allFieldsRequiredDesc'))
            return
        }
        try {
            await contactMut.mutateAsync(contactForm)
            toast.success(t('orgSettings.subscription.inquirySent'), t('orgSettings.subscription.inquirySentDesc'))
            setEnterpriseModal(false)
        } catch (err) {
            const msg = err instanceof ApiError ? err.message : t('common.error')
            toast.error(t('orgSettings.subscription.failedToSendInquiry'), msg)
        }
    }

    if (isLoading) {
        return (
            <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
                    <Skeleton className="h-64 rounded-xl" />
                    <Skeleton className="h-64 rounded-xl" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[1, 2, 3].map(n => <Skeleton key={n} className="h-72 rounded-xl" />)}
                </div>
            </div>
        )
    }

    const { current, plans } = sub!
    const planColors = PLAN_COLORS[current.plan] ?? PLAN_COLORS.starter

    return (
        <div className="space-y-6">

            {/* ── Row 1: Current plan (left) + Billing history (right) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">

                {/* Left — current plan card */}
                <Card className={cn('ring-1', planColors.ring)}>
                    <CardHeader className="pb-3">
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: planColors.bg }}>
                                <ShieldCheck className="h-4 w-4" style={{ color: planColors.icon }} />
                            </div>
                            <div>
                                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">{t('orgSettings.subscription.currentPlan')}</p>
                                <p className="text-base font-bold leading-tight">{current.planName}</p>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-0 space-y-4">
                        <Separator />

                        {/* Usage */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5 text-muted-foreground">
                                    <Users2 className="h-3.5 w-3.5" />
                                    <span>{t('orgSettings.subscription.employees')}</span>
                                </div>
                                <span className="font-semibold">
                                    {current.employeeCount}
                                    {current.quota !== null
                                        ? <span className="text-muted-foreground font-normal"> / {current.quota}</span>
                                        : <span className="text-muted-foreground font-normal"> / {t('orgSettings.subscription.unlimited')}</span>}
                                </span>
                            </div>
                            {current.quota !== null ? (
                                <>
                                    <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                                width: `${Math.min(100, current.usagePercent)}%`,
                                                backgroundColor: current.usagePercent >= 90 ? '#dc2626' : current.usagePercent >= 70 ? '#d97706' : '#10b981',
                                            }}
                                        />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">{t('orgSettings.subscription.usagePercent', { percent: current.usagePercent })}</p>
                                </>
                            ) : (
                                <p className="text-[11px] text-muted-foreground">{t('orgSettings.subscription.noLimit')}</p>
                            )}
                        </div>

                        {!current.canAdd && (
                            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>{t('orgSettings.subscription.limitReached')}</span>
                            </div>
                        )}

                        <Separator />

                        {/* CTAs */}
                        <div className="space-y-2">
                            <Button
                                size="sm" className="w-full"
                                onClick={() => setUpgradeModal(isOnProfessional ? 'quota' : 'plans')}
                                leftIcon={<Zap className="h-3.5 w-3.5" />}
                            >
                                {isOnProfessional ? t('orgSettings.subscription.updateCapacity') : t('orgSettings.subscription.upgradePlan')}
                            </Button>
                            <Button
                                size="sm" variant="outline" className="w-full"
                                onClick={() => setEnterpriseModal(true)}
                                leftIcon={<Send className="h-3.5 w-3.5" />}
                            >
                                {t('orgSettings.subscription.contactEnterpriseSales')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Right — billing history */}
                <Card className="min-h-[256px]">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-semibold">{t('orgSettings.subscription.billingHistory')}</CardTitle>
                            <CardDescription className="text-xs mt-0.5">{t('orgSettings.subscription.billingHistoryDesc')}</CardDescription>
                        </div>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>

                    {eventsLoading ? (
                        <CardContent className="pt-0 space-y-2">
                            {[1, 2, 3].map(n => <Skeleton key={n} className="h-10 rounded-lg" />)}
                        </CardContent>
                    ) : events.length === 0 ? (
                        <CardContent className="py-10 text-center">
                            <FileText className="h-7 w-7 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">{t('orgSettings.subscription.noBillingHistory')}</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">{t('orgSettings.subscription.noBillingHistoryHint')}</p>
                        </CardContent>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b bg-muted/40">
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t('orgSettings.subscription.invoiceCol')}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t('orgSettings.subscription.typeCol')}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t('orgSettings.subscription.capacityCol')}</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">{t('orgSettings.subscription.amountCol')}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">{t('orgSettings.subscription.dateCol')}</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">{t('orgSettings.subscription.pdfCol')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map(event => <InvoiceRow key={event.id} event={event} />)}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>

            {/* ── Step 1: Plan picker ── */}
            <Dialog open={upgradeModal === 'plans'} onOpenChange={v => !v && setUpgradeModal(false)}>
                <DialogContent className="max-w-4xl w-full">
                    <DialogHeader>
                        <DialogTitle className="text-lg">{t('orgSettings.subscription.choosePlan')}</DialogTitle>
                        <DialogDescription>{t('orgSettings.subscription.choosePlanDesc')}</DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2">
                        {(plans as PlanInfo[]).map(plan => {
                            const PlanIcon = PLAN_ICONS[plan.key] ?? Zap
                            const colors = PLAN_COLORS[plan.key]
                            return (
                                <div
                                    key={plan.key}
                                    className={cn(
                                        'rounded-xl border bg-card p-6 flex flex-col gap-4',
                                        plan.isCurrent ? `ring-2 shadow-sm ${colors?.ring}` : 'hover:shadow-md transition-shadow',
                                    )}
                                >
                                    {/* Icon + name */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-3">
                                            <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: colors?.bg ?? '#f8fafc' }}>
                                                <PlanIcon className="h-5 w-5" style={{ color: colors?.icon }} />
                                            </div>
                                            <div>
                                                <p className="font-bold text-base leading-tight">{plan.name}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">{plan.description}</p>
                                            </div>
                                        </div>
                                        {plan.isCurrent && (
                                            <span className={cn('text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0', colors?.badge)}>{t('orgSettings.subscription.activePlan')}</span>
                                        )}
                                    </div>

                                    {/* Price */}
                                    <div>
                                        <p className="text-lg font-bold">{plan.priceLabel}</p>
                                    </div>

                                    {/* Features */}
                                    <ul className="space-y-2 flex-1">
                                        {plan.features.map(f => (
                                            <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                                                <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                                {f}
                                            </li>
                                        ))}
                                    </ul>

                                    {/* CTA */}
                                    <div className="pt-3 border-t mt-auto">
                                        {plan.isCurrent ? (
                                            <Button size="sm" variant="outline" className="w-full" disabled>{t('orgSettings.subscription.currentPlanBtn')}</Button>
                                        ) : plan.key === 'growth' ? (
                                            <Button
                                                className={cn('w-full', colors?.button)}
                                                onClick={() => { setDesiredQuota(10); setUpgradeModal('quota') }}
                                                leftIcon={<Zap className="h-4 w-4" />}
                                            >
                                                {t('orgSettings.subscription.selectProfessional')}
                                            </Button>
                                        ) : plan.key === 'enterprise' ? (
                                            <Button
                                                variant="outline" className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
                                                onClick={() => { setUpgradeModal(false); setEnterpriseModal(true) }}
                                                leftIcon={<Send className="h-4 w-4" />}
                                            >
                                                {t('orgSettings.subscription.contactSales')}
                                            </Button>
                                        ) : (
                                            <Button variant="outline" className="w-full" disabled>{t('orgSettings.subscription.freePlan')}</Button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Step 2: Capacity + payment ── */}
            <Dialog open={upgradeModal === 'quota'} onOpenChange={v => !v && setUpgradeModal(false)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{isOnProfessional ? t('orgSettings.subscription.updateEmployeeCapacity') : t('orgSettings.subscription.upgradeToProfessional')}</DialogTitle>
                        <DialogDescription>
                            {isOnProfessional
                                ? stripeEnabled
                                    ? t('orgSettings.subscription.stripeCapacityDesc')
                                    : t('orgSettings.subscription.manualCapacityDesc')
                                : `${t('orgSettings.subscription.pricePerUserDesc', { price: pricePerUser })} ${stripeEnabled ? t('orgSettings.subscription.stripeDesc') : t('orgSettings.subscription.manualDesc')}`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <Label>{t('orgSettings.subscription.numberOfUsers')}</Label>
                        <div className="flex items-center gap-3">
                            <Button type="button" variant="outline" size="icon-sm" onClick={() => setDesiredQuota(q => Math.max(1, q - 1))}>
                                <Minus className="h-4 w-4" />
                            </Button>
                            <NumericInput
                                decimal={false}
                                value={String(desiredQuota)}
                                onChange={e => setDesiredQuota(Math.max(1, Number(e.target.value) || 1))}
                                className="text-center font-semibold w-24"
                            />
                            <Button type="button" variant="outline" size="icon-sm" onClick={() => setDesiredQuota(q => q + 1)}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-blue-600 font-medium">{t('orgSettings.subscription.monthlyCost')}</p>
                                <p className="text-2xl font-bold text-blue-700">AED {monthlyCost.toLocaleString()}</p>
                            </div>
                            <div className="text-right text-xs text-blue-600">
                                <p>{desiredQuota} {desiredQuota === 1 ? t('orgSettings.subscription.user') : t('orgSettings.subscription.users')}</p>
                                <p>{t('orgSettings.subscription.priceFormula', { price: pricePerUser, count: desiredQuota })}</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        {!isOnProfessional && (
                            <Button variant="ghost" size="sm" onClick={() => setUpgradeModal('plans')} className="gap-1 text-xs px-2">
                                ← {t('common.back')}
                            </Button>
                        )}
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setUpgradeModal(false)}>{t('common.cancel')}</Button>
                        {stripeEnabled ? (
                            <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" loading={checkoutMut.isPending} onClick={handlePay}
                                leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
                                {isOnProfessional ? t('orgSettings.subscription.payUpdate') : t('orgSettings.subscription.payActivate')}
                            </Button>
                        ) : isOnProfessional ? (
                            <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" loading={updateQuotaMut.isPending} onClick={handlePay}
                                leftIcon={<CheckCircle className="h-3.5 w-3.5" />}>
                                {t('orgSettings.subscription.saveChanges')}
                            </Button>
                        ) : (
                            <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" loading={upgradeMut.isPending} onClick={handlePay}
                                leftIcon={<Send className="h-3.5 w-3.5" />}>
                                {t('orgSettings.subscription.sendUpgradeRequest')}
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Enterprise modal ── */}
            <Dialog open={enterpriseModal} onOpenChange={setEnterpriseModal}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('orgSettings.subscription.contactSalesEnterprise')}</DialogTitle>
                        <DialogDescription>{t('orgSettings.subscription.contactSalesEnterpriseDesc')}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>{t('orgSettings.subscription.yourName')}</Label>
                                <Input value={contactForm.contactName} onChange={e => setContactForm(f => ({ ...f, contactName: e.target.value }))} placeholder={t('orgSettings.subscription.fullNamePlaceholder')} />
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t('orgSettings.subscription.workEmail')}</Label>
                                <Input type="email" value={contactForm.contactEmail} onChange={e => setContactForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder={t('orgSettings.subscription.workEmailPlaceholder')} />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('orgSettings.subscription.companySize')}</Label>
                            <select
                                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                value={contactForm.companySize}
                                onChange={e => setContactForm(f => ({ ...f, companySize: e.target.value }))}
                            >
                                <option value="">{t('orgSettings.subscription.selectCompanySize')}</option>
                                <option value="50-100">50–100 employees</option>
                                <option value="100-250">100–250 employees</option>
                                <option value="250-500">250–500 employees</option>
                                <option value="500-1000">500–1,000 employees</option>
                                <option value="1000+">1,000+ employees</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('orgSettings.subscription.tellUsNeeds')}</Label>
                            <textarea
                                rows={3}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                                placeholder={t('orgSettings.subscription.requirementsPlaceholder')}
                                value={contactForm.message}
                                onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setEnterpriseModal(false)}>{t('common.cancel')}</Button>
                        <Button size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" loading={contactMut.isPending} onClick={handleEnterpriseContact}
                            leftIcon={<Send className="h-3.5 w-3.5" />}>
                            {t('orgSettings.subscription.sendInquiry')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
