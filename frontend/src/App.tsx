import React, { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from '@/components/ui/overlays'
import { ErrorBoundary } from '@/components/layout/ErrorBoundary'
import { useAuthStore } from '@/store/authStore'
import { canAccessRoute, type RouteKey } from '@/lib/permissions'
import type { UserRole } from '@/types'

// Code-split all pages — only loaded when navigated to
const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then(m => ({ default: m.LoginPage })))
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage').then(m => ({ default: m.RegisterPage })))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })))
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })))
const EmployeesPage = lazy(() => import('@/pages/employees/EmployeesPage').then(m => ({ default: m.EmployeesPage })))
const EmployeeDetailPage = lazy(() => import('@/pages/employees/EmployeeDetailPage').then(m => ({ default: m.EmployeeDetailPage })))
const RecruitmentPage = lazy(() => import('@/pages/recruitment/RecruitmentPage').then(m => ({ default: m.RecruitmentPage })))
const CandidateProfilePage = lazy(() => import('@/pages/recruitment/CandidateProfilePage').then(m => ({ default: m.CandidateProfilePage })))
const VisaPage = lazy(() => import('@/pages/visa/VisaPage').then(m => ({ default: m.VisaPage })))
const VisaDetailPage = lazy(() => import('@/pages/visa/VisaDetailPage').then(m => ({ default: m.VisaDetailPage })))
const DocumentsPage = lazy(() => import('@/pages/documents/DocumentsPage').then(m => ({ default: m.DocumentsPage })))
const PayrollPage = lazy(() => import('@/pages/payroll/PayrollPage').then(m => ({ default: m.PayrollPage })))
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then(m => ({ default: m.SettingsPage })))
const ExitPage = lazy(() => import('@/pages/employees/ExitPage').then(m => ({ default: m.ExitPage })))
const AttendancePage = lazy(() => import('@/pages/attendance/AttendancePage').then(m => ({ default: m.AttendancePage })))
const PerformancePage = lazy(() => import('@/pages/performance/PerformancePage').then(m => ({ default: m.PerformancePage })))
const OrgChartPage = lazy(() => import('@/pages/employees/OrgChartPage').then(m => ({ default: m.OrgChartPage })))
const AuditLogPage = lazy(() => import('@/pages/misc/AuditLogPage').then(m => ({ default: m.AuditLogPage })))
const LoginHistoryPage = lazy(() => import('@/pages/misc/LoginHistoryPage').then(m => ({ default: m.LoginHistoryPage })))
const NotificationsPage = lazy(() => import('@/pages/misc/NotificationsPage').then(m => ({ default: m.NotificationsPage })))
const NotFoundPage = lazy(() => import('@/pages/misc/NotFoundPage').then(m => ({ default: m.NotFoundPage })))
const ForbiddenPage = lazy(() => import('@/pages/misc/ForbiddenPage').then(m => ({ default: m.ForbiddenPage })))
const CalendarPage = lazy(() => import('@/pages/calendar/CalendarPage').then(m => ({ default: m.CalendarPage })))
const LeavePage = lazy(() => import('@/pages/misc/LeavePage').then(m => ({ default: m.LeavePage })))
const OnboardingPage = lazy(() => import('@/pages/misc/OnboardingPage').then(m => ({ default: m.OnboardingPage })))
const OnboardingDetailPage = lazy(() => import('@/pages/misc/OnboardingDetailPage').then(m => ({ default: m.OnboardingDetailPage })))
const CompliancePage = lazy(() => import('@/pages/misc/CompliancePage').then(m => ({ default: m.CompliancePage })))
const ReportsPage = lazy(() => import('@/pages/misc/ReportsPage').then(m => ({ default: m.ReportsPage })))
const AssetsPage = lazy(() => import('@/pages/assets/AssetsPage').then(m => ({ default: m.AssetsPage })))
const OrganizationsPage = lazy(() => import('@/pages/organizations/OrganizationsPage').then(m => ({ default: m.OrganizationsPage })))
const TeamPage = lazy(() => import('@/pages/organizations/TeamPage').then(m => ({ default: m.TeamPage })))
const UsersPage = lazy(() => import('@/pages/settings/UsersPage').then(m => ({ default: m.UsersPage })))
const ConnectedAppsPage = lazy(() => import('@/pages/organizations/ConnectedAppsPage').then(m => ({ default: m.ConnectedAppsPage })))
const AppDetailPage = lazy(() => import('@/pages/organizations/AppDetailPage').then(m => ({ default: m.AppDetailPage })))
const LeavePoliciesPage = lazy(() => import('@/pages/leave/LeavePoliciesPage').then(m => ({ default: m.LeavePoliciesPage })))
const OnboardingUploadPage = lazy(() => import('@/pages/onboarding/OnboardingUploadPage').then(m => ({ default: m.OnboardingUploadPage })))
const OrganizationSettingsPage = lazy(() => import('@/pages/organizations/OrganizationSettingsPage').then(m => ({ default: m.OrganizationSettingsPage })))
const SubscriptionPage = lazy(() => import('@/pages/organizations/SubscriptionPage').then(m => ({ default: m.SubscriptionPage })))
const MyLeavePage = lazy(() => import('@/pages/my/MyLeavePage').then(m => ({ default: m.MyLeavePage })))
const MyPayslipsPage = lazy(() => import('@/pages/my/MyPayslipsPage').then(m => ({ default: m.MyPayslipsPage })))
const MyProfilePage = lazy(() => import('@/pages/my/MyProfilePage').then(m => ({ default: m.MyProfilePage })))
const MyAccountPage = lazy(() => import('@/pages/my/MyAccountPage').then(m => ({ default: m.MyAccountPage })))
const ComplaintsPage = lazy(() => import('@/pages/misc/ComplaintsPage').then(m => ({ default: m.ComplaintsPage })))
const MyComplaintsPage = lazy(() => import('@/pages/my/MyComplaintsPage').then(m => ({ default: m.MyComplaintsPage })))
const TrainingPage = lazy(() => import('@/pages/misc/TrainingPage').then(m => ({ default: m.TrainingPage })))
const MyTrainingPage = lazy(() => import('@/pages/my/MyTrainingPage').then(m => ({ default: m.MyTrainingPage })))
const LoansPage = lazy(() => import('@/pages/misc/LoansPage').then(m => ({ default: m.LoansPage })))
const MyLoansPage = lazy(() => import('@/pages/my/MyLoansPage').then(m => ({ default: m.MyLoansPage })))
const LeaveAdjustmentsPage = lazy(() => import('@/pages/leave/LeaveAdjustmentsPage').then(m => ({ default: m.LeaveAdjustmentsPage })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

// Maps route paths to translation keys (format: "section.title")
const PAGE_TITLE_MAP: Record<string, string> = {
  '/login': 'auth.signIn',
  '/register': 'auth.signUp',
  '/forgot-password': 'auth.forgotPassword',
  '/reset-password': 'auth.resetPassword',
  '/dashboard': 'dashboard.title',
  '/employees': 'employees.title',
  '/recruitment': 'recruitment.title',
  '/onboarding': 'onboarding.title',
  '/visa': 'visa.title',
  '/documents': 'documents.title',
  '/payroll': 'payroll.title',
  '/leave': 'leave.title',
  '/compliance': 'compliance.title',
  '/reports': 'reports.title',
  '/settings': 'settings.title',
  '/exit': 'exit.title',
  '/attendance': 'attendance.title',
  '/performance': 'performance.title',
  '/org-chart': 'orgChart.title',
  '/audit': 'audit.title',
  '/notifications': 'notifications.title',
  '/my/login-history': 'loginHistory.title',
  '/my/account': 'myAccount.title',
  '/my/leave': 'myLeave.title',
  '/my/payslips': 'myPayslips.title',
  '/my/profile': 'myProfile.title',
  '/organizations': 'organizations.title',
  '/team': 'team.title',
  '/apps': 'apps.title',
  '/leave-policies': 'leavePolicies.title',
  '/training': 'training.pageTitle',
  '/my/training': 'training.myPageTitle',
  '/loans': 'loans.pageTitle',
  '/my/loans': 'loans.myPageTitle',
  '/leave-adjustments': 'leaveAdjustments.title',
}

function TitleManager() {
  const location = useLocation()
  const { t } = useTranslation()

  useEffect(() => {
    const path = location.pathname
    const key = PAGE_TITLE_MAP[path] ??
      Object.entries(PAGE_TITLE_MAP).find(([k]) => path.startsWith(k + '/') && k !== '/')?.[1]
    const pageTitle = key ? t(key) : null
    document.title = pageTitle ? `${pageTitle} | HRHub` : 'HRHub'
  }, [location.pathname, t])

  return null
}

/** Redirects to /login if not authenticated. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

/** Guards a single route by role. Renders 403 inline if the role lacks access. */
function RoleRoute({ routeKey, children }: { routeKey: RouteKey; children: React.ReactNode }) {
  const role = useAuthStore((s) => s.user?.role) as UserRole | undefined
  if (!role || !canAccessRoute(role, routeKey)) {
    return <ForbiddenPage />
  }
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <TitleManager />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/" element={<ProtectedRoute><ErrorBoundary><AppLayout /></ErrorBoundary></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<RoleRoute routeKey="dashboard"><DashboardPage /></RoleRoute>} />
            <Route path="employees" element={<RoleRoute routeKey="employees"><EmployeesPage /></RoleRoute>} />
            <Route path="employees/:id" element={<RoleRoute routeKey="employees/:id"><EmployeeDetailPage /></RoleRoute>} />
            <Route path="recruitment" element={<RoleRoute routeKey="recruitment"><RecruitmentPage /></RoleRoute>} />
            <Route path="recruitment/candidates" element={<Navigate to="/recruitment" replace />} />
            <Route path="recruitment/candidates/:id" element={<RoleRoute routeKey="recruitment/candidates/:id"><CandidateProfilePage /></RoleRoute>} />
            <Route path="onboarding" element={<RoleRoute routeKey="onboarding"><OnboardingPage /></RoleRoute>} />
            <Route path="onboarding/:employeeId" element={<RoleRoute routeKey="onboarding/:employeeId"><OnboardingDetailPage /></RoleRoute>} />
            <Route path="visa" element={<RoleRoute routeKey="visa"><VisaPage /></RoleRoute>} />
            <Route path="visa/:id" element={<RoleRoute routeKey="visa/:id"><VisaDetailPage /></RoleRoute>} />
            <Route path="documents" element={<RoleRoute routeKey="documents"><DocumentsPage /></RoleRoute>} />
            <Route path="payroll" element={<RoleRoute routeKey="payroll"><PayrollPage /></RoleRoute>} />
            <Route path="leave" element={<RoleRoute routeKey="leave"><LeavePage /></RoleRoute>} />
            <Route path="compliance" element={<RoleRoute routeKey="compliance"><CompliancePage /></RoleRoute>} />
            <Route path="reports" element={<RoleRoute routeKey="reports"><ReportsPage /></RoleRoute>} />
            <Route path="settings" element={<RoleRoute routeKey="settings"><SettingsPage /></RoleRoute>} />
            <Route path="exit" element={<RoleRoute routeKey="exit"><ExitPage /></RoleRoute>} />
            <Route path="calendar" element={<RoleRoute routeKey="calendar"><CalendarPage /></RoleRoute>} />
            <Route path="attendance" element={<RoleRoute routeKey="attendance"><AttendancePage /></RoleRoute>} />
            <Route path="performance" element={<RoleRoute routeKey="performance"><PerformancePage /></RoleRoute>} />
            <Route path="org-chart" element={<RoleRoute routeKey="org-chart"><OrgChartPage /></RoleRoute>} />
            <Route path="audit" element={<RoleRoute routeKey="audit"><AuditLogPage /></RoleRoute>} />
            <Route path="notifications" element={<RoleRoute routeKey="notifications"><NotificationsPage /></RoleRoute>} />
            <Route path="my/login-history" element={<RoleRoute routeKey="my/login-history"><LoginHistoryPage /></RoleRoute>} />
            <Route path="my/account" element={<RoleRoute routeKey="my/account"><MyAccountPage /></RoleRoute>} />
            <Route path="my/leave" element={<RoleRoute routeKey="my/leave"><MyLeavePage /></RoleRoute>} />
            <Route path="my/payslips" element={<RoleRoute routeKey="my/payslips"><MyPayslipsPage /></RoleRoute>} />
            <Route path="my/profile" element={<RoleRoute routeKey="my/profile"><MyProfilePage /></RoleRoute>} />
            <Route path="assets" element={<RoleRoute routeKey="assets"><AssetsPage /></RoleRoute>} />
            <Route path="organizations" element={<RoleRoute routeKey="organizations"><OrganizationsPage /></RoleRoute>} />
            <Route path="team" element={<RoleRoute routeKey="team"><TeamPage /></RoleRoute>} />
            <Route path="users" element={<RoleRoute routeKey="users"><UsersPage /></RoleRoute>} />
            <Route path="apps" element={<RoleRoute routeKey="apps"><ConnectedAppsPage /></RoleRoute>} />
            <Route path="apps/:id" element={<RoleRoute routeKey="apps"><AppDetailPage /></RoleRoute>} />
            <Route path="leave-policies" element={<RoleRoute routeKey="leave-policies"><LeavePoliciesPage /></RoleRoute>} />
            <Route path="organization-settings" element={<RoleRoute routeKey="organization-settings"><OrganizationSettingsPage /></RoleRoute>} />
            <Route path="subscription" element={<RoleRoute routeKey="subscription"><SubscriptionPage /></RoleRoute>} />
            <Route path="complaints" element={<RoleRoute routeKey="complaints"><ComplaintsPage /></RoleRoute>} />
            <Route path="my/complaints" element={<RoleRoute routeKey="my/complaints"><MyComplaintsPage /></RoleRoute>} />
            <Route path="training" element={<RoleRoute routeKey="training"><TrainingPage /></RoleRoute>} />
            <Route path="my/training" element={<RoleRoute routeKey="my/training"><MyTrainingPage /></RoleRoute>} />
            <Route path="loans" element={<RoleRoute routeKey="loans"><LoansPage /></RoleRoute>} />
            <Route path="my/loans" element={<RoleRoute routeKey="my/loans"><MyLoansPage /></RoleRoute>} />
            <Route path="leave-adjustments" element={<RoleRoute routeKey="leave-adjustments"><LeaveAdjustmentsPage /></RoleRoute>} />
          </Route>
          {/* Public onboarding upload — no auth, no AppLayout */}
          <Route path="onboarding/upload/:token" element={<OnboardingUploadPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  )
}
