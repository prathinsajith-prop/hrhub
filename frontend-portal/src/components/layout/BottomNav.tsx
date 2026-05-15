import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Calendar, ClipboardCheck, Home, Receipt, User, Users, Clock, ListChecks } from 'lucide-react'
import { useViewModeStore } from '@/store/viewModeStore'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

type NavItem = { to: string; label: string; icon: typeof Home }

const EMPLOYEE_ITEMS: NavItem[] = [
    { to: ROUTES.employeeHome, label: 'nav.home', icon: Home },
    { to: ROUTES.employeeLeave, label: 'nav.leave', icon: Calendar },
    { to: ROUTES.employeePayslips, label: 'nav.payslips', icon: Receipt },
    { to: ROUTES.employeeAttendance, label: 'nav.attendance', icon: Clock },
    { to: ROUTES.employeeProfile, label: 'nav.profile', icon: User },
]

const MANAGER_ITEMS: NavItem[] = [
    { to: ROUTES.managerHome, label: 'nav.home', icon: Home },
    { to: ROUTES.managerMembers, label: 'nav.team', icon: Users },
    { to: ROUTES.managerApprovals, label: 'nav.approvals', icon: ListChecks },
    { to: ROUTES.managerCalendar, label: 'nav.calendar', icon: ClipboardCheck },
]

export function BottomNav() {
    const { t } = useTranslation()
    const mode = useViewModeStore((s) => s.mode)
    const items = mode === 'manager' ? MANAGER_ITEMS : EMPLOYEE_ITEMS

    return (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/85 px-2 pb-[env(safe-area-inset-bottom)] pt-1.5 backdrop-blur-xl md:hidden">
            <ul className="mx-auto flex max-w-md items-stretch justify-around gap-1">
                {items.map((item) => {
                    const Icon = item.icon
                    return (
                        <li key={item.to} className="flex-1">
                            <NavLink
                                end={item.to === ROUTES.employeeHome || item.to === ROUTES.managerHome}
                                to={item.to}
                                className={({ isActive }) =>
                                    cn(
                                        'flex flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors',
                                        isActive
                                            ? 'text-primary'
                                            : 'text-muted-foreground hover:text-foreground',
                                    )
                                }
                            >
                                {({ isActive }) => (
                                    <>
                                        <span
                                            className={cn(
                                                'flex h-7 w-7 items-center justify-center rounded-lg transition-all',
                                                isActive && 'bg-primary/15',
                                            )}
                                        >
                                            <Icon className="h-[18px] w-[18px]" />
                                        </span>
                                        <span className="leading-none">{t(item.label)}</span>
                                    </>
                                )}
                            </NavLink>
                        </li>
                    )
                })}
            </ul>
        </nav>
    )
}
