import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { downloadExport } from '@/lib/export'

export interface PlanInfo {
    key: string
    name: string
    description: string
    quota: number | null
    priceMonthly: number | null
    priceLabel: string
    features: string[]
    isCurrent: boolean
}

export interface SubscriptionData {
    current: {
        plan: string
        planName: string
        quota: number | null
        employeeCount: number
        canAdd: boolean
        usagePercent: number
    }
    plans: PlanInfo[]
    pricing: {
        pricePerFiveEmployees: number
        currency: string
    }
    stripeEnabled: boolean
}

export function useSubscription() {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['subscription', tenantId],
        queryFn: () => api.get<{ data: SubscriptionData }>('/subscription').then(r => r.data),
        enabled: !!tenantId,
        staleTime: 60_000,
    })
}

/** Self-service checkout: creates Stripe session, returns { url } to redirect to */
export function useCheckoutSession() {
    return useMutation({
        mutationFn: ({ desiredQuota, action }: { desiredQuota: number; action: 'upgrade' | 'quota_update' }) =>
            api.post<{ data: { url: string } }>('/subscription/checkout', { desiredQuota, action }).then(r => r.data),
    })
}

/** Update employee quota for existing Professional tenants (no payment required) */
export function useUpdateQuota() {
    const queryClient = useQueryClient()
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useMutation({
        mutationFn: (newQuota: number) =>
            api.patch<{ data: { message: string; newQuota: number; monthlyCost: number; currency: string } }>(
                '/subscription/quota',
                { newQuota },
            ).then(r => r.data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subscription', tenantId] })
        },
    })
}

/** Fallback: email-based upgrade request (when Stripe is not configured) */
export function useUpgradeRequest() {
    return useMutation({
        mutationFn: (desiredQuota: number) =>
            api.post<{ data: { message: string; desiredQuota: number; monthlyCost: number; currency: string } }>(
                '/subscription/upgrade',
                { desiredQuota },
            ).then(r => r.data),
    })
}

export function useEnterpriseContact() {
    return useMutation({
        mutationFn: (body: { contactName: string; contactEmail: string; companySize: string; message: string }) =>
            api.post<{ data: { message: string } }>('/subscription/enterprise-contact', body).then(r => r.data),
    })
}

export interface SubscriptionEvent {
    id: string
    eventType: 'upgrade_request' | 'enterprise_contact' | 'plan_activated' | 'quota_updated' | 'checkout_created'
    planFrom: string | null
    planTo: string | null
    employeeQuota: number | null
    monthlyCost: number | null
    stripeSessionId: string | null
    contactEmail: string | null
    metadata: Record<string, unknown>
    createdAt: string
}

export function useSubscriptionEvents(limit = 50) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['subscription-events', tenantId, limit],
        queryFn: () => api.get<{ data: SubscriptionEvent[] }>(`/subscription/events?limit=${limit}`).then(r => r.data ?? []),
        enabled: !!tenantId,
        staleTime: 60_000,
    })
}

export async function downloadInvoicePdf(eventId: string, invoiceRef: string) {
    await downloadExport(`/subscription/events/${eventId}/invoice`, `invoice-${invoiceRef}.pdf`)
}

export function usePricingCalculator(employeeCount: number) {
    const tenantId = useAuthStore(s => s.tenant?.id)
    return useQuery({
        queryKey: ['subscription-pricing', tenantId, employeeCount],
        queryFn: () =>
            api.get<{ data: { employeeCount: number; monthlyCost: number; currency: string } }>(
                `/subscription/pricing?employees=${employeeCount}`,
            ).then(r => r.data),
        enabled: !!tenantId && employeeCount > 0,
    })
}
