import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { Skeleton } from '@/components/ui/skeleton'

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
const EmployeeDocumentsPage = lazy(() => import('@/pages/employee/DocumentsPage').then((m) => ({ default: m.EmployeeDocumentsPage })))
const EmployeePerformancePage = lazy(() => import('@/pages/employee/PerformancePage').then((m) => ({ default: m.EmployeePerformancePage })))
const EmployeeReferralsPage = lazy(() => import('@/pages/employee/ReferralsPage').then((m) => ({ default: m.ReferralsPage })))
const EmployeeAnnouncementsPage = lazy(() => import('@/pages/employee/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage })))
// NOTE: the exit-interview pages were removed — the portal backend (port
// 4001) serves no exit/offboarding routes, so /my-exit and
// /exit-interview/by-token 404'd. The feature lives in the admin app only.
// Re-add here once backend-portal grows an exit module.

const ManagerHomePage = lazy(() => import('@/pages/manager/HomePage').then((m) => ({ default: m.ManagerHomePage })))
const ManagerTeamPage = lazy(() => import('@/pages/manager/TeamPage').then((m) => ({ default: m.ManagerTeamPage })))
const ManagerMemberDetailPage = lazy(() => import('@/pages/manager/MemberDetailPage').then((m) => ({ default: m.ManagerMemberDetailPage })))
const ManagerApprovalsPage = lazy(() => import('@/pages/manager/ApprovalsPage').then((m) => ({ default: m.ManagerApprovalsPage })))
const ManagerDocumentApprovalsPage = lazy(() => import('@/pages/manager/DocumentApprovalsPage').then((m) => ({ default: m.ManagerDocumentApprovalsPage })))
const ManagerTeamAttendancePage = lazy(() => import('@/pages/manager/TeamAttendancePage').then((m) => ({ default: m.ManagerTeamAttendancePage })))
const ManagerProfileApprovalsPage = lazy(() => import('@/pages/manager/ProfileApprovalsPage').then((m) => ({ default: m.ManagerProfileApprovalsPage })))
const ManagerTeamCalendarPage = lazy(() => import('@/pages/manager/TeamCalendarPage').then((m) => ({ default: m.ManagerTeamCalendarPage })))

/**
 * Suspense fallback shown while a lazy-loaded route chunk downloads. Mirrors the
 * generic page layout (header + content cards) so the transition reads as
 * "the page is loading" rather than "the app crashed".
 */
function PageFallback() {
    return (
        <div className="space-y-5 animate-fade-fast">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-2">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-8 w-48" />
                </div>
                <Skeleton className="h-9 w-32" />
            </div>
            <Skeleton className="h-32 w-full" />
            <div className="grid gap-4 sm:grid-cols-2">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
            </div>
            <div className="space-y-2">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
            </div>
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
                <Route path={ROUTES.employeeDocuments} element={<EmployeeDocumentsPage />} />
                <Route path={ROUTES.employeePerformance} element={<EmployeePerformancePage />} />
                <Route path={ROUTES.employeeReferrals} element={<EmployeeReferralsPage />} />
                <Route path={ROUTES.employeeAnnouncements} element={<EmployeeAnnouncementsPage />} />

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
                    path={ROUTES.managerDocumentApprovals}
                    element={
                        <ManagerGuard>
                            <ManagerDocumentApprovalsPage />
                        </ManagerGuard>
                    }
                />
                <Route
                    path={ROUTES.managerProfileApprovals}
                    element={
                        <ManagerGuard>
                            <ManagerProfileApprovalsPage />
                        </ManagerGuard>
                    }
                />
                <Route
                    path={ROUTES.managerAttendance}
                    element={
                        <ManagerGuard>
                            <ManagerTeamAttendancePage />
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
