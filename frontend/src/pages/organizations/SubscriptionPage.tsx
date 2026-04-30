import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
    CreditCard, CheckCircle2, Zap, Building2, Users, ArrowUpRight,
    Download, FileText, Calendar, Plus, Minus, Send,
    ShieldCheck, AlertCircle,
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

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAN_META: Record<string, { icon: typeof Zap; color: string; ring: string; bg: string; badge: string }> = {
    starter: { icon: Zap, color: '#6b7280', ring: 'ring-slate-200', bg: 'bg-slate-50', badge: 'bg-slate-100 text-slate-700' },
    growth: { icon: CreditCard, color: '#2563eb', ring: 'ring-blue-300', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700' },
    enterprise: { icon: Building2, color: '#7c3aed', ring: 'ring-purple-300', bg: 'bg-purple-50', badge: 'bg-purple-100 text-purple-700' },
}

const EVENT_LABELS: Record<string, string> = {
    plan_activated: 'Professional Plan Activation',
    quota_updated: 'Employee Capacity Update',
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

// ─── Upgrade Dialog ───────────────────────────────────────────────────────────

function UpgradeDialog({ open, onClose, currentQuota, stripeEnabled, pricePerFive, currency }: {
    open: boolean
    onClose: () => void
    currentQuota: number | null
    stripeEnabled: boolean
    pricePerFive: number
    currency: string
}) {
    const [quota, setQuota] = useState(Math.max(10, (currentQuota ?? 0) + 5))
    const checkoutMut = useCheckoutSession()
    const upgradeMut = useUpgradeRequest()

    const monthlyCost = Math.ceil(quota / 5) * pricePerFive
    const step = 5

    function adjust(delta: number) {
        setQuota(q => Math.max(5, Math.min(10000, q + delta)))
    }

    function handleSubmit() {
        if (stripeEnabled) {
            checkoutMut.mutate({ desiredQuota: quota, action: 'upgrade' }, {
                onSuccess: (data) => {
                    if (data?.url) window.location.href = data.url
                },
                onError: (err) => toast.error('Checkout failed', err instanceof ApiError ? err.message : 'Please try again.'),
            })
        } else {
            upgradeMut.mutate(quota, {
                onSuccess: () => {
                    toast.success('Upgrade request sent', 'Our team will contact you within 1 business day.')
                    onClose()
                },
                onError: (err) => toast.error('Request failed', err instanceof ApiError ? err.message : 'Please try again.'),
            })
        }
    }

    const isPending = checkoutMut.isPending || upgradeMut.isPending

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[420px]">
                <DialogHeader>
                    <DialogTitle>Book an Upgrade</DialogTitle>
                    <DialogDescription>
                        Choose your desired employee capacity. You'll be charged {currency} {pricePerFive} per 5 employees per month.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    {/* Capacity selector */}
                    <div className="space-y-2">
                        <Label>Employee capacity</Label>
                        <div className="flex items-center gap-3">
                            <Button
                                type="button" variant="outline" size="icon"
                                onClick={() => adjust(-step)}
                                disabled={quota <= 5}
                                className="h-9 w-9 shrink-0"
                            >
                                <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <div className="flex-1 text-center">
                                <p className="text-2xl font-bold">{quota}</p>
                                <p className="text-xs text-muted-foreground">employees</p>
                            </div>
                            <Button
                                type="button" variant="outline" size="icon"
                                onClick={() => adjust(step)}
                                disabled={quota >= 10000}
                                className="h-9 w-9 shrink-0"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                    </div>

                    {/* Cost summary */}
                    <div className="rounded-lg border bg-muted/40 p-4 space-y-2">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Monthly cost</span>
                            <span className="font-semibold">{currency} {monthlyCost.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Per employee</span>
                            <span className="font-medium">{currency} {(monthlyCost / quota).toFixed(2)}</span>
                        </div>
                        <Separator className="my-1" />
                        <div className="flex items-center justify-between text-sm font-semibold">
                            <span>Annual estimate</span>
                            <span>{currency} {(monthlyCost * 12).toLocaleString()}</span>
                        </div>
                    </div>

                    {!stripeEnabled && (
                        <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                            <span>Online payment is not configured. Your request will be sent to our team who will contact you to complete the upgrade.</span>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={isPending} leftIcon={stripeEnabled ? <CreditCard className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}>
                        {isPending ? 'Processing…' : stripeEnabled ? 'Proceed to payment' : 'Send request'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Enterprise Dialog ────────────────────────────────────────────────────────

function EnterpriseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
            toast.error('All fields are required')
            return
        }
        contactMut.mutate(form, {
            onSuccess: () => {
                toast.success('Enquiry sent', 'Our enterprise team will reach out within 1 business day.')
                onClose()
            },
            onError: (err) => toast.error('Failed to send', err instanceof ApiError ? err.message : 'Please try again.'),
        })
    }

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[440px]">
                <DialogHeader>
                    <DialogTitle>Contact Enterprise Sales</DialogTitle>
                    <DialogDescription>Tell us about your requirements and we'll tailor a solution for you.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-1">
                    {(['contactName', 'contactEmail', 'companySize'] as const).map(key => (
                        <div key={key} className="space-y-1.5">
                            <Label className="capitalize">{key === 'contactName' ? 'Your name' : key === 'contactEmail' ? 'Email' : 'Company size'}</Label>
                            <Input
                                value={form[key]}
                                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                                placeholder={key === 'companySize' ? 'e.g. 200–500 employees' : ''}
                            />
                        </div>
                    ))}
                    <div className="space-y-1.5">
                        <Label>Message</Label>
                        <textarea
                            rows={3}
                            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                            placeholder="Describe your needs…"
                            value={form.message}
                            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={contactMut.isPending} leftIcon={<Send className="h-3.5 w-3.5" />}>
                        {contactMut.isPending ? 'Sending…' : 'Send enquiry'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
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

    return (
        <Card className={cn('relative flex flex-col transition-shadow hover:shadow-md', isCurrent && `ring-2 ${meta.ring}`)}>
            {isCurrent && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className={cn('text-[10px] font-semibold px-3 py-0.5 rounded-full', meta.badge)}>Current plan</span>
                </div>
            )}
            <CardHeader className="pb-3 pt-6">
                <div className="flex items-start justify-between gap-2">
                    <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center', meta.bg)}>
                        <Icon className="h-4 w-4" style={{ color: meta.color }} />
                    </div>
                    {plan.key === 'growth' && !isCurrent && (
                        <Badge className="text-[10px] bg-blue-100 text-blue-700">Most popular</Badge>
                    )}
                </div>
                <CardTitle className="text-base mt-3">{plan.name}</CardTitle>
                <div className="mt-1">
                    <span className="text-2xl font-bold">{plan.priceLabel}</span>
                </div>
                <CardDescription className="text-xs">{plan.description}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col gap-4">
                <ul className="space-y-2 flex-1">
                    {plan.features.map(f => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                            <span>{f}</span>
                        </li>
                    ))}
                </ul>
                {isCurrent ? (
                    <Button variant="outline" size="sm" className="w-full" disabled>Active plan</Button>
                ) : plan.key === 'enterprise' ? (
                    <Button variant="outline" size="sm" className="w-full" onClick={onEnterprise}
                        leftIcon={<ArrowUpRight className="h-3.5 w-3.5" />}>
                        Contact sales
                    </Button>
                ) : (
                    <Button size="sm" className="w-full" onClick={onUpgrade}
                        leftIcon={<Zap className="h-3.5 w-3.5" />}>
                        Upgrade now
                    </Button>
                )}
            </CardContent>
        </Card>
    )
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
            toast.error('Download failed', 'Could not generate invoice PDF. Please try again.')
        } finally {
            setDownloading(false)
        }
    }

    return (
        <tr className="border-b last:border-0 hover:bg-muted/30 transition-colors">
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                        <p className="text-sm font-medium font-mono">{invoiceRef}</p>
                        <p className="text-xs text-muted-foreground">{EVENT_LABELS[event.eventType] ?? event.eventType}</p>
                    </div>
                </div>
            </td>
            <td className="px-4 py-3">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', EVENT_BADGE[event.eventType] ?? 'bg-muted text-muted-foreground')}>
                    {EVENT_LABELS[event.eventType] ?? event.eventType}
                </span>
            </td>
            <td className="px-4 py-3">
                {event.employeeQuota ? (
                    <div className="flex items-center gap-1 text-sm">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {event.employeeQuota} employees
                    </div>
                ) : <span className="text-sm text-muted-foreground">—</span>}
            </td>
            <td className="px-4 py-3 text-right">
                {event.monthlyCost ? (
                    <p className="text-sm font-semibold">AED {event.monthlyCost.toLocaleString()}</p>
                ) : <span className="text-sm text-muted-foreground">—</span>}
            </td>
            <td className="px-4 py-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                    {new Date(event.createdAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
            </td>
            <td className="px-4 py-3 text-right">
                {isDownloadable ? (
                    <Button
                        variant="ghost" size="sm"
                        className="h-7 gap-1.5 text-xs"
                        onClick={handleDownload}
                        disabled={downloading}
                    >
                        <Download className="h-3.5 w-3.5" />
                        {downloading ? 'Downloading…' : 'PDF'}
                    </Button>
                ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                )}
            </td>
        </tr>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function SubscriptionPage() {
    const tenant = useAuthStore(s => s.tenant)
    const [searchParams, setSearchParams] = useSearchParams()
    const [upgradeOpen, setUpgradeOpen] = useState(false)
    const [enterpriseOpen, setEnterpriseOpen] = useState(false)

    const { data: sub, isLoading: subLoading } = useSubscription()
    const { data: events = [], isLoading: eventsLoading } = useSubscriptionEvents()

    // Handle Stripe redirect back — must be in useEffect to avoid render-time state mutation
    const checkoutResult = searchParams.get('checkout')
    useEffect(() => {
        if (!checkoutResult) return
        const msg = checkoutResult === 'upgraded'
            ? 'Professional plan activated — payment confirmed.'
            : checkoutResult === 'quota'
                ? 'Employee capacity updated — payment confirmed.'
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

    return (
        <PageWrapper>
            <PageHeader
                title="Billing & Subscription"
                description="Manage your plan, capacity and view billing history."
            />

            {/* ── Top section: current plan (left) + billing history (right) ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5 items-start">

                {/* ── Left: Current plan card ── */}
                {subLoading ? (
                    <Skeleton className="h-72 rounded-xl" />
                ) : current ? (
                    <Card className={cn('ring-1', planMeta.ring)}>
                        <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                                <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', planMeta.bg)}>
                                    <ShieldCheck className="h-5 w-5" style={{ color: planMeta.color }} />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Current plan</p>
                                    <p className="text-lg font-bold leading-tight">{current.planName}</p>
                                </div>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{tenant?.name}</p>
                        </CardHeader>

                        <CardContent className="space-y-4 pt-0">
                            <Separator />

                            {/* Usage bar */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-1.5">
                                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                        <span className="text-xs text-muted-foreground font-medium">Employees</span>
                                    </div>
                                    <span className="text-xs font-semibold">
                                        {current.employeeCount}
                                        {current.quota ? <span className="text-muted-foreground font-normal"> / {current.quota}</span> : <span className="text-muted-foreground font-normal"> / Unlimited</span>}
                                    </span>
                                </div>
                                {current.quota ? (
                                    <>
                                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div
                                                className={cn('h-full rounded-full transition-all', current.usagePercent >= 90 ? 'bg-destructive' : current.usagePercent >= 70 ? 'bg-amber-500' : 'bg-primary')}
                                                style={{ width: `${Math.min(100, current.usagePercent)}%` }}
                                            />
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">{current.usagePercent}% of capacity used</p>
                                    </>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">No employee limit on this plan</p>
                                )}
                            </div>

                            <Separator />

                            {/* CTA buttons */}
                            <div className="space-y-2">
                                <Button
                                    size="sm" className="w-full"
                                    onClick={() => setUpgradeOpen(true)}
                                    leftIcon={<Zap className="h-3.5 w-3.5" />}
                                >
                                    Upgrade plan
                                </Button>
                                <Button
                                    size="sm" variant="outline" className="w-full"
                                    onClick={() => setEnterpriseOpen(true)}
                                    leftIcon={<Building2 className="h-3.5 w-3.5" />}
                                >
                                    Contact enterprise sales
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ) : null}

                {/* ── Right: Billing history ── */}
                <Card className="min-h-[288px]">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-sm font-semibold">Billing History</CardTitle>
                            <CardDescription className="text-xs mt-0.5">Invoices and subscription events</CardDescription>
                        </div>
                        <FileText className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    {eventsLoading ? (
                        <CardContent className="pt-0 space-y-3">
                            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
                        </CardContent>
                    ) : events.length === 0 ? (
                        <CardContent className="py-10 text-center">
                            <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                            <p className="text-sm text-muted-foreground">No billing history yet</p>
                            <p className="text-xs text-muted-foreground/60 mt-1">Invoices will appear here after your first payment.</p>
                        </CardContent>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b bg-muted/40">
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Invoice</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Type</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Capacity</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Amount</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Date</th>
                                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Download</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {events.map(event => (
                                        <InvoiceRow key={event.id} event={event} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            </div>

            {/* ── Plans grid ── */}
            <div>
                <h2 className="text-sm font-semibold mb-3">Available plans</h2>
                {subLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-80 rounded-xl" />)}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(sub?.plans ?? []).map(plan => (
                            <PlanCard
                                key={plan.key}
                                plan={plan}
                                isCurrent={plan.isCurrent}
                                onUpgrade={() => setUpgradeOpen(true)}
                                onEnterprise={() => setEnterpriseOpen(true)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Dialogs ── */}
            <UpgradeDialog
                open={upgradeOpen}
                onClose={() => setUpgradeOpen(false)}
                currentQuota={sub?.current.quota ?? null}
                stripeEnabled={sub?.stripeEnabled ?? false}
                pricePerFive={sub?.pricing.pricePerFiveEmployees ?? 0}
                currency={sub?.pricing.currency ?? 'AED'}
            />
            <EnterpriseDialog open={enterpriseOpen} onClose={() => setEnterpriseOpen(false)} />
        </PageWrapper>
    )
}
