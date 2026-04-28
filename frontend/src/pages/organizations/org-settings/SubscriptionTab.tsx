import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Zap, CreditCard, Building, Users2, AlertCircle, CheckCircle, Send, RefreshCw, ExternalLink, XCircle, Plus, Minus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'
import { ApiError } from '@/lib/api'
import { useSubscription, useUpgradeRequest, useEnterpriseContact, useCheckoutSession, useUpdateQuota } from '@/hooks/useSubscription'
import type { PlanInfo } from '@/hooks/useSubscription'

// ─── Subscription Tab ─────────────────────────────────────────────────────────

const PLAN_ICONS: Record<string, typeof Zap> = {
    starter: Zap,
    growth: CreditCard,
    enterprise: Building,
}

const PLAN_COLORS: Record<string, { badge: string; ring: string; button: string; bg: string }> = {
    starter: { badge: 'bg-slate-100 text-slate-700', ring: 'ring-slate-200', button: '', bg: '#f8fafc' },
    growth: { badge: 'bg-blue-100 text-blue-700', ring: 'ring-blue-300', button: 'bg-blue-600 hover:bg-blue-700 text-white', bg: '#eff6ff' },
    enterprise: { badge: 'bg-purple-100 text-purple-700', ring: 'ring-purple-300', button: 'bg-purple-600 hover:bg-purple-700 text-white', bg: '#f5f3ff' },
}

