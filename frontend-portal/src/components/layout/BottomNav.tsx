import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    Calendar,
    FileCheck2,
    FileText,
    Home,
    MoreHorizontal,
    Receipt,
    ShieldCheck,
    Sparkles,
    Users,
    Clock,
    ListChecks,
} from 'lucide-react'

import { useViewModeStore } from '@/store/viewModeStore'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type NavItem = { to: string; label: string; icon: typeof Home }

// Primary tabs render as the persistent bottom row. The overflow goes into a
// "More" sheet so we never push past 5 visible slots — that's the cap before
// the row starts visibly cramping on small phones.
const EMPLOYEE_ITEMS: NavItem[] = [
    { to: ROUTES.employeeHome, label: 'nav.home', icon: Home },
    { to: ROUTES.employeeLeave, label: 'nav.leave', icon: Calendar },
    { to: ROUTES.employeePayslips, label: 'nav.payslips', icon: Receipt },
    { to: ROUTES.employeeAttendance, label: 'nav.attendance', icon: Clock },
]
// Profile intentionally omitted — it lives in the avatar dropdown in TopBar,
// which is the consistent entry point for personal/account screens. Listing
// it in two places would dilute that convention.
const EMPLOYEE_MORE: NavItem[] = [
    { to: ROUTES.employeeDocuments, label: 'nav.documents', icon: FileText },
    { to: ROUTES.employeePerformance, label: 'nav.performance', icon: Sparkles },
]

const MANAGER_ITEMS: NavItem[] = [
    { to: ROUTES.managerHome, label: 'nav.home', icon: Home },
    { to: ROUTES.managerMembers, label: 'nav.team', icon: Users },
    { to: ROUTES.managerApprovals, label: 'nav.approvals', icon: ListChecks },
    { to: ROUTES.managerAttendance, label: 'nav.attendance', icon: Clock },
]
const MANAGER_MORE: NavItem[] = [
    { to: ROUTES.managerDocumentApprovals, label: 'nav.documents', icon: FileCheck2 },
    { to: ROUTES.managerCalendar, label: 'nav.calendar', icon: Calendar },
    { to: ROUTES.managerProfileApprovals, label: 'nav.profileChanges', icon: ShieldCheck },
]

export function BottomNav() {
    const { t } = useTranslation()
    const mode = useViewModeStore((s) => s.mode)
    const { pathname } = useLocation()
    const navigate = useNavigate()
    const items = mode === 'manager' ? MANAGER_ITEMS : EMPLOYEE_ITEMS
    const moreItems = mode === 'manager' ? MANAGER_MORE : EMPLOYEE_MORE

    const moreActive = moreItems.some((m) => pathname === m.to || pathname.startsWith(m.to + '/'))

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
                                                'flex size-7 items-center justify-center rounded-lg transition-all',
                                                isActive && 'bg-primary/15',
                                            )}
                                        >
                                            <Icon className="size-[18px]" />
                                        </span>
                                        <span className="leading-none">{t(item.label)}</span>
                                    </>
                                )}
                            </NavLink>
                        </li>
                    )
                })}

                {/* Overflow — keeps the rest of the screens reachable on mobile
                    without exceeding the 5-slot visual limit. */}
                <li className="flex-1">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button
                                type="button"
                                aria-label={t('common.more', { defaultValue: 'More' })}
                                className={cn(
                                    'flex w-full flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium transition-colors',
                                    moreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                <span
                                    className={cn(
                                        'flex size-7 items-center justify-center rounded-lg transition-all',
                                        moreActive && 'bg-primary/15',
                                    )}
                                >
                                    <MoreHorizontal className="size-[18px]" />
                                </span>
                                <span className="leading-none">{t('common.more', { defaultValue: 'More' })}</span>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={12} className="w-44">
                            {moreItems.map((m) => {
                                const Icon = m.icon
                                return (
                                    <DropdownMenuItem
                                        key={m.to}
                                        onSelect={() => navigate(m.to)}
                                        className="gap-2.5"
                                    >
                                        <Icon className="size-4 text-muted-foreground" />
                                        <span>{t(m.label)}</span>
                                    </DropdownMenuItem>
                                )
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </li>
            </ul>
        </nav>
    )
}
