import { CreditCardIcon, CheckCircle2Icon, ZapIcon, ShieldCheckIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useAuthStore } from '@/store/authStore'

const PLANS = [
    {
        id: 'starter',
        name: 'Starter',
        price: '$29',
        period: '/month',
        description: 'Perfect for small teams getting started.',
        features: ['Up to 25 employees', 'Core HR modules', 'Email support', '5 GB storage'],
        badge: null,
    },
    {
        id: 'professional',
        name: 'Professional',
        price: '$79',
        period: '/month',
        description: 'For growing businesses with advanced needs.',
        features: ['Up to 200 employees', 'All HR modules', 'Priority support', '25 GB storage', 'API access', 'Custom reports'],
        badge: 'Most popular',
    },
    {
        id: 'enterprise',
        name: 'Enterprise',
        price: 'Custom',
        period: '',
        description: 'Tailored solutions for large organisations.',
        features: ['Unlimited employees', 'All modules + custom', 'Dedicated support', 'Unlimited storage', 'SSO / SAML', 'SLA guarantee'],
        badge: null,
    },
]

export function SubscriptionPage() {
    const tenant = useAuthStore((s) => s.tenant)

    return (
        <PageWrapper>
            <PageHeader
                title="Billing & Plans"
                description="Manage your subscription and billing details."
                actions={
                    <Button size="sm" leftIcon={<CreditCardIcon className="h-3.5 w-3.5" />} variant="outline">
                        Manage billing
                    </Button>
                }
            />

            {/* Current plan banner */}
            <Card className="mb-6 border-primary/30 bg-primary/5">
                <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <ShieldCheckIcon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold">{tenant?.name ?? 'Your organisation'}</p>
                            <p className="text-xs text-muted-foreground">Currently on <span className="font-medium text-primary">Professional plan</span> — billed monthly</p>
                        </div>
                        <Badge variant="default" className="shrink-0">Active</Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Plans grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {PLANS.map((plan) => (
                    <Card key={plan.id} className={plan.id === 'professional' ? 'border-primary ring-1 ring-primary/30' : ''}>
                        <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base">{plan.name}</CardTitle>
                                {plan.badge && <Badge className="text-[10px]">{plan.badge}</Badge>}
                            </div>
                            <div className="flex items-end gap-1 mt-1">
                                <span className="text-3xl font-bold">{plan.price}</span>
                                {plan.period && <span className="text-sm text-muted-foreground mb-1">{plan.period}</span>}
                            </div>
                            <CardDescription>{plan.description}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <ul className="space-y-2">
                                {plan.features.map((f) => (
                                    <li key={f} className="flex items-center gap-2 text-sm">
                                        <CheckCircle2Icon className="h-4 w-4 text-primary shrink-0" />
                                        {f}
                                    </li>
                                ))}
                            </ul>
                            <Button
                                className="w-full"
                                variant={plan.id === 'professional' ? 'default' : 'outline'}
                                size="sm"
                                leftIcon={plan.id === 'enterprise' ? undefined : <ZapIcon className="h-3.5 w-3.5" />}
                            >
                                {plan.id === 'professional' ? 'Current plan' : plan.id === 'enterprise' ? 'Contact sales' : 'Downgrade'}
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </PageWrapper>
    )
}