export function SubscriptionTab() {
    const { data: sub, isLoading, refetch } = useSubscription()
    const checkoutMut = useCheckoutSession()
    const updateQuotaMut = useUpdateQuota()
    const upgradeMut = useUpgradeRequest()
    const contactMut = useEnterpriseContact()
    const user = useAuthStore(s => s.user)
    const [searchParams, setSearchParams] = useSearchParams()

    // Stripe redirects back with ?checkout=upgraded (new plan) or ?checkout=quota (capacity change)
    const checkoutResult = searchParams.get('checkout')
    useEffect(() => {
        if (checkoutResult === 'upgraded') {
            toast.success('Professional plan activated', 'Payment confirmed. Your plan is now active and employee capacity has been updated.')
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

    const [upgradeModal, setUpgradeModal] = useState(false)
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

    // Single handler for both Free→Pro and Pro quota change
    // When Stripe is enabled: always redirect to checkout
    // When Stripe is not enabled: email request (Free→Pro) or direct PATCH (Pro quota update)
    const handlePay = async () => {
        const action: 'upgrade' | 'quota_update' = isOnProfessional ? 'quota_update' : 'upgrade'
        try {
            if (stripeEnabled) {
                const result = await checkoutMut.mutateAsync({ desiredQuota, action })
                window.location.href = result.url
            } else if (isOnProfessional) {
                // No Stripe — update quota directly for existing Professional tenants
                const result = await updateQuotaMut.mutateAsync(desiredQuota)
                toast.success('Capacity updated', result.message)
                setUpgradeModal(false)
            } else {
                // No Stripe — send email upgrade request for Free tenants
                const result = await upgradeMut.mutateAsync(desiredQuota)
                toast.success('Upgrade request sent', result.message)
                setUpgradeModal(false)
            }
        } catch (err) {
            const msg = err instanceof ApiError ? err.message : 'Please try again.'
            toast.error(
                isOnProfessional ? 'Failed to update capacity' : 'Upgrade failed',
                msg,
            )
        }
    }

    const handleEnterpriseContact = async () => {
        if (!contactForm.contactName || !contactForm.contactEmail || !contactForm.companySize || !contactForm.message) {
            toast.error('All fields required', 'Please fill in your name, email, company size, and message.')
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
                {[1, 2, 3].map(n => <Skeleton key={n} className="h-32 w-full" />)}
            </div>
        )
    }

    const { current, plans } = sub!

    return (
        <div className="space-y-6">
            {/* Current plan banner */}
            <div
                className="rounded-xl border-2 p-5 flex flex-col sm:flex-row sm:items-center gap-4"
                style={{ borderColor: current.plan === 'enterprise' ? '#7c3aed' : current.plan === 'growth' ? '#2563eb' : '#cbd5e1', backgroundColor: PLAN_COLORS[current.plan]?.bg }}
            >
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', PLAN_COLORS[current.plan]?.badge)}>
                            Current Plan
                        </span>
                        <span className="font-semibold text-base">{current.planName}</span>
                    </div>
                    <div className="flex items-center gap-4 flex-wrap">
                        <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                            <Users2 className="h-3.5 w-3.5" />
                            {current.employeeCount}
                            {current.quota !== null ? ` / ${current.quota}` : ' (unlimited)'}
                            {' '}employees
                        </span>
                        {current.quota !== null && (
                            <div className="flex items-center gap-2">
                                <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full rounded-full transition-all"
                                        style={{
                                            width: `${Math.min(100, current.usagePercent)}%`,
                                            backgroundColor: current.usagePercent >= 90 ? '#dc2626' : current.usagePercent >= 70 ? '#d97706' : '#10b981',
                                        }}
                                    />
                                </div>
                                <span className="text-xs text-muted-foreground">{current.usagePercent}% used</span>
                            </div>
                        )}
                    </div>
                </div>
                {!current.canAdd && (
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shrink-0">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        <span>Employee limit reached — upgrade to add more</span>
                    </div>
                )}
            </div>

            {/* Plan cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(plans as PlanInfo[]).map(plan => {
                    const PlanIcon = PLAN_ICONS[plan.key] ?? Zap
                    const colors = PLAN_COLORS[plan.key]
                    return (
                        <div
                            key={plan.key}
                            className={cn(
                                'rounded-xl border bg-card p-5 flex flex-col gap-4 transition-all',
                                plan.isCurrent ? `ring-2 shadow-sm ${colors?.ring}` : 'hover:shadow-sm',
                            )}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <PlanIcon className="h-4 w-4" style={{ color: plan.key === 'enterprise' ? '#7c3aed' : plan.key === 'growth' ? '#2563eb' : '#6b7280' }} />
                                        <h3 className="font-semibold text-sm">{plan.name}</h3>
                                    </div>
                                    <p className="text-xs text-muted-foreground">{plan.description}</p>
                                </div>
                                {plan.isCurrent && (
                                    <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0', colors?.badge)}>Active</span>
                                )}
                            </div>

                            <div className="text-sm font-semibold text-foreground">
                                {plan.priceLabel}
                            </div>

                            <ul className="space-y-1.5 flex-1">
                                {plan.features.map(f => (
                                    <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                        {f}
                                    </li>
                                ))}
                            </ul>

                            {!plan.isCurrent && (
                                <div className="pt-2 border-t">
                                    {plan.key === 'growth' ? (
                                        <Button
                                            size="sm"
                                            className={cn('w-full text-xs whitespace-normal h-auto py-2 leading-tight', colors?.button)}
                                            onClick={() => { setDesiredQuota(10); setUpgradeModal(true) }}
                                        >
                                            <Zap className="h-3.5 w-3.5 mr-1.5" />
                                            Upgrade to Professional
                                        </Button>
                                    ) : plan.key === 'enterprise' ? (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="w-full text-xs whitespace-normal h-auto py-2 leading-tight border-purple-300 text-purple-700 hover:bg-purple-50"
                                            onClick={() => setEnterpriseModal(true)}
                                        >
                                            <Send className="h-3.5 w-3.5 mr-1.5" />
                                            Contact Sales
                                        </Button>
                                    ) : null}
                                </div>
                            )}

                            {plan.isCurrent && plan.key === 'growth' && (
                                <div className="pt-2 border-t">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full text-xs whitespace-normal h-auto py-2 leading-tight"
                                        onClick={() => { setDesiredQuota(current.quota ?? 10); setUpgradeModal(true) }}
                                    >
                                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                                        Update capacity
                                    </Button>
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>

            {/* Pricing note */}
            <p className="text-xs text-muted-foreground text-center">
                Professional plan is billed at AED {pricing?.pricePerFiveEmployees ?? 10} per 5 employees per month.
                {stripeEnabled ? ' Pay securely by card — your plan activates instantly.' : ' Our team will contact you to confirm payment.'}
                {' '}Enterprise pricing is fully custom.
            </p>

            {/* ── Upgrade / Update capacity modal ─────────────────────── */}
            {upgradeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-background rounded-2xl border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold text-base">
                                {isOnProfessional ? 'Update employee capacity' : 'Upgrade to Professional'}
                            </h2>
                            <button type="button" onClick={() => setUpgradeModal(false)} className="text-muted-foreground hover:text-foreground">
                                <XCircle className="h-5 w-5" />
                            </button>
                        </div>

                        <p className="text-sm text-muted-foreground">
                            {isOnProfessional
                                ? stripeEnabled
                                    ? 'Choose your new employee capacity. A payment will be processed for the updated monthly amount.'
                                    : 'Adjust your employee capacity. Changes take effect immediately.'
                                : stripeEnabled
                                    ? `Choose how many employees you need. You'll be billed AED ${pricing?.pricePerFiveEmployees ?? 10} per 5 employees per month. Pay by card and your plan activates instantly.`
                                    : `Choose how many employees you need. You'll be billed AED ${pricing?.pricePerFiveEmployees ?? 10} per 5 employees per month. Our team will confirm payment before activating.`
                            }
                        </p>

                        <div className="space-y-3">
                            <Label htmlFor="quota">Number of employees</Label>
                            <div className="flex items-center gap-3">
                                <Button
                                    type="button" variant="outline" size="icon-sm"
                                    onClick={() => setDesiredQuota(q => Math.max(5, q - 5))}
                                >
                                    <Minus className="h-4 w-4" />
                                </Button>
                                <Input
                                    id="quota"
                                    type="number"
                                    min={5}
                                    step={5}
                                    value={desiredQuota}
                                    onChange={e => setDesiredQuota(Math.max(5, Number(e.target.value)))}
                                    className="text-center font-semibold w-24"
                                />
                                <Button
                                    type="button" variant="outline" size="icon-sm"
                                    onClick={() => setDesiredQuota(q => q + 5)}
                                >
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
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => setUpgradeModal(false)}>
                                Cancel
                            </Button>

                            {stripeEnabled ? (
                                <Button
                                    size="sm"
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                                    loading={checkoutMut.isPending}
                                    onClick={handlePay}
                                >
                                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                                    {isOnProfessional ? 'Pay & update capacity' : 'Pay & activate'}
                                </Button>
                            ) : isOnProfessional ? (
                                <Button
                                    size="sm"
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                                    loading={updateQuotaMut.isPending}
                                    onClick={handlePay}
                                >
                                    <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                                    Save changes
                                </Button>
                            ) : (
                                <Button
                                    size="sm"
                                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                                    loading={upgradeMut.isPending}
                                    onClick={handlePay}
                                >
                                    <Send className="h-3.5 w-3.5 mr-1.5" />
                                    Send upgrade request
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Enterprise contact modal ──────────────────────────── */}
            {enterpriseModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-background rounded-2xl border shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-4 sm:p-6 space-y-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="font-semibold text-base">Contact Sales — Enterprise</h2>
                                <p className="text-xs text-muted-foreground mt-0.5">Our team will reach out within 1 business day.</p>
                            </div>
                            <button type="button" onClick={() => setEnterpriseModal(false)} className="text-muted-foreground hover:text-foreground">
                                <XCircle className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Your name</Label>
                                    <Input
                                        value={contactForm.contactName}
                                        onChange={e => setContactForm(f => ({ ...f, contactName: e.target.value }))}
                                        placeholder="Full name"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Work email</Label>
                                    <Input
                                        type="email"
                                        value={contactForm.contactEmail}
                                        onChange={e => setContactForm(f => ({ ...f, contactEmail: e.target.value }))}
                                        placeholder="you@company.com"
                                    />
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
                                    className="w-full min-h-[90px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring resize-none"
                                    placeholder="Describe your requirements, integrations, timeline..."
                                    value={contactForm.message}
                                    onChange={e => setContactForm(f => ({ ...f, message: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-1">
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => setEnterpriseModal(false)}>
                                Cancel
                            </Button>
                            <Button
                                size="sm"
                                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                                loading={contactMut.isPending}
                                onClick={handleEnterpriseContact}
                            >
                                <Send className="h-3.5 w-3.5 mr-1.5" />
                                Send inquiry
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
