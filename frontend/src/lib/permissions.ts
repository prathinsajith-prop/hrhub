import type { UserRole } from '@/types'

// ─── Action definitions ───────────────────────────────────────────────────────
export type Permission =
  | 'manage_employees'
  | 'view_employees'
  | 'manage_recruitment'
  | 'manage_onboarding'
  | 'view_onboarding'
  | 'manage_visa'
  | 'manage_documents'
  | 'view_documents'
  | 'manage_payroll'
  | 'view_payroll'
  | 'manage_leave'
  | 'approve_leave'
  | 'view_own_leave'
  | 'manage_compliance'
  | 'view_reports'
  | 'manage_settings'
  | 'manage_users'
  | 'view_audit_log'
  | 'manage_attendance'
  | 'view_own_attendance'
  | 'manage_performance'
  | 'view_own_performance'
  | 'manage_assets'
  | 'manage_exit'
  | 'view_org_chart'

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
  | 'assets'
  | 'organizations'
  | 'organizations/new'
  | 'team'
  | 'apps'
  | 'leave-policies'
  | 'organization-settings'

// ─── Permission matrix ────────────────────────────────────────────────────────
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  super_admin: [
    'manage_employees', 'view_employees',
    'manage_recruitment',
    'manage_onboarding', 'view_onboarding',
    'manage_visa',
    'manage_documents', 'view_documents',
    'manage_payroll', 'view_payroll',
    'manage_leave', 'approve_leave', 'view_own_leave',
    'manage_compliance',
    'view_reports',
    'manage_settings', 'manage_users',
    'view_audit_log',
    'manage_attendance', 'view_own_attendance',
    'manage_performance', 'view_own_performance',
    'manage_assets',
    'manage_exit',
    'view_org_chart',
  ],
  hr_manager: [
    'manage_employees', 'view_employees',
    'manage_recruitment',
    'manage_onboarding', 'view_onboarding',
    'manage_documents', 'view_documents',
    'manage_payroll', 'view_payroll',
    'manage_leave', 'approve_leave', 'view_own_leave',
    'manage_compliance',
    'view_reports',
    'manage_settings',
    'view_audit_log',
    'manage_attendance', 'view_own_attendance',
    'manage_performance', 'view_own_performance',
    'manage_assets',
    'manage_exit',
    'view_org_chart',
  ],
  pro_officer: [
    'view_employees',
    'manage_visa',
    'manage_documents', 'view_documents',
    'manage_compliance',
    'view_reports',
    'view_own_leave',
    'view_own_attendance',
    'view_own_performance',
    'view_org_chart',
  ],
  dept_head: [
    'view_employees',
    'view_onboarding', 'manage_onboarding',
    'approve_leave', 'view_own_leave',
    'manage_attendance', 'view_own_attendance',
    'manage_performance', 'view_own_performance',
    'view_org_chart',
    'view_documents',
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
  'org-chart': ['super_admin', 'hr_manager', 'pro_officer', 'dept_head'],
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
  leave: ['super_admin', 'hr_manager', 'dept_head', 'employee'],
  attendance: ['super_admin', 'hr_manager', 'dept_head', 'employee'],
  performance: ['super_admin', 'hr_manager', 'dept_head', 'employee'],
  assets: ['super_admin', 'hr_manager'],

  reports: ['super_admin', 'hr_manager', 'pro_officer'],
  audit: ['super_admin', 'hr_manager'],
  settings: ['super_admin', 'hr_manager'],

  // App Management
  organizations: ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],
  'organizations/new': ['super_admin', 'hr_manager', 'pro_officer', 'dept_head', 'employee'],
  team: ['super_admin', 'hr_manager'],
  apps: ['super_admin'],
  'leave-policies': ['super_admin', 'hr_manager'],
  'organization-settings': ['super_admin', 'hr_manager'],
}

// ─── Public API ───────────────────────────────────────────────────────────────
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
    '/organizations': 'organizations',
    '/team': 'team',
    '/apps': 'apps',
    '/leave-policies': 'leave-policies',
    '/organization-settings': 'organization-settings',
  }
  return map[url] ?? null
}
