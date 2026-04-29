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
    leavePolicies: '/leave-policies',
    attendance: '/attendance',
    performance: '/performance',
    assets: '/assets',

    // Insights
    reports: '/reports',
    audit: '/audit',
    loginHistory: '/my/login-history',

    // Workspace
    organizations: '/organizations',
    organizationsNew: '/organizations/new',
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
} as const

export type RouteKey = keyof typeof ROUTES

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
    'leave-policies': 'nav.leavePolicies',
    attendance: 'nav.attendance',
    performance: 'nav.performance',
    assets: 'nav.assets',
    reports: 'nav.reports',
    audit: 'nav.auditLog',
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
}
