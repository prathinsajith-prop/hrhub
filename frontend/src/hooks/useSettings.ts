import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export interface CompanySettings {
    id: string
    name: string
    tradeLicenseNo: string
    jurisdiction: string
    industryType: string
    subscriptionPlan: string
    logoUrl: string | null
}

export interface TenantUser {
    id: string
    name: string
    email: string
    role: string
    department: string | null
    isActive: boolean
    lastLoginAt: string | null
    createdAt: string
}

export function useCompanySettings() {
    return useQuery({
        queryKey: ['settings', 'company'],
        queryFn: () =>
            api.get<{ data: CompanySettings }>('/settings/company').then((r) => r.data),
    })
}

export function useUpdateCompanySettings() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: Partial<CompanySettings>) =>
            api.patch<{ data: CompanySettings }>('/settings/company', data).then((r) => r.data),
        onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'company'] }),
    })
}

export function useTenantUsers() {
    return useQuery({
        queryKey: ['settings', 'users'],
        queryFn: () =>
            api.get<{ data: TenantUser[] }>('/settings/users').then((r) => r.data),
    })
}
