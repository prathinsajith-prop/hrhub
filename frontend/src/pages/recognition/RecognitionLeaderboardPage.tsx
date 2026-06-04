import { useMemo, useState } from 'react'
import {
    Trophy, Medal, Award, Crown, TrendingUp, Users, HandHeart, Sparkles,
    BarChart3, PieChart as PieIcon, Activity, Gem,
} from 'lucide-react'
import {
    ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
    PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend,
} from 'recharts'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { InitialsAvatar } from '@/components/shared/Avatar'
import { cn } from '@/lib/utils'
import {
    useLeaderboard, useAnalyticsSummary, useBadgesDistribution,
    type LeaderboardEntry, type BadgeLevel,
} from '@/hooks/useRecognition'

type Period = '7d' | '30d' | '90d' | '365d'
type LeaderType = 'received' | 'given'

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
    { value: '365d', label: 'Last 12 months' },
]

const CHART_PALETTE = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
    '#eab308', '#10b981', '#14b8a6', '#06b6d4', '#3b82f6',
    '#a855f7', '#22c55e',
]

const BADGE_LEVEL_TONE: Record<BadgeLevel, { bg: string; text: string; ring: string; label: string }> = {
    bronze: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', label: 'Bronze' },
    silver: { bg: 'bg-slate-100', text: 'text-slate-700', ring: 'ring-slate-300', label: 'Silver' },
    gold: { bg: 'bg-yellow-50', text: 'text-yellow-700', ring: 'ring-yellow-300', label: 'Gold' },
    platinum: { bg: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-200', label: 'Platinum' },
    diamond: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700', ring: 'ring-fuchsia-200', label: 'Diamond' },
}

export function RecognitionLeaderboardPage() {
    const [period, setPeriod] = useState<Period>('30d')

    return (
        <PageWrapper>
            <PageHeader
                eyebrow="Engagement"
                title="Leaderboard & Analytics"
                description="See who is shining brightest and how recognition is flowing across your organization."
                actions={
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Period</span>
                        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                            <SelectTrigger className="h-9 w-[160px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PERIOD_OPTIONS.map((p) => (
                                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                }
            />

            <Tabs defaultValue="leaderboard" className="space-y-5">
                <TabsList>
                    <TabsTrigger value="leaderboard" className="gap-2">
                        <Trophy className="size-4" /> Leaderboard
                    </TabsTrigger>
                    <TabsTrigger value="analytics" className="gap-2">
                        <BarChart3 className="size-4" /> Analytics
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="leaderboard" className="space-y-5">
                    <LeaderboardTab period={period} />
                </TabsContent>

                <TabsContent value="analytics" className="space-y-5">
                    <AnalyticsTab period={period} />
                </TabsContent>
            </Tabs>
        </PageWrapper>
    )
}

// ── Leaderboard tab ───────────────────────────────────────────────────────────
function LeaderboardTab({ period }: { period: Period }) {
    const [type, setType] = useState<LeaderType>('received')
    const { data, isLoading } = useLeaderboard(period, type)

    // Some backends return a flat list, others return { received, given } subsets.
    const entries: LeaderboardEntry[] = useMemo(() => {
        if (!data) return []
        if (Array.isArray(data)) return data
        const maybe = data as unknown as { received?: LeaderboardEntry[]; given?: LeaderboardEntry[] }
        if (maybe.received || maybe.given) return (type === 'received' ? maybe.received : maybe.given) ?? []
        return []
    }, [data, type])

    const podium = entries.slice(0, 3)
    const rest = entries.slice(3)

    return (
        <>
            <div className="flex items-center justify-between flex-wrap gap-3">
                <Tabs value={type} onValueChange={(v) => setType(v as LeaderType)}>
                    <TabsList>
                        <TabsTrigger value="received" className="gap-2">
                            <Award className="size-4" /> Most Recognized
                        </TabsTrigger>
                        <TabsTrigger value="given" className="gap-2">
                            <HandHeart className="size-4" /> Most Active Givers
                        </TabsTrigger>
                    </TabsList>
                </Tabs>
                <p className="text-xs text-muted-foreground">
                    Ranked by recognition {type === 'received' ? 'received' : 'given'} in the selected period.
                </p>
            </div>

            {isLoading ? (
                <PodiumSkeleton />
            ) : entries.length === 0 ? (
                <EmptyState
                    icon={<Trophy className="size-6 text-muted-foreground" />}
                    title="No leaderboard data yet"
                    description="Once recognitions start flowing, top performers will appear here."
                />
            ) : (
                <>
                    <Podium entries={podium} type={type} />
                    {rest.length > 0 && <RankList entries={rest} startRank={4} type={type} />}
                </>
            )}
        </>
    )
}

function Podium({ entries, type }: { entries: LeaderboardEntry[]; type: LeaderType }) {
    if (entries.length === 0) return null
    const [first, second, third] = entries
    // Visual order: 2nd, 1st (tallest middle), 3rd
    const podiumOrder = [
        { entry: second, rank: 2, height: 'h-32', tone: 'from-slate-100 to-slate-200', icon: <Medal className="size-7 text-slate-500" /> },
        { entry: first, rank: 1, height: 'h-44', tone: 'from-yellow-100 to-amber-200', icon: <Crown className="size-8 text-yellow-500" /> },
        { entry: third, rank: 3, height: 'h-24', tone: 'from-amber-50 to-orange-200', icon: <Medal className="size-7 text-amber-600" /> },
    ].filter((p) => p.entry)

    return (
        <Card className="overflow-hidden">
            <CardContent className="px-4 pt-6 pb-0">
                <div className="grid grid-cols-3 items-end gap-3 sm:gap-6 max-w-3xl mx-auto">
                    {podiumOrder.map(({ entry, rank, height, tone, icon }) => {
                        if (!entry) return <div key={rank} />
                        const isFirst = rank === 1
                        return (
                            <div key={entry.employeeId} className="flex flex-col items-center">
                                {/* `relative` parent so the sparkles + crown
                                    medals position against the avatar, not the
                                    nearest distant ancestor (the Card). */}
                                <div className="relative mb-2 flex flex-col items-center gap-2">
                                    {isFirst && (
                                        <div className="absolute -top-7 left-1/2 -translate-x-1/2">
                                            <Sparkles className="size-5 text-yellow-500 animate-pulse" />
                                        </div>
                                    )}
                                    <div className={cn(
                                        'relative rounded-full ring-4 transition-transform hover:scale-105',
                                        isFirst ? 'ring-yellow-400 shadow-lg shadow-yellow-200/50' : rank === 2 ? 'ring-slate-300' : 'ring-amber-300',
                                    )}>
                                        <InitialsAvatar
                                            name={entry.name}
                                            src={entry.avatarUrl}
                                            size="lg"
                                        />
                                        <div className="absolute -right-1 -bottom-1 rounded-full bg-background p-0.5 shadow-sm">
                                            {icon}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <p className={cn('font-semibold truncate max-w-[140px] sm:max-w-[180px]',
                                        isFirst ? 'text-base' : 'text-sm')}>{entry.name}</p>
                                    {entry.department && (
                                        <p className="text-[11px] text-muted-foreground truncate max-w-[140px] sm:max-w-[180px]">
                                            {entry.department}
                                        </p>
                                    )}
                                </div>
                                <div className={cn(
                                    'mt-3 w-full rounded-t-xl bg-gradient-to-b flex flex-col items-center justify-start pt-3 pb-1.5',
                                    tone, height,
                                )}>
                                    <span className={cn('font-bold tabular-nums',
                                        isFirst ? 'text-3xl' : 'text-2xl',
                                        isFirst ? 'text-amber-700' : rank === 2 ? 'text-slate-600' : 'text-amber-700',
                                    )}>
                                        #{rank}
                                    </span>
                                    <div className="mt-1 flex flex-col items-center gap-0.5">
                                        <span className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">
                                            {type === 'received' ? 'Received' : 'Given'}
                                        </span>
                                        <span className={cn('font-semibold tabular-nums',
                                            isFirst ? 'text-base' : 'text-sm')}>
                                            {entry.count}
                                        </span>
                                        {entry.points > 0 && (
                                            <span className="text-[10px] text-muted-foreground tabular-nums">
                                                {entry.points} pts
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}

function RankList({ entries, startRank, type }: { entries: LeaderboardEntry[]; startRank: number; type: LeaderType }) {
    return (
        <Card>
            <CardContent className="p-0">
                <div className="divide-y">
                    {entries.map((e, i) => {
                        const rank = startRank + i
                        return (
                            <div key={e.employeeId} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                                <div className="w-8 shrink-0 text-center">
                                    <span className="text-sm font-semibold tabular-nums text-muted-foreground">
                                        #{rank}
                                    </span>
                                </div>
                                <InitialsAvatar name={e.name} src={e.avatarUrl} size="md" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium truncate">{e.name}</p>
                                    <p className="text-[11px] text-muted-foreground truncate">
                                        {e.designation ?? '—'}{e.department ? ` · ${e.department}` : ''}
                                    </p>
                                </div>
                                <div className="flex flex-col items-end shrink-0">
                                    <span className="text-sm font-semibold tabular-nums">
                                        {e.count}
                                    </span>
                                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                        {type === 'received' ? 'received' : 'given'}
                                    </span>
                                </div>
                                {e.points > 0 && (
                                    <div className="ml-3 flex flex-col items-end shrink-0 min-w-[60px]">
                                        <span className="text-sm font-semibold text-primary tabular-nums">
                                            {e.points}
                                        </span>
                                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                            points
                                        </span>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            </CardContent>
        </Card>
    )
}

function PodiumSkeleton() {
    return (
        <div className="space-y-3">
            <Card><CardContent className="py-8"><div className="grid grid-cols-3 gap-4 max-w-3xl mx-auto">
                {[1, 2, 3].map(i => (
                    <div key={i} className="flex flex-col items-center gap-3">
                        <Skeleton className="size-16 rounded-full" />
                        <Skeleton className="h-3 w-24" />
                        <Skeleton className={cn('w-full rounded-t-xl', i === 1 ? 'h-44' : i === 2 ? 'h-32' : 'h-24')} />
                    </div>
                ))}
            </div></CardContent></Card>
            <Card><CardContent className="p-0">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 rounded-none" />)}
            </CardContent></Card>
        </div>
    )
}

// ── Analytics tab ─────────────────────────────────────────────────────────────
function AnalyticsTab({ period }: { period: Period }) {
    const summary = useAnalyticsSummary(period)
    const badges = useBadgesDistribution(period)

    if (summary.isLoading) {
        return (
            <div className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <Skeleton className="h-72 rounded-xl" />
                    <Skeleton className="h-72 rounded-xl" />
                </div>
                <Skeleton className="h-72 rounded-xl" />
            </div>
        )
    }

    const data = summary.data
    if (!data) {
        return (
            <EmptyState
                icon={<BarChart3 className="size-6 text-muted-foreground" />}
                title="No analytics yet"
                description="Once recognitions are published, charts and trends will populate this view."
            />
        )
    }

    const noActivity = data.totalRecognitions === 0

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiTile
                    label="Total recognitions"
                    value={data.totalRecognitions}
                    icon={<Award className="size-5" />}
                    tone="from-indigo-50 to-indigo-100 text-indigo-700 ring-indigo-200"
                />
                <KpiTile
                    label="Recipients"
                    value={data.totalRecipients}
                    icon={<Users className="size-5" />}
                    tone="from-emerald-50 to-emerald-100 text-emerald-700 ring-emerald-200"
                />
                <KpiTile
                    label="Givers"
                    value={data.totalGivers}
                    icon={<HandHeart className="size-5" />}
                    tone="from-rose-50 to-rose-100 text-rose-700 ring-rose-200"
                />
                <KpiTile
                    label="Avg per employee"
                    value={data.avgPerEmployee.toFixed(1)}
                    icon={<TrendingUp className="size-5" />}
                    tone="from-amber-50 to-amber-100 text-amber-700 ring-amber-200"
                />
            </div>

            {noActivity ? (
                <EmptyState
                    icon={<Sparkles className="size-6 text-muted-foreground" />}
                    title="No recognition activity in this period"
                    description="Try widening the period filter or encourage your team to recognize peers."
                />
            ) : (
                <>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <ChartCard title="By category" icon={<BarChart3 className="size-4 text-muted-foreground" />}>
                            <CategoryBarChart data={data.byCategory} />
                        </ChartCard>
                        <ChartCard title="By department" icon={<PieIcon className="size-4 text-muted-foreground" />}>
                            <DepartmentPieChart data={data.byDepartment} />
                        </ChartCard>
                    </div>
                    <ChartCard title="Monthly trend" icon={<Activity className="size-4 text-muted-foreground" />}>
                        <MonthlyTrendChart data={data.byMonth} />
                    </ChartCard>
                </>
            )}

            <BadgesDistributionTable
                rows={badges.data ?? []}
                loading={badges.isLoading}
            />
        </>
    )
}

function KpiTile({ label, value, icon, tone }: { label: string; value: number | string; icon: React.ReactNode; tone: string }) {
    return (
        <Card className={cn('overflow-hidden bg-gradient-to-br ring-1', tone)}>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-wide font-medium opacity-80">{label}</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
                    </div>
                    <div className="opacity-70">{icon}</div>
                </div>
            </CardContent>
        </Card>
    )
}

function ChartCard({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                    {icon}
                    <h3 className="text-sm font-semibold">{title}</h3>
                </div>
                {children}
            </CardContent>
        </Card>
    )
}

// ── Charts ────────────────────────────────────────────────────────────────────
function CategoryBarChart({ data }: { data: Array<{ key: string; label: string; color: string; count: number }> }) {
    const rows = useMemo(() => {
        return [...data]
            .filter(d => d.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
            .map((d, i) => ({
                ...d,
                fill: d.color && d.color.startsWith('#') ? d.color : CHART_PALETTE[i % CHART_PALETTE.length],
            }))
    }, [data])

    if (rows.length === 0) {
        return <p className="py-12 text-center text-xs text-muted-foreground">No category data</p>
    }
    return (
        <ResponsiveContainer width="100%" height={260}>
            <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgb(226 232 240)" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} stroke="rgb(148 163 184)" />
                <YAxis
                    type="category"
                    dataKey="label"
                    tick={{ fontSize: 11 }}
                    width={120}
                    stroke="rgb(148 163 184)"
                />
                <Tooltip
                    cursor={{ fill: 'rgba(99,102,241,0.05)' }}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid rgb(226 232 240)' }}
                    formatter={(value: unknown) => [Number(value ?? 0), 'recognitions']}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                    {rows.map((r, i) => <Cell key={i} fill={r.fill} />)}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}

function DepartmentPieChart({ data }: { data: Array<{ orgUnitId: string; name: string; count: number }> }) {
    const rows = useMemo(() => {
        return [...data]
            .filter(d => d.count > 0)
            .sort((a, b) => b.count - a.count)
            .slice(0, 8)
            .map((d, i) => ({ ...d, fill: CHART_PALETTE[i % CHART_PALETTE.length] }))
    }, [data])
    const total = rows.reduce((sum, r) => sum + r.count, 0)

    if (rows.length === 0) {
        return <p className="py-12 text-center text-xs text-muted-foreground">No department data</p>
    }
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                    <Pie
                        data={rows}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={85}
                        paddingAngle={2}
                        dataKey="count"
                        nameKey="name"
                    >
                        {rows.map((r, i) => <Cell key={i} fill={r.fill} />)}
                    </Pie>
                    <Tooltip
                        contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid rgb(226 232 240)' }}
                        formatter={(value: unknown, name: unknown) => [Number(value ?? 0), String(name ?? '')]}
                    />
                </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 max-h-[220px] overflow-auto pr-1">
                {rows.map((r) => {
                    const pct = total > 0 ? (r.count / total) * 100 : 0
                    return (
                        <div key={r.orgUnitId} className="flex items-center gap-2 text-[11px]">
                            <span className="size-2.5 rounded-full shrink-0" style={{ background: r.fill }} />
                            <span className="font-medium truncate flex-1" title={r.name}>{r.name}</span>
                            <span className="tabular-nums text-muted-foreground">{r.count}</span>
                            <span className="tabular-nums text-muted-foreground w-9 text-right">{pct.toFixed(0)}%</span>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

function MonthlyTrendChart({ data }: { data: Array<{ month: string; count: number }> }) {
    const rows = useMemo(() => data.map(d => ({ ...d })), [data])
    if (rows.length === 0) {
        return <p className="py-12 text-center text-xs text-muted-foreground">No trend data</p>
    }
    return (
        <ResponsiveContainer width="100%" height={260}>
            <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgb(226 232 240)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="rgb(148 163 184)" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="rgb(148 163 184)" />
                <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid rgb(226 232 240)' }}
                    formatter={(value: unknown) => [Number(value ?? 0), 'recognitions']}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line
                    type="monotone"
                    dataKey="count"
                    name="Recognitions"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: '#6366f1' }}
                    activeDot={{ r: 5 }}
                />
            </LineChart>
        </ResponsiveContainer>
    )
}

// ── Badges distribution ───────────────────────────────────────────────────────
function BadgesDistributionTable({
    rows,
    loading,
}: {
    rows: Array<{ badgeKey: string; label: string; level: BadgeLevel; color: string; count: number }>
    loading: boolean
}) {
    return (
        <Card>
            <CardContent className="p-4">
                <div className="mb-3 flex items-center gap-2">
                    <Gem className="size-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Badges distribution</h3>
                    {!loading && rows.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] ml-auto">
                            {rows.reduce((s, r) => s + r.count, 0)} awarded
                        </Badge>
                    )}
                </div>

                {loading ? (
                    <div className="space-y-2">
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 rounded-md" />)}
                    </div>
                ) : rows.length === 0 ? (
                    <p className="py-8 text-center text-xs text-muted-foreground">No badges have been awarded yet</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground border-b">
                                    <th className="py-2 px-2 font-medium">Badge</th>
                                    <th className="py-2 px-2 font-medium">Level</th>
                                    <th className="py-2 px-2 font-medium text-right">Times awarded</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* `toSorted` is ES2023; use spread+sort for broader lib compat. */}
                                {[...rows].sort((a, b) => b.count - a.count).map((r) => {
                                    const tone = BADGE_LEVEL_TONE[r.level] ?? BADGE_LEVEL_TONE.bronze
                                    return (
                                        <tr key={r.badgeKey} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                                            <td className="py-2.5 px-2">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className="size-7 rounded-md flex items-center justify-center text-white"
                                                        style={{ background: r.color || '#6366f1' }}
                                                    >
                                                        <Award className="size-3.5" />
                                                    </span>
                                                    <span className="font-medium">{r.label}</span>
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-2">
                                                <span className={cn(
                                                    'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1',
                                                    tone.bg, tone.text, tone.ring,
                                                )}>
                                                    {tone.label}
                                                </span>
                                            </td>
                                            <td className="py-2.5 px-2 text-right tabular-nums font-semibold">
                                                {r.count}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

// ── Misc ──────────────────────────────────────────────────────────────────────
function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
    return (
        <Card>
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                    {icon}
                </div>
                <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
                </div>
            </CardContent>
        </Card>
    )
}
