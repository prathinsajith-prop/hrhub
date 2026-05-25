import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { ROUTES } from '@/lib/routes'

const APP_NAME = 'HRHub Portal'

/**
 * Maps a pathname to the i18n key used for the browser-tab title.
 * Exact-match routes are tried first; falls back to prefix-match for nested paths
 * (e.g. /team/members/:id → "Team member") and finally to the app name only.
 */
function resolveTitleKey(pathname: string): string | null {
    // Exact matches first
    const exact: Record<string, string> = {
        [ROUTES.login]: 'auth.welcomeBack',
        [ROUTES.forgotPassword]: 'auth.forgotTitle',
        [ROUTES.resetPassword]: 'auth.resetTitle',
        [ROUTES.notAuthorized]: 'notAuthorized.title',
        [ROUTES.notifications]: 'notifications.title',
        [ROUTES.employeeHome]: 'nav.home',
        [ROUTES.employeeProfile]: 'nav.profile',
        [ROUTES.employeeLeave]: 'leave.title',
        [ROUTES.employeePayslips]: 'payslips.title',
        [ROUTES.employeeAttendance]: 'attendance.title',
        [ROUTES.employeeDocuments]: 'nav.documents',
        [ROUTES.employeeExitInterview]: 'nav.exitInterview',
        [ROUTES.managerHome]: 'nav.home',
        [ROUTES.managerMembers]: 'team.title',
        [ROUTES.managerApprovals]: 'team.pendingApprovals',
        [ROUTES.managerCalendar]: 'team.calendarTitle',
    }
    if (exact[pathname]) return exact[pathname]

    // Prefix matches for dynamic segments (e.g. /team/members/:id)
    if (pathname.startsWith('/team/members/')) return 'team.members'
    return null
}

/**
 * Watches the route and keeps `document.title` in sync with the page label.
 * Format: "<Page> · HRHub Portal" (just "HRHub Portal" for the root/unknown routes).
 */
export function RouteTitle() {
    const { t, i18n } = useTranslation()
    const { pathname } = useLocation()

    useEffect(() => {
        const key = resolveTitleKey(pathname)
        const label = key ? t(key) : null
        document.title = label ? `${label} · ${APP_NAME}` : APP_NAME
        // Also keep <html lang> in sync — i18n.ts already handles initial direction,
        // but a fresh nav doesn't trigger a language change so we re-apply here.
        document.documentElement.lang = i18n.language?.slice(0, 2) ?? 'en'
    }, [pathname, t, i18n.language])

    return null
}
