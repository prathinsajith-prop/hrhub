import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import {
    ArrowRight,
    Bell,
    Calendar,
    CalendarDays,
    CalendarRange,
    ClipboardCheck,
    ExternalLink,
    Link2,
    MapPin,
    Plane,
    Receipt,
    Sparkles,
    User,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CompactEmptyState as EmptyState } from '@/components/shared/EmptyState'
import { useAuthStore } from '@/store/authStore'
import { useLeaveBalance, useLeaveRequests } from '@/hooks/useLeave'
import { useMyChangeRequests } from '@/hooks/useProfileChanges'
import { useUnreadNotificationsCount } from '@/hooks/useNotifications'
import { useMyPayslips } from '@/hooks/usePayslips'
import { useMyEmployee } from '@/hooks/useMe'
import { ROUTES } from '@/lib/routes'
import { cn, formatCurrency, formatDate, monthName } from '@/lib/utils'
import { LeaveUsageChart, PayslipTrendChart } from '@/components/shared/EmployeeCharts'
import { GlassCard } from '@/components/shared/GlassCard'
import { MyTeamsCard } from '@/components/shared/MyTeamsCard'
import { AssignedAssetsCard } from '@/components/shared/AssignedAssetsCard'

interface UpcomingLeaveLite {
    id: string
    startDate: string
    endDate: string
    leaveType: string
    status?: string | null
}

/**
 * Employee Reports — a dashboard of insights and personal-context widgets
 * separated from the day-to-day Home page. Layout flows from broad insights
 * (charts) → personal pending items → team context.
 */
