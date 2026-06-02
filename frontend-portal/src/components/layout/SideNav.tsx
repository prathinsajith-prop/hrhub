import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    Calendar,
    ClipboardCheck,
    FileCheck2,
    FileText,
    Home,
    ListChecks,
    Receipt,
    ShieldCheck,
    Sparkles,
    Users,
    Clock,
    UserPlus,
    Megaphone,
} from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { useViewModeStore } from '@/store/viewModeStore'
import { canSwitchToManager } from '@/lib/permissions'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

type NavItem = { to: string; label: string; icon: typeof Home; end?: boolean }

const PERSONAL_ITEMS: NavItem[] = [
    { to: ROUTES.employeeHome, label: 'nav.home', icon: Home, end: true },
    { to: ROUTES.employeeAnnouncements, label: 'nav.announcements', icon: Megaphone },
    { to: ROUTES.employeeLeave, label: 'nav.leave', icon: Calendar },
    { to: ROUTES.employeePayslips, label: 'nav.payslips', icon: Receipt },
    { to: ROUTES.employeeAttendance, label: 'nav.attendance', icon: Clock },
    { to: ROUTES.employeeDocuments, label: 'nav.documents', icon: FileText },
    { to: ROUTES.employeePerformance, label: 'nav.performance', icon: Sparkles },
    { to: ROUTES.employeeReferrals, label: 'nav.referrals', icon: UserPlus },
    // Profile lives in the TopBar avatar dropdown — single source of truth
    // for personal/account screens. Don't surface it here too.
]

const TEAM_ITEMS: NavItem[] = [
    { to: ROUTES.managerHome, label: 'nav.home', icon: Home, end: true },
    { to: ROUTES.managerMembers, label: 'nav.team', icon: Users },
    { to: ROUTES.managerApprovals, label: 'nav.approvals', icon: ListChecks },
    { to: ROUTES.managerDocumentApprovals, label: 'nav.documents', icon: FileCheck2 },
    { to: ROUTES.managerProfileApprovals, label: 'nav.profileChanges', icon: ShieldCheck },
    { to: ROUTES.managerAttendance, label: 'nav.attendance', icon: Clock },
    { to: ROUTES.managerCalendar, label: 'nav.calendar', icon: ClipboardCheck },
]

export function SideNav() {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const mode = useViewModeStore((s) => s.mode)
    const inPersonalMode = !(mode === 'manager' && canSwitchToManager(user))
    const items: NavItem[] = inPersonalMode ? PERSONAL_ITEMS : TEAM_ITEMS

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
                            <Icon className="size-4" />
                            <span className="flex-1">{t(item.label, { defaultValue: item.label.split('.').pop() })}</span>
                        </NavLink>
                    )
                })}
            </nav>
        </aside>
    )
}
