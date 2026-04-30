import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
    Zap, CreditCard, Building, Users2, AlertCircle, CheckCircle, Send,
    ExternalLink, Plus, Minus, ShieldCheck, FileText, Calendar, Download,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
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

const EVENT_LABELS: Record<string, string> = {
    plan_activated: 'Plan Activation',
    quota_updated: 'Capacity Update',
    upgrade_request: 'Upgrade Request',
    enterprise_contact: 'Enterprise Enquiry',
    checkout_created: 'Checkout Initiated',
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
    const [downloading, setDownloading] = useState(false)
    const meta = event.metadata ?? {}
    const invoiceRef = (meta.invoiceRef as string) ?? `INV-${event.id.slice(0, 8).toUpperCase()}`
    const isDownloadable = ['plan_activated', 'quota_updated'].includes(event.eventType)

    async function handleDownload() {
        setDownloading(true)
        try {
            await downloadInvoicePdf(event.id, invoiceRef)
        } catch {
            toast.error('Download failed', 'Could not generate invoice PDF.')
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
                        {downloading ? 'Downloading…' : 'Download PDF'}
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
            toast.success('Professional plan activated', 'Payment confirmed. Your plan is now active.')
            refetch()
            const next = new URLSearchParams(searchParams)
            next.delete('checkout')
            setSearchParams(next, { replace: true })
        } else if (checkoutResult === 'quota') {
            toast.success('Capacity updated', 'Payment confirmed. Your new employee capacity is now active.')
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
    const monthlyCost = pricing ? Math.ceil(desiredQuota / 5) * pricing.pricePerFiveEmployees : 0

    const handlePay = async () => {
        const action: 'upgrade' | 'quota_update' = isOnProfessional ? 'quota_update' : 'upgrade'
        try {
            if (stripeEnabled) {
                const result = await checkoutMut.mutateAsync({ desiredQuota, action })
                window.location.href = result.url
            } else if (isOnProfessional) {
                const result = await updateQuotaMut.mutateAsync(desiredQuota)
                toast.success('Capacity updated', result.message)
                setUpgradeModal(false)
                refetch()
            } else {
                const result = await upgradeMut.mutateAsync(desiredQuota)
                toast.success('Upgrade request sent', result.message)
                setUpgradeModal(false)
            }
        } catch (err) {
            const msg = err instanceof ApiError ? err.message : 'Please try again.'
            toast.error(isOnProfessional ? 'Failed to update capacity' : 'Upgrade failed', msg)
        }
    }

    const handleEnterpriseContact = async () => {
        if (!contactForm.contactName || !contactForm.contactEmail || !contactForm.companySize || !contactForm.message) {
            toast.error('All fields required', 'Please fill in all fields.')
            return
        }
        try {
            await contactMut.mutateAsync(contactForm)
            toast.success('Inquiry sent', 'Our enterprise team will reach out within 1 business day.')
            setEnterpriseModal(false)
        } catch (err) {
            const msg = err instanceof ApiError ? err.message : 'Please try again.'
            toast.error('Failed to send inquiry', msg)
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
                                <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Current plan</p>
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
                                    <span>Employees</span>
                                </div>
                                <span className="font-semibold">
                                    {current.employeeCount}
                                    {current.quota !== null
                                        ? <span className="text-muted-foreground font-normal"> / {current.quota}</span>
                                        : <span className="text-muted-foreground font-normal"> / Unlimited</span>}
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
                                    <p className="text-[11px] text-muted-foreground">{current.usagePercent}% of capacity used</p>
                                </>
                            ) : (
                                <p className="text-[11px] text-muted-foreground">No employee limit</p>
                            )}
                        </div>

                        {!current.canAdd && (
                            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                <span>Employee limit reached — upgrade to add more</span>
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
                                {isOnProfessional ? 'Update capacity' : 'Upgrade plan'}
                            </Button>
                            <Button
                                size="sm" variant="outline" className="w-full"
                                onClick={() => setEnterpriseModal(true)}
                                leftIcon={<Send className="h-3.5 w-3.5" />}
                            >
                                Contact enterprise sales
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* Right — billing history */}
                <Card className="min-h-[256px]">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-semibold">Billing History</CardTitle>
                            <CardDescription className="text-xs mt-0.5">Invoices and subscription events</CardDescription>
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
                            <p className="text-sm text-muted-foreground">No billing history yet</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">Invoices appear here after your first payment.</p>
                        </CardContent>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b bg-muted/40">
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Invoice</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Type</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Capacity</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Amount</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Date</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">PDF</th>
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
                        <DialogTitle className="text-lg">Choose a plan</DialogTitle>
                        <DialogDescription>Select the plan that fits your team. You can change at any time.</DialogDescription>
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
                                            <span className={cn('text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0', colors?.badge)}>Active</span>
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
                                            <Button size="sm" variant="outline" className="w-full" disabled>Current plan</Button>
                                        ) : plan.key === 'growth' ? (
                                            <Button
                                                className={cn('w-full', colors?.button)}
                                                onClick={() => { setDesiredQuota(10); setUpgradeModal('quota') }}
                                                leftIcon={<Zap className="h-4 w-4" />}
                                            >
                                                Select Professional
                                            </Button>
                                        ) : plan.key === 'enterprise' ? (
                                            <Button
                                                variant="outline" className="w-full border-purple-300 text-purple-700 hover:bg-purple-50"
                                                onClick={() => { setUpgradeModal(false); setEnterpriseModal(true) }}
                                                leftIcon={<Send className="h-4 w-4" />}
                                            >
                                                Contact Sales
                                            </Button>
                                        ) : (
                                            <Button variant="outline" className="w-full" disabled>Free plan</Button>
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
                        <DialogTitle>{isOnProfessional ? 'Update employee capacity' : 'Upgrade to Professional'}</DialogTitle>
                        <DialogDescription>
                            {isOnProfessional
                                ? stripeEnabled ? 'Choose your new capacity. A payment will be processed for the updated monthly amount.' : 'Adjust your employee capacity. Changes take effect immediately.'
                                : `AED ${pricing?.pricePerFiveEmployees ?? 10} per 5 employees / month. ${stripeEnabled ? 'Pay by card — plan activates instantly.' : 'Our team will confirm payment before activating.'}`}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <Label>Number of employees</Label>
                        <div className="flex items-center gap-3">
                            <Button type="button" variant="outline" size="icon-sm" onClick={() => setDesiredQuota(q => Math.max(5, q - 5))}>
                                <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                                type="number" min={5} step={5}
                                value={desiredQuota}
                                onChange={e => setDesiredQuota(Math.max(5, Number(e.target.value)))}
                                className="text-center font-semibold w-24"
                            />
                            <Button type="button" variant="outline" size="icon-sm" onClick={() => setDesiredQuota(q => q + 5)}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>

                        <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs text-blue-600 font-medium">Monthly cost</p>
                                <p className="text-2xl font-bold text-blue-700">AED {monthlyCost}</p>
                            </div>
                            <div className="text-right text-xs text-blue-600">
                                <p>{desiredQuota} employees</p>
                                <p>AED {pricing?.pricePerFiveEmployees ?? 10} × {Math.ceil(desiredQuota / 5)} blocks</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                        {!isOnProfessional && (
                            <Button variant="ghost" size="sm" onClick={() => setUpgradeModal('plans')} className="gap-1 text-xs px-2">
                                ← Back
                            </Button>
                        )}
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setUpgradeModal(false)}>Cancel</Button>
                        {stripeEnabled ? (
                            <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" loading={checkoutMut.isPending} onClick={handlePay}
                                leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
                                {isOnProfessional ? 'Pay & update' : 'Pay & activate'}
                            </Button>
                        ) : isOnProfessional ? (
                            <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" loading={updateQuotaMut.isPending} onClick={handlePay}
                                leftIcon={<CheckCircle className="h-3.5 w-3.5" />}>
                                Save changes
                            </Button>
                        ) : (
                            <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700 text-white" loading={upgradeMut.isPending} onClick={handlePay}
                                leftIcon={<Send className="h-3.5 w-3.5" />}>
                                Send upgrade request
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* ── Enterprise modal ── */}
            <Dialog open={enterpriseModal} onOpenChange={setEnterpriseModal}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Contact Sales — Enterprise</DialogTitle>
                        <DialogDescription>Our team will reach out within 1 business day.</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Your name</Label>
                                <Input value={contactForm.contactName} onChange={e => setContactForm(f => ({ ...f, contactName: e.target.value }))} placeholder="Full name" />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Work email</Label>
                                <Input type="email" value={contactForm.contactEmail} onChange={e => setContactForm(f => ({ ...f, contactEmail: e.target.value }))} placeholder="you@company.com" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Company size</Label>
                            <select
                                className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                                value={contactForm.companySize}
                                onChange={e => setContactForm(f => ({ ...f, companySize: e.target.value }))}
                            >
                                <option value="">Select company size</option>
                                <option value="50-100">50–100 employees</option>
                                <option value="100-250">100–250 employees</option>
                                <option value="250-500">250–500 employees</option>
                                <option value="500-1000">500–1,000 employees</option>
                                <option value="1000+">1,000+ employees</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Tell us about your needs</Label>
                            <textarea
                                rows={3}
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                                placeholder="Describe your requirements, integrations, timeline…"
                                value={contactForm.message}
                                onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))}
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-1">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setEnterpriseModal(false)}>Cancel</Button>
                        <Button size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" loading={contactMut.isPending} onClick={handleEnterpriseContact}
                            leftIcon={<Send className="h-3.5 w-3.5" />}>
                            Send inquiry
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
