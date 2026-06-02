import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    Award, Trophy, Sparkles, Heart, ThumbsUp, PartyPopper, HandHeart, Crown,
    Users, MessageSquare, Send, Pin, Loader2, Plus, Filter, Search, Share2,
    TrendingUp, Star, ChevronRight, X,
} from 'lucide-react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelect } from '@/components/ui/multi-select'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, toast } from '@/components/ui/overlays'
import {
    useRecognitionFeed, useCreateRecognition, useSetReaction, useRemoveReaction,
    useTrendingRecognitions, useRecognitionCategories, useRecognitionBadges,
    useTopGivers, useTopRecognized, useAnalyticsSummary,
    type Recognition, type ReactionType, type Visibility, type NominationType,
} from '@/hooks/useRecognition'
import { useEmployees } from '@/hooks/useEmployees'
import { useTeams } from '@/hooks/useTeams'
import { useOrgUnits } from '@/hooks/useOrgUnits'
import { useAuthStore } from '@/store/authStore'
import { cn, formatDate } from '@/lib/utils'
import type { Employee } from '@/types'

// ── Reaction config ─────────────────────────────────────────────────────────
const REACTIONS: { type: ReactionType; icon: typeof Heart; label: string; color: string; bg: string }[] = [
    { type: 'like', icon: ThumbsUp, label: 'Like', color: 'text-blue-600', bg: 'bg-blue-50 ring-blue-200' },
    { type: 'celebrate', icon: PartyPopper, label: 'Celebrate', color: 'text-amber-600', bg: 'bg-amber-50 ring-amber-200' },
    { type: 'love', icon: Heart, label: 'Love', color: 'text-rose-600', bg: 'bg-rose-50 ring-rose-200' },
    { type: 'support', icon: HandHeart, label: 'Support', color: 'text-emerald-600', bg: 'bg-emerald-50 ring-emerald-200' },
    { type: 'congrats', icon: Crown, label: 'Congrats', color: 'text-purple-600', bg: 'bg-purple-50 ring-purple-200' },
]

const VISIBILITY_OPTIONS: { value: Visibility; label: string; desc: string }[] = [
    { value: 'public', label: 'Public', desc: 'Visible to everyone' },
    { value: 'team', label: 'Team', desc: 'Team members only' },
    { value: 'department', label: 'Department', desc: 'Department members only' },
    { value: 'branch', label: 'Branch', desc: 'Branch members only' },
    { value: 'manager', label: 'Manager', desc: "Recipient's manager only" },
    { value: 'hr', label: 'HR', desc: 'HR team only' },
    { value: 'private', label: 'Private', desc: 'Only the recipient' },
]

const NOMINATION_TYPES: { value: NominationType; label: string }[] = [
    { value: 'peer', label: 'Peer' },
    { value: 'manager', label: 'Manager' },
    { value: 'leadership', label: 'Leadership' },
    { value: 'self_nomination', label: 'Self-Nomination' },
    { value: 'employee_of_month', label: 'Employee of the Month' },
]

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
    { value: 'draft', label: 'Draft' },
    { value: 'pending', label: 'Pending' },
    { value: 'approved', label: 'Approved' },
    { value: 'published', label: 'Published' },
    { value: 'archived', label: 'Archived' },
    { value: 'rejected', label: 'Rejected' },
]

const DEFAULT_CATEGORY_COLOR = '#6366f1'

