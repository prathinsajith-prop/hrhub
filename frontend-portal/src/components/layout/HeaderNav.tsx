import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    Briefcase,
    ClipboardCheck,
    FileCheck2,
    FileText,
    Home,
    ListChecks,
    MoreHorizontal,
    Receipt,
    ShieldCheck,
    Clock,
    Users,
} from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { useViewModeStore } from '@/store/viewModeStore'
import { canSwitchToManager } from '@/lib/permissions'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type NavItem = { to: string; label: string; icon: typeof Home; end?: boolean }

// Employees get a flat top nav. Home embeds the Feed/Overview/Announcements/
// Recognitions tabs and My Work embeds the Attendance/Leave/Schedule/
// Performance tabs, so those screens don't need their own entries. Referrals
// lives in the avatar dropdown (AccountMenu). No overflow needed → empty "More".
const PERSONAL_PRIMARY: NavItem[] = [
    { to: ROUTES.employeeHome, label: 'nav.home', icon: Home, end: true },
    { to: ROUTES.employeeWork, label: 'nav.myWork', icon: Briefcase },
    { to: ROUTES.employeePayslips, label: 'nav.payslips', icon: Receipt },
    { to: ROUTES.employeeDocuments, label: 'nav.documents', icon: FileText },
]

const PERSONAL_MORE: NavItem[] = []

const TEAM_PRIMARY: NavItem[] = [
    { to: ROUTES.managerHome, label: 'nav.home', icon: Home, end: true },
    { to: ROUTES.managerMembers, label: 'nav.team', icon: Users },
    { to: ROUTES.managerApprovals, label: 'nav.approvals', icon: ListChecks },
    { to: ROUTES.managerAttendance, label: 'nav.attendance', icon: Clock },
    { to: ROUTES.managerCalendar, label: 'nav.calendar', icon: ClipboardCheck },
]

const TEAM_MORE: NavItem[] = [
    { to: ROUTES.managerDocumentApprovals, label: 'nav.documents', icon: FileCheck2 },
    { to: ROUTES.managerProfileApprovals, label: 'nav.profileChanges', icon: ShieldCheck },
]

/**
 * Inline desktop navigation — primary items render as horizontal pills with
 * stacked icon + label. Less-used items collapse into a "More" dropdown.
 * Hidden on mobile (BottomNav handles that role).
 */
export function HeaderNav() {
    const user = useAuthStore((s) => s.user)
    const mode = useViewModeStore((s) => s.mode)
    const inPersonalMode = !(mode === 'manager' && canSwitchToManager(user))
    const primary = inPersonalMode ? PERSONAL_PRIMARY : TEAM_PRIMARY
    const more = inPersonalMode ? PERSONAL_MORE : TEAM_MORE

    return (
        <nav className="hidden min-w-0 flex-1 md:block" aria-label="Primary">
            <ul className="flex items-center justify-center gap-1">
                {primary.map((item) => (
                    <NavItemPill key={item.to} item={item} />
                ))}
                {more.length > 0 ? <MoreMenu items={more} /> : null}
            </ul>
        </nav>
    )
}

function NavItemPill({ item }: { item: NavItem }) {
    const { t } = useTranslation()
    const Icon = item.icon
    const label = t(item.label, { defaultValue: item.label.split('.').pop() })

    return (
        <li className="shrink-0">
            <NavLink
                to={item.to}
                end={item.end}
                title={label}
                className={({ isActive }) =>
                    cn(
                        'group relative flex min-w-[80px] flex-col items-center gap-1 rounded-lg px-2 py-1.5 transition-colors',
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
                                'flex size-9 items-center justify-center rounded-xl transition-all',
                                isActive
                                    ? 'bg-primary/10 ring-1 ring-primary/20'
                                    : 'group-hover:bg-muted/70',
                            )}
                        >
                            <Icon className="size-[18px]" />
                        </span>
                        <span className="text-[11px] font-medium leading-none">{label}</span>
                    </>
                )}
            </NavLink>
        </li>
    )
}

function MoreMenu({ items }: { items: NavItem[] }) {
    const { t } = useTranslation()
    const { pathname } = useLocation()
    const navigate = useNavigate()
    const activeInMore = items.some((m) => pathname === m.to || pathname.startsWith(m.to + '/'))
    const label = t('nav.more', { defaultValue: 'More' })

    return (
        <li className="shrink-0">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={label}
                        className={cn(
                            'group relative flex min-w-[80px] flex-col items-center gap-1 rounded-lg px-2 py-1.5 transition-colors',
                            activeInMore
                                ? 'text-primary'
                                : 'text-muted-foreground hover:text-foreground',
                        )}
                    >
                        <span
                            className={cn(
                                'flex size-9 items-center justify-center rounded-xl transition-all',
                                activeInMore
                                    ? 'bg-primary/10 ring-1 ring-primary/20'
                                    : 'group-hover:bg-muted/70',
                            )}
                        >
                            <MoreHorizontal className="size-[18px]" />
                        </span>
                        <span className="text-[11px] font-medium leading-none">{label}</span>
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-52">
                    {items.map((m) => {
                        const Icon = m.icon
                        return (
                            <DropdownMenuItem
                                key={m.to}
                                onSelect={() => navigate(m.to)}
                                className="gap-2.5"
                            >
                                <Icon className="size-4 text-muted-foreground" />
                                <span>{t(m.label, { defaultValue: m.label.split('.').pop() })}</span>
                            </DropdownMenuItem>
                        )
                    })}
                </DropdownMenuContent>
            </DropdownMenu>
        </li>
    )
}
