import type { UserRole } from '@/types'

// ─── Role hierarchy ───────────────────────────────────────────────────────────
/** Numeric level per role — higher = more access. */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  employee: 1,
  dept_head: 2,
  pro_officer: 3,
  hr_manager: 4,
  super_admin: 5,
}

export function getRoleLevel(role: UserRole): number {
  return ROLE_HIERARCHY[role] ?? 0
}

/** True when the user's role level is ≥ the required role level. */
export function hasMinRole(userRole: UserRole, minRole: UserRole): boolean {
  return getRoleLevel(userRole) >= getRoleLevel(minRole)
}

// ─── Action definitions ───────────────────────────────────────────────────────
export type Permission =
  // People & workforce
  | 'manage_employees'
  | 'view_employees'
  // Recruitment
  | 'manage_recruitment'
  | 'view_recruitment'
  // Onboarding
  | 'manage_onboarding'
  | 'view_onboarding'
  // Visa
  | 'manage_visa'
  | 'view_visa'
  // Documents
  | 'manage_documents'
  | 'view_documents'
  // Payroll
  | 'manage_payroll'
  | 'view_payroll'
  // Leave
  | 'manage_leave'
  | 'approve_leave'
  | 'view_own_leave'
  // Compliance
  | 'manage_compliance'
  | 'view_compliance'
  // Reports
  | 'view_reports'
  | 'export_reports'
  // Settings & admin
  | 'manage_settings'
  | 'manage_users'
  | 'view_audit_log'
  // Attendance
  | 'manage_attendance'
  | 'view_own_attendance'
  // Performance
  | 'manage_performance'
  | 'view_own_performance'
  // Assets
  | 'manage_assets'
  | 'view_assets'
  // Exit management
  | 'manage_exit'
  | 'view_exit'
  // Org chart
  | 'view_org_chart'
  // Workspace / app management
  | 'manage_team'
  | 'manage_org'
  | 'manage_apps'
  | 'invite_members'

// ─── Route keys — must match App.tsx path strings exactly ────────────────────
export type RouteKey =
  | 'dashboard'
  | 'employees'
  | 'employees/:id'
  | 'recruitment'
  | 'recruitment/candidates/:id'
  | 'onboarding'
  | 'onboarding/:employeeId'
  | 'visa'
  | 'visa/:id'
  | 'documents'
  | 'payroll'
  | 'leave'
  | 'compliance'
  | 'reports'
  | 'settings'
  | 'exit'
  | 'calendar'
  | 'attendance'
  | 'performance'
  | 'org-chart'
  | 'audit'
  | 'notifications'
  | 'my/login-history'
  | 'my/account'
  | 'my/leave'
  | 'my/payslips'
  | 'my/profile'
  | 'assets'
  | 'organizations'
  | 'organizations/new'
  | 'team'
  | 'users'
  | 'apps'
  | 'leave-policies'
  | 'organization-settings'
  | 'subscription'
  | 'complaints'
  | 'my/complaints'