// ── Helpers ─────────────────────────────────────────────────────────────────
function initials(name?: string | null): string {
    if (!name) return '?'
    const parts = name.trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function withAlpha(hex: string, alpha: number): string {
    if (!hex?.startsWith('#') || hex.length < 7) return `rgba(99, 102, 241, ${alpha})`
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function buildRecipientLabel(r: Recognition): string {
    const list = r.recipients ?? []
    if (list.length === 0) return 'a colleague'
    if (list.length === 1) return list[0].name
    if (list.length === 2) return `${list[0].name} and ${list[1].name}`
    return `${list[0].name} and ${list.length - 1} others`
}

// ── Main page ───────────────────────────────────────────────────────────────
export function RecognitionFeedPage() {
    const { t } = useTranslation()
    const role = useAuthStore(s => s.user?.role)
    const canViewAnalytics = role === 'hr_manager' || role === 'super_admin' || role === 'dept_head'
    const [showFilters, setShowFilters] = useState(false)
    const [showGiveDialog, setShowGiveDialog] = useState(false)
    const [trendingOnly, setTrendingOnly] = useState(false)
    const [categoryFilter, setCategoryFilter] = useState<string>('all')
    const [visibilityFilter, setVisibilityFilter] = useState<string>('all')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [searchQuery, setSearchQuery] = useState('')

    const feedQuery = useRecognitionFeed({ limit: 20 })
    const trendingQuery = useTrendingRecognitions()
    const categoriesQuery = useRecognitionCategories()
    // Backend returns 403 on analytics endpoints for employees — only call when authorized.
    const summaryQuery = useAnalyticsSummary('30d')
    const topGivers = useTopGivers('30d')
    const topRecognized = useTopRecognized('30d')

    const allItems = useMemo<Recognition[]>(
        () => (feedQuery.data?.pages ?? []).flatMap(p => p.data),
        [feedQuery.data],
    )

    const trendingItems = trendingQuery.data ?? []
    const sourceItems = trendingOnly ? trendingItems : allItems

    const filteredItems = useMemo(() => {
        const q = searchQuery.trim().toLowerCase()
        return sourceItems.filter(r => {
            if (categoryFilter !== 'all' && r.categoryKey !== categoryFilter) return false
            if (visibilityFilter !== 'all' && r.visibility !== visibilityFilter) return false
            if (canViewAnalytics && statusFilter !== 'all' && r.status !== statusFilter) return false
            if (q) {
                const hay = `${r.title} ${r.message} ${r.giverName ?? ''} ${(r.recipients ?? []).map(x => x.name).join(' ')}`.toLowerCase()
                if (!hay.includes(q)) return false
            }
            return true
        })
    }, [sourceItems, categoryFilter, visibilityFilter, statusFilter, canViewAnalytics, searchQuery])

    const pinned = filteredItems.filter(r => r.isPinned)
    const unpinned = filteredItems.filter(r => !r.isPinned)

    const summary = summaryQuery.data
    const topCategory = summary?.byCategory?.[0]

    return (
        <PageWrapper>
            <PageHeader
                eyebrow={t('recognition.eyebrow', { defaultValue: 'Engagement' })}
                title={t('recognition.title', { defaultValue: 'Recognition' })}
                description={t('recognition.description', { defaultValue: 'Celebrate great work across the organization' })}
                actions={
                    <>
                        <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<Filter className="size-4" />}
                            onClick={() => setShowFilters(v => !v)}
                        >
                            {t('common.filter', { defaultValue: 'Filter' })}
                        </Button>
                        <Button
                            onClick={() => setShowGiveDialog(true)}
                            leftIcon={<Sparkles className="size-4" />}
                            className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white shadow-md hover:from-indigo-700 hover:via-violet-700 hover:to-fuchsia-700"
                        >
                            {t('recognition.giveRecognition', { defaultValue: 'Give Recognition' })}
                        </Button>
                    </>
                }
            />

            {/* KPI strip — HR/manager only; backend returns 403 for plain employees */}
            {canViewAnalytics && (
                <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <KpiTile
                        icon={Award}
                        label={t('recognition.kpi.thisMonth', { defaultValue: 'Recognitions this month' })}
                        value={summary?.totalRecognitions ?? 0}
                        loading={summaryQuery.isLoading}
                        accent="from-indigo-500 to-violet-500"
                    />
                    <KpiTile
                        icon={Star}
                        label={t('recognition.kpi.topCategory', { defaultValue: 'Top category' })}
                        value={topCategory?.label ?? '—'}
                        loading={summaryQuery.isLoading}
                        accent="from-amber-500 to-orange-500"
                    />
                    <KpiTile
                        icon={Users}
                        label={t('recognition.kpi.activeRecognizers', { defaultValue: 'Active recognizers' })}
                        value={summary?.totalGivers ?? 0}
                        loading={summaryQuery.isLoading}
                        accent="from-emerald-500 to-teal-500"
                    />
                </div>
            )}

            {/* Sticky filter bar */}
            <div className="sticky top-0 z-10 -mx-4 mt-6 border-b border-border bg-background/85 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:-mx-6 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-0 flex-1 max-w-md">
                        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder={t('recognition.search', { defaultValue: 'Search recognitions, people…' })}
                            className="pl-9"
                        />
                    </div>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('recognition.allCategories', { defaultValue: 'All categories' })}</SelectItem>
                            {(categoriesQuery.data ?? []).filter(c => !c.isArchived).map(c => (
                                <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Select value={visibilityFilter} onValueChange={setVisibilityFilter}>
                        <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Visibility" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('recognition.allVisibility', { defaultValue: 'All visibility' })}</SelectItem>
                            {VISIBILITY_OPTIONS.map(v => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {canViewAnalytics && (
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t('recognition.allStatuses', { defaultValue: 'All statuses' })}</SelectItem>
                                {STATUS_FILTER_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    )}
                    <button
                        type="button"
                        onClick={() => setTrendingOnly(v => !v)}
                        className={cn(
                            'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                            trendingOnly
                                ? 'border-orange-300 bg-orange-50 text-orange-700'
                                : 'border-input bg-background text-muted-foreground hover:bg-muted',
                        )}
                    >
                        <TrendingUp className="size-3.5" />
                        {t('recognition.trending', { defaultValue: 'Trending' })}
                    </button>
                    {(searchQuery || categoryFilter !== 'all' || visibilityFilter !== 'all' || statusFilter !== 'all' || trendingOnly) && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setSearchQuery(''); setCategoryFilter('all'); setVisibilityFilter('all'); setStatusFilter('all'); setTrendingOnly(false) }}
                            leftIcon={<X className="size-3.5" />}
                        >
                            {t('common.clear', { defaultValue: 'Clear' })}
                        </Button>
                    )}
                </div>
                {showFilters && (
                    <p className="mt-2 text-[11px] text-muted-foreground">
                        {t('recognition.filterHint', { defaultValue: 'Filters apply to the current feed view. Toggle Trending to see top reactions of the last 30 days.' })}
                    </p>
                )}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Main feed column */}
                <div className="lg:col-span-2 space-y-5">
                    {/* Pinned */}
                    {pinned.length > 0 && (
                        <div>
                            <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                <Pin className="size-3.5" />
                                {t('recognition.pinned', { defaultValue: 'Pinned' })}
                            </h2>
                            <div className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
                                {pinned.map(r => (
                                    <div key={r.id} className="w-[320px] shrink-0 snap-start sm:w-[360px]">
                                        <RecognitionCard r={r} compact />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Feed */}
                    <div className="space-y-4">
                        {feedQuery.isLoading ? (
                            [1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)
                        ) : unpinned.length === 0 ? (
                            <EmptyState onCreate={() => setShowGiveDialog(true)} />
                        ) : (
                            <>
                                {unpinned.map(r => <RecognitionCard key={r.id} r={r} />)}
                                {!trendingOnly && feedQuery.hasNextPage && (
                                    <div className="flex justify-center pt-2">
                                        <Button
                                            variant="outline"
                                            onClick={() => feedQuery.fetchNextPage()}
                                            disabled={feedQuery.isFetchingNextPage}
                                            leftIcon={feedQuery.isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : undefined}
                                        >
                                            {feedQuery.isFetchingNextPage
                                                ? t('common.loading', { defaultValue: 'Loading…' })
                                                : t('common.loadMore', { defaultValue: 'Load more' })}
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Sidebar */}
                <aside className="hidden lg:block">
                    <div className="sticky top-32 space-y-4">
                        <LeaderboardWidget
                            title={t('recognition.topGivers', { defaultValue: 'Top givers' })}
                            icon={Trophy}
                            entries={topGivers.data ?? []}
                            loading={topGivers.isLoading}
                            accent="from-amber-500 to-orange-500"
                        />
                        <LeaderboardWidget
                            title={t('recognition.topRecognized', { defaultValue: 'Top recognized' })}
                            icon={Award}
                            entries={topRecognized.data ?? []}
                            loading={topRecognized.isLoading}
                            accent="from-indigo-500 to-violet-500"
                        />
                        <Link
                            to="/recognition/leaderboard"
                            className="group flex items-center justify-between rounded-xl border bg-card p-3 text-sm font-medium transition-colors hover:bg-muted"
                        >
                            <span className="flex items-center gap-2"><Trophy className="size-4 text-amber-500" /> {t('recognition.viewLeaderboard', { defaultValue: 'View full leaderboard' })}</span>
                            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </Link>
                    </div>
                </aside>
            </div>

            {showGiveDialog && (
                <GiveRecognitionDialog
                    open={showGiveDialog}
                    onOpenChange={setShowGiveDialog}
                />
            )}
        </PageWrapper>
    )
}

// ── KPI tile ────────────────────────────────────────────────────────────────
function KpiTile({
    icon: Icon, label, value, loading, accent,
}: { icon: typeof Award; label: string; value: number | string; loading?: boolean; accent: string }) {
    return (
        <Card className="overflow-hidden">
            <div className={cn('h-1 w-full bg-gradient-to-r', accent)} />
            <CardContent className="flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
                    {loading ? (
                        <Skeleton className="mt-1 h-6 w-20" />
                    ) : (
                        <p className="mt-0.5 truncate text-xl font-semibold tracking-tight">{value}</p>
                    )}
                </div>
                <div className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm', accent)}>
                    <Icon className="size-5" />
                </div>
            </CardContent>
        </Card>
    )
}

// ── Recognition card ────────────────────────────────────────────────────────
function RecognitionCard({ r, compact = false }: { r: Recognition; compact?: boolean }) {
    const navigate = useNavigate()
    const setReaction = useSetReaction()
    const removeReaction = useRemoveReaction()
    const color = r.category?.color ?? DEFAULT_CATEGORY_COLOR
    const reactionCounts = r.reactionCounts ?? { like: 0, celebrate: 0, love: 0, support: 0, congrats: 0, total: 0 }
    const myReaction = r.myReaction ?? null

    const onReact = (type: ReactionType) => {
        if (myReaction === type) {
            removeReaction.mutate(r.id)
        } else {
            setReaction.mutate({ id: r.id, type })
        }
    }

    const onShare = (e: React.MouseEvent) => {
        e.stopPropagation()
        const url = `${window.location.origin}/recognition/${r.id}`
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url)
                .then(() => toast.success('Link copied'))
                .catch(() => toast.error('Copy failed'))
        }
    }

    return (
        <Card
            className={cn(
                'group relative overflow-hidden transition-all hover:shadow-md',
                compact ? 'h-full' : '',
            )}
        >
            {/* Gradient header strip */}
            <div
                className="h-1.5 w-full"
                style={{ backgroundImage: `linear-gradient(90deg, ${color}, ${withAlpha(color, 0.5)})` }}
            />
            {r.isPinned && (
                <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700 ring-1 ring-amber-200">
                    <Pin className="size-3" /> Pinned
                </div>
            )}

            <CardContent className={cn('p-5', compact && 'p-4')}>
                {/* Header: giver → recipients */}
                <div className="flex items-start gap-3">
                    <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm"
                        style={{ backgroundImage: `linear-gradient(135deg, ${color}, ${withAlpha(color, 0.65)})` }}
                    >
                        {initials(r.giverName)}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">
                            <span className="font-semibold">{r.giverName ?? 'Someone'}</span>
                            <span className="text-muted-foreground"> appreciated </span>
                            <span className="font-medium">{buildRecipientLabel(r)}</span>
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <span>{formatDate(r.publishedAt ?? r.createdAt, 'relative')}</span>
                            {r.achievementDate && (
                                <>
                                    <span>·</span>
                                    <span>Achievement on {formatDate(r.achievementDate)}</span>
                                </>
                            )}
                            <span>·</span>
                            <span className="capitalize">{r.visibility}</span>
                        </div>
                    </div>
                    {r.badge && (
                        <div
                            className="flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide ring-1"
                            style={{
                                backgroundColor: withAlpha(r.badge.color ?? color, 0.08),
                                color: r.badge.color ?? color,
                                borderColor: withAlpha(r.badge.color ?? color, 0.2),
                            }}
                            title={`${r.badge.label} · ${r.badge.level}`}
                        >
                            <Trophy className="size-5" />
                            <span className="capitalize">{r.badge.level}</span>
                        </div>
                    )}
                </div>

                {/* Category chip + points */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1"
                        style={{
                            backgroundColor: withAlpha(color, 0.1),
                            color: color,
                            borderColor: withAlpha(color, 0.25),
                        }}
                    >
                        <Award className="size-3" />
                        {r.category?.label ?? r.categoryKey}
                    </span>
                    {r.points > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
                            <Sparkles className="size-3" /> {r.points} pts
                        </span>
                    )}
                </div>

                {/* Title + body */}
                <h3 className={cn('mt-3 font-semibold tracking-tight', compact ? 'text-sm' : 'text-base')}>
                    {r.title}
                </h3>
                <p className={cn('mt-1 whitespace-pre-line text-sm text-muted-foreground', compact ? 'line-clamp-2' : 'line-clamp-3')}>
                    {r.message}
                </p>

                {/* Reaction strip */}
                <div className="mt-4 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                        {REACTIONS.map(reaction => {
                            const Icon = reaction.icon
                            const active = myReaction === reaction.type
                            const count = reactionCounts[reaction.type]
                            return (
                                <button
                                    key={reaction.type}
                                    type="button"
                                    onClick={() => onReact(reaction.type)}
                                    className={cn(
                                        'flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-all',
                                        active
                                            ? cn(reaction.color, reaction.bg, 'ring-1 scale-105')
                                            : 'text-muted-foreground hover:bg-muted',
                                    )}
                                    title={reaction.label}
                                >
                                    <Icon className={cn('size-3.5', active && 'fill-current')} />
                                    {count > 0 && <span>{count}</span>}
                                </button>
                            )
                        })}
                    </div>
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] text-muted-foreground"
                            onClick={() => navigate(`/recognition/${r.id}`)}
                            leftIcon={<MessageSquare className="size-3.5" />}
                        >
                            {r.commentCount ?? 0}
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-7"
                            onClick={onShare}
                            title="Copy link"
                        >
                            <Share2 className="size-3.5" />
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] font-semibold text-primary"
                            onClick={() => navigate(`/recognition/${r.id}`)}
                        >
                            View
                            <ChevronRight className="ml-0.5 size-3.5" />
                        </Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ onCreate }: { onCreate: () => void }) {
    return (
        <Card>
            <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
                <div className="relative">
                    <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-br from-indigo-200 to-fuchsia-200 blur-xl" />
                    <div className="flex size-16 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-lg">
                        <Sparkles className="size-7" />
                    </div>
                </div>
                <div>
                    <p className="text-base font-semibold">No recognitions yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">Be the first to celebrate someone’s great work.</p>
                </div>
                <Button
                    onClick={onCreate}
                    leftIcon={<Plus className="size-4" />}
                    className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white"
                >
                    Give recognition
                </Button>
            </CardContent>
        </Card>
    )
}

// ── Leaderboard widget ──────────────────────────────────────────────────────
function LeaderboardWidget({
    title, icon: Icon, entries, loading, accent,
}: {
    title: string
    icon: typeof Trophy
    entries: Array<{ employeeId: string; name: string; department?: string | null; count: number; points: number }>
    loading?: boolean
    accent: string
}) {
    return (
        <Card className="overflow-hidden">
            <div className={cn('h-1 w-full bg-gradient-to-r', accent)} />
            <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
                    <Icon className="size-4 text-muted-foreground" />
                </div>
                {loading ? (
                    <div className="space-y-2">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
                    </div>
                ) : entries.length === 0 ? (
                    <p className="py-4 text-center text-xs text-muted-foreground">No data yet.</p>
                ) : (
                    <ol className="space-y-1.5">
                        {entries.slice(0, 5).map((e, idx) => (
                            <li key={e.employeeId} className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-muted/60">
                                <span className={cn(
                                    'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                                    idx === 0 ? 'bg-amber-100 text-amber-700' :
                                        idx === 1 ? 'bg-slate-100 text-slate-700' :
                                            idx === 2 ? 'bg-orange-100 text-orange-700' :
                                                'bg-muted text-muted-foreground',
                                )}>
                                    {idx + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-medium">{e.name}</p>
                                    {e.department && <p className="truncate text-[10px] text-muted-foreground">{e.department}</p>}
                                </div>
                                <div className="text-right">
                                    <p className="text-xs font-semibold">{e.count}</p>
                                    {e.points > 0 && <p className="text-[10px] text-muted-foreground">{e.points} pts</p>}
                                </div>
                            </li>
                        ))}
                    </ol>
                )}
            </CardContent>
        </Card>
    )
}

// ── Give Recognition dialog ─────────────────────────────────────────────────
function GiveRecognitionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const create = useCreateRecognition()
    const categoriesQuery = useRecognitionCategories()
    const badgesQuery = useRecognitionBadges()
    const teamsQuery = useTeams()
    const orgUnitsQuery = useOrgUnits()
    const [employeeSearch, setEmployeeSearch] = useState('')
    const employeesQuery = useEmployees({ search: employeeSearch, limit: 30 })

    const [form, setForm] = useState({
        categoryKey: '',
        badgeKey: '' as string,
        title: '',
        message: '',
        achievementDate: '',
        visibility: 'public' as Visibility,
        nominationType: 'peer' as NominationType,
        points: 10,
        commentsDisabled: false,
        requireApproval: false,
    })
    const [recipients, setRecipients] = useState<Array<{ id: string; name: string }>>([])
    const [teamIds, setTeamIds] = useState<string[]>([])
    const [orgUnitIds, setOrgUnitIds] = useState<string[]>([])

    const categories = (categoriesQuery.data ?? []).filter(c => !c.isArchived)
    const badges = (badgesQuery.data ?? []).filter(b => !b.isArchived && (!form.categoryKey || !b.categoryKey || b.categoryKey === form.categoryKey))
    // Org-units: only department-type entries make sense for recognition targets.
    const departments = (orgUnitsQuery.data ?? []).filter(u => u.isActive && u.type === 'department')

    // Auto-select first category once loaded (state-during-render pattern)
    const [syncedCatList, setSyncedCatList] = useState(false)
    if (!syncedCatList && !form.categoryKey && categories.length > 0 && categoriesQuery.isFetched) {
        setSyncedCatList(true)
        setForm(f => ({ ...f, categoryKey: categories[0].key }))
    }

    const employees: Employee[] = employeesQuery.data?.data ?? []
    const recipientIds = recipients.map(r => r.id)
    // Hide already-selected employees from the search options (they show as chips).
    const filteredEmployees = employees.filter(e => !recipientIds.includes(e.id))

    // When a badge is picked, prefill points with the badge's defaultPoints.
    const onBadgeChange = (key: string) => {
        const next = key === '__none' ? '' : key
        setForm(f => {
            if (!next) return { ...f, badgeKey: '' }
            const badge = badges.find(b => b.key === next)
            return badge
                ? { ...f, badgeKey: next, points: badge.defaultPoints }
                : { ...f, badgeKey: next }
        })
    }

    const canSubmit =
        recipients.length > 0 &&
        form.categoryKey &&
        form.title.trim().length > 0 &&
        form.message.trim().length >= 10

    const submit = () => {
        if (!canSubmit) return
        create.mutate({
            categoryKey: form.categoryKey,
            badgeKey: form.badgeKey || null,
            title: form.title.trim(),
            message: form.message.trim(),
            achievementDate: form.achievementDate || null,
            visibility: form.visibility,
            nominationType: form.nominationType,
            points: Number(form.points) || 0,
            commentsDisabled: form.commentsDisabled,
            recipientEmployeeIds: recipients.map(r => r.id),
            teamIds: teamIds.length > 0 ? teamIds : undefined,
            orgUnitIds: orgUnitIds.length > 0 ? orgUnitIds : undefined,
            // requireApproval is read by the backend create-route only; cast through
            // because the RecognitionInput interface omits it (server-only flag).
            ...(form.requireApproval ? { requireApproval: true } : {}),
        } as any, {
            onSuccess: () => {
                toast.success('Recognition sent')
                onOpenChange(false)
            },
            onError: (e: any) => toast.error('Failed to send', e?.message),
        })
    }

    const pending = create.isPending

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white">
                            <Sparkles className="size-4" />
                        </div>
                        Give Recognition
                    </DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    {/* Recipients */}
                    <div className="space-y-1.5">
                        <Label className="text-xs font-semibold uppercase tracking-wide">Recipients *</Label>
                        <MultiSelect
                            placeholder="Search and select employees…"
                            searchPlaceholder="Search employees…"
                            emptyMessage="No matching employees."
                            filter={false}
                            withAvatars
                            loading={employeesQuery.isLoading}
                            search={employeeSearch}
                            onSearchChange={setEmployeeSearch}
                            options={filteredEmployees.map(e => ({
                                value: e.id,
                                label: e.fullName ?? `${e.firstName} ${e.lastName}`,
                                secondary: e.designation ?? e.department ?? undefined,
                                avatar: e.avatarUrl ?? e.avatar ?? undefined,
                            }))}
                            selected={recipients.map(r => ({ value: r.id, label: r.name }))}
                            onChange={sel => setRecipients(sel.map(s => ({ id: s.value, name: s.label })))}
                        />
                    </div>

                    {/* Teams (optional) */}
                    {(teamsQuery.data ?? []).length > 0 && (
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold uppercase tracking-wide">Teams (optional)</Label>
                            <MultiSelect
                                placeholder="Select teams…"
                                searchPlaceholder="Search teams…"
                                emptyMessage="No teams."
                                options={(teamsQuery.data ?? []).map(team => ({ value: team.id, label: team.name }))}
                                selected={(teamsQuery.data ?? []).filter(team => teamIds.includes(team.id)).map(team => ({ value: team.id, label: team.name }))}
                                onChange={sel => setTeamIds(sel.map(s => s.value))}
                            />
                        </div>
                    )}

                    {/* Departments (optional) */}
                    {departments.length > 0 && (
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold uppercase tracking-wide">Departments (optional)</Label>
                            <MultiSelect
                                placeholder="Select departments…"
                                searchPlaceholder="Search departments…"
                                emptyMessage="No departments."
                                options={departments.map(d => ({ value: d.id, label: d.name }))}
                                selected={departments.filter(d => orgUnitIds.includes(d.id)).map(d => ({ value: d.id, label: d.name }))}
                                onChange={sel => setOrgUnitIds(sel.map(s => s.value))}
                            />
                        </div>
                    )}

                    {/* Category & badge */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Category *</Label>
                            <Select value={form.categoryKey} onValueChange={(v) => setForm(f => ({ ...f, categoryKey: v, badgeKey: '' }))}>
                                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                                <SelectContent>
                                    {categories.map(c => (
                                        <SelectItem key={c.key} value={c.key}>
                                            <span className="flex items-center gap-2">
                                                <span
                                                    className="inline-block size-2.5 rounded-full"
                                                    style={{ backgroundColor: c.color || DEFAULT_CATEGORY_COLOR }}
                                                />
                                                {c.label}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Badge (optional)</Label>
                            <Select value={form.badgeKey || '__none'} onValueChange={onBadgeChange}>
                                <SelectTrigger><SelectValue placeholder="No badge" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none">No badge</SelectItem>
                                    {badges.map(b => (
                                        <SelectItem key={b.key} value={b.key}>
                                            <span className="flex items-center gap-2">
                                                <Trophy className="size-3.5" style={{ color: b.color }} />
                                                {b.label} <span className="text-muted-foreground capitalize">· {b.level} · {b.defaultPoints} pts</span>
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* Nomination type */}
                    <div className="space-y-1.5">
                        <Label>Nomination type</Label>
                        <Select value={form.nominationType} onValueChange={(v) => setForm(f => ({ ...f, nominationType: v as NominationType }))}>
                            <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                            <SelectContent>
                                {NOMINATION_TYPES.map(n => (
                                    <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Title */}
                    <div className="space-y-1.5">
                        <Label>Title *</Label>
                        <Input
                            value={form.title}
                            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                            placeholder="e.g. Delivered the migration ahead of schedule"
                            maxLength={120}
                        />
                    </div>

                    {/* Message */}
                    <div className="space-y-1.5">
                        <Label>Message *</Label>
                        <Textarea
                            rows={4}
                            value={form.message}
                            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                            placeholder="What did they do, and why does it matter? (min 10 characters)"
                        />
                        <p className="text-[10px] text-muted-foreground">
                            {form.message.trim().length}/10 minimum
                        </p>
                    </div>

                    {/* Achievement date + points */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Achievement date (optional)</Label>
                            <Input
                                type="date"
                                value={form.achievementDate}
                                onChange={e => setForm(f => ({ ...f, achievementDate: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Points (0–100)</Label>
                            <Input
                                type="number"
                                min={0}
                                max={100}
                                value={form.points}
                                onChange={e => setForm(f => ({ ...f, points: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                            />
                        </div>
                    </div>

                    {/* Visibility */}
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold uppercase tracking-wide">Visibility</Label>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            {VISIBILITY_OPTIONS.map(v => (
                                <button
                                    key={v.value}
                                    type="button"
                                    onClick={() => setForm(f => ({ ...f, visibility: v.value }))}
                                    className={cn(
                                        'flex flex-col items-start gap-0.5 rounded-lg border p-2.5 text-left transition-all',
                                        form.visibility === v.value
                                            ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                                            : 'border-input hover:bg-muted',
                                    )}
                                >
                                    <span className="text-xs font-semibold">{v.label}</span>
                                    <span className="text-[10px] text-muted-foreground">{v.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Toggles: comments + approval */}
                    <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                            <div className="min-w-0">
                                <p className="text-xs font-semibold">Disable comments</p>
                                <p className="text-[10px] text-muted-foreground">Hides the comment thread for this recognition.</p>
                            </div>
                            <Switch
                                checked={form.commentsDisabled}
                                onCheckedChange={(v) => setForm(f => ({ ...f, commentsDisabled: v }))}
                            />
                        </div>
                        <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                            <div className="min-w-0">
                                <p className="text-xs font-semibold">Require manager approval</p>
                                <p className="text-[10px] text-muted-foreground">Submit for approval instead of publishing immediately.</p>
                            </div>
                            <Switch
                                checked={form.requireApproval}
                                onCheckedChange={(v) => setForm(f => ({ ...f, requireApproval: v }))}
                            />
                        </div>
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
                    <Button
                        onClick={submit}
                        disabled={!canSubmit || pending}
                        className="gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 text-white hover:from-indigo-700 hover:via-violet-700 hover:to-fuchsia-700"
                        leftIcon={pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                    >
                        Send recognition
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
