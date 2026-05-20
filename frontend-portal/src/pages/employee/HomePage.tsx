import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    ArrowRight,
    Calendar,
    CheckCircle2,
    ChevronRight,
    Clock,
    FileText,
    LogIn,
    LogOut,
    PieChart,
    Receipt,
    TrendingUp,
    User,
} from 'lucide-react'
import {
    Area,
    AreaChart,
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
import { useMyEmployee } from '@/hooks/useMe'
import { useLeaveBalance, useLeaveRequests } from '@/hooks/useLeave'
import { useMyPayslips } from '@/hooks/usePayslips'
import { useAttendance, useCheckIn, useCheckOut } from '@/hooks/useAttendance'
import { GlassCard } from '@/components/shared/GlassCard'
import { ChartCard } from '@/components/shared/ChartCard'
import { AssignedAssetsCard } from '@/components/shared/AssignedAssetsCard'
import { BirthdaysCard } from '@/components/shared/BirthdaysCard'
import { MyTeamsCard } from '@/components/shared/MyTeamsCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ROUTES } from '@/lib/routes'
import { cn, formatCurrency, formatDate, formatShiftRange, monthName } from '@/lib/utils'
import type { LeaveStatus, Payslip } from '@/types'

function greetingKey(hour: number): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
    if (hour < 12) return 'greetingMorning'
    if (hour < 17) return 'greetingAfternoon'
    return 'greetingEvening'
}

const STATUS_TONE: Record<LeaveStatus, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    cancelled: 'bg-muted text-muted-foreground',
}

