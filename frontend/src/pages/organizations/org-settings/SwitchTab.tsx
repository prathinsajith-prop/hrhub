import { ArrowRightLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'
import { labelFor } from '@/lib/enums'
import { useMyTenants, useSwitchTenant, type TenantMembershipSummary } from '@/hooks/useTenants'
import { Section } from './_shared'

// ─── Switch Organizations Tab ─────────────────────────────────────────────────
export function SwitchTab() {
    const { data: tenants, isLoading } = useMyTenants()
    const switchMut = useSwitchTenant()
    const { tenant: currentTenant } = useAuthStore()

    const handleSwitch = async (tenantId: string, name: string) => {
        if (tenantId === currentTenant?.id) return
        try {
            await switchMut.mutateAsync(tenantId)
            toast.success('Switched', `Now working in ${name}`)
            window.location.assign('/dashboard')
        } catch {
            toast.error('Switch failed', 'Could not switch organization.')
        }
    }

    return (
        <div className="space-y-5">
            <Section icon={ArrowRightLeft} title="Switch Organization" description="Select a workspace to switch into">
                {isLoading ? (
                    <div className="grid sm:grid-cols-2 gap-3">
                        {[1, 2, 3].map(n => <Skeleton key={n} className="h-20 w-full" />)}
                    </div>
                ) : (tenants ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">You don't belong to any organization yet.</p>
                ) : (
                    <div className="grid sm:grid-cols-2 gap-3">
                        {(tenants ?? []).map((m: TenantMembershipSummary) => {
                            const isActive = currentTenant?.id === m.tenantId
                            return (
                                <button
                                    key={m.membershipId}
                                    type="button"
                                    disabled={isActive || switchMut.isPending}
                                    className={cn(
                                        'flex items-center justify-between gap-3 rounded-lg border p-4 transition-colors text-left w-full',
                                        isActive ? 'border-primary/40 bg-primary/5' : 'hover:border-primary/30 hover:bg-muted/30 cursor-pointer',
                                    )}
                                    onClick={() => handleSwitch(m.tenantId, m.tenantName)}
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0 text-sm font-semibold text-muted-foreground">
                                            {m.tenantName?.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">{m.tenantName}</p>
                                            <p className="text-xs text-muted-foreground capitalize">{labelFor(m.role)}</p>
                                        </div>
                                    </div>
                                    {isActive ? (
                                        <Badge variant="secondary" className="text-[10px] shrink-0">Current</Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[10px] shrink-0">Switch</Badge>
                                    )}
                                </button>
                            )
                        })}
                    </div>
                )}
            </Section>
        </div>
    )
}
