import { NavLink, Outlet, Navigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Megaphone, Trophy } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { canAccessRouteForRoles } from '@/lib/permissions'
import { cn } from '@/lib/utils'
import type { UserRole } from '@/types'

/**
 * Resolve the signed-in user's effective roles (multi-role aware, falling back
 * to the single `role`). Shared by the layout and the index redirect.
 */
function useRoles(): UserRole[] {
    const role = useAuthStore((s) => s.user?.role) as UserRole | undefined
    const rawRoles = useAuthStore((s) => s.user?.roles)
    return (rawRoles?.length ? rawRoles : role ? [role] : []) as UserRole[]
}

/**
 * "Engage" hub shell. Renders a tab bar (Announcements · Recognition, filtered
 * by the user's permissions) above the active page via <Outlet/>. The two tabs
 * keep their original URLs (`/announcements`, `/recognition/*`) so notification
 * deep-links and previously shared links continue to work — this layout simply
 * wraps them with shared sub-navigation. Recognition's leaderboard/admin/detail
 * routes live under the Recognition tab and keep it highlighted.
 */
export function EngageLayout() {
    const { t } = useTranslation()
    const { pathname } = useLocation()
    const roles = useRoles()

    const tabs = [
        canAccessRouteForRoles(roles, 'announcements') && {
            to: '/announcements',
            label: t('nav.announcements', { defaultValue: 'Announcements' }),
            icon: Megaphone,
            active: pathname.startsWith('/announcements'),
        },
        canAccessRouteForRoles(roles, 'recognition') && {
            to: '/recognition',
            label: t('nav.recognition', { defaultValue: 'Recognition' }),
            icon: Trophy,
            active: pathname.startsWith('/recognition'),
        },
    ].filter(Boolean) as Array<{ to: string; label: string; icon: typeof Megaphone; active: boolean }>

    return (
        <div className="space-y-4 page-slide-up">
            <div className="border-b border-border">
                <nav className="-mb-px flex gap-1" aria-label={t('engage.title', { defaultValue: 'Engage' })}>
                    {tabs.map((tab) => (
                        <NavLink
                            key={tab.to}
                            to={tab.to}
                            className={cn(
                                'inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                                tab.active
                                    ? 'border-primary text-foreground'
                                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                            )}
                        >
                            <tab.icon className="size-4" />
                            {tab.label}
                        </NavLink>
                    ))}
                </nav>
            </div>
            <Outlet />
        </div>
    )
}

/**
 * Landing redirect for `/engage`. Sends the user to the first tab they can
 * access — Announcements for HR/admins, Recognition for everyone else.
 */
export function EngageIndexRedirect() {
    const roles = useRoles()
    if (canAccessRouteForRoles(roles, 'announcements')) return <Navigate to="/announcements" replace />
    if (canAccessRouteForRoles(roles, 'recognition')) return <Navigate to="/recognition" replace />
    return <Navigate to="/dashboard" replace />
}