// ─── Permission matrix ────────────────────────────────────────────────────────
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    // People
    'manage_employees', 'view_employees',
    // Recruitment
    'manage_recruitment', 'view_recruitment',
    // Onboarding
    'manage_onboarding', 'view_onboarding',
    // Visa
    'manage_visa', 'view_visa',
    // Documents
    'manage_documents', 'view_documents',
    // Payroll
    'manage_payroll', 'view_payroll',
    // Leave
    'manage_leave', 'approve_leave', 'view_own_leave',
    // Compliance
    'manage_compliance', 'view_compliance',
    // Reports
    'view_reports', 'export_reports',
    // Settings & admin
    'manage_settings', 'manage_users',
    'view_audit_log',
    // Attendance
    'manage_attendance', 'view_own_attendance',
    // Performance
    'manage_performance', 'view_own_performance',
    // Assets
    'manage_assets', 'view_assets',
    // Exit
    'manage_exit', 'view_exit',
    // Misc
    'view_org_chart',
    // Workspace management
    'manage_team', 'manage_org', 'manage_apps', 'invite_members',
  ],
  hr_manager: [
    // People
    'manage_employees', 'view_employees',
    // Recruitment
    'manage_recruitment', 'view_recruitment',
    // Onboarding
    'manage_onboarding', 'view_onboarding',
    // Documents
    'manage_documents', 'view_documents',
    // Payroll
    'manage_payroll', 'view_payroll',
    // Leave
    'manage_leave', 'approve_leave', 'view_own_leave',
    // Compliance
    'manage_compliance', 'view_compliance',
    // Reports
    'view_reports', 'export_reports',
    // Settings & admin
    'manage_settings',
    'view_audit_log',
    // Attendance
    'manage_attendance', 'view_own_attendance',
    // Performance
    'manage_performance', 'view_own_performance',
    // Assets
    'manage_assets', 'view_assets',
    // Exit
    'manage_exit', 'view_exit',
    // Misc
    'view_org_chart',
    // Workspace management
    'manage_team', 'manage_org', 'manage_apps', 'invite_members',
  ],
  pro_officer: [
    // People (read-only)
    'view_employees',
    // Visa
    'manage_visa', 'view_visa',
    // Documents
    'manage_documents', 'view_documents',
    // Compliance
    'manage_compliance', 'view_compliance',
    // Reports (view only)
    'view_reports',
    // Own data
    'view_own_leave',
    'view_own_attendance',
    'view_own_performance',
    // Misc
    'view_org_chart',
  ],
  dept_head: [
    // People (read-only, scoped to their department server-side)
    'view_employees',
    // Onboarding (read + manage for dept)
    'view_onboarding', 'manage_onboarding',
    // Documents (read-only)
    'view_documents',
    // Leave (approve for dept + own)
    'approve_leave', 'manage_leave', 'view_own_leave',
    // Attendance (manage for dept)
    'manage_attendance', 'view_own_attendance',
    // Performance (manage for dept)
    'manage_performance', 'view_own_performance',
    // Reports (dept-level read only)
    'view_reports',
    // Assets (read-only)
    'view_assets',
    // Misc
    'view_org_chart',
    // Teams (manage dept-scoped teams)
    'manage_team',
  ],
  employee: [
    'view_own_leave',
    'view_own_attendance',
    'view_own_performance',
  ],
}

// ─── Route access matrix ──────────────────────────────────────────────────────
const ROUTE_ACCESS: Record<RouteKey, UserRole[]> = {
  dashboard: ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],
  calendar: ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],
  notifications: ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],
  'my/login-history': ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],

  employees: ['super_admin', 'hr_manager', 'pro_officer', 'dept_head'],
  'employees/:id': ['super_admin', 'hr_manager', 'pro_officer', 'dept_head'],
  'org-chart': ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],
  recruitment: ['super_admin', 'hr_manager'],
  'recruitment/candidates/:id': ['super_admin', 'hr_manager'],
  onboarding: ['super_admin', 'hr_manager', 'dept_head'],
  'onboarding/:employeeId': ['super_admin', 'hr_manager', 'dept_head'],
  exit: ['super_admin', 'hr_manager'],

  visa: ['super_admin', 'hr_manager', 'pro_officer'],
  'visa/:id': ['super_admin', 'hr_manager', 'pro_officer'],
  documents: ['super_admin', 'hr_manager', 'pro_officer', 'dept_head'],
  compliance: ['super_admin', 'hr_manager', 'pro_officer'],

  payroll: ['super_admin', 'hr_manager'],
  leave: ['super_admin', 'hr_manager', 'dept_head'],
  attendance: ['super_admin', 'hr_manager', 'dept_head'],
  performance: ['super_admin', 'hr_manager', 'dept_head'],
  assets: ['super_admin', 'hr_manager', 'dept_head'],

  reports: ['super_admin', 'hr_manager', 'pro_officer', 'dept_head'],
  audit: ['super_admin', 'hr_manager'],
  settings: ['super_admin', 'hr_manager'],

  // App Management
  organizations: ['super_admin', 'hr_manager', 'pro_officer'],
  'organizations/new': ['super_admin', 'hr_manager'],
  team: ['super_admin', 'hr_manager', 'dept_head', 'pro_officer', 'employee'],
  users: ['super_admin', 'hr_manager'],
  apps: ['super_admin', 'hr_manager'],
  'leave-policies': ['super_admin', 'hr_manager'],
  'organization-settings': ['super_admin', 'hr_manager'],
  subscription: ['super_admin', 'hr_manager'],
  complaints: ['super_admin', 'hr_manager'],

  // Self-service (all authenticated roles)
  'my/account': ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],
  'my/leave': ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],
  'my/payslips': ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],
  'my/profile': ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],
  'my/complaints': ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],
}

