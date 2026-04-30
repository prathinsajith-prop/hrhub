import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { labelFor } from '@/lib/enums'
import { Building2, Plus, Check, ArrowRightLeft, RefreshCcw } from 'lucide-react'
import { useMyTenants, useSwitchTenant } from '@/hooks/useTenants'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { toast } from '@/components/ui/overlays'
import { NewOrganizationDialog } from '@/components/shared/NewOrganizationDialog'

export function OrganizationsPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [newOrgOpen, setNewOrgOpen] = useState(false)
    const { data: tenants, isLoading, isFetching, refetch } = useMyTenants()
    const currentTenantId = useAuthStore(s => s.tenant?.id)
    const switchMut = useSwitchTenant()

    const handleSwitch = async (tenantId: string, name: string) => {
        try {
            await switchMut.mutateAsync(tenantId)
            toast.success(t('organizations.switched', { name }))
            // Re-fetch is handled by the hook; force a soft navigate to dashboard.
            navigate('/dashboard')
        } catch (err: unknown) {
            toast.error((err instanceof Error ? err.message : null) ?? t('organizations.switchFailed'))
        }
    }

    return (
        <>
        <PageWrapper>
            <PageHeader
                title={t('organizations.title')}
                description={t('organizations.description')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
                            Refresh
                        </Button>
                        <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNewOrgOpen(true)}>
                            {t('organizations.new')}
                        </Button>
                    </div>
                }
            />

            <Card>
                <CardHeader>
                    <CardTitle className="text-base">{t('organizations.yourOrganizations')}</CardTitle>
                    <CardDescription>
                        {tenants?.length ?? 0} {(tenants?.length ?? 0) === 1 ? t('organizations.membership') : t('organizations.memberships')}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="grid sm:grid-cols-2 gap-3">
                            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
                        </div>
                    ) : (tenants?.length ?? 0) === 0 ? (
                        <div className="text-sm text-muted-foreground py-8 text-center">
                            {t('organizations.none')}
                        </div>
                    ) : (
                        <div className="grid sm:grid-cols-2 gap-3">
                            {tenants!.map((m) => {
                                const isActive = currentTenantId === m.tenantId
                                return (
                                    <div
                                        key={m.membershipId}
                                        className="flex items-start justify-between gap-3 rounded-lg border bg-card p-4 hover:border-primary/40 transition-colors"
                                    >
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div className="h-10 w-10 shrink-0 rounded-md bg-muted flex items-center justify-center overflow-hidden">
                                                {m.logoUrl
                                                    ? <img src={m.logoUrl} alt={m.tenantName} className="h-full w-full object-cover" />
                                                    : <Building2 className="h-5 w-5 text-muted-foreground" />}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-medium truncate">{m.tenantName}</span>
                                                    {isActive && <Badge variant="secondary" className="text-[10px]">{t('organizations.current')}</Badge>}
                                                </div>
                                                <div className="text-xs text-muted-foreground capitalize mt-0.5">
                                                    {t(`team.roles.${m.role}`, { defaultValue: labelFor(m.role) })}
                                                    {m.subscriptionPlan ? ` · ${m.subscriptionPlan}` : ''}
                                                    {m.jurisdiction ? ` · ${m.jurisdiction}` : ''}
                                                </div>
                                            </div>
                                        </div>
                                        {isActive ? (
                                            <Button variant="ghost" size="sm" disabled leftIcon={<Check className="h-3.5 w-3.5" />}>
                                                {t('organizations.active')}
                                            </Button>
                                        ) : (
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                leftIcon={<ArrowRightLeft className="h-3.5 w-3.5" />}
                                                onClick={() => handleSwitch(m.tenantId, m.tenantName)}
                                                disabled={switchMut.isPending}
                                            >
                                                {t('organizations.switch')}
                                            </Button>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        </PageWrapper>

        <NewOrganizationDialog open={newOrgOpen} onOpenChange={setNewOrgOpen} onSuccess={() => refetch()} />
        </>
    )
}
