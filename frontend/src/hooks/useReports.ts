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
        staleTime: 5 * 60_000, // 5 minutes - payroll totals change infrequently
    })
}

export function useVisaExpiryReport(days = 90) {
    return useQuery({
        queryKey: ['reports', 'visa-expiry', days],
        queryFn: () => api.get<{ data: VisaExpiryReport }>(`/reports/visa-expiry?days=${days}`).then(r => r.data),
        staleTime: 5 * 60_000,
    })
}

// ─── Attendance Summary ─────────────────────────────────────────────────

export interface AttendanceTrendRow {
    period: string
    bucket: string
    present: number
    late: number
    absent: number
    rate: number
}

export interface AttendanceByDepartment {
    department: string
    present: number
    late: number
    absent: number
    rate: number
}

export interface AttendanceLeader {
    employeeId: string
    employeeNo: string | null
    fullName: string
    department: string | null
    designation: string | null
    lateCount: number
}

export interface AttendanceSummaryReport {
    windowDays: number
    present: number
    late: number
    absent: number
    onLeave: number
    attendanceRate: number
    avgHoursPerDay: number
    trend: AttendanceTrendRow[]
    byDepartment: AttendanceByDepartment[]
    lateLeaderboard: AttendanceLeader[]
}

export function useAttendanceSummaryReport(days = 90) {
    return useQuery({
        queryKey: ['reports', 'attendance-summary', days],
        queryFn: () => api.get<{ data: AttendanceSummaryReport }>(`/reports/attendance-summary?days=${days}`).then((r) => r.data),
        staleTime: 5 * 60_000,
    })
}

// ─── Leave Summary ──────────────────────────────────────────────────────

export interface LeaveTypeRow {
    leaveType: string
    requests: number
    days: number
}

export interface LeaveByDepartment {
    department: string
    days: number
    requests: number
}

export interface LeaveTopTaker {
    employeeId: string
    employeeNo: string | null
    fullName: string
    department: string | null
    designation: string | null
    days: number
    requests: number
}

export interface LeaveSummaryReport {
    year: number
    approvedRequests: number
    approvedDays: number
    pendingRequests: number
    pendingDays: number
    rejectedRequests: number
    cancelledRequests: number
    byType: LeaveTypeRow[]
    byDepartment: LeaveByDepartment[]
    topTakers: LeaveTopTaker[]
}

export function useLeaveSummaryReport(year?: number) {
    return useQuery({
        queryKey: ['reports', 'leave-summary', year ?? 'current'],
        queryFn: () => api.get<{ data: LeaveSummaryReport }>(`/reports/leave-summary${year ? `?year=${year}` : ''}`).then((r) => r.data),
        staleTime: 5 * 60_000,
    })
}

// ─── Turnover & Attrition ───────────────────────────────────────────────

export interface TurnoverTrendRow {
    period: string
    bucket: string
    joins: number
    exits: number
}

export interface TurnoverByDepartment {
    department: string
    exits: number
}

export interface TurnoverReport {
    windowMonths: number
    totalJoins: number
    totalExits: number
    currentHeadcount: number
    turnoverRate: number
    netChange: number
    trend: TurnoverTrendRow[]
    byDepartment: TurnoverByDepartment[]
    tenureDistribution: { label: string; count: number }[]
    byExitType: { label: string; count: number }[]
    windowStart: string
    windowEnd: string
}

export function useTurnoverReport(months = 12) {
    return useQuery({
        queryKey: ['reports', 'turnover', months],
        queryFn: () => api.get<{ data: TurnoverReport }>(`/reports/turnover?months=${months}`).then((r) => r.data),
        staleTime: 5 * 60_000,
    })
}

// ─── Onboarding Completion ──────────────────────────────────────────────

export interface StalledChecklist {
    id: string
    employeeId: string
    employeeNo: string | null
    fullName: string
    department: string | null
    designation: string | null
    progress: number
    stalledDays: number
    dueDate: string | null
}

export interface OnboardingByDepartment {
    department: string
    total: number
    completed: number
    inProgress: number
    completionRate: number
}

export interface OnboardingReport {
    total: number
    completed: number
    inProgress: number
    stalled: number
    overdue: number
    completionRate: number
    avgDaysToComplete: number
    stalledList: StalledChecklist[]
    byDepartment: OnboardingByDepartment[]
}

export function useOnboardingReport() {
    return useQuery({
        queryKey: ['reports', 'onboarding'],
        queryFn: () => api.get<{ data: OnboardingReport }>('/reports/onboarding').then((r) => r.data),
        staleTime: 5 * 60_000,
    })
}

// ─── Performance Review Summary ─────────────────────────────────────────

export interface PerformanceDeptRow {
    department: string
    avgRating: number
    count: number
}

export interface RecentReview {
    id: string
    employeeId: string
    employeeNo: string | null
    fullName: string
    department: string | null
    designation: string | null
    period: string
    status: string
    overallRating: number | null
    reviewDate: string | null
}

export interface PerformanceReport {
    total: number
    completed: number
    inProgress: number
    draft: number
    completionRate: number
    avgRating: number
    ratingDistribution: { rating: number; count: number }[]
    byDepartment: PerformanceDeptRow[]
    recent: RecentReview[]
}

export function usePerformanceReport() {
    return useQuery({
        queryKey: ['reports', 'performance'],
        queryFn: () => api.get<{ data: PerformanceReport }>('/reports/performance').then((r) => r.data),
        staleTime: 5 * 60_000,
    })
}

// ─── Combined summary (BFF) ─────────────────────────────────────────────

export interface ReportsSummary {
    headcount: HeadcountReport
    payrollSummary: PayrollSummaryReport
    visaExpiry: VisaExpiryReport
    proCosts: PROCostReport
    attendanceSummary: AttendanceSummaryReport
    leaveSummary: LeaveSummaryReport
    turnover: TurnoverReport
    onboarding: OnboardingReport
    performance: PerformanceReport
}

export function useReportsSummary(days = 90) {
    return useQuery({
        queryKey: ['reports', 'summary', days],
        queryFn: () => api.get<ReportsSummary>(`/reports/summary?days=${days}`),
        staleTime: 5 * 60_000,
    })
}