export function EmployeeHomePage() {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const employeeId = user?.employeeId ?? undefined

    const { data: me } = useMyEmployee()
    const { data: balance, isLoading: balanceLoading } = useLeaveBalance(employeeId)
    const { data: payslips } = useMyPayslips()
    const { data: leaveList } = useLeaveRequests({ employeeId, limit: 4 })

    const today = new Date().toISOString().slice(0, 10)
    const { data: todayAttendance } = useAttendance({
        employeeId,
        startDate: today,
        endDate: today,
        limit: 1,
    })
    const checkIn = useCheckIn()
    const checkOut = useCheckOut()

    const annualBalance = balance?.balance?.annual
    const latestSlip = payslips?.[0]
    const todayRecord = todayAttendance?.data?.[0]
    const isCheckedIn = !!todayRecord?.checkIn && !todayRecord?.checkOut
    const checkedOutToday = !!todayRecord?.checkOut

    const pendingLeaveCount = leaveList?.data.filter((l) => l.status === 'pending').length ?? 0

    return (
        <div className="space-y-6">
            {/* ── Greeting ──────────────────────────────────────────────── */}
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <p className="text-sm text-muted-foreground">
                        {t(`home.${greetingKey(new Date().getHours())}`)},
                    </p>
                    <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                        {me ? `${me.firstName} ${me.lastName}`.trim() : (user?.name ?? '')} 👋
                    </h1>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                    <div>{formatDate(today, { weekday: 'long' })}</div>
                    <div className="text-sm font-semibold text-foreground">
                        {formatDate(today, { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                </div>
            </header>

            {/* ── Hero: today's attendance ──────────────────────────────── */}
            <GlassCard
                tone={isCheckedIn ? 'success' : checkedOutToday ? 'default' : 'primary'}
                className="overflow-hidden p-5 sm:p-6"
            >
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider opacity-80">
                            <span className="inline-flex items-center gap-1.5">
                                <Clock className="size-3" />
                                {t('attendance.title')}
                            </span>
                            {/* Show today's scheduled shift inline so the user knows what window they're tracking against. */}
                            {me?.shift ? (() => {
                                const range = formatShiftRange(me.shift!.startTime, me.shift!.endTime)
                                return range ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-white/35 px-2 py-0.5 text-[10px] font-medium normal-case tracking-normal opacity-80 dark:bg-white/10">
                                        {me.shift!.name} · {range}
                                    </span>
                                ) : null
                            })() : null}
                        </div>
                        {todayRecord?.checkIn ? (
                            <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <div className="font-display text-2xl font-bold tabular-figures">
                                    {new Date(todayRecord.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="text-xs text-muted-foreground">→</div>
                                {todayRecord.checkOut ? (
                                    <div className="font-display text-2xl font-bold tabular-figures">
                                        {new Date(todayRecord.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                ) : (
                                    <div className="text-sm font-medium text-foreground/70">{t('common.today')}…</div>
                                )}
                                {todayRecord.hoursWorked ? (
                                    <Badge variant="secondary" className="text-[10px] tabular-figures">
                                        {todayRecord.hoursWorked}h
                                    </Badge>
                                ) : null}
                            </div>
                        ) : (
                            <div className="mt-2 font-display text-xl font-semibold sm:text-2xl">
                                {t('home.checkInPrompt')}
                            </div>
                        )}
                    </div>

                    <div className="shrink-0">
                        {checkedOutToday ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <CheckCircle2 className="size-3.5" /> Done for the day
                            </span>
                        ) : isCheckedIn ? (
                            <Button
                                onClick={() =>
                                    checkOut.mutate(undefined, {
                                        onSuccess: () => toast.success(t('attendance.checkOut')),
                                    })
                                }
                                loading={checkOut.isPending}
                            >
                                <LogOut className="size-4" /> {t('attendance.checkOut')}
                            </Button>
                        ) : (
                            <Button
                                onClick={() =>
                                    checkIn.mutate(undefined, {
                                        onSuccess: () => toast.success(t('attendance.checkIn')),
                                    })
                                }
                                loading={checkIn.isPending}
                            >
                                <LogIn className="size-4" /> {t('attendance.checkIn')}
                            </Button>
                        )}
                    </div>
                </div>
            </GlassCard>

            {/* ── Stats: leave + payslip ────────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
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
                            ? `${pendingLeaveCount} pending`
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
                        <div className="text-sm text-muted-foreground">Not yet available</div>
                    )}
                    <FooterLink to={ROUTES.employeePayslips} accent="emerald">
                        {t('home.viewPayslips')}
                    </FooterLink>
                </StatCard>
            </div>

            {/* ── Charts row ────────────────────────────────────────────── */}
            <div className="grid gap-4 lg:grid-cols-2">
                <LeaveUsageChart balance={annualBalance} />
                <PayslipTrendChart payslips={payslips ?? []} />
            </div>

            {/* ── Recent leave activity ─────────────────────────────────── */}
            {leaveList?.data && leaveList.data.length > 0 ? (
                <section>
                    <div className="mb-3 flex items-center justify-between">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Recent leave
                        </h2>
                        <Link
                            to={ROUTES.employeeLeave}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                            {t('common.viewAll')} <ChevronRight className="size-3" />
                        </Link>
                    </div>
                    <div className="space-y-2">
                        {leaveList.data.slice(0, 3).map((req) => (
                            <Card key={req.id} className="border-border/70 transition-colors hover:border-primary/30">
                                <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium capitalize">{req.leaveType}</span>
                                            <Badge
                                                className={cn(
                                                    'border-0 text-[10px] uppercase tracking-wider',
                                                    STATUS_TONE[req.status],
                                                )}
                                            >
                                                {t(`leave.status.${req.status}`)}
                                            </Badge>
                                        </div>
                                        <div className="mt-0.5 text-xs text-muted-foreground">
                                            {formatDate(req.startDate)} → {formatDate(req.endDate)} · {req.days}{' '}
                                            {req.days === 1 ? 'day' : 'days'}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </section>
            ) : null}

            {/* ── Team memberships + birthdays + assets ───────────────────
                Three small cards that together answer "what context am I in
                today?" — which teams I'm part of, who has a birthday today,
                what hardware I'm holding. Two-column on lg, single-column
                on smaller viewports. */}
            <div className="grid gap-4 lg:grid-cols-2">
                <MyTeamsCard variant="me" />
                <BirthdaysCard title="Department birthdays today" />
            </div>
            <AssignedAssetsCard variant="me" />

            {/* ── Quick actions ─────────────────────────────────────────── */}
            <section>
                <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('home.quickActions')}
                </h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    <ActionLink to={ROUTES.employeeLeave} icon={<Calendar className="size-5" />} label={t('home.requestLeave')} />
                    <ActionLink to={ROUTES.employeePayslips} icon={<Receipt className="size-5" />} label={t('home.viewPayslips')} />
                    <ActionLink to={ROUTES.employeeAttendance} icon={<Clock className="size-5" />} label={t('home.viewAttendance')} />
                    <ActionLink to={ROUTES.employeeDocuments} icon={<FileText className="size-5" />} label={t('nav.documents')} />
                    <ActionLink to={ROUTES.employeeProfile} icon={<User className="size-5" />} label={t('home.viewProfile')} />
                </div>
            </section>
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
 * Donut showing leave used vs. remaining for the current year.
 * Center label is the remaining count.
 */
function LeaveUsageChart({
    balance,
}: {
    balance: { available: number; taken: number; entitled: number; accrued: number } | undefined
}) {
    const available = balance ? Math.max(0, Math.round(balance.available)) : 0
    const taken = balance ? Math.max(0, Math.round(balance.taken)) : 0
    const total = available + taken

    const data =
        total === 0
            ? [{ name: 'No data', value: 1 }]
            : [
                  { name: 'Available', value: available },
                  { name: 'Taken', value: taken },
              ]
    const COLORS = total === 0 ? ['#e2e8f0'] : ['#6366f1', '#0ea5e9']

    return (
        <ChartCard
            title="Leave usage"
            subtitle={total > 0 ? `${taken} taken of ${total} days` : 'No leave records yet'}
            icon={<PieChart className="size-4 text-indigo-500" />}
            height={220}
        >
            <ResponsiveContainer width="100%" height="100%">
                <RPieChart>
                    <Pie
                        data={data}
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={total > 0 ? 4 : 0}
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
                                <div className="font-display text-3xl font-bold tabular-figures">{available}</div>
                                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                                    {total > 0 ? 'days left' : '—'}
                                </div>
                            </div>
                        </foreignObject>
                    </Pie>
                    {total > 0 ? (
                        <Tooltip
                            formatter={((value: unknown, name: unknown) => [`${value} days`, String(name)]) as any}
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
            {total > 0 ? (
                <div className="-mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <Legend swatch="#6366f1" label="Available" value={available} />
                    <Legend swatch="#0ea5e9" label="Taken" value={taken} />
                </div>
            ) : null}
        </ChartCard>
    )
}

/**
 * Area chart of the user's last 6 months of net pay.
 * Newest first in the response — we reverse to get chronological order on the X axis.
 */
function PayslipTrendChart({ payslips }: { payslips: Payslip[] }) {
    const last6 = payslips.slice(0, 6).reverse()
    const data = last6.map((p) => ({
        label: monthName(p.month).slice(0, 3),
        net: Number(p.netSalary),
        gross: Number(p.grossSalary),
    }))

    return (
        <ChartCard
            title="Net pay trend"
            subtitle={data.length ? `Last ${data.length} payslip${data.length === 1 ? '' : 's'}` : 'No payslips yet'}
            icon={<TrendingUp className="size-4 text-emerald-500" />}
            height={220}
        >
            {data.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    Your first payslip will show up here.
                </div>
            ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                        <defs>
                            <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis
                            dataKey="label"
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        />
                        <YAxis
                            axisLine={false}
                            tickLine={false}
                            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                            tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                            width={36}
                        />
                        <Tooltip
                            formatter={((value: unknown) => formatCurrency(value as number)) as any}
                            labelFormatter={(label) => `${label}`}
                            contentStyle={{
                                borderRadius: 8,
                                border: '1px solid hsl(var(--border))',
                                fontSize: 12,
                                background: 'hsl(var(--card) / 0.95)',
                                backdropFilter: 'blur(8px)',
                            }}
                        />
                        <Area
                            type="monotone"
                            dataKey="net"
                            name="Net pay"
                            stroke="#10b981"
                            strokeWidth={2}
                            fill="url(#netGradient)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </ChartCard>
    )
}

function Legend({ swatch, label, value }: { swatch: string; label: string; value: number }) {
    return (
        <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: swatch }} />
            {label} <span className="font-semibold tabular-figures text-foreground">{value}</span>
        </span>
    )
}
