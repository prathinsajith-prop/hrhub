import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
    ArrowRight,
    Award,
    Bell,
    CalendarClock,
    CalendarDays,
    CheckCircle2,
    ChevronRight,
    Clock,
    ExternalLink,
    LayoutDashboard,
    Link2,
    Loader2,
    LogIn,
    LogOut,
    Megaphone,
    MessageCircle,
    Newspaper,
    Pin,
    PenSquare,
    Send,
    Sparkles,
    Target,
    User,
    UserPlus,
    Contact as UserPin,
} from 'lucide-react'

import { useAuthStore } from '@/store/authStore'
import { useMyEmployee, useAccountFlags } from '@/hooks/useMe'
import { useLeaveRequests } from '@/hooks/useLeave'
import { useAttendance, useCheckIn, useCheckOut } from '@/hooks/useAttendance'
import {
    useAnnouncementFeed,
    useAnnouncementComments,
    useAddAnnouncementComment,
    useUpdatePost,
    type FeedAnnouncement,
} from '@/hooks/useAnnouncements'
import { BirthdaysCard } from '@/components/shared/BirthdaysCard'
import { CompactEmptyState } from '@/components/shared/EmptyState'
import { StartPostComposer } from '@/components/shared/StartPostComposer'
import { PostOwnerMenu } from '@/components/shared/PostOwnerMenu'
import { useMyChangeRequests } from '@/hooks/useProfileChanges'
import { useUnreadNotificationsCount } from '@/hooks/useNotifications'
import { formatTime } from '@/lib/datetime'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmployeeReportsPage } from './ReportsPage'
import { AnnouncementsPage } from './AnnouncementsPage'
import { RecognitionPage } from './RecognitionPage'
import { ROUTES } from '@/lib/routes'
import { cn, formatDate, formatShiftRange, initialsOf } from '@/lib/utils'
import type { LeaveStatus } from '@/types'

function greetingKey(hour: number): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
    if (hour < 12) return 'greetingMorning'
    if (hour < 17) return 'greetingAfternoon'
    return 'greetingEvening'
}

function formatJoinDate(joinDate: string | undefined | null, locale: string): string {
    if (!joinDate) return ''
    const d = new Date(joinDate)
    if (Number.isNaN(d.getTime())) return joinDate
    try {
        return d.toLocaleDateString(locale, { month: 'short', day: '2-digit', year: 'numeric' })
    } catch {
        return joinDate
    }
}

const STATUS_TONE: Record<LeaveStatus, string> = {
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    approved: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300',
    rejected: 'bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300',
    cancelled: 'bg-muted text-muted-foreground',
}

