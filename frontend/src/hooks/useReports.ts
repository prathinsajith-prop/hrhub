import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { PROCostReport } from '@/hooks/useVisaCosts'

export interface HeadcountEmployee {
    id: string
    fullName: string
    department: string | null
    designation: string | null
    nationality: string | null
    status: string
    joinDate: string | null
    visaExpiry: string | null
    emiratisationCategory: string | null
}

export interface HeadcountReport {
    total: number
    byStatus: { label: string; count: number }[]
    byDepartment: { label: string; count: number }[]
    byNationality: { label: string; count: number }[]
    employees: HeadcountEmployee[]
}

export interface PayrollTrendRow {
    period: string
    gross: number
    net: number
    deductions: number
    headcount: number
    status: string
}

export interface PayrollSummaryReport {
    trend: PayrollTrendRow[]
    ytdGross: number
    ytdNet: number
    totalRuns: number
}

export interface VisaExpiryEmployee {
    id: string
    fullName: string
    department: string | null
    designation: string | null
    nationality: string | null
    visaExpiry: string | null
    passportExpiry: string | null
    visaType: string | null
    emiratesId: string | null
    daysLeft: number | null
    urgency: 'expired' | 'critical' | 'urgent' | 'normal' | 'unknown'
}

export interface VisaExpiryReport {
    total: number
    expired: number
    critical: number
    urgent: number
    normal: number
    employees: VisaExpiryEmployee[]
}

export function useHeadcountReport() {
    return useQuery({
        queryKey: ['reports', 'headcount'],
        queryFn: () => api.get<{ data: HeadcountReport }>('/reports/headcount').then(r => r.data),
    })
}

export function usePayrollSummaryReport() {
    return useQuery({
        queryKey: ['reports', 'payroll-summary'],
        queryFn: () => api.get<{ data: PayrollSummaryReport }>('/reports/payroll-summary').then(r => r.data),
        staleTime: 5 * 60_000, // 5 minutes — payroll totals change infrequently
    })
}

export function useVisaExpiryReport(days = 90) {
    return useQuery({
        queryKey: ['reports', 'visa-expiry', days],
        queryFn: () => api.get<{ data: VisaExpiryReport }>(`/reports/visa-expiry?days=${days}`).then(r => r.data),
        staleTime: 5 * 60_000,
    })
}

export interface ReportsSummary {
    headcount: HeadcountReport
    payrollSummary: PayrollSummaryReport
    visaExpiry: VisaExpiryReport
    proCosts: PROCostReport
}

export function useReportsSummary(days = 90) {
    return useQuery({
        queryKey: ['reports', 'summary', days],
        queryFn: () => api.get<ReportsSummary>(`/reports/summary?days=${days}`),
        staleTime: 5 * 60_000,
    })
}
