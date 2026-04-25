import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface KPIs {
    totalEmployees: number
    openJobs: number
    activeVisas: number
    pendingLeave: number
    expiringVisas: number
}

export interface PayrollTrendPoint {
    month: string
    amount: number
}

export interface NationalityPoint {
    name: string
    value: number
    color: string
}

export interface DeptHeadcountPoint {
    dept: string
    count: number
}

// Backend caches KPIs for 2 minutes; match frontend staleTime so we don't
// hammer the server on every window refocus or component mount.
const DASHBOARD_STALE = 2 * 60 * 1000 // 2 min

// Chart/analytic data changes even less frequently
const ANALYTICS_STALE = 5 * 60 * 1000 // 5 min

export function useDashboardKPIs() {
    return useQuery({
        queryKey: ['dashboard', 'kpis'],
        queryFn: () => api.get<{ data: KPIs }>('/dashboard/kpis').then(r => r.data),
        staleTime: DASHBOARD_STALE,
    })
}

export function useNotifications(limit = 10) {
    return useQuery({
        queryKey: ['dashboard', 'notifications', limit],
        queryFn: () => api.get<{ data: unknown[] }>(`/dashboard/notifications?limit=${limit}`).then(r => r.data),
    })
}

export function usePayrollTrend() {
    return useQuery({
        queryKey: ['dashboard', 'payroll-trend'],
        queryFn: () => api.get<{ data: PayrollTrendPoint[] }>('/dashboard/payroll-trend').then(r => r.data),
        staleTime: ANALYTICS_STALE,
    })
}

export function useNationalityBreakdown() {
    return useQuery({
        queryKey: ['dashboard', 'nationality-breakdown'],
        queryFn: () => api.get<{ data: NationalityPoint[] }>('/dashboard/nationality-breakdown').then(r => r.data),
        staleTime: ANALYTICS_STALE,
    })
}

export function useDeptHeadcount() {
    return useQuery({
        queryKey: ['dashboard', 'dept-headcount'],
        queryFn: () => api.get<{ data: DeptHeadcountPoint[] }>('/dashboard/dept-headcount').then(r => r.data),
        staleTime: ANALYTICS_STALE,
    })
}

export interface EmiratisationStatus {
    currentRatio: number
    targetRatio: number
    gap: number
    emiratis: number
    totalActive: number
    required: number
    progress: number
}

export function useEmiratisation() {
    return useQuery({
        queryKey: ['dashboard', 'emiratisation'],
        queryFn: () => api.get<{ data: EmiratisationStatus }>('/dashboard/emiratisation').then(r => r.data),
        staleTime: ANALYTICS_STALE,
    })
}

export interface OnboardingSummary {
    active: number
    overdue: number
}

export function useOnboardingSummary() {
    return useQuery({
        queryKey: ['dashboard', 'onboarding-summary'],
        queryFn: () => api.get<{ data: OnboardingSummary }>('/dashboard/onboarding-summary').then(r => r.data),
        staleTime: DASHBOARD_STALE,
    })
}
