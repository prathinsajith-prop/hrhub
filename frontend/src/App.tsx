import React, { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Toaster } from '@/components/ui/overlays'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { useAuthStore } from '@/store/authStore'

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
// Misc pages bundle
const LeavePage = lazy(() => import('@/pages/misc/Pages').then(m => ({ default: m.LeavePage })))
const OnboardingPage = lazy(() => import('@/pages/misc/Pages').then(m => ({ default: m.OnboardingPage })))
const CompliancePage = lazy(() => import('@/pages/misc/Pages').then(m => ({ default: m.CompliancePage })))
const ReportsPage = lazy(() => import('@/pages/misc/Pages').then(m => ({ default: m.ReportsPage })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-32">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/" element={<ProtectedRoute><ErrorBoundary><AppLayout /></ErrorBoundary></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="employees" element={<EmployeesPage />} />
            <Route path="employees/:id" element={<EmployeeDetailPage />} />
            <Route path="recruitment" element={<RecruitmentPage />} />
            <Route path="recruitment/candidates/:id" element={<CandidateProfilePage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="visa" element={<VisaPage />} />
            <Route path="visa/:id" element={<VisaDetailPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="payroll" element={<PayrollPage />} />
            <Route path="leave" element={<LeavePage />} />
            <Route path="compliance" element={<CompliancePage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="exit" element={<ExitPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="performance" element={<PerformancePage />} />
            <Route path="org-chart" element={<OrgChartPage />} />
            <Route path="audit" element={<AuditLogPage />} />
            <Route path="notifications" element={<NotificationsPage />} />
            <Route path="my/login-history" element={<LoginHistoryPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  )
}
