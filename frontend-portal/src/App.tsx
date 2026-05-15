import { Navigate, Route, Routes } from 'react-router-dom'

import { useAuthStore } from '@/store/authStore'
import { useViewModeStore } from '@/store/viewModeStore'
import { canSwitchToManager, canUsePortal, isAdminRoleOnly } from '@/lib/permissions'
import { ROUTES } from '@/lib/routes'

import { LoginPage } from '@/pages/LoginPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { NotAuthorizedPage } from '@/pages/NotAuthorizedPage'
import { NotificationsPage } from '@/pages/NotificationsPage'
import { AppShell } from '@/components/layout/AppShell'
import { RouteTitle } from '@/components/RouteTitle'

import { EmployeeHomePage } from '@/pages/employee/HomePage'
import { EmployeeProfilePage } from '@/pages/employee/ProfilePage'
import { EmployeeLeavePage } from '@/pages/employee/LeavePage'
import { EmployeePayslipsPage } from '@/pages/employee/PayslipsPage'
import { EmployeeAttendancePage } from '@/pages/employee/AttendancePage'

import { ManagerHomePage } from '@/pages/manager/HomePage'
import { ManagerTeamPage } from '@/pages/manager/TeamPage'
import { ManagerMemberDetailPage } from '@/pages/manager/MemberDetailPage'
import { ManagerApprovalsPage } from '@/pages/manager/ApprovalsPage'
import { ManagerTeamCalendarPage } from '@/pages/manager/TeamCalendarPage'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
    const user = useAuthStore((s) => s.user)
    if (!isAuthenticated) return <Navigate to={ROUTES.login} replace />
    if (isAdminRoleOnly(user) || !canUsePortal(user)) return <Navigate to={ROUTES.notAuthorized} replace />
    return <>{children}</>
}

function ManagerGuard({ children }: { children: React.ReactNode }) {
    const user = useAuthStore((s) => s.user)
    if (!canSwitchToManager(user)) return <Navigate to={ROUTES.employeeHome} replace />
    return <>{children}</>
}

function RootRedirect() {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
    const user = useAuthStore((s) => s.user)
    const mode = useViewModeStore((s) => s.mode)

    if (!isAuthenticated) return <Navigate to={ROUTES.login} replace />
    if (isAdminRoleOnly(user)) return <Navigate to={ROUTES.notAuthorized} replace />
    if (mode === 'manager' && canSwitchToManager(user)) return <Navigate to={ROUTES.managerHome} replace />
    return <Navigate to={ROUTES.employeeHome} replace />
}

export default function App() {
    return (
        <>
            <RouteTitle />
            <Routes>
            <Route path={ROUTES.login} element={<LoginPage />} />
            <Route path={ROUTES.forgotPassword} element={<ForgotPasswordPage />} />
            <Route path={ROUTES.resetPassword} element={<ResetPasswordPage />} />
            <Route path={ROUTES.notAuthorized} element={<NotAuthorizedPage />} />

            <Route
                element={
                    <ProtectedRoute>
                        <AppShell />
                    </ProtectedRoute>
                }
            >
                {/* Employee mode */}
                <Route path={ROUTES.employeeHome} element={<EmployeeHomePage />} />
                <Route path={ROUTES.employeeProfile} element={<EmployeeProfilePage />} />
                <Route path={ROUTES.employeeLeave} element={<EmployeeLeavePage />} />
                <Route path={ROUTES.employeePayslips} element={<EmployeePayslipsPage />} />
                <Route path={ROUTES.employeeAttendance} element={<EmployeeAttendancePage />} />

                {/* Shared (both modes) */}
                <Route path={ROUTES.notifications} element={<NotificationsPage />} />

                {/* Manager mode (dept_head only) */}
                <Route
                    path={ROUTES.managerHome}
                    element={
                        <ManagerGuard>
                            <ManagerHomePage />
                        </ManagerGuard>
                    }
                />
                <Route
                    path={ROUTES.managerMembers}
                    element={
                        <ManagerGuard>
                            <ManagerTeamPage />
                        </ManagerGuard>
                    }
                />
                <Route
                    path={ROUTES.managerMemberDetail()}
                    element={
                        <ManagerGuard>
                            <ManagerMemberDetailPage />
                        </ManagerGuard>
                    }
                />
                <Route
                    path={ROUTES.managerApprovals}
                    element={
                        <ManagerGuard>
                            <ManagerApprovalsPage />
                        </ManagerGuard>
                    }
                />
                <Route
                    path={ROUTES.managerCalendar}
                    element={
                        <ManagerGuard>
                            <ManagerTeamCalendarPage />
                        </ManagerGuard>
                    }
                />
            </Route>

            <Route path="*" element={<RootRedirect />} />
            </Routes>
        </>
    )
}