// ─── Public API ───────────────────────────────────────────────────────────────
export const ALL_ROLES: UserRole[] = ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee']

export const ALL_PERMISSIONS: Permission[] = [
  // People
  'manage_employees', 'view_employees',
  // Recruitment
  'manage_recruitment', 'view_recruitment',
  // Onboarding
  'manage_onboarding', 'view_onboarding',
  // Visa
  'manage_visa', 'view_visa',
  // Documents
  'manage_documents', 'view_documents',
  // Payroll
  'manage_payroll', 'view_payroll',
  // Leave
  'manage_leave', 'approve_leave', 'view_own_leave',
  // Compliance
  'manage_compliance', 'view_compliance',
  // Reports
  'view_reports', 'export_reports',
  // Settings & admin
  'manage_settings', 'manage_users',
  'view_audit_log',
  // Attendance
  'manage_attendance', 'view_own_attendance',
  // Performance
  'manage_performance', 'view_own_performance',
  // Assets
  'manage_assets', 'view_assets',
  // Exit
  'manage_exit', 'view_exit',
  // Misc
  'view_org_chart',
  // Workspace management
  'manage_team', 'manage_org', 'manage_apps', 'invite_members',
]

/** Read-only snapshot of the role → permissions matrix (currently hard-coded). */
export function getRolePermissionMatrix(): Record<UserRole, Permission[]> {
  return ROLE_PERMISSIONS
}

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false
}

export function canAccessRoute(role: UserRole, routeKey: RouteKey): boolean {
  return ROUTE_ACCESS[routeKey]?.includes(role) ?? false
}

/** Returns the first route a role is allowed to see after login. */
export function getDefaultRoute(): string {
  return '/dashboard'
}

/** Nav item visibility: maps sidebar URL prefix → RouteKey */
export function getNavRouteKey(url: string): RouteKey | null {
  const map: Record<string, RouteKey> = {
    '/dashboard': 'dashboard',
    '/calendar': 'calendar',
    '/employees': 'employees',
    '/org-chart': 'org-chart',
    '/recruitment': 'recruitment',
    '/onboarding': 'onboarding',
    '/exit': 'exit',
    '/visa': 'visa',
    '/documents': 'documents',
    '/compliance': 'compliance',
    '/payroll': 'payroll',
    '/leave': 'leave',
    '/attendance': 'attendance',
    '/performance': 'performance',
    '/assets': 'assets',
    '/reports': 'reports',
    '/audit': 'audit',
    '/settings': 'settings',
    '/notifications': 'notifications',
    '/my/login-history': 'my/login-history',
    '/my/account': 'my/account',
    '/my/leave': 'my/leave',
    '/my/payslips': 'my/payslips',
    '/my/profile': 'my/profile',
    '/organizations': 'organizations',
    '/team': 'team',
    '/users': 'users',
    '/apps': 'apps',
    '/leave-policies': 'leave-policies',
    '/organization-settings': 'organization-settings',
    '/subscription': 'subscription',
    '/complaints': 'complaints',
    '/my/complaints': 'my/complaints',
  }
  return map[url] ?? null
}