export function EmployeeReportsPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const employeeId = useAuthStore((s) => s.user?.employeeId) ?? undefined

    const { data: me } = useMyEmployee()
    const { data: balance, isLoading: balanceLoading } = useLeaveBalance(me?.id)
    const { data: payslips } = useMyPayslips()
    const latestSlip = payslips?.[0]
    const { data: leaveList } = useLeaveRequests({ employeeId, limit: 50 })
    const { data: myChanges } = useMyChangeRequests()
    const { data: unreadCount } = useUnreadNotificationsCount()

    const today = new Date().toISOString().slice(0, 10)

    const annualBalance = balance?.balance?.annual
    const pendingLeaveCount = leaveList?.data.filter((l) => l.status === 'pending').length ?? 0
    const pendingProfileChangeCount = myChanges?.filter((c) => c.status === 'pending').length ?? 0
    const unread = unreadCount ?? 0
    const openTasksTotal = pendingLeaveCount + pendingProfileChangeCount + unread

    const upcomingMyLeaves = ((leaveList?.data ?? []) as UpcomingLeaveLite[])
        .filter((l) => (l.status === 'approved' || l.status === 'pending') && l.startDate >= today)
        .slice(0, 5)

    return (
        <div className="space-y-6">
            <header>
                <p className="text-sm text-muted-foreground">{t('home.systemNotification')}</p>
                <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                    {t('nav.reports')}
                </h1>
            </header>

            {/* ── KPI stat cards ── */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    tone="primary"
                    icon={<Calendar className="size-4" />}
                    label={t('home.leaveBalance')}
                    accent="indigo"
                >
                    {balanceLoading ? (
                        <Skeleton className="mt-1 h-10 w-32" />
                    ) : (
                        <div className="flex items-baseline gap-3">
                            <div className="font-display text-4xl font-bold tabular-figures text-foreground">
                                {annualBalance ? Math.round(annualBalance.available) : 0}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                <span className="block">{t('home.available')}</span>
                                <span className="block">
                                    {annualBalance ? Math.round(annualBalance.taken) : 0} {t('home.taken')}
                                </span>
                            </div>
                        </div>
                    )}
                    <FooterLink to={ROUTES.employeeLeave} accent="indigo">
                        {pendingLeaveCount > 0 ? `${pendingLeaveCount} pending` : t('home.requestLeave')}
                    </FooterLink>
                </StatCard>

                <StatCard
                    tone="success"
                    icon={<Receipt className="size-4" />}
                    label={t('home.nextPayslip')}
                    accent="emerald"
                >
                    {latestSlip ? (
                        <div className="flex items-baseline gap-3">
                            <div className="font-display text-2xl font-bold tabular-figures text-foreground sm:text-3xl">
                                {formatCurrency(latestSlip.netSalary)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                                {monthName(latestSlip.month)} {latestSlip.year}
                            </div>
                        </div>
                    ) : (
                        <div className="text-sm text-muted-foreground">Not yet available</div>
                    )}
                    <FooterLink to={ROUTES.employeePayslips} accent="emerald">
                        {t('home.viewPayslips')}
                    </FooterLink>
                </StatCard>
            </div>

            {/* ── Charts row ── */}
            <div className="grid gap-4 lg:grid-cols-2">
                <LeaveUsageChart balance={annualBalance} />
                <PayslipTrendChart payslips={payslips ?? []} />
            </div>

            {/* ── Personal pending items row ── */}
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border/70">
                    <CardContent className="p-5 sm:p-6">
                        <h2 className="mb-4 font-display text-base font-semibold text-foreground">
                            {t('home.importantLinks')}
                        </h2>
                        <EmptyState icon={Link2} message={t('home.noLinksAvailable')} />
                    </CardContent>
                </Card>

                <Card className="border-border/70">
                    <CardContent className="p-5 sm:p-6">
                        <h2 className="mb-4 font-display text-base font-semibold text-foreground">
                            {t('home.openTasks')}
                        </h2>
                        {openTasksTotal === 0 ? (
                            <EmptyState icon={Sparkles} message={t('home.noPendingTask')} />
                        ) : (
                            <ul className="-mx-1 divide-y divide-border/60">
                                {pendingLeaveCount > 0 ? (
                                    <TaskRow
                                        icon={CalendarDays}
                                        iconClass="text-amber-500"
                                        label={t(
                                            pendingLeaveCount === 1
                                                ? 'home.pendingLeaveRequestOne'
                                                : 'home.pendingLeaveRequestOther',
                                            { count: pendingLeaveCount },
                                        )}
                                        onClick={() => navigate(ROUTES.employeeLeave)}
                                    />
                                ) : null}
                                {pendingProfileChangeCount > 0 ? (
                                    <TaskRow
                                        icon={User}
                                        iconClass="text-sky-500"
                                        label={t(
                                            pendingProfileChangeCount === 1
                                                ? 'home.pendingProfileChangeOne'
                                                : 'home.pendingProfileChangeOther',
                                            { count: pendingProfileChangeCount },
                                        )}
                                        onClick={() => navigate(ROUTES.employeeProfile)}
                                    />
                                ) : null}
                                {unread > 0 ? (
                                    <TaskRow
                                        icon={Bell}
                                        iconClass="text-indigo-500"
                                        label={t(
                                            unread === 1
                                                ? 'home.unreadNotificationsOne'
                                                : 'home.unreadNotificationsOther',
                                            { count: unread },
                                        )}
                                        onClick={() => navigate(ROUTES.notifications)}
                                    />
                                ) : null}
                            </ul>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ── Who is out? (full width) ── */}
            <Card className="border-border/70">
                <CardContent className="p-5 sm:p-6">
                    <WhoIsOutContent
                        upcomingLeaves={upcomingMyLeaves}
                        onViewAll={() => navigate(ROUTES.employeeLeave)}
                    />
                </CardContent>
            </Card>

            {/* ── Tasks & interviews row ── */}
            <div className="grid gap-4 lg:grid-cols-2">
                <Card className="border-border/70">
                    <CardContent className="p-5 sm:p-6">
                        <h2 className="mb-4 font-display text-base font-semibold text-foreground">
                            {t('home.toDos')}
                        </h2>
                        <EmptyState icon={ClipboardCheck} message={t('home.noPendingToDo')} />
                    </CardContent>
                </Card>

                <Card className="border-border/70">
                    <CardContent className="p-5 sm:p-6">
                        <h2 className="mb-4 font-display text-base font-semibold text-foreground">
                            {t('home.interviews')}
                        </h2>
                        <EmptyState icon={CalendarRange} message={t('home.noInterviewsScheduled')} />
                    </CardContent>
                </Card>
            </div>

            {/* ── Team context row ──
                Department birthdays moved to the home page right rail
                (after Open Tasks) so the people-signals live where
                employees look for them. Reports now keeps a single
                MyTeams card here — full width — and the assets card
                below. */}
            <MyTeamsCard variant="me" />
            <AssignedAssetsCard variant="me" />
        </div>
    )
}

// `EmptyState` was previously a private duplicate of the shared
// `CompactEmptyState`. Now imported above as `EmptyState` via alias,
// keeping all call sites in this file unchanged.

function TaskRow({
    icon: Icon,
    iconClass,
    label,
    onClick,
}: {
    icon: React.ElementType
    iconClass?: string
    label: string
    onClick: () => void
}) {
    return (
        <li>
            <button
                type="button"
                onClick={onClick}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent/50"
            >
                <Icon className={cn('size-4 shrink-0', iconClass)} />
                <span className="flex-1 text-sm">{label}</span>
                <ExternalLink className="size-3.5 text-muted-foreground" data-rtl-flip />
            </button>
        </li>
    )
}

function WhoIsOutContent({
    upcomingLeaves,
    onViewAll,
}: {
    upcomingLeaves: UpcomingLeaveLite[]
    onViewAll: () => void
}) {
    const { t } = useTranslation()
    const [tab, setTab] = useState<'leave' | 'remote'>('leave')

    return (
        <>
            <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-foreground">
                    {t('home.whoIsOut')}
                </h2>
                <button
                    type="button"
                    onClick={onViewAll}
                    className="text-xs font-medium text-primary hover:underline"
                >
                    {t('home.viewAll')}
                </button>
            </div>

            <div className="mb-4 grid w-full grid-cols-2 rounded-full bg-muted/50 p-1 sm:max-w-md">
                <button
                    type="button"
                    onClick={() => setTab('leave')}
                    className={cn(
                        'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                        tab === 'leave'
                            ? 'bg-sky-500 text-white shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    <Plane className="size-3.5" />
                    {t('home.leaveTab')}
                </button>
                <button
                    type="button"
                    onClick={() => setTab('remote')}
                    className={cn(
                        'inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                        tab === 'remote'
                            ? 'bg-sky-500 text-white shadow-sm'
                            : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    <MapPin className="size-3.5" />
                    {t('home.remoteTab')}
                </button>
            </div>

            <div className="space-y-3 text-sm">
                <WhoIsOutRow label={t('home.today')} count={0} />
                <WhoIsOutRow label={t('home.tomorrow')} count={0} />
                <WhoIsOutRow label={t('home.dayAfterTomorrow')} count={0} />
            </div>

            <div className="mt-5 border-t border-border/60 pt-4">
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('home.myUpcomingLeaves')}
                </h3>
                {upcomingLeaves.length === 0 ? (
                    <EmptyState icon={CalendarDays} message={t('home.noUpcomingLeaves')} />
                ) : (
                    <ul className="space-y-2">
                        {upcomingLeaves.map((l) => (
                            <li
                                key={l.id}
                                className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs"
                            >
                                <span className="font-medium capitalize text-foreground">{l.leaveType}</span>
                                <span className="text-muted-foreground">
                                    {formatDate(l.startDate)} → {formatDate(l.endDate)}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </>
    )
}

function WhoIsOutRow({ label, count }: { label: string; count: number }) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-sm text-foreground">
                {label} <span className="text-muted-foreground">({count})</span>
            </span>
            <span className="text-xs text-muted-foreground">—</span>
        </div>
    )
}

const ACCENT_CLASSES = {
    indigo: {
        label: 'text-indigo-700/80 dark:text-indigo-300/80',
        icon: 'text-indigo-700/70 dark:text-indigo-300/70',
        link: 'text-indigo-700 dark:text-indigo-300',
    },
    emerald: {
        label: 'text-emerald-700/80 dark:text-emerald-300/80',
        icon: 'text-emerald-700/70 dark:text-emerald-300/70',
        link: 'text-emerald-700 dark:text-emerald-300',
    },
} as const

type Accent = keyof typeof ACCENT_CLASSES

function StatCard({
    tone,
    icon,
    label,
    accent,
    children,
}: {
    tone: 'primary' | 'success' | 'warning' | 'default'
    icon: React.ReactNode
    label: string
    accent: Accent
    children: React.ReactNode
}) {
    return (
        <GlassCard tone={tone} className="flex flex-col gap-3 p-5">
            <div className="flex items-center justify-between">
                <div className={cn('text-[11px] font-semibold uppercase tracking-wider', ACCENT_CLASSES[accent].label)}>
                    {label}
                </div>
                <span className={ACCENT_CLASSES[accent].icon}>{icon}</span>
            </div>
            {children}
        </GlassCard>
    )
}

function FooterLink({ to, accent, children }: { to: string; accent: Accent; children: React.ReactNode }) {
    return (
        <Link
            to={to}
            className={cn(
                'inline-flex items-center gap-1 text-xs font-medium hover:underline',
                ACCENT_CLASSES[accent].link,
            )}
        >
            {children} <ArrowRight className="size-3" data-rtl-flip />
        </Link>
    )
}
