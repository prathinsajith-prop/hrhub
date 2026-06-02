/**
 * Application route constants.
 *
 * Single source of truth for all top-level URL paths used by the router,
 * the sidebar, the breadcrumb, and any feature that needs to navigate
 * between pages. Always import from here instead of hard-coding strings.
 */

export const ROUTES = {
    // Auth
    login: '/login',
    register: '/register',
    forgotPassword: '/forgot-password',
    resetPassword: '/reset-password',

    // Core
    dashboard: '/dashboard',
    employees: '/employees',
    orgChart: '/org-chart',
    recruitment: '/recruitment',
    onboarding: '/onboarding',
    exit: '/exit',
    calendar: '/calendar',

    // Compliance
    visa: '/visa',
    documents: '/documents',
    compliance: '/compliance',

    // Finance & HR Ops
    payroll: '/payroll',
    leave: '/leave',
    attendance: '/attendance',
    attendanceBiometric: '/attendance/biometric',
    performance: '/performance',
    assets: '/assets',
    travel: '/travel',

    // Insights
    reports: '/reports',
    audit: '/audit',
    announcements: '/announcements',
    recognition: '/recognition',
    loginHistory: '/my/login-history',

    // Workspace
    organizations: '/organizations',
    organizationSettings: '/organization-settings',
    team: '/team',
    users: '/users',
    apps: '/apps',

    // Personal
    notifications: '/notifications',
    settings: '/settings',
    help: '/help',

    // Self-service (employee portal)
    myLeave: '/my/leave',
    myPayslips: '/my/payslips',
    myProfile: '/my/profile',
    myAttendance: '/my/attendance',
    myActivity: '/my/activity',
} as const

export type RouteKey = keyof typeof ROUTES

/**
 * Public (unauthenticated) careers-portal route builders. Kept separate from
 * ROUTES so they don't pollute RouteKey / the RoleRoute permission matrix.
 */
export const PUBLIC_ROUTES = {
    careersJobs: (companyCode: string) => `/careers/${encodeURIComponent(companyCode)}/jobs`,
    careersJob: (companyCode: string, jobId: string) => `/careers/${encodeURIComponent(companyCode)}/jobs/${jobId}`,
} as const

/**
 * Maps the first URL segment to its i18n key in the `nav.*` namespace.
 * Used by the breadcrumb in the SiteHeader to translate root paths.
 */
export const ROOT_NAV_LABELS: Record<string, string> = {
    dashboard: 'nav.dashboard',
    employees: 'nav.employees',
    'org-chart': 'nav.orgChart',
    recruitment: 'nav.recruitment',
    onboarding: 'nav.onboarding',
    exit: 'nav.exit',
    calendar: 'nav.calendar',
    visa: 'nav.visa',
    documents: 'nav.documents',
    compliance: 'nav.compliance',
    payroll: 'nav.payroll',
    leave: 'nav.leave',
    attendance: 'nav.attendance',
    performance: 'nav.performance',
    assets: 'nav.assets',
    travel: 'nav.travel',
    reports: 'nav.reports',
    audit: 'nav.auditLog',
    recognition: 'nav.recognition',
    'login-history': 'loginHistory.title',
    notifications: 'profile.notifications',
    settings: 'nav.settings',
    help: 'nav.help',
    organizations: 'nav.organizations',
    team: 'nav.team',
    users: 'nav.users',
    apps: 'nav.apps',
    'organization-settings': 'settings.company',
    'my/leave': 'myLeave.title',
    'my/payslips': 'myPayslips.title',
    'my/profile': 'myProfile.title',
    'my/attendance': 'myAttendance.title',
    'my/activity': 'myActivity.title',
}
