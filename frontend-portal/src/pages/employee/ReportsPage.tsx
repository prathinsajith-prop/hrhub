import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Link } from 'react-router-dom'
import {
    ArrowRight,
    Bell,
    Calendar,
    CalendarDays,
    ExternalLink,
    Link2,
    Receipt,
    Sparkles,
    User,
} from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CompactEmptyState as EmptyState } from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/shared/PageHeader'
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
 * (charts) to personal pending items to team context.
 */
export function EmployeeReportsPage({ embedded = false }: { embedded?: boolean } = {}) {
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
            {!embedded && (
                <PageHeader
                    title={t('reports.title', { defaultValue: 'Overview' })}
                    subtitle={t('reports.subtitle', { defaultValue: 'Your personal insights and pending items' })}
                />
            )}

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
                        {pendingLeaveCount > 0
                            ? t(
                                  pendingLeaveCount === 1
                                      ? 'home.pendingLeaveRequestOne'
                                      : 'home.pendingLeaveRequestOther',
                                  { count: pendingLeaveCount },
                              )
                            : t('home.requestLeave')}
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
                        <div className="text-sm text-muted-foreground">
                            {t('reports.notYetAvailable', { defaultValue: 'Not yet available' })}
                        </div>
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
                                        iconClass="text-amber-600"
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

            {/* ── My upcoming leaves (full width) ── */}
            <Card className="border-border/70">
                <CardContent className="p-5 sm:p-6">
                    <UpcomingLeavesContent
                        upcomingLeaves={upcomingMyLeaves}
                        onViewAll={() => navigate(ROUTES.employeeLeave)}
                    />
                </CardContent>
            </Card>

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

function UpcomingLeavesContent({
    upcomingLeaves,
    onViewAll,
}: {
    upcomingLeaves: UpcomingLeaveLite[]
    onViewAll: () => void
}) {
    const { t } = useTranslation()

    return (
        <>
            <div className="mb-4 flex items-center justify-between">
                <h2 className="font-display text-base font-semibold text-foreground">
                    {t('home.myUpcomingLeaves')}
                </h2>
                <button
                    type="button"
                    onClick={onViewAll}
                    className="text-xs font-medium text-primary hover:underline"
                >
                    {t('home.viewAll')}
                </button>
            </div>

            {upcomingLeaves.length === 0 ? (
                <EmptyState icon={CalendarDays} message={t('home.noUpcomingLeaves')} />
            ) : (
                <ul className="space-y-2">
                    {upcomingLeaves.map((l) => (
                        <li
                            key={l.id}
                            className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs"
                        >
                            <span className="font-medium text-foreground">
                                {t(`leave.types.${l.leaveType}`, { defaultValue: l.leaveType })}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                {formatDate(l.startDate)}
                                <ArrowRight className="size-3" data-rtl-flip />
                                {formatDate(l.endDate)}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </>
    )
}

const ACCENT_CLASSES = {
    indigo: {
        label: 'text-indigo-700 dark:text-indigo-300',
        icon: 'text-indigo-700 dark:text-indigo-300',
        link: 'text-indigo-700 dark:text-indigo-300',
    },
    emerald: {
        label: 'text-emerald-700 dark:text-emerald-300',
        icon: 'text-emerald-700 dark:text-emerald-300',
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
                <div className={cn('text-xs font-semibold uppercase tracking-wider', ACCENT_CLASSES[accent].label)}>
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
