import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { useViewModeStore } from '@/store/viewModeStore'
import { canSwitchToManager, canUsePortal, isAdminRoleOnly } from '@/lib/permissions'
import { ROUTES } from '@/lib/routes'

import { LoginPage } from '@/pages/LoginPage'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { NotAuthorizedPage } from '@/pages/NotAuthorizedPage'
import { AppShell } from '@/components/layout/AppShell'
import { RouteTitle } from '@/components/RouteTitle'

// Lazy-loaded — each route is its own chunk so the login bundle stays small.
// Vite splits these into their own JS files automatically; React Router renders
// the Suspense fallback while a chunk downloads (typically <50ms on a warm cache).
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage').then((m) => ({ default: m.NotificationsPage })))
const EmployeeHomePage = lazy(() => import('@/pages/employee/HomePage').then((m) => ({ default: m.EmployeeHomePage })))
const EmployeeProfilePage = lazy(() => import('@/pages/employee/ProfilePage').then((m) => ({ default: m.EmployeeProfilePage })))
const EmployeeLeavePage = lazy(() => import('@/pages/employee/LeavePage').then((m) => ({ default: m.EmployeeLeavePage })))
const EmployeePayslipsPage = lazy(() => import('@/pages/employee/PayslipsPage').then((m) => ({ default: m.EmployeePayslipsPage })))
const EmployeeAttendancePage = lazy(() => import('@/pages/employee/AttendancePage').then((m) => ({ default: m.EmployeeAttendancePage })))

const ManagerHomePage = lazy(() => import('@/pages/manager/HomePage').then((m) => ({ default: m.ManagerHomePage })))
const ManagerTeamPage = lazy(() => import('@/pages/manager/TeamPage').then((m) => ({ default: m.ManagerTeamPage })))
const ManagerMemberDetailPage = lazy(() => import('@/pages/manager/MemberDetailPage').then((m) => ({ default: m.ManagerMemberDetailPage })))
const ManagerApprovalsPage = lazy(() => import('@/pages/manager/ApprovalsPage').then((m) => ({ default: m.ManagerApprovalsPage })))
const ManagerTeamCalendarPage = lazy(() => import('@/pages/manager/TeamCalendarPage').then((m) => ({ default: m.ManagerTeamCalendarPage })))

function PageFallback() {
    return (
        <div className="flex h-[50vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
    )
}

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
                        <Suspense fallback={<PageFallback />}>
                            <AppShell />
                        </Suspense>
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
