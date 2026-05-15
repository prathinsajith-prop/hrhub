import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    Calendar,
    ClipboardCheck,
    Home,
    ListChecks,
    Receipt,
    User,
    Users,
    Clock,
} from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { useViewModeStore } from '@/store/viewModeStore'
import { canSwitchToManager } from '@/lib/permissions'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

type NavItem = { to: string; label: string; icon: typeof Home; end?: boolean }

const PERSONAL_ITEMS: NavItem[] = [
    { to: ROUTES.employeeHome, label: 'nav.home', icon: Home, end: true },
    { to: ROUTES.employeeLeave, label: 'nav.leave', icon: Calendar },
    { to: ROUTES.employeePayslips, label: 'nav.payslips', icon: Receipt },
    { to: ROUTES.employeeAttendance, label: 'nav.attendance', icon: Clock },
    { to: ROUTES.employeeProfile, label: 'nav.profile', icon: User },
]

const TEAM_ITEMS: NavItem[] = [
    { to: ROUTES.managerHome, label: 'nav.home', icon: Home, end: true },
    { to: ROUTES.managerMembers, label: 'nav.team', icon: Users },
    { to: ROUTES.managerApprovals, label: 'nav.approvals', icon: ListChecks },
    { to: ROUTES.managerCalendar, label: 'nav.calendar', icon: ClipboardCheck },
]

export function SideNav() {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const mode = useViewModeStore((s) => s.mode)

    // Pick the nav set that matches the active mode. Manager items only appear
    // when the user actually has dept_head and is currently in Manager view.
    const items = mode === 'manager' && canSwitchToManager(user) ? TEAM_ITEMS : PERSONAL_ITEMS

    return (
        <aside className="hidden w-60 shrink-0 md:block">
            <nav className="sticky top-24 space-y-0.5 pe-4">
                {items.map((item) => {
                    const Icon = item.icon
                    return (
                        <NavLink
                            key={item.to}
                            to={item.to}
                            end={item.end}
                            className={({ isActive }) =>
                                cn(
                                    'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                                    isActive
                                        ? 'bg-gradient-to-r from-indigo-50 to-sky-50 text-indigo-700 shadow-sm dark:from-indigo-950/50 dark:to-sky-950/30 dark:text-indigo-300'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                )
                            }
                        >
                            <Icon className="h-4 w-4" />
                            <span>{t(item.label)}</span>
                        </NavLink>
                    )
                })}
            </nav>
        </aside>
    )
}