export function EmployeeHomePage() {
    const { t, i18n } = useTranslation()
    const navigate = useNavigate()
    const user = useAuthStore((s) => s.user)
    const employeeId = user?.employeeId ?? undefined
    const [tab, setTab] = useState('feed')

    const { data: me } = useMyEmployee()
    const { data: leaveList } = useLeaveRequests({ employeeId, limit: 4 })
    // Feed announcements load 3 at a time: first page renders 3, then the list
    // pulls the next 3 as the user scrolls (see AnnouncementsList sentinel).
    const {
        data: announcementPages,
        fetchNextPage: fetchMoreAnnouncements,
        hasNextPage: hasMoreAnnouncements,
        isFetchingNextPage: isLoadingMoreAnnouncements,
    } = useAnnouncementFeed(3)
    const announcements = announcementPages?.pages.flatMap((p) => p.data) ?? []
    const { data: myChanges } = useMyChangeRequests()
    const { data: unreadCount } = useUnreadNotificationsCount()

    const today = new Date().toISOString().slice(0, 10)
    const { data: todayAttendance } = useAttendance({
        employeeId,
        startDate: today,
        endDate: today,
        limit: 1,
    })
    const checkIn = useCheckIn()
    const checkOut = useCheckOut()
    // HR-controlled override — hide the live check-in/out widget entirely
    // when self-punch is revoked for this user.
    const { attendancePunchEnabled, portalPostEnabled } = useAccountFlags()

    const todayRecord = todayAttendance?.data?.[0]
    const isCheckedIn = !!todayRecord?.checkIn && !todayRecord?.checkOut
    const checkedOutToday = !!todayRecord?.checkOut
    const liveTimer = useLiveDuration(todayRecord?.checkIn, todayRecord?.checkOut)

    const pendingLeaveCount = leaveList?.data.filter((l) => l.status === 'pending').length ?? 0
    const pendingProfileChangeCount = myChanges?.filter((c) => c.status === 'pending').length ?? 0
    const unread = unreadCount ?? 0
    const openTasksTotal = pendingLeaveCount + pendingProfileChangeCount + unread

    const upcomingMyLeaves = (leaveList?.data ?? [])
        .filter((l) => (l.status === 'approved' || l.status === 'pending') && l.startDate >= today)
        .slice(0, 3)

    const joinDateLabel = formatJoinDate(me?.joinDate, i18n.language)
    const displayName = me ? `${me.firstName} ${me.lastName}`.trim() : (user?.name ?? '')

    return (
        <div className="space-y-6">
            {/* ── Greeting ──────────────────────────────────────────────── */}
            <header className="flex flex-wrap items-start sm:items-end justify-between gap-3">
                <div>
                    <p className="text-sm text-muted-foreground">
                        {t(`home.${greetingKey(new Date().getHours())}`)},
                    </p>
                    <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl 3xl:text-5xl">
                        {me ? `${me.firstName} ${me.lastName}`.trim() : (user?.name ?? '')} 👋
                    </h1>
                </div>
                <div className="text-end text-xs text-muted-foreground">
                    <div>{formatDate(today, { weekday: 'long' })}</div>
                    <div className="text-sm font-semibold text-foreground">
                        {formatDate(today, { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                </div>
            </header>

            {/* ── Adaptive home layout — the right sidebar (attendance,
                quick actions, important links, open tasks, birthdays, who's
                out) is only meaningful on the Feed tab. On Overview /
                Announcements / Recognitions the embedded page is its own
                full-width surface, so the sidebar is hidden and the main
                column spans the full width. The data hooks above stay live
                regardless, so switching back to Feed is instant. ── */}
            <div className={cn('grid gap-6', tab === 'feed' && 'lg:grid-cols-3')}>
                <div className={cn(tab === 'feed' && 'lg:col-span-2')}>
                    <Tabs value={tab} onValueChange={setTab} className="space-y-5">
                        <TabsList variant="underline">
                            <TabsTrigger value="feed">
                                <Newspaper className="size-3.5" /> {t('home.tabFeed', { defaultValue: 'Feed' })}
                            </TabsTrigger>
                            <TabsTrigger value="overview">
                                <LayoutDashboard className="size-3.5" /> {t('home.tabOverview', { defaultValue: 'Overview' })}
                            </TabsTrigger>
                            <TabsTrigger value="announcements">
                                <Megaphone className="size-3.5" /> {t('home.tabAnnouncements', { defaultValue: 'Announcements' })}
                            </TabsTrigger>
                            <TabsTrigger value="recognitions">
                                <Award className="size-3.5" /> {t('home.tabRecognitions', { defaultValue: 'Recognitions' })}
                            </TabsTrigger>
                        </TabsList>

                        {/* ── Feed — activity stream: welcome, announcements preview, recent leave ── */}
                        <TabsContent value="feed" className="space-y-6 focus-visible:outline-none">
                            {portalPostEnabled ? (
                                <StartPostComposer displayName={displayName} avatarUrl={me?.avatarUrl} />
                            ) : null}
                            <NewJoineeCard
                                displayName={displayName}
                                avatarUrl={me?.avatarUrl}
                                firstName={me?.firstName}
                                joinDateLabel={joinDateLabel}
                            />

                            <AnnouncementsList
                                items={announcements}
                                onViewAll={() => setTab('announcements')}
                                currentUserId={user?.id}
                                currentUserName={displayName}
                                currentUserAvatarUrl={me?.avatarUrl}
                                hasMore={hasMoreAnnouncements}
                                isLoadingMore={isLoadingMoreAnnouncements}
                                onLoadMore={fetchMoreAnnouncements}
                            />

                            {leaveList?.data && leaveList.data.length > 0 ? (
                                <section>
                                    <div className="mb-3 flex items-center justify-between">
                                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            {t('home.recentLeave', { defaultValue: 'Recent leave' })}
                                        </h2>
                                        <Link
                                            to={ROUTES.employeeLeave}
                                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                                        >
                                            {t('common.viewAll')} <ChevronRight className="size-3" data-rtl-flip />
                                        </Link>
                                    </div>
                                    <div className="space-y-2">
                                        {leaveList.data.slice(0, 3).map((req) => (
                                            <Card key={req.id} className="border-border/70 transition-colors hover:border-primary/30">
                                                <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-medium">{t(`leave.types.${req.leaveType}`, { defaultValue: req.leaveType })}</span>
                                                            <Badge className={cn('border-0 text-[10px] uppercase tracking-wider', STATUS_TONE[req.status])}>
                                                                {t(`leave.status.${req.status}`)}
                                                            </Badge>
                                                        </div>
                                                        <div className="mt-0.5 text-xs text-muted-foreground">
                                                            {formatDate(req.startDate)} → {formatDate(req.endDate)} · {t(req.days === 1 ? 'leave.days' : 'leave.days_plural', { count: req.days })}
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </div>
                                </section>
                            ) : null}
                        </TabsContent>

                        {/* ── Overview — the renamed Reports view, embedded ── */}
                        <TabsContent value="overview" className="focus-visible:outline-none">
                            <EmployeeReportsPage embedded />
                        </TabsContent>

                        {/* ── Announcements — full feed with comments ── */}
                        <TabsContent value="announcements" className="focus-visible:outline-none">
                            <AnnouncementsPage embedded />
                        </TabsContent>

                        {/* ── Recognitions — company-wide recognition feed ── */}
                        <TabsContent value="recognitions" className="focus-visible:outline-none">
                            <RecognitionPage embedded />
                        </TabsContent>
                    </Tabs>
                </div>
                {/* /Left column */}

                {/* ── Right sidebar widgets — only meaningful on the Feed
                    tab. Other tabs render their own full-width surface. ── */}
                {tab === 'feed' && (
                    <aside className="space-y-6">
                        <AttendanceSidebarCard
                            todayRecord={todayRecord}
                            isCheckedIn={isCheckedIn}
                            checkedOutToday={checkedOutToday}
                            liveTimer={liveTimer}
                            attendancePunchEnabled={attendancePunchEnabled}
                            shift={me?.shift ?? null}
                            onCheckIn={() => checkIn.mutate({}, { onSuccess: () => toast.success(t('attendance.checkIn')) })}
                            onCheckOut={() => checkOut.mutate({}, { onSuccess: () => toast.success(t('attendance.checkOut')) })}
                            checkInPending={checkIn.isPending}
                            checkOutPending={checkOut.isPending}
                        />
                        {/* Quick Actions — moved here, directly under the Attendance card. */}
                        <Card className="border-border/70">
                            <CardContent className="p-5 sm:p-6">
                                <h2 className="mb-3 font-display text-base font-semibold text-foreground">
                                    {t('home.quickActions')}
                                </h2>
                                <div className="grid grid-cols-3 gap-2">
                                    <QuickActionTile icon={PenSquare} label={t('home.createPost')} onClick={() => navigate(ROUTES.employeeAnnouncements)} />
                                    <QuickActionTile icon={UserPlus} label={t('home.refer')} onClick={() => navigate(ROUTES.employeeReferrals)} />
                                    <QuickActionTile icon={Award} label={t('home.recognize')} onClick={() => navigate(ROUTES.employeeRecognition)} />
                                    <QuickActionTile icon={CalendarClock} label={t('home.regulariseAttendance')} onClick={() => navigate(ROUTES.employeeAttendance)} />
                                    <QuickActionTile icon={CalendarDays} label={t('home.applyLeave')} onClick={() => navigate(ROUTES.employeeLeave)} />
                                    <QuickActionTile icon={Target} label={t('home.createGoal')} onClick={() => navigate(ROUTES.employeeGoals)} />
                                </div>
                            </CardContent>
                        </Card>
                        <ImportantLinksCard />
                        <OpenTasksCard
                            pendingLeaveCount={pendingLeaveCount}
                            pendingProfileChangeCount={pendingProfileChangeCount}
                            unread={unread}
                            openTasksTotal={openTasksTotal}
                            onOpenLeave={() => navigate(ROUTES.employeeLeave)}
                            onOpenProfile={() => navigate(ROUTES.employeeProfile)}
                            onOpenNotifications={() => navigate(ROUTES.notifications)}
                        />
                        {/* Department birthdays today — moved here from the
                            portal Reports page. Sits directly after the Open
                            Tasks card so the right rail goes: my live state
                            (attendance) → my actions (open tasks) → people
                            signals (birthdays, who's out). */}
                        <BirthdaysCard title={t('home.departmentBirthdaysToday', { defaultValue: 'Department birthdays today' })} />
                        <WhoIsOutCard
                            upcomingLeaves={upcomingMyLeaves}
                            onViewAll={() => setTab('overview')}
                        />
                    </aside>
                )}
            </div>
        </div>
    )
}

function QuickActionTile({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
    // Compact, single-orientation tile (icon on top, label below) for both
    // breakpoints — keeps the row visually uniform whether it's 3-up
    // (mobile) or 6-up (tablet+). The mobile build used to switch to a
    // horizontal layout on `sm:`, but on a 6-col tablet row that flipped
    // each tile to icon-left/label-right and overflowed the column.
    //
    // Sizing trimmed across the board:
    //   • icon badge 9 → 8
    //   • padding 12-16 → 8-10
    //   • label text-xs (was -sm on tablet) with tight leading
    //   • truncate to 1 line everywhere; full label stays in the `title`
    //     attribute for the rare case of a long string.
    return (
        <button
            type="button"
            onClick={onClick}
            title={label}
            className="group flex flex-col items-center gap-1 rounded-lg bg-muted/40 px-2 py-2.5 text-center transition-all hover:bg-accent/60 hover:shadow-sm active:scale-[0.97]"
        >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-card shadow-sm">
                <Icon className="size-3.5 text-primary" />
            </span>
            <span className="w-full truncate text-[11px] font-medium leading-tight text-foreground">
                {label}
            </span>
        </button>
    )
}

// `CardEmptyState` used to live here as a private duplicate of the
// shared `CompactEmptyState`. The alias keeps the local call sites
// (4 of them) intact while delegating to the single source of truth.
const CardEmptyState = CompactEmptyState

interface NewJoineeCardProps {
    displayName: string
    avatarUrl?: string | null
    firstName?: string | null
    joinDateLabel: string
}

function NewJoineeCard({ displayName, avatarUrl, firstName, joinDateLabel }: NewJoineeCardProps) {
    const { t } = useTranslation()

    return (
        <Card className="overflow-hidden border-border/70">
            {/* ─── Header strip ─── */}
            <div className="flex items-center gap-3 px-5 py-4 sm:px-6">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                    <UserPin className="size-5 text-slate-600 dark:text-slate-300" />
                </span>
                <div className="min-w-0">
                    <h2 className="font-display text-base font-semibold text-foreground">{t('home.newJoinee')}</h2>
                    <p className="text-xs text-muted-foreground">
                        {t('home.systemNotification')}{joinDateLabel ? ` · ${joinDateLabel}` : ''}
                    </p>
                </div>
            </div>

            {/* ─── Banner strip ─── */}
            <div className="relative h-40 overflow-hidden bg-gradient-to-b from-emerald-50 via-teal-50 to-emerald-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/40">
                {/* Decorative leaves — pure CSS shapes evoking the reference */}
                <LeafCluster className="absolute -bottom-2 -left-3 text-emerald-500/70" />
                <LeafCluster className="absolute -bottom-2 -right-3 scale-x-[-1] text-emerald-500/70" />
                <span aria-hidden className="absolute right-12 top-3 size-2 rounded-full bg-emerald-400/60" />
                <span aria-hidden className="absolute left-12 top-6 size-1.5 rounded-full bg-emerald-400/50" />
                <span aria-hidden className="absolute right-1/3 top-8 size-1 rounded-full bg-emerald-400/60" />

                {/* Welcome text */}
                <div className="relative flex h-full items-center justify-center">
                    <p className="font-display text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-3xl">
                        {t('home.welcomeOnBoard')}
                    </p>
                </div>
            </div>

            {/* ─── Footer strip with overlapping avatar ─── */}
            <div className="relative flex flex-col items-center px-5 pb-5 pt-0 sm:px-6">
                <Avatar className="-mt-9 mb-2 size-[72px] border-4 border-card shadow-md">
                    {avatarUrl ? <AvatarImage src={avatarUrl} alt={displayName} /> : null}
                    <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-sky-100 font-display text-xl font-semibold text-indigo-700 dark:from-indigo-950/60 dark:to-sky-950/40 dark:text-indigo-200">
                        {initialsOf(displayName || firstName || '')}
                    </AvatarFallback>
                </Avatar>
                <p className="text-sm font-bold uppercase tracking-wider text-foreground">{displayName}</p>
            </div>
        </Card>
    )
}

interface AnnouncementsListProps {
    items: FeedAnnouncement[]
    onViewAll: () => void
    currentUserId?: string
    currentUserName?: string
    currentUserAvatarUrl?: string | null
    hasMore?: boolean
    isLoadingMore?: boolean
    onLoadMore?: () => void
}

function AnnouncementsList({
    items,
    onViewAll,
    currentUserId,
    currentUserName,
    currentUserAvatarUrl,
    hasMore = false,
    isLoadingMore = false,
    onLoadMore,
}: AnnouncementsListProps) {
    const { t, i18n } = useTranslation()
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const listRef = useRef<HTMLUListElement | null>(null)
    const sentinelRef = useRef<HTMLDivElement | null>(null)
    const [maxHeight, setMaxHeight] = useState<number | undefined>(undefined)

    // Show three announcements at a time: cap the visible area to the height of
    // the first three real cards (+ a sliver of the next as a scroll affordance),
    // and let the rest scroll inside the card. Derived from the actual rendered
    // cards so the window always matches three, whatever their content height.
    useLayoutEffect(() => {
        const ul = listRef.current
        if (!ul) return
        const lis = Array.from(ul.children) as HTMLElement[]
        if (lis.length <= 3) {
            setMaxHeight(undefined)
            return
        }
        const rowGap = parseFloat(getComputedStyle(ul).rowGap) || 16
        const threeCards = lis.slice(0, 3).reduce((sum, li) => sum + li.offsetHeight, 0)
        setMaxHeight(Math.round(threeCards + rowGap * 2 + 28))
    }, [items.length])

    // Infinite scroll within the capped window: when the sentinel nears the
    // bottom of the scroll container, pull the next page (3 more). Scoped to the
    // scroll container as root so it fires on inner-scroll, not page-scroll.
    useEffect(() => {
        const node = sentinelRef.current
        if (!node || !hasMore || !onLoadMore) return
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) onLoadMore()
            },
            { root: scrollRef.current ?? null, rootMargin: '120px' },
        )
        observer.observe(node)
        return () => observer.disconnect()
    }, [hasMore, onLoadMore, items.length, maxHeight])

    return (
        <Card className="overflow-hidden border-border/70">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-3 sm:px-6">
                <h2 className="font-display text-base font-semibold text-foreground">
                    {t('home.announcements')}
                </h2>
                {items.length > 0 ? (
                    <button
                        type="button"
                        onClick={onViewAll}
                        className="text-xs font-medium text-primary hover:underline"
                    >
                        {t('home.viewAll')}
                    </button>
                ) : null}
            </div>
            <CardContent className="p-5 sm:p-6">
                {items.length === 0 ? (
                    <CardEmptyState icon={Megaphone} message={t('home.noAnnouncements')} />
                ) : (
                    <div
                        ref={scrollRef}
                        style={maxHeight ? { maxHeight } : undefined}
                        className={cn(maxHeight && 'overflow-y-auto overscroll-contain -mr-2.5 pr-2.5')}
                    >
                        <ul ref={listRef} className="space-y-4">
                            {items.map((a) => (
                                <li key={a.id}>
                                    <AnnouncementCard
                                        item={a}
                                        locale={i18n.language}
                                        currentUserId={currentUserId}
                                        currentUserName={currentUserName}
                                        currentUserAvatarUrl={currentUserAvatarUrl}
                                    />
                                </li>
                            ))}
                        </ul>
                        {hasMore ? (
                            <div ref={sentinelRef} className="flex justify-center pt-4 text-muted-foreground">
                                {isLoadingMore ? <Loader2 className="size-4 animate-spin" /> : null}
                            </div>
                        ) : null}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

function AnnouncementCard({
    item,
    locale,
    currentUserId,
    currentUserName,
    currentUserAvatarUrl,
}: {
    item: FeedAnnouncement
    locale: string
    currentUserId?: string
    currentUserName?: string
    currentUserAvatarUrl?: string | null
}) {
    const { t } = useTranslation()
    const dateLabel = formatJoinDate(item.publishedAt ?? item.createdAt, locale)
    const authorInitials = initialsOf(item.authorName ?? '?')

    // Own posts (authored by the signed-in user) get edit/delete affordances.
    // Ownership is the createdBy match — so this never exposes controls on
    // HR-authored announcements, even for a user with the post permission.
    const isOwn = !!item.createdBy && !!currentUserId && item.createdBy === currentUserId
    const updatePost = useUpdatePost()
    const [editing, setEditing] = useState(false)
    const [editText, setEditText] = useState(item.body)

    function saveEdit() {
        const body = editText.trim()
        if (!body || updatePost.isPending) return
        updatePost.mutate(
            { id: item.id, body },
            {
                onSuccess: () => {
                    setEditing(false)
                    toast.success(t('post.updated', { defaultValue: 'Post updated' }))
                },
                onError: (err: unknown) =>
                    toast.error(err instanceof Error ? err.message : t('post.failed', { defaultValue: 'Could not update post' })),
            },
        )
    }

    // Lazy-load comments only when the user opens the thread — keeps the
    // home feed snappy when there are several announcements but each
    // thread is unread. The toggle flips `showComments`, which is also
    // what flips the textarea/submit into "active" state.
    const [showComments, setShowComments] = useState(false)
    const [draft, setDraft] = useState('')
    const { data: comments } = useAnnouncementComments(item.id, showComments)
    const addComment = useAddAnnouncementComment(item.id)
    const commentCount = comments?.length ?? 0

    function submitComment() {
        const body = draft.trim()
        if (!body || addComment.isPending) return
        addComment.mutate(
            { body },
            {
                onSuccess: () => {
                    setDraft('')
                    setShowComments(true)
                },
                onError: (err: unknown) => {
                    const message = err instanceof Error ? err.message : 'Could not post comment'
                    toast.error(message)
                },
            },
        )
    }

    return (
        <article className="rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border sm:p-5">
            {/* ── Author identity + timestamp ──
                Single source of authorship. The old card showed the author
                once in a header strip AND again in a dedicated "Author"
                footer block — redundant and amateurish. One avatar + name +
                date row reads cleanly, like any modern social feed. */}
            <header className="flex items-center gap-3">
                <Avatar className="size-9 shrink-0">
                    <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-sky-100 text-[11px] font-semibold text-indigo-700 dark:from-indigo-950/60 dark:to-sky-950/40 dark:text-indigo-200">
                        {authorInitials}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{item.authorName ?? '—'}</p>
                    {dateLabel ? <p className="text-xs text-muted-foreground">{dateLabel}</p> : null}
                </div>
                {item.pinned ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 ring-1 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900">
                        <Pin className="size-3" data-rtl-flip />
                        {t('home.pinned', { defaultValue: 'Pinned' })}
                    </span>
                ) : null}
                {isOwn && !editing ? (
                    <PostOwnerMenu item={item} onEdit={() => { setEditText(item.body); setEditing(true) }} />
                ) : null}
            </header>

            {/* ── Title + body, or the inline editor for an own post ── */}
            {editing ? (
                <div className="mt-3">
                    <textarea
                        autoFocus
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        rows={3}
                        maxLength={5000}
                        className="w-full resize-none rounded-xl border border-border/70 bg-background px-3.5 py-2.5 text-sm leading-relaxed outline-none transition-colors focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
                    />
                    <div className="mt-2 flex items-center justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                            {t('common.cancel', { defaultValue: 'Cancel' })}
                        </Button>
                        <Button type="button" size="sm" onClick={saveEdit} disabled={!editText.trim() || updatePost.isPending}>
                            {updatePost.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                            <span className={updatePost.isPending ? 'ms-1.5' : ''}>{t('common.save', { defaultValue: 'Save' })}</span>
                        </Button>
                    </div>
                </div>
            ) : (
                <div className="mt-3 space-y-1.5">
                    {item.title ? (
                        <h3 className="font-display text-base font-semibold leading-snug text-foreground">{item.title}</h3>
                    ) : null}
                    {item.body ? (
                        <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                    ) : null}
                </div>
            )}

            {/* ── Comment affordance ──
                A single, honest control. The disabled "React — coming soon"
                button is gone (a button that does nothing reads as
                unfinished). Tapping the count opens the thread + input. */}
            <div className="mt-4 border-t border-border/40 pt-3">
                <button
                    type="button"
                    onClick={() => setShowComments((v) => !v)}
                    aria-expanded={showComments}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    <MessageCircle className="size-4" />
                    {t('home.commentsCountOther', { count: commentCount })}
                </button>
            </div>

            {/* ── Existing comments (only when expanded) ── */}
            {showComments && commentCount > 0 ? (
                <ul className="mt-3 space-y-2.5">
                    {comments?.map((c) => (
                        <li key={c.id} className="flex items-start gap-2.5">
                            <Avatar className="size-7 shrink-0">
                                <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-sky-100 text-[10px] font-semibold text-indigo-700 dark:from-indigo-950/60 dark:to-sky-950/40 dark:text-indigo-200">
                                    {initialsOf(c.authorName ?? '?')}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 flex-1 rounded-2xl bg-muted/50 px-3 py-2">
                                <p className="text-[11px] font-medium text-foreground">
                                    {c.authorName ?? '—'}
                                    <span className="ms-1.5 font-normal tabular-nums text-muted-foreground">
                                        {formatJoinDate(c.createdAt, locale)}
                                    </span>
                                </p>
                                <p className="mt-0.5 whitespace-pre-line break-words text-sm text-foreground">{c.body}</p>
                            </div>
                        </li>
                    ))}
                </ul>
            ) : null}

            {/* ── Add a comment ──
                Submit on click OR Enter; Shift+Enter inserts a newline.
                Send button spins while in flight, disabled when empty. */}
            <div className="mt-3 flex items-center gap-2.5">
                <Avatar className="size-8 shrink-0">
                    {currentUserAvatarUrl ? <AvatarImage src={currentUserAvatarUrl} /> : null}
                    <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-sky-100 text-[11px] font-semibold text-indigo-700 dark:from-indigo-950/60 dark:to-sky-950/40 dark:text-indigo-200">
                        {initialsOf(currentUserName)}
                    </AvatarFallback>
                </Avatar>
                <div className="relative flex-1">
                    <input
                        type="text"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault()
                                submitComment()
                            }
                        }}
                        placeholder={t('home.addComment')}
                        disabled={addComment.isPending}
                        className="w-full rounded-full border border-border/70 bg-background px-4 py-2 pe-10 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                    />
                    <button
                        type="button"
                        onClick={submitComment}
                        disabled={!draft.trim() || addComment.isPending}
                        aria-label={t('home.addComment')}
                        className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-transparent"
                    >
                        {addComment.isPending ? (
                            <Loader2 className="size-4 animate-spin" />
                        ) : (
                            <Send className="size-4" data-rtl-flip />
                        )}
                    </button>
                </div>
            </div>
        </article>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Right-sidebar widgets
// ──────────────────────────────────────────────────────────────────────────

interface AttendanceSidebarCardProps {
    todayRecord:
        | {
              checkIn?: string | null
              checkOut?: string | null
              hoursWorked?: number | string | null
          }
        | null
        | undefined
    isCheckedIn: boolean
    checkedOutToday: boolean
    liveTimer: string
    attendancePunchEnabled: boolean
    shift: { name?: string | null; startTime?: string | null; endTime?: string | null } | null
    onCheckIn: () => void
    onCheckOut: () => void
    checkInPending: boolean
    checkOutPending: boolean
}

function AttendanceSidebarCard({
    todayRecord,
    isCheckedIn,
    checkedOutToday,
    liveTimer,
    attendancePunchEnabled,
    shift,
    onCheckIn,
    onCheckOut,
    checkInPending,
    checkOutPending,
}: AttendanceSidebarCardProps) {
    const { t } = useTranslation()
    const shiftRange = shift ? formatShiftRange(shift.startTime ?? null, shift.endTime ?? null) : null

    return (
        <Card className="border-border/70">
            <CardContent className="space-y-3 p-5 sm:p-6">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <Clock className="size-3.5 text-primary" />
                    {t('attendance.title')}
                </div>

                {shift?.name && shiftRange ? (
                    <div className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {shift.name} · {shiftRange}
                    </div>
                ) : null}

                {todayRecord?.checkIn ? (
                    // Time strip — colour-coded for in vs out so the
                    // employee can read both states at a glance:
                    //   • In  = emerald + LogIn icon
                    //   • Out = rose + LogOut icon
                    //   • Pending out = subtle pulsing dot
                    // The plain `10:42 am → 10:42 am` rendering previously
                    // gave no visual cue which time was which, so a same-
                    // minute check-in / check-out (a real edge case but a
                    // common test path) looked identical to a single read.
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 dark:bg-emerald-950/40">
                            <LogIn className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span className="font-display text-base font-bold tabular-figures text-emerald-700 dark:text-emerald-300">
                                {formatTime(todayRecord.checkIn)}
                            </span>
                        </span>
                        <ArrowRight className="size-3.5 text-muted-foreground/60 shrink-0" aria-hidden />
                        {todayRecord.checkOut ? (
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-rose-50 px-2 py-1 dark:bg-rose-950/40">
                                <LogOut className="size-3.5 text-rose-600 dark:text-rose-400" />
                                <span className="font-display text-base font-bold tabular-figures text-rose-700 dark:text-rose-300">
                                    {formatTime(todayRecord.checkOut)}
                                </span>
                            </span>
                        ) : (
                            // In-progress chip — shows a live ticker so the
                            // employee can see how long they've been clocked
                            // in without the duration crowding the action
                            // button below. The ticker comes from
                            // `useLiveDuration`, which updates every second.
                            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50/60 px-2 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                                <span className="relative inline-flex size-2 items-center justify-center">
                                    <span className="absolute size-2 rounded-full bg-emerald-500 animate-ping opacity-60" />
                                    <span className="relative size-2 rounded-full bg-emerald-500" />
                                </span>
                                <span className="tabular-nums">{liveTimer}</span>
                            </span>
                        )}
                        {todayRecord.hoursWorked && Number(todayRecord.hoursWorked) > 0 ? (
                            <Badge variant="secondary" className="text-[10px] tabular-figures">
                                {Number(todayRecord.hoursWorked).toFixed(2)}h
                            </Badge>
                        ) : null}
                    </div>
                ) : (
                    <p className="font-display text-base font-semibold text-foreground">{t('home.checkInPrompt')}</p>
                )}

                {attendancePunchEnabled ? (
                    // Three-state action area:
                    //   1. Not yet checked in today → "Check in" button.
                    //   2. Currently checked in     → "Check out" button + live timer.
                    //   3. Already checked out      → small "Session complete" hint
                    //      ABOVE a "Check in again" button. Backend supports
                    //      multiple sessions per day (lunch out / back in /
                    //      out again — see recordPunch alternation rules);
                    //      the home card previously locked on `checkedOutToday`
                    //      and refused to render a new check-in button, which
                    //      forced employees to navigate to /me/attendance
                    //      just to start a second session.
                    <div className="pt-1 space-y-2">
                        {checkedOutToday && !isCheckedIn ? (
                            <span className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-emerald-50 px-3 py-1.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                <CheckCircle2 className="size-3.5" />
                                Session complete
                                {todayRecord?.hoursWorked && Number(todayRecord.hoursWorked) > 0 ? (
                                    <span className="tabular-nums opacity-80">
                                        · {Number(todayRecord.hoursWorked).toFixed(2)}h today
                                    </span>
                                ) : null}
                            </span>
                        ) : null}
                        {isCheckedIn ? (
                            // Check-out button — rose-tinted to match the
                            // rose "out" chip the click is going to fill in.
                            // The live timer no longer rides inside the
                            // label (it's now on the in-progress chip
                            // above), so the button reads as a clear,
                            // single-intent action: "end the session".
                            <Button
                                onClick={onCheckOut}
                                loading={checkOutPending}
                                className="w-full bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500/40 dark:bg-rose-700 dark:hover:bg-rose-800"
                            >
                                <LogOut className="size-4" />
                                {t('attendance.checkOut')}
                            </Button>
                        ) : (
                            <Button
                                onClick={onCheckIn}
                                loading={checkInPending}
                                className="w-full bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500/40 dark:bg-emerald-700 dark:hover:bg-emerald-800"
                            >
                                <LogIn className="size-4" />
                                {/* "Check in" the first time today; "Check in again"
                                    for a second/third session after a check-out. */}
                                {checkedOutToday ? t('attendance.checkInAgain', { defaultValue: 'Check in again' }) : t('attendance.checkIn')}
                            </Button>
                        )}
                    </div>
                ) : null}
            </CardContent>
        </Card>
    )
}

function ImportantLinksCard() {
    const { t } = useTranslation()
    return (
        <Card className="border-border/70">
            <CardContent className="p-5 sm:p-6">
                <h2 className="mb-4 font-display text-base font-semibold text-foreground">
                    {t('home.importantLinks')}
                </h2>
                <CardEmptyState icon={Link2} message={t('home.noLinksAvailable')} />
            </CardContent>
        </Card>
    )
}

interface OpenTasksCardProps {
    pendingLeaveCount: number
    pendingProfileChangeCount: number
    unread: number
    openTasksTotal: number
    onOpenLeave: () => void
    onOpenProfile: () => void
    onOpenNotifications: () => void
}

function OpenTasksCard({
    pendingLeaveCount,
    pendingProfileChangeCount,
    unread,
    openTasksTotal,
    onOpenLeave,
    onOpenProfile,
    onOpenNotifications,
}: OpenTasksCardProps) {
    const { t } = useTranslation()

    return (
        <Card className="border-border/70">
            <CardContent className="p-5 sm:p-6">
                <h2 className="mb-4 font-display text-base font-semibold text-foreground">
                    {t('home.openTasks')}
                </h2>
                {openTasksTotal === 0 ? (
                    <CardEmptyState icon={Sparkles} message={t('home.noPendingTask')} />
                ) : (
                    <ul className="-mx-1 divide-y divide-border/60">
                        {pendingLeaveCount > 0 ? (
                            <TaskRow
                                icon={CalendarDays}
                                iconClass="text-amber-500"
                                label={t(pendingLeaveCount === 1 ? 'home.pendingLeaveRequestOne' : 'home.pendingLeaveRequestOther', { count: pendingLeaveCount })}
                                onClick={onOpenLeave}
                            />
                        ) : null}
                        {pendingProfileChangeCount > 0 ? (
                            <TaskRow
                                icon={User}
                                iconClass="text-sky-500"
                                label={t(pendingProfileChangeCount === 1 ? 'home.pendingProfileChangeOne' : 'home.pendingProfileChangeOther', { count: pendingProfileChangeCount })}
                                onClick={onOpenProfile}
                            />
                        ) : null}
                        {unread > 0 ? (
                            <TaskRow
                                icon={Bell}
                                iconClass="text-indigo-500"
                                label={t(unread === 1 ? 'home.unreadNotificationsOne' : 'home.unreadNotificationsOther', { count: unread })}
                                onClick={onOpenNotifications}
                            />
                        ) : null}
                    </ul>
                )}
            </CardContent>
        </Card>
    )
}

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

interface UpcomingLeaveLite {
    id: string
    startDate: string
    endDate: string
    leaveType: string
    status?: string | null
}

function WhoIsOutCard({
    upcomingLeaves,
    onViewAll,
}: {
    upcomingLeaves: UpcomingLeaveLite[]
    onViewAll: () => void
}) {
    const { t } = useTranslation()
    // Leave | Remote segmented view. Leave is data-backed (the signed-in
    // employee's own approved/pending leaves); Remote has no portal data
    // source yet, so it honestly reads zero until one is wired up.
    const [tab, setTab] = useState<'leave' | 'remote'>('leave')

    // Count this employee's own pending+approved leaves that COVER each of
    // the next three days. Company-wide "who's out" isn't exposed to the
    // portal, so the Leave tab reflects the current user's own schedule.
    const leaveCounts = useMemo(() => {
        const todayMs = Date.now()
        const dayMs = 86_400_000
        const inWindow = (d: Date, leave: UpcomingLeaveLite) => {
            const start = new Date(leave.startDate).getTime()
            const end = new Date(leave.endDate).getTime()
            return d.getTime() >= start && d.getTime() <= end
        }
        return [0, 1, 2].map((offset) => {
            const d = new Date(todayMs + offset * dayMs)
            d.setHours(12, 0, 0, 0)
            return upcomingLeaves.filter((l) => inWindow(d, l)).length
        })
    }, [upcomingLeaves])

    // No remote-work data source yet — show real zeros rather than a fake count.
    const counts = tab === 'leave' ? leaveCounts : [0, 0, 0]

    return (
        <Card className="border-border/70">
            <CardContent className="p-5 sm:p-6">
                <div className="mb-3 flex items-center justify-between">
                    <h2 className="font-display text-base font-semibold text-foreground">
                        {t('home.whoIsOut', { defaultValue: 'Who is out?' })}
                    </h2>
                    <button
                        type="button"
                        onClick={onViewAll}
                        className="text-xs font-medium text-primary hover:underline"
                    >
                        {t('home.viewAll')}
                    </button>
                </div>

                {/* Leave / Remote segmented control */}
                <div className="mb-4 inline-flex rounded-lg bg-muted/60 p-0.5">
                    {(['leave', 'remote'] as const).map((key) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setTab(key)}
                            aria-pressed={tab === key}
                            className={cn(
                                'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                                tab === key
                                    ? 'bg-card text-foreground shadow-sm'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {t(key === 'leave' ? 'home.leaveTab' : 'home.remoteTab', {
                                defaultValue: key === 'leave' ? 'Leave' : 'Remote',
                            })}
                        </button>
                    ))}
                </div>

                <div className="space-y-2.5 text-sm">
                    <WhoIsOutRow label={t('home.today')} count={counts[0]} />
                    <WhoIsOutRow label={t('home.tomorrow')} count={counts[1]} />
                    <WhoIsOutRow label={t('home.dayAfterTomorrow')} count={counts[2]} />
                </div>

                <div className="mt-5 border-t border-border/60 pt-4">
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t('home.myUpcomingLeaves')}
                    </h3>
                    {upcomingLeaves.length === 0 ? (
                        <CardEmptyState icon={CalendarDays} message={t('home.noUpcomingLeaves')} />
                    ) : (
                        <ul className="space-y-2">
                            {upcomingLeaves.map((l) => (
                                <li key={l.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2 text-xs">
                                    <span className="font-medium capitalize text-foreground">{l.leaveType}</span>
                                    <span className="text-muted-foreground">
                                        {formatDate(l.startDate)} → {formatDate(l.endDate)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </CardContent>
        </Card>
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

/**
 * SVG glyph evoking the reference's plant cluster — kept inline (small) so it
 * doesn't need a build-time asset import.
 */
function LeafCluster({ className }: { className?: string }) {
    return (
        <svg
            viewBox="0 0 120 100"
            fill="currentColor"
            className={cn('size-32', className)}
            aria-hidden
        >
            <path d="M20 90 C 10 60, 30 40, 50 50 C 35 65, 28 80, 25 95 Z" opacity="0.7" />
            <path d="M50 90 C 40 55, 60 35, 80 45 C 65 60, 58 80, 55 95 Z" opacity="0.55" />
            <path d="M80 90 C 75 65, 90 50, 110 60 C 95 70, 88 82, 85 95 Z" opacity="0.7" />
            <circle cx="40" cy="55" r="3" opacity="0.5" />
            <circle cx="70" cy="50" r="2.5" opacity="0.5" />
        </svg>
    )
}

/** Ticks every second so the check-in / check-out button can show a live
 *  H:MM:SS timer. When `endIso` is set, the duration is frozen at end−start;
 *  when only `startIso` is set, it counts up from now. */
function useLiveDuration(startIso: string | null | undefined, endIso: string | null | undefined): string {
    const [now, setNow] = useState(() => Date.now())
    const running = !!startIso && !endIso
    useEffect(() => {
        if (!running) return
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
    }, [running])
    if (!startIso) return '0:00:00'
    const startMs = Date.parse(startIso)
    if (Number.isNaN(startMs)) return '0:00:00'
    const endMs = endIso ? Date.parse(endIso) : now
    const secs = Math.max(0, Math.floor((endMs - startMs) / 1000))
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}
