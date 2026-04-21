import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useEmiratisation() {
    return useQuery({
        queryKey: ['compliance', 'emiratisation'],
        queryFn: () => api.get<{ data: unknown }>('/compliance/emiratisation').then(r => r.data),
    })
}

export function useExpiryAlerts() {
    return useQuery({
        queryKey: ['compliance', 'expiry-alerts'],
        queryFn: () => api.get<{ data: unknown }>('/compliance/expiry-alerts').then(r => r.data),
    })
}

export interface ComplianceCheck {
    label: string
    score: number
    status: 'pass' | 'warning' | 'fail'
    desc: string
}

export interface ComplianceReport {
    overall: number
    checks: ComplianceCheck[]
}

export function useComplianceReport() {
    return useQuery({
        queryKey: ['compliance', 'report'],
        queryFn: () => api.get<{ data: ComplianceReport }>('/compliance/report').then(r => r.data),
    })
}
