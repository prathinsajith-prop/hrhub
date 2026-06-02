import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    CreditCard, CheckCircle2, Zap, Building2, Users, ArrowUpRight,
    Download, FileText, Calendar, Plus, Minus, Send,
    AlertCircle, Sparkles, ChevronDown, Receipt, TrendingUp,
} from 'lucide-react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { toast } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { ApiError } from '@/lib/api'
import {
    useSubscription, useSubscriptionEvents, useUpgradeRequest,
    useEnterpriseContact, useCheckoutSession, downloadInvoicePdf,
} from '@/hooks/useSubscription'
import type { PlanInfo, SubscriptionEvent } from '@/hooks/useSubscription'

// ─── Plan visual metadata ────────────────────────────────────────────────────

const PLAN_META: Record<string, {
    icon: typeof Zap
    gradient: string
    iconBg: string
    iconColor: string
    accent: string
}> = {
    starter: {
        icon: Zap,
        gradient: 'from-slate-500/10 via-slate-500/5 to-transparent',
        iconBg: 'bg-slate-100',
        iconColor: 'text-slate-600',
        accent: 'text-slate-700',
    },
    growth: {
        icon: Sparkles,
        gradient: 'from-blue-500/15 via-blue-500/5 to-transparent',
        iconBg: 'bg-blue-100',
        iconColor: 'text-blue-600',
        accent: 'text-blue-700',
    },
    enterprise: {
        icon: Building2,
        gradient: 'from-violet-500/15 via-violet-500/5 to-transparent',
        iconBg: 'bg-violet-100',
        iconColor: 'text-violet-600',
        accent: 'text-violet-700',
    },
}

// EVENT_LABELS are now translated inline via t() in InvoiceRow

const EVENT_TONE: Record<string, string> = {
    plan_activated: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    quota_updated: 'bg-blue-50 text-blue-700 ring-blue-200',
    upgrade_request: 'bg-amber-50 text-amber-700 ring-amber-200',
    enterprise_contact: 'bg-violet-50 text-violet-700 ring-violet-200',
    checkout_created: 'bg-slate-100 text-slate-600 ring-slate-200',
}

function fmtMoney(n: number, currency = 'AED') {
    return `${currency} ${n.toLocaleString('en-AE')}`
}

// ─── Upgrade Dialog ───────────────────────────────────────────────────────────

