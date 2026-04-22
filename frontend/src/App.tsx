import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { EmployeesPage } from '@/pages/employees/EmployeesPage'
import { EmployeeDetailPage } from '@/pages/employees/EmployeeDetailPage'
import { RecruitmentPage } from '@/pages/recruitment/RecruitmentPage'
import { CandidateProfilePage } from '@/pages/recruitment/CandidateProfilePage'
import { VisaPage } from '@/pages/visa/VisaPage'
import { VisaDetailPage } from '@/pages/visa/VisaDetailPage'
import { DocumentsPage } from '@/pages/documents/DocumentsPage'
import { PayrollPage } from '@/pages/payroll/PayrollPage'
import { LeavePage, OnboardingPage, CompliancePage, ReportsPage } from '@/pages/misc/Pages'
import { SettingsPage } from '@/pages/settings/SettingsPage'
import { ExitPage } from '@/pages/employees/ExitPage'
import { AttendancePage } from '@/pages/attendance/AttendancePage'
import { PerformancePage } from '@/pages/performance/PerformancePage'
import { OrgChartPage } from '@/pages/employees/OrgChartPage'
import { AuditLogPage } from '@/pages/misc/AuditLogPage'
import { LoginHistoryPage } from '@/pages/misc/LoginHistoryPage'
import { Toaster } from '@/components/ui/overlays'
import { useAuthStore } from '@/store/authStore'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
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
          <Route path="my/login-history" element={<LoginHistoryPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <Toaster />
    </BrowserRouter>
  )
}
