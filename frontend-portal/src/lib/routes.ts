export const ROUTES = {
    login: '/login',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',
    notAuthorized: '/not-authorized',

    // Employee mode
    employeeHome: '/me',
    employeeProfile: '/me/profile',
    employeeLeave: '/me/leave',
    employeePayslips: '/me/payslips',
    employeeAttendance: '/me/attendance',
    employeeDocuments: '/me/documents',
    employeePerformance: '/me/performance',
    employeeReferrals: '/me/referrals',
    employeeAnnouncements: '/me/announcements',
    notifications: '/notifications',

    // Manager mode (dept_head only)
    managerHome: '/team',
    managerMembers: '/team/members',
    managerMemberDetail: (id = ':id') => `/team/members/${id}`,
    managerApprovals: '/team/approvals',
    managerDocumentApprovals: '/team/documents',
    managerProfileApprovals: '/team/profile-changes',
    managerAttendance: '/team/attendance',
    managerCalendar: '/team/calendar',
} as const

export const ADMIN_APP_URL = (import.meta.env.VITE_ADMIN_APP_URL as string | undefined) ?? 'https://hrhub-alpha.vercel.app'