function UpgradeDialog({ open, onClose, currentQuota, stripeEnabled, pricePerUser, currency }: {
    open: boolean
    onClose: () => void
    currentQuota: number | null
    stripeEnabled: boolean
    pricePerUser: number
    currency: string
}) {
    const { t } = useTranslation()
    const [quota, setQuota] = useState(() => Math.max(1, (currentQuota ?? 0) + 1))
    const checkoutMut = useCheckoutSession()
    const upgradeMut = useUpgradeRequest()

     
    useEffect(() => {
        if (open) setQuota(Math.max(1, (currentQuota ?? 0) + 1))
    }, [open, currentQuota])

    const monthlyCost = quota * pricePerUser

    function adjust(delta: number) {
        setQuota(q => Math.max(1, Math.min(10000, q + delta)))
    }

    function handleSubmit() {
        if (stripeEnabled) {
            checkoutMut.mutate({ desiredQuota: quota, action: 'upgrade' }, {
                onSuccess: (data) => { if (data?.url) window.location.href = data.url },
                onError: (err) => toast.error(t('subscriptionPage.checkoutFailed'), err instanceof ApiError ? err.message : t('subscriptionPage.tryAgain')),
            })
        } else {
            upgradeMut.mutate(quota, {
                onSuccess: () => {
                    toast.success(t('subscriptionPage.upgradeRequestSent'), t('subscriptionPage.upgradeRequestSentDesc'))
                    onClose()
                },
                onError: (err) => toast.error(t('subscriptionPage.requestFailed'), err instanceof ApiError ? err.message : t('subscriptionPage.tryAgain')),
            })
        }
    }

    const isPending = checkoutMut.isPending || upgradeMut.isPending

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="size-4 text-primary" />
                        {t('subscriptionPage.adjustCapacity')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('subscriptionPage.perUserBilledMonthly', { price: fmtMoney(pricePerUser, currency) })}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* Capacity stepper - pill style */}
                    <div className="rounded-2xl border bg-muted/30 p-5">
                        <Label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{t('subscriptionPage.employees')}</Label>
                        <div className="flex items-center gap-3 mt-2">
                            <Button
                                type="button" variant="outline" size="icon"
                                onClick={() => adjust(-1)} disabled={quota <= 1}
                                className="size-10 shrink-0 rounded-full"
                            >
                                <Minus className="size-4" />
                            </Button>
                            <Input
                                type="number"
                                value={quota}
                                min={1}
                                max={10000}
                                onChange={e => {
                                    const v = parseInt(e.target.value)
                                    if (!isNaN(v)) setQuota(Math.max(1, Math.min(10000, v)))
                                }}
                                className="text-center text-3xl font-bold h-12 border-0 bg-transparent shadow-none focus-visible:ring-0 tabular-figures"
                            />
                            <Button
                                type="button" variant="outline" size="icon"
                                onClick={() => adjust(1)} disabled={quota >= 10000}
                                className="size-10 shrink-0 rounded-full"
                            >
                                <Plus className="size-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Cost summary */}
                    <div className="space-y-2.5 px-1">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{t('subscriptionPage.perUser')}</span>
                            <span className="font-medium tabular-figures">{fmtMoney(pricePerUser, currency)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{t('subscriptionPage.monthlyTotal')}</span>
                            <span className="font-semibold tabular-figures">{fmtMoney(monthlyCost, currency)}</span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-semibold">{t('subscriptionPage.annualEstimate')}</span>
                            <span className="font-bold tabular-figures text-primary">{fmtMoney(monthlyCost * 12, currency)}</span>
                        </div>
                    </div>

                    {!stripeEnabled && (
                        <div className="flex gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                            <AlertCircle className="size-4 shrink-0 mt-0.5 text-amber-600" />
                            <span>{t('subscriptionPage.noOnlinePayment')}</span>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isPending}>{t('common.cancel')}</Button>
                    <Button onClick={handleSubmit} disabled={isPending}
                        leftIcon={stripeEnabled ? <CreditCard className="size-3.5" /> : <Send className="size-3.5" />}>
                        {isPending ? t('subscriptionPage.processing') : stripeEnabled ? t('subscriptionPage.continueToPayment') : t('subscriptionPage.sendRequest')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Enterprise Dialog ────────────────────────────────────────────────────────

function EnterpriseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation()
    const user = useAuthStore(s => s.user)
    const contactMut = useEnterpriseContact()
    const [form, setForm] = useState({
        contactName: user?.name ?? '',
        contactEmail: user?.email ?? '',
        companySize: '',
        message: '',
    })

    function handleSubmit() {
        if (!form.contactName || !form.contactEmail || !form.companySize || !form.message) {
            toast.error(t('subscriptionPage.allFieldsRequired'))
            return
        }
        contactMut.mutate(form, {
            onSuccess: () => {
                toast.success(t('subscriptionPage.enquirySent'), t('subscriptionPage.enquirySentDesc'))
                onClose()
            },
            onError: (err) => toast.error(t('subscriptionPage.failedToSend'), err instanceof ApiError ? err.message : t('subscriptionPage.tryAgain')),
        })
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[460px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Building2 className="size-4 text-violet-600" />
                        {t('subscriptionPage.talkToEnterprise')}
                    </DialogTitle>
                    <DialogDescription>{t('subscriptionPage.talkToEnterpriseDesc')}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3.5 py-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>{t('subscriptionPage.yourName')}</Label>
                            <Input
                                value={form.contactName}
                                onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Email</Label>
                            <Input
                                type="email"
                                value={form.contactEmail}
                                onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))}
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Company size</Label>
                        <Input
                            value={form.companySize}
                            onChange={e => setForm(f => ({ ...f, companySize: e.target.value }))}
                            placeholder="e.g. 200–500 employees"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label>Tell us about your needs</Label>
                        <textarea
                            rows={4}
                            aria-label="Tell us about your needs"
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            placeholder="Number of entities, payroll complexity, integrations…"
                            value={form.message}
                            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={contactMut.isPending} leftIcon={<Send className="size-3.5" />}>
                        {contactMut.isPending ? 'Sending…' : 'Send enquiry'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Stat tile ────────────────────────────────────────────────────────────────

const STAT_TILE_TONE_MAP = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-950/40 dark:text-violet-400',
}

function StatTile({ label, value, hint, icon: Icon, tone }: {
    label: string
    value: React.ReactNode
    hint?: React.ReactNode
    icon: React.ElementType
    tone: 'blue' | 'emerald' | 'amber' | 'violet'
}) {
    return (
        <div className="rounded-xl border bg-card p-4 flex items-start gap-3">
            <div className={cn('size-9 rounded-lg flex items-center justify-center shrink-0', STAT_TILE_TONE_MAP[tone])}>
                <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>
                <p className="text-xl font-bold leading-tight mt-1 tabular-figures">{value}</p>
                {hint && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
            </div>
        </div>
    )
}

// ─── Plan Card ────────────────────────────────────────────────────────────────

function PlanCard({ plan, isCurrent, onUpgrade, onEnterprise }: {
    plan: PlanInfo
    isCurrent: boolean
    onUpgrade: () => void
    onEnterprise: () => void
}) {
    const meta = PLAN_META[plan.key] ?? PLAN_META.starter
    const Icon = meta.icon
    const isMostPopular = plan.key === 'growth' && !isCurrent

    return (
        <div className={cn(
            'relative rounded-2xl border bg-card p-5 flex flex-col transition-all',
            isCurrent ? 'border-primary/40 shadow-sm' : 'border-border hover:border-border/80 hover:shadow-sm',
        )}>
            {isCurrent && (
                <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground shadow-sm">
                    <CheckCircle2 className="size-3" /> Current
                </span>
            )}
            {isMostPopular && (
                <span className="absolute -top-2.5 left-5 inline-flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                    Most popular
                </span>
            )}

            {/* Header */}
            <div className="flex items-start gap-3">
                <div className={cn('size-10 rounded-xl flex items-center justify-center shrink-0', meta.iconBg)}>
                    <Icon className={cn('size-5', meta.iconColor)} />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className={cn('text-base font-bold', meta.accent)}>{plan.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{plan.description}</p>
                </div>
            </div>

            {/* Price */}
            <div className="mt-4 mb-4">
                <p className="text-2xl font-bold tracking-tight tabular-figures">{plan.priceLabel}</p>
            </div>

            {/* Features */}
            <ul className="space-y-2 mb-5 flex-1">
                {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span className="text-foreground/90">{f}</span>
                    </li>
                ))}
            </ul>

            {/* CTA */}
            {isCurrent ? (
                <Button variant="outline" size="sm" className="w-full" disabled>
                    Active plan
                </Button>
            ) : plan.key === 'enterprise' ? (
                <Button variant="outline" size="sm" className="w-full" onClick={onEnterprise}
                    leftIcon={<ArrowUpRight className="size-3.5" />}>
                    Contact sales
                </Button>
            ) : (
                <Button size="sm" className="w-full" onClick={onUpgrade}
                    leftIcon={<Zap className="size-3.5" />}>
                    Upgrade now
                </Button>
            )}
        </div>
    )
}

// ─── Invoice row (clean card-style) ───────────────────────────────────────────

function InvoiceRow({ event }: { event: SubscriptionEvent }) {
    const { t } = useTranslation()
    const [downloading, setDownloading] = useState(false)
    const meta = event.metadata ?? {}
    const invoiceRef = (meta.invoiceRef as string) ?? `INV-${event.id.slice(0, 8).toUpperCase()}`
    const isDownloadable = ['plan_activated', 'quota_updated'].includes(event.eventType)
    const tone = EVENT_TONE[event.eventType] ?? 'bg-slate-100 text-slate-600 ring-slate-200'
    const eventLabel = t(`subscriptionPage.events.${event.eventType}`, { defaultValue: event.eventType })

    async function handleDownload() {
        setDownloading(true)
        try {
            await downloadInvoicePdf(event.id, invoiceRef)
        } catch {
            toast.error('Download failed', 'Could not generate invoice PDF. Please try again.')
        } finally {
            setDownloading(false)
        }
    }

    return (
        <div className="flex items-center gap-4 px-4 py-3.5 hover:bg-muted/40 transition-colors group">
            {/* Icon */}
            <div className="size-9 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
                <Receipt className="size-4 text-primary" />
            </div>

            {/* Reference + label */}
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold font-mono truncate">{invoiceRef}</p>
                    <span className={cn(
                        'shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full ring-1 capitalize',
                        tone,
                    )}>
                        {eventLabel}
                    </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3" />
                        {new Date(event.createdAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    {event.employeeQuota && (
                        <span className="inline-flex items-center gap-1">
                            <Users className="size-3" />
                            {event.employeeQuota} {event.employeeQuota === 1 ? 'employee' : 'employees'}
                        </span>
                    )}
                </div>
            </div>

            {/* Amount */}
            <div className="text-right shrink-0 hidden sm:block">
                {event.monthlyCost ? (
                    <>
                        <p className="text-sm font-bold tabular-figures">{fmtMoney(event.monthlyCost)}</p>
                        <p className="text-[10px] text-muted-foreground">/ month</p>
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground/60">—</p>
                )}
            </div>

            {/* Download */}
            <div className="shrink-0">
                {isDownloadable ? (
                    <Button
                        variant="outline" size="sm"
                        className="h-8 gap-1.5"
                        onClick={handleDownload}
                        disabled={downloading}
                    >
                        <Download className="size-3.5" />
                        <span className="hidden sm:inline">{downloading ? 'Downloading…' : 'PDF'}</span>
                    </Button>
                ) : (
                    <span className="block w-8" />
                )}
            </div>
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SubscriptionPage() {
    const tenant = useAuthStore(s => s.tenant)
    const [searchParams, setSearchParams] = useSearchParams()
    const [upgradeOpen, setUpgradeOpen] = useState(false)
    const [enterpriseOpen, setEnterpriseOpen] = useState(false)
    const [comparePlansOpen, setComparePlansOpen] = useState(false)

    const { data: sub, isLoading: subLoading } = useSubscription()
    const { data: events = [], isLoading: eventsLoading } = useSubscriptionEvents()

    // Handle Stripe redirect back
    const checkoutResult = searchParams.get('checkout')
    useEffect(() => {
        if (!checkoutResult) return
        const msg = checkoutResult === 'upgraded'
            ? 'Professional plan activated - payment confirmed.'
            : checkoutResult === 'quota'
                ? 'Employee capacity updated - payment confirmed.'
                : null
        if (msg) {
            toast.success('Payment confirmed', msg)
            const next = new URLSearchParams(searchParams)
            next.delete('checkout')
            setSearchParams(next, { replace: true })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checkoutResult])

    const current = sub?.current
    const planMeta = PLAN_META[current?.plan ?? 'starter'] ?? PLAN_META.starter
    const PlanIcon = planMeta.icon
    const pricePerUser = sub?.pricing.pricePerUser ?? 15
    const currency = sub?.pricing.currency ?? 'AED'
    const monthlyCost = current?.quota ? current.quota * pricePerUser : (current?.employeeCount ?? 0) * pricePerUser
    const usagePct = current?.usagePercent ?? 0
    const usageColor = usagePct >= 90 ? 'bg-rose-500' : usagePct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'

    return (
        <PageWrapper>
            <PageHeader
                title="Billing & Subscription"
                description="Manage your plan, capacity, and billing history."
            />

            {subLoading ? (
                <Skeleton className="h-48 rounded-2xl" />
            ) : current ? (
                <>
                    {/* ── Hero card ─────────────────────────────────────────── */}
                    <div className={cn(
                        'relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 lg:p-7',
                        planMeta.gradient,
                    )}>
                        <div className="flex flex-col lg:flex-row lg:items-start gap-6">
                            {/* Left: identity + usage */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <div className={cn('size-11 rounded-xl flex items-center justify-center', planMeta.iconBg)}>
                                        <PlanIcon className={cn('size-5', planMeta.iconColor)} />
                                    </div>
                                    <div>
                                        <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Current plan</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            <h2 className={cn('text-2xl font-bold tracking-tight', planMeta.accent)}>{current.planName}</h2>
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 gap-1">
                                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                                Active
                                            </Badge>
                                        </div>
                                        {tenant?.name && (
                                            <p className="text-xs text-muted-foreground mt-0.5">{tenant.name}</p>
                                        )}
                                    </div>
                                </div>

                                {/* Capacity bar - wide and prominent */}
                                <div className="mt-6 max-w-xl">
                                    <div className="flex items-baseline justify-between mb-2">
                                        <p className="text-sm font-medium">
                                            <span className="text-2xl font-bold tabular-figures">{current.employeeCount}</span>
                                            <span className="text-muted-foreground">
                                                {' '}of {current.quota ? current.quota.toLocaleString() : 'unlimited'} employees
                                            </span>
                                        </p>
                                        {current.quota && (
                                            <span className={cn(
                                                'text-xs font-semibold tabular-figures',
                                                usagePct >= 90 ? 'text-rose-600' : usagePct >= 70 ? 'text-amber-600' : 'text-emerald-600',
                                            )}>
                                                {usagePct}% used
                                            </span>
                                        )}
                                    </div>
                                    {current.quota ? (
                                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className={cn('h-full rounded-full transition-all', usageColor)}
                                                style={{ width: `${Math.min(100, usagePct)}%` }}
                                            />
                                        </div>
                                    ) : (
                                        <p className="text-xs text-muted-foreground">No capacity limit on this plan.</p>
                                    )}

                                    {current.quota && usagePct >= 80 && (
                                        <div className="flex items-center gap-2 mt-3 text-xs text-amber-700">
                                            <AlertCircle className="size-3.5" />
                                            <span>You're nearing capacity. Increase it to keep adding employees.</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right: CTAs */}
                            <div className="flex flex-row lg:flex-col gap-2 lg:w-48 shrink-0">
                                <Button
                                    className="flex-1 lg:w-full"
                                    onClick={() => setUpgradeOpen(true)}
                                    leftIcon={<Sparkles className="size-3.5" />}
                                >
                                    {current.quota ? 'Adjust capacity' : 'Upgrade plan'}
                                </Button>
                                <Button
                                    variant="outline"
                                    className="flex-1 lg:w-full"
                                    onClick={() => setEnterpriseOpen(true)}
                                    leftIcon={<Building2 className="size-3.5" />}
                                >
                                    Talk to sales
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* ── KPI tiles ─────────────────────────────────────────── */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                        <StatTile
                            label="Active employees"
                            value={current.employeeCount}
                            hint={current.canAdd ? 'Headroom available' : 'Capacity reached'}
                            icon={Users}
                            tone="blue"
                        />
                        <StatTile
                            label="Capacity"
                            value={current.quota ? current.quota.toLocaleString() : '∞'}
                            hint={current.quota ? `${current.quota - current.employeeCount} seats free` : 'Unlimited'}
                            icon={TrendingUp}
                            tone="emerald"
                        />
                        <StatTile
                            label="Monthly cost"
                            value={current.quota ? fmtMoney(monthlyCost, currency) : '—'}
                            hint={`${fmtMoney(pricePerUser, currency)} per user`}
                            icon={CreditCard}
                            tone="amber"
                        />
                        <StatTile
                            label="Annual estimate"
                            value={current.quota ? fmtMoney(monthlyCost * 12, currency) : '—'}
                            hint="Billed monthly"
                            icon={Calendar}
                            tone="violet"
                        />
                    </div>
                </>
            ) : null}

            {/* ── Billing history ─────────────────────────────────────────── */}
            <Card>
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <FileText className="size-4 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-base">Billing history</CardTitle>
                            <CardDescription className="text-xs">Invoices and recent subscription events</CardDescription>
                        </div>
                    </div>
                </CardHeader>
                {eventsLoading ? (
                    <CardContent className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={`skeleton-${i}`} className="h-14 rounded-lg" />)}
                    </CardContent>
                ) : events.length === 0 ? (
                    <CardContent className="py-12 text-center">
                        <div className="inline-flex size-12 rounded-2xl bg-muted items-center justify-center mb-3">
                            <Receipt className="size-5 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium">No billing history yet</p>
                        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                            Invoices and subscription events will appear here after your first payment.
                        </p>
                    </CardContent>
                ) : (
                    <div className="divide-y border-t">
                        {events.map(event => (
                            <InvoiceRow key={event.id} event={event} />
                        ))}
                    </div>
                )}
            </Card>

            {/* ── Compare plans (toggle button) ───────────────────────────── */}
            <div>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                        <h3 className="text-sm font-semibold">Plans</h3>
                        <p className="text-xs text-muted-foreground">See what's included in each tier and upgrade when ready.</p>
                    </div>
                    <Button
                        variant={comparePlansOpen ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setComparePlansOpen(v => !v)}
                        leftIcon={<Sparkles className="size-3.5" />}
                        rightIcon={<ChevronDown className={cn('size-3.5 transition-transform', comparePlansOpen && 'rotate-180')} />}
                    >
                        {comparePlansOpen ? 'Hide plans' : 'Compare plans'}
                    </Button>
                </div>

                {comparePlansOpen && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                        {subLoading
                            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={`skeleton-${i}`} className="h-80 rounded-2xl" />)
                            : (sub?.plans ?? []).map(plan => (
                                <PlanCard
                                    key={plan.key}
                                    plan={plan}
                                    isCurrent={plan.isCurrent}
                                    onUpgrade={() => setUpgradeOpen(true)}
                                    onEnterprise={() => setEnterpriseOpen(true)}
                                />
                            ))
                        }
                    </div>
                )}
            </div>

            {/* ── Dialogs ─────────────────────────────────────────────────── */}
            <UpgradeDialog
                open={upgradeOpen}
                onClose={() => setUpgradeOpen(false)}
                currentQuota={sub?.current.quota ?? null}
                stripeEnabled={sub?.stripeEnabled ?? false}
                pricePerUser={pricePerUser}
                currency={currency}
            />
            <EnterpriseDialog open={enterpriseOpen} onClose={() => setEnterpriseOpen(false)} />
        </PageWrapper>
    )
}
