import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    Activity,
    ArrowRight,
    Building2,
    Calendar,
    CalendarDays,
    Check,
    ChevronRight,
    ListChecks,
    PieChart,
    UserMinus,
    Users,
    X,
} from 'lucide-react'
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Pie,
    PieChart as RPieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts'

import { useAuthStore } from '@/store/authStore'
import { useApproveLeave, useLeaveRequests } from '@/hooks/useLeave'
import { useMyEmployee } from '@/hooks/useMe'
import { useTeam } from '@/hooks/useTeam'
import { GlassCard } from '@/components/shared/GlassCard'
import { ChartCard } from '@/components/shared/ChartCard'
import { BirthdaysCard } from '@/components/shared/BirthdaysCard'
import { MyTeamsCard } from '@/components/shared/MyTeamsCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { ROUTES } from '@/lib/routes'
import { cn, formatDate, initialsOf, monthName } from '@/lib/utils'
import type { LeaveRequest } from '@/types'

function toISO(d: Date) {
    return d.toISOString().slice(0, 10)
}

function greetingKey(hour: number): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
    if (hour < 12) return 'greetingMorning'
    if (hour < 17) return 'greetingAfternoon'
    return 'greetingEvening'
}

export function ManagerHomePage() {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    // `user.department` from the JWT is the legacy text column (often
    // outdated faker data). The /employees/me endpoint resolves the canonical
    // org-unit name via the FK — that's what we want to show on the greeting
    // badge so it matches the profile page.
    const { data: me } = useMyEmployee()

    const { data: team, isLoading: teamLoading } = useTeam({ limit: 100 })
    const { data: pending, isLoading: pendingLoading } = useLeaveRequests({ status: 'pending', limit: 5 })

    const today = toISO(new Date())
    const { data: onLeaveToday } = useLeaveRequests({
        status: 'approved',
        from: today,
        to: today,
        limit: 20,
    })

    // Last 6 months of leave activity — used for the bar chart below.
    const sixMonthsAgo = useMemo(() => {
        const d = new Date()
        d.setMonth(d.getMonth() - 5)
        d.setDate(1)
        return toISO(d)
    }, [])
    const { data: recentLeaveHistory } = useLeaveRequests({ from: sixMonthsAgo, limit: 200 })

    const teamMembers = (team?.data ?? []).filter((m) => m.id !== user?.employeeId)
    const teamCount = teamMembers.length
    const onLeaveTodayList = onLeaveToday?.data ?? []
    const onLeaveTodayCount = onLeaveTodayList.length

    const pendingTotal = pending?.total ?? 0
    const pendingList = pending?.data ?? []

    // Department breakdown across the manager's reporting subtree.
    // Useful when a dept_head has cross-functional reports (e.g. a tech lead who manages
    // both engineers and designers) — surfaces the mix at a glance.
    const departmentBreakdown = useMemo(() => {
        const counts = new Map<string, number>()
        for (const m of teamMembers) {
            const dept = (m.department ?? '').trim() || 'Unassigned'
            counts.set(dept, (counts.get(dept) ?? 0) + 1)
        }
        return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
    }, [teamMembers])

    // Prefer the FK-resolved name from /employees/me. Only fall back to the
    // single-dept breakdown when we genuinely don't have a department on the
    // manager's own record (e.g. cross-functional manager with no home dept).
    const primaryDepartment =
        me?.departmentName ?? me?.department ?? (departmentBreakdown.length === 1 ? departmentBreakdown[0].name : null)

    const approve = useApproveLeave()
    const [decision, setDecision] = useState<{ id: string; approved: boolean; employeeName: string } | null>(null)
    const [note, setNote] = useState('')

    function submitDecision() {
        if (!decision) return
        approve.mutate(
            { id: decision.id, approved: decision.approved, notes: note || undefined },
            {
                onSuccess: () => {
                    toast.success(decision.approved ? t('team.approveSuccess') : t('team.rejectSuccess'))
                    setDecision(null)
                    setNote('')
                },
            },
        )
    }

    return (
        <div className="space-y-6">
            {/* ── Greeting ───────────────────────────────────────────────── */}
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">
                        {t(`home.${greetingKey(new Date().getHours())}`)},
                    </p>
                    <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                        {user?.name ?? `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()}
                    </h1>
                    {/* Department badge — primary dept if set on the user, else inferred from the team mix. */}
                    {(primaryDepartment || departmentBreakdown.length > 1) ? (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                                <Building2 className="size-3" />
                                {primaryDepartment ?? `${departmentBreakdown.length} departments`}
                            </span>
                            {departmentBreakdown.length > 1 ? (
                                <span className="text-[11px] text-muted-foreground">
                                    cross-functional manager
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                    <p className="mt-1.5 text-xs text-muted-foreground">
                        {pendingTotal > 0
                            ? `You have ${pendingTotal} request${pendingTotal === 1 ? '' : 's'} waiting for review`
                            : 'Your team is all set — nothing to review'}
                    </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                    <div>{formatDate(today, { weekday: 'long' })}</div>
                    <div className="text-sm font-semibold text-foreground">
                        {formatDate(today, { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                </div>
            </header>

            {/* ── Stat tiles ─────────────────────────────────────────────── */}
            <div className="grid gap-3 sm:grid-cols-3">
                <MiniStat
                    tone="warning"
                    icon={<ListChecks className="size-4" />}
                    label={t('team.pendingApprovals')}
                    value={pendingTotal}
                    loading={pendingLoading}
                    href={ROUTES.managerApprovals}
                    accent="amber"
                />
                <MiniStat
                    tone="primary"
                    icon={<Users className="size-4" />}
                    label={t('team.members')}
                    value={teamCount}
                    loading={teamLoading}
                    href={ROUTES.managerMembers}
                    accent="indigo"
                />
                <MiniStat
                    tone="default"
                    icon={<UserMinus className="size-4" />}
                    label="On leave today"
                    value={onLeaveTodayCount}
                    href={ROUTES.managerCalendar}
                    accent="slate"
                />
            </div>

            {/* ── Department breakdown (only when there's more than one) ─── */}
            {departmentBreakdown.length > 1 ? (
                <section>
                    <div className="mb-2 flex items-center gap-2">
                        <Building2 className="size-3.5 text-muted-foreground" />
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Team by department
                        </h2>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {departmentBreakdown.map((d) => (
                            <Link
                                key={d.name}
                                to={`${ROUTES.managerMembers}?department=${encodeURIComponent(d.name)}`}
                                className="inline-flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 text-xs transition-colors hover:border-primary/40 hover:bg-card"
                            >
                                <span className="font-medium">{d.name}</span>
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-figures text-foreground/80">
                                    {d.count}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>
            ) : null}

            {/* ── Charts row ─────────────────────────────────────────────── */}
            <div className="grid gap-4 lg:grid-cols-2">
                <TeamStatusChart
                    teamCount={teamCount}
                    onLeaveToday={onLeaveTodayCount}
                    pending={pendingTotal}
                />
                <LeaveActivityChart requests={recentLeaveHistory?.data ?? []} />
            </div>

            {/* ── Pending approvals (inline list) ────────────────────────── */}
            <section>
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('team.pendingApprovals')}
                    </h2>
                    {pendingTotal > 0 ? (
                        <Link
                            to={ROUTES.managerApprovals}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                            {t('common.viewAll')} <ChevronRight className="size-3" />
                        </Link>
                    ) : null}
                </div>

                {pendingLoading ? (
                    <div className="space-y-2">
                        <Skeleton className="h-20" />
                        <Skeleton className="h-20" />
                    </div>
                ) : pendingList.length === 0 ? (
                    <Card className="border-dashed bg-card/40">
                        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <Check className="size-5" />
                            </div>
                            {t('team.noApprovals')}
                        </CardContent>
                    </Card>
                ) : (
                    <div className="space-y-2.5">
                        {pendingList.map((req) => (
                            <Card key={req.id} className="border-border/70 transition-colors hover:border-primary/30">
                                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="truncate font-medium">{req.employeeName ?? req.employeeId}</span>
                                            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                                pending
                                            </span>
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            <span className="capitalize">{req.leaveType}</span>
                                            <span className="mx-1.5">·</span>
                                            {formatDate(req.startDate)} → {formatDate(req.endDate)}
                                            <span className="mx-1.5">·</span>
                                            {req.days} {req.days === 1 ? 'day' : 'days'}
                                        </div>
                                        {req.reason ? (
                                            <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground/90">{req.reason}</p>
                                        ) : null}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                                setDecision({
                                                    id: req.id,
                                                    approved: false,
                                                    employeeName: req.employeeName ?? '',
                                                })
                                            }
                                        >
                                            <X className="size-4" /> {t('common.reject')}
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="success"
                                            onClick={() =>
                                                setDecision({
                                                    id: req.id,
                                                    approved: true,
                                                    employeeName: req.employeeName ?? '',
                                                })
                                            }
                                        >
                                            <Check className="size-4" /> {t('common.approve')}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                )}
            </section>

            {/* ── My teams + today's birthdays ──────────────────────────── */}
            <div className="grid gap-4 lg:grid-cols-2">
                <MyTeamsCard variant="me" />
                <BirthdaysCard title="Team birthdays today" />
            </div>

            {/* ── Who's on leave today ───────────────────────────────────── */}
            <section>
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        On leave today
                    </h2>
                    <Link
                        to={ROUTES.managerCalendar}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                        {t('common.viewAll')} <ChevronRight className="size-3" />
                    </Link>
                </div>

                {onLeaveTodayList.length === 0 ? (
                    <Card className="border-dashed bg-card/40">
                        <CardContent className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
                            <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                                <CalendarDays className="size-5" />
                            </div>
                            Everyone is in today.
                        </CardContent>
                    </Card>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        {onLeaveTodayList.slice(0, 8).map((r) => (
                            <div
                                key={r.id}
                                className="flex items-center gap-2 rounded-full border border-border bg-card/70 px-2.5 py-1 text-xs"
                            >
                                <Avatar className="size-6">
                                    <AvatarFallback className="text-[9px] font-semibold">
                                        {initialsOf(r.employeeName ?? '')}
                                    </AvatarFallback>
                                </Avatar>
                                <span className="truncate font-medium">{r.employeeName ?? r.employeeId}</span>
                                <span className="capitalize text-muted-foreground">· {r.leaveType}</span>
                            </div>
                        ))}
                        {onLeaveTodayList.length > 8 ? (
                            <span className="self-center text-xs text-muted-foreground">
                                +{onLeaveTodayList.length - 8} more
                            </span>
                        ) : null}
                    </div>
                )}
            </section>

            {/* ── Team preview ───────────────────────────────────────────── */}
            {teamMembers.length > 0 ? (
                <section>
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Your team
                        </h2>
                        <Link
                            to={ROUTES.managerMembers}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                            {t('common.viewAll')} <ChevronRight className="size-3" />
                        </Link>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {teamMembers.slice(0, 6).map((m) => (
                            <Link
                                key={m.id}
                                to={ROUTES.managerMemberDetail(m.id)}
                                className="flex items-center gap-3 rounded-xl border border-border bg-card/60 p-2.5 transition-colors hover:border-primary/40 hover:bg-card"
                            >
                                <Avatar className="size-9">
                                    <AvatarImage src={m.avatarUrl ?? undefined} />
                                    <AvatarFallback className="text-[10px] font-semibold">
                                        {initialsOf(`${m.firstName} ${m.lastName}`)}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">
                                        {m.firstName} {m.lastName}
                                    </div>
                                    <div className="truncate text-[11px] text-muted-foreground">
                                        {m.designation ?? m.department ?? m.employeeNo}
                                    </div>
                                </div>
                                <ArrowRight className="size-3.5 text-muted-foreground" data-rtl-flip />
                            </Link>
                        ))}
                    </div>
                </section>
            ) : null}

            {/* ── Quick actions ──────────────────────────────────────────── */}
            <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('home.quickActions')}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <ActionLink to={ROUTES.managerApprovals} icon={<ListChecks className="size-5" />} label={t('nav.approvals')} />
                    <ActionLink to={ROUTES.managerMembers} icon={<Users className="size-5" />} label={t('nav.team')} />
                    <ActionLink to={ROUTES.managerAttendance} icon={<CalendarDays className="size-5" />} label={t('nav.attendance')} />
                    <ActionLink to={ROUTES.managerCalendar} icon={<Calendar className="size-5" />} label={t('nav.calendar')} />
                </div>
            </section>

            {/* ── Approve / reject dialog ────────────────────────────────── */}
            <Dialog open={!!decision} onOpenChange={(v) => !v && setDecision(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>
                            {decision?.approved ? t('team.approveLeave') : t('team.rejectLeave')}
                            {decision?.employeeName ? <span className="text-sm font-normal text-muted-foreground"> · {decision.employeeName}</span> : null}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-1.5">
                        <Label>{t('team.managerNote')}</Label>
                        <Input value={note} onChange={(e) => setNote(e.target.value)} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDecision(null)}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={submitDecision} loading={approve.isPending}>
                            {decision?.approved ? t('common.approve') : t('common.reject')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

const STAT_ACCENT = {
    amber: 'text-amber-700/80 dark:text-amber-300/80',
    indigo: 'text-indigo-700/80 dark:text-indigo-300/80',
    slate: 'text-slate-700/80 dark:text-slate-300/80',
} as const

function MiniStat({
    tone,
    icon,
    label,
    value,
    loading,
    href,
    accent,
}: {
    tone: 'primary' | 'success' | 'warning' | 'default'
    icon: React.ReactNode
    label: string
    value: number
    loading?: boolean
    href: string
    accent: keyof typeof STAT_ACCENT
}) {
    return (
        <Link to={href} className="group focus-visible:outline-none">
            <GlassCard
                tone={tone}
                className="flex h-full flex-col gap-2 p-4 transition-all group-hover:-translate-y-0.5 group-hover:shadow-xl"
            >
                <div className="flex items-center justify-between">
                    <span className={cn('text-[11px] font-semibold uppercase tracking-wider', STAT_ACCENT[accent])}>
                        {label}
                    </span>
                    <span className={STAT_ACCENT[accent]}>{icon}</span>
                </div>
                <div className="font-display text-3xl font-bold tabular-figures">
                    {loading ? <Skeleton className="h-9 w-12" /> : value}
                </div>
            </GlassCard>
        </Link>
    )
}

function ActionLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
    return (
        <Link
            to={to}
            className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-card/70 p-4 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
        >
            <span className="flex size-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-50 to-sky-50 text-indigo-600 transition-transform group-hover:scale-110 dark:from-indigo-950/40 dark:to-sky-950/30 dark:text-indigo-300">
                {icon}
            </span>
            <span className="text-sm font-medium leading-snug">{label}</span>
        </Link>
    )
}

/**
 * Donut chart: today's team status — present / on leave / pending approvals.
 * The center label is the team headcount.
 */
function TeamStatusChart({
    teamCount,
    onLeaveToday,
    pending,
}: {
    teamCount: number
    onLeaveToday: number
    pending: number
}) {
    const present = Math.max(0, teamCount - onLeaveToday)
    const data =
        teamCount === 0
            ? [{ name: 'No team', value: 1 }]
            : [
                  { name: 'Present', value: present },
                  { name: 'On leave', value: onLeaveToday },
                  ...(pending > 0 ? [{ name: 'Pending', value: pending }] : []),
              ].filter((d) => d.value > 0)

    const COLORS = teamCount === 0 ? ['#e2e8f0'] : ['#10b981', '#0ea5e9', '#f59e0b']

    return (
        <ChartCard
            title="Today at a glance"
            subtitle={teamCount > 0 ? `${present} of ${teamCount} present` : 'No team data yet'}
            icon={<PieChart className="size-4 text-indigo-500" />}
            height={220}
        >
            <ResponsiveContainer width="100%" height="100%">
                <RPieChart>
                    <Pie
                        data={data}
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={teamCount > 0 ? 3 : 0}
                        dataKey="value"
                        startAngle={90}
                        endAngle={-270}
                        stroke="none"
                    >
                        {data.map((slice, i) => (
                            <Cell key={slice.name} fill={COLORS[i % COLORS.length]} />
                        ))}
                        <foreignObject x="35%" y="35%" width="30%" height="30%">
                            <div className="flex size-full flex-col items-center justify-center">
                                <div className="font-display text-3xl font-bold tabular-figures">{teamCount}</div>
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">team</div>
                            </div>
                        </foreignObject>
                    </Pie>
                    {teamCount > 0 ? (
                        <Tooltip
                            formatter={((value: unknown, name: unknown) => [`${value}`, String(name)]) as any}
                            contentStyle={{
                                borderRadius: 8,
                                border: '1px solid hsl(var(--border))',
                                fontSize: 12,
                                background: 'hsl(var(--card) / 0.95)',
                                backdropFilter: 'blur(8px)',
                            }}
                        />
                    ) : null}
                </RPieChart>
            </ResponsiveContainer>
            {teamCount > 0 ? (
                <div className="-mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <Legend swatch="#10b981" label="Present" value={present} />
                    <Legend swatch="#0ea5e9" label="On leave" value={onLeaveToday} />
                    {pending > 0 ? <Legend swatch="#f59e0b" label="Pending" value={pending} /> : null}
                </div>
            ) : null}
        </ChartCard>
    )
}

/**
 * Stacked bar: leave activity (approved / pending / rejected) by month for the last 6 months.
 */
function LeaveActivityChart({ requests }: { requests: LeaveRequest[] }) {
    const data = useMemo(() => {
        const now = new Date()
        const months: { key: string; label: string; approved: number; pending: number; rejected: number }[] = []
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
            months.push({
                key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
                label: monthName(d.getMonth() + 1).slice(0, 3),
                approved: 0,
                pending: 0,
                rejected: 0,
            })
        }
        const byKey = new Map(months.map((m) => [m.key, m]))
        for (const r of requests) {
            const d = new Date(r.startDate)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            const bucket = byKey.get(key)
            if (!bucket) continue
            if (r.status === 'approved') bucket.approved++
            else if (r.status === 'pending') bucket.pending++
            else if (r.status === 'rejected') bucket.rejected++
        }
        return months
    }, [requests])

    const totals = data.reduce((s, m) => s + m.approved + m.pending + m.rejected, 0)

    return (
        <ChartCard
            title="Leave activity"
            subtitle={totals > 0 ? `${totals} requests across last 6 months` : 'No leave activity in the last 6 months'}
            icon={<Activity className="size-4 text-sky-500" />}
            height={220}
        >
            {totals === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    No leave requests yet.
                </div>
            ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis
                            allowDecimals={false}
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            width={28}
                        />
                        <Tooltip
                            cursor={{ fill: 'hsl(var(--muted) / 0.5)' }}
                            contentStyle={{
                                borderRadius: 8,
                                border: '1px solid hsl(var(--border))',
                                fontSize: 12,
                                background: 'hsl(var(--card) / 0.95)',
                                backdropFilter: 'blur(8px)',
                            }}
                        />
                        <Bar dataKey="approved" stackId="a" fill="#10b981" name="Approved" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pending" radius={[0, 0, 0, 0]} />
                        <Bar dataKey="rejected" stackId="a" fill="#f43f5e" name="Rejected" radius={[6, 6, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            )}
            <div className="-mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <Legend swatch="#10b981" label="Approved" />
                <Legend swatch="#f59e0b" label="Pending" />
                <Legend swatch="#f43f5e" label="Rejected" />
            </div>
        </ChartCard>
    )
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value?: number }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: swatch }} />
            {label}
            {value !== undefined ? <span className="font-semibold tabular-figures text-foreground">{value}</span> : null}
        </span>
    )
}
