import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    ArrowLeft,
    BadgeCheck,
    Briefcase,
    Building2,
    CalendarDays,
    ChevronRight,
    Clock,
    Flag,
    Globe,
    Mail,
    Phone,
    Smartphone,
    Star,
    Timer,
    UserCircle2,
} from 'lucide-react'

import { useTeamMember } from '@/hooks/useTeam'
import { useLeaveBalance, useLeaveRequests } from '@/hooks/useLeave'
import { useAttendance } from '@/hooks/useAttendance'
import { GlassCard } from '@/components/shared/GlassCard'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ROUTES } from '@/lib/routes'
import { cn, formatDate, formatShiftRange, initialsOf } from '@/lib/utils'
import { AssignedAssetsCard } from '@/components/shared/AssignedAssetsCard'
import { MyTeamsCard } from '@/components/shared/MyTeamsCard'
import { PerformanceCard } from '@/components/shared/PerformanceCard'
import type { LeaveStatus } from '@/types'

const STATUS_TONE: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    onboarding: 'bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300',
    suspended: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    terminated: 'bg-muted text-muted-foreground',
    visa_expired: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
}

const LEAVE_STATUS_TONE: Record<LeaveStatus, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    cancelled: 'bg-muted text-muted-foreground',
}

function tenureLabel(joinDate: string | null | undefined): string {
    if (!joinDate) return '—'
    const start = new Date(joinDate).getTime()
    if (Number.isNaN(start)) return '—'
    const months = Math.max(0, Math.floor((Date.now() - start) / (1000 * 60 * 60 * 24 * 30.44)))
    if (months < 1) return 'New joiner'
    if (months < 12) return `${months} month${months === 1 ? '' : 's'}`
    const years = Math.floor(months / 12)
    const rem = months % 12
    if (rem === 0) return `${years} year${years === 1 ? '' : 's'}`
    return `${years}y ${rem}m`
}

export function ManagerMemberDetailPage() {
    const { id } = useParams<{ id: string }>()
    const { t } = useTranslation()
    const { data: employee, isLoading } = useTeamMember(id)
    const { data: leave } = useLeaveRequests({ employeeId: id, limit: 6 })
    const { data: balance } = useLeaveBalance(id)

    // Last 14 days of attendance for a quick presence snapshot
    const { fromISO, toISO } = useMemo(() => {
        const to = new Date()
        const from = new Date()
        from.setDate(from.getDate() - 13)
        return { fromISO: from.toISOString().slice(0, 10), toISO: to.toISOString().slice(0, 10) }
    }, [])
    const { data: attendance } = useAttendance({ employeeId: id, startDate: fromISO, endDate: toISO, limit: 30 })

    if (isLoading || !employee) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-32" />
                <Skeleton className="h-48" />
            </div>
        )
    }

    const annual = balance?.balance?.annual
    const presentDays = attendance?.data?.filter((r) => r.status === 'present').length ?? 0
    const onLeaveDays = attendance?.data?.filter((r) => r.status === 'on_leave').length ?? 0
    const absentDays = attendance?.data?.filter((r) => r.status === 'absent').length ?? 0

    return (
        <div className="space-y-6">
            <Button asChild variant="ghost" size="sm" className="-ml-2">
                <Link to={ROUTES.managerMembers}>
                    <ArrowLeft className="size-4" /> {t('common.viewAll')}
                </Link>
            </Button>

            {/* ── Hero header ─────────────────────────────────────────── */}
            <GlassCard tone="primary" className="overflow-hidden p-6">
                <div className="flex flex-wrap items-start gap-5">
                    <Avatar className="size-20 shrink-0 border-2 border-white/60 dark:border-white/10">
                        <AvatarImage src={employee.avatarUrl ?? undefined} />
                        <AvatarFallback className="text-lg font-semibold">
                            {initialsOf(`${employee.firstName} ${employee.lastName}`)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                        <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
                            {employee.firstName} {employee.lastName}
                        </h1>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-sm text-foreground/80">
                            {employee.designation ? (
                                <span className="inline-flex items-center gap-1.5">
                                    <Briefcase className="size-3.5" /> {employee.designation}
                                </span>
                            ) : null}
                            {employee.department ? (
                                <>
                                    {employee.designation ? <span className="opacity-50">·</span> : null}
                                    <span className="inline-flex items-center gap-1.5">
                                        <Building2 className="size-3.5" /> {employee.department}
                                    </span>
                                </>
                            ) : null}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <Badge
                                className={cn(
                                    'border-0 text-[10px] uppercase tracking-wider',
                                    STATUS_TONE[employee.status] ?? STATUS_TONE.terminated,
                                )}
                            >
                                {employee.status.replace('_', ' ')}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] tabular-figures">
                                #{employee.employeeNo}
                            </Badge>
                            <Badge variant="secondary" className="inline-flex items-center gap-1 text-[10px]">
                                <Clock className="size-3" /> {tenureLabel(employee.joinDate)}
                            </Badge>
                        </div>
                    </div>
                </div>
            </GlassCard>

            {/* ── Side-by-side info cards ─────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
                <DetailCard title="Employment" icon={<BadgeCheck className="size-4 text-indigo-500" />}>
                    <DetailRow label="Department" value={employee.department ?? '—'} icon={<Building2 className="size-3.5" />} />
                    <DetailRow label="Designation" value={employee.designation ?? '—'} icon={<Briefcase className="size-3.5" />} />
                    <DetailRow label="Join date" value={formatDate(employee.joinDate)} icon={<CalendarDays className="size-3.5" />} />
                    <DetailRow label="Tenure" value={tenureLabel(employee.joinDate)} icon={<Clock className="size-3.5" />} />
                    <DetailRow label="Status" value={employee.status.replace('_', ' ')} icon={<Star className="size-3.5" />} />
                    <DetailRow
                        label="Shift"
                        value={
                            employee.shift
                                ? `${employee.shift.name} · ${formatShiftRange(employee.shift.startTime, employee.shift.endTime) ?? '—'}`
                                : 'Default'
                        }
                        icon={<Timer className="size-3.5" />}
                    />
                    {employee.shift?.weeklyOffDays && employee.shift.weeklyOffDays.length > 0 ? (
                        <DetailRow
                            label="Weekly off"
                            value={employee.shift.weeklyOffDays.map((d) => d.slice(0, 3).replace(/^./, (c) => c.toUpperCase())).join(', ')}
                            icon={<CalendarDays className="size-3.5" />}
                        />
                    ) : null}
                    {employee.nationality ? (
                        <DetailRow label="Nationality" value={employee.nationality} icon={<Flag className="size-3.5" />} />
                    ) : null}
                </DetailCard>

                <DetailCard title="Contact" icon={<Mail className="size-4 text-sky-500" />}>
                    {employee.email ? <DetailRow label="Work email" value={employee.email} icon={<Mail className="size-3.5" />} copyable /> : null}
                    {employee.personalEmail ? <DetailRow label="Personal email" value={employee.personalEmail} icon={<Globe className="size-3.5" />} copyable /> : null}
                    {employee.phone ? <DetailRow label="Phone" value={employee.phone} icon={<Phone className="size-3.5" />} copyable /> : null}
                    {employee.mobileNo ? <DetailRow label="Mobile" value={employee.mobileNo} icon={<Smartphone className="size-3.5" />} copyable /> : null}
                    {!employee.email && !employee.phone && !employee.mobileNo && !employee.personalEmail ? (
                        <p className="py-1 text-xs text-muted-foreground">No contact details on file.</p>
                    ) : null}
                </DetailCard>
            </div>

            {/* ── Reporting line ──────────────────────────────────────── */}
            {employee.reportingToName ? (
                <Card className="border-border/70">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                        <div className="flex items-center gap-3">
                            <span className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                                <UserCircle2 className="size-5" />
                            </span>
                            <div>
                                <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                    Reports to
                                </div>
                                <div className="font-medium">{employee.reportingToName}</div>
                                <div className="text-xs text-muted-foreground">
                                    {[employee.reportingToDesignation, employee.reportingToDepartment].filter(Boolean).join(' · ') || `#${employee.reportingToEmployeeNo ?? ''}`}
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ) : null}

            {/* ── Team memberships ────────────────────────────────────── */}
            <MyTeamsCard variant="employee" employeeId={employee.id} title="Team memberships" />

            {/* ── Assigned assets ─────────────────────────────────────── */}
            <AssignedAssetsCard variant="employee" employeeId={employee.id} />

            {/* ── Performance reviews ─────────────────────────────────── */}
            <PerformanceCard variant="employee" employeeId={employee.id} />

            {/* ── Leave balance + attendance summary ──────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2">
                <Card className="border-border/70">
                    <CardContent className="p-4">
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Leave balance ({balance?.year ?? new Date().getFullYear()})
                        </h3>
                        {balance && Object.keys(balance.balance ?? {}).length > 0 ? (
                            <div className="space-y-2">
                                {annual ? (
                                    <BalanceRow
                                        label="Annual"
                                        available={Math.round(annual.available)}
                                        taken={Math.round(annual.taken)}
                                        total={Math.round(annual.available + annual.taken)}
                                    />
                                ) : null}
                                {Object.entries(balance.balance ?? {})
                                    .filter(([key]) => key !== 'annual')
                                    .slice(0, 3)
                                    .map(([key, b]) => (
                                        <BalanceRow
                                            key={key}
                                            label={key}
                                            available={Math.round(b.available)}
                                            taken={Math.round(b.taken)}
                                            total={Math.round(b.available + b.taken)}
                                        />
                                    ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground">No leave allocations on record.</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-border/70">
                    <CardContent className="p-4">
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Last 14 days
                        </h3>
                        <div className="grid grid-cols-3 gap-2 text-center">
                            <Stat tone="emerald" label="Present" value={presentDays} />
                            <Stat tone="amber" label="On leave" value={onLeaveDays} />
                            <Stat tone="rose" label="Absent" value={absentDays} />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── Recent leave history ────────────────────────────────── */}
            <section>
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Recent leave
                    </h2>
                    {leave?.data && leave.data.length > 0 ? (
                        <Link
                            to={`${ROUTES.managerApprovals}`}
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                        >
                            {t('common.viewAll')} <ChevronRight className="size-3" />
                        </Link>
                    ) : null}
                </div>
                {leave?.data?.length ? (
                    <div className="space-y-2">
                        {leave.data.slice(0, 6).map((r) => (
                            <Card key={r.id} className="border-border/70">
                                <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
                                    <div>
                                        <div className="font-medium capitalize">{r.leaveType}</div>
                                        <div className="text-xs text-muted-foreground">
                                            {formatDate(r.startDate)} → {formatDate(r.endDate)} · {r.days}{' '}
                                            {r.days === 1 ? 'day' : 'days'}
                                        </div>
                                    </div>
                                    <Badge
                                        className={cn(
                                            'border-0 text-[10px] uppercase tracking-wider',
                                            LEAVE_STATUS_TONE[r.status],
                                        )}
                                    >
                                        {r.status}
                                    </Badge>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">{t('common.empty')}</p>
                )}
            </section>
        </div>
    )
}

function DetailCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
    return (
        <Card className="border-border/70">
            <CardContent className="p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    {icon}
                    <span>{title}</span>
                </h3>
                <div className="space-y-2">{children}</div>
            </CardContent>
        </Card>
    )
}

function DetailRow({
    label,
    value,
    icon,
    copyable,
}: {
    label: string
    value: string
    icon?: React.ReactNode
    copyable?: boolean
}) {
    return (
        <div className="flex items-start justify-between gap-3 py-1">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {icon}
                <span>{label}</span>
            </div>
            <div className="min-w-0 max-w-[60%] truncate text-sm font-medium" title={copyable ? value : undefined}>
                {value}
            </div>
        </div>
    )
}

function BalanceRow({ label, available, taken, total }: { label: string; available: number; taken: number; total: number }) {
    const pct = total > 0 ? Math.min(100, Math.round((available / total) * 100)) : 0
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium capitalize">{label}</span>
                <span className="tabular-figures text-muted-foreground">
                    {available} <span className="opacity-60">/ {total}</span>
                </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-500 transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{taken} day{taken === 1 ? '' : 's'} taken</div>
        </div>
    )
}

const STAT_TONES = {
    emerald: 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
    amber: 'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40',
    rose: 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-950/40',
} as const

function Stat({ tone, label, value }: { tone: keyof typeof STAT_TONES; label: string; value: number }) {
    return (
        <div className={cn('rounded-xl py-2.5', STAT_TONES[tone])}>
            <div className="font-display text-2xl font-bold tabular-figures">{value}</div>
            <div className="text-[10px] uppercase tracking-wider opacity-80">{label}</div>
        </div>
    )
}
