import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import DOMPurify from 'dompurify'
import { Megaphone, MessageSquare, Pin, AlertTriangle, Check, Loader2, CheckCircle2, ChevronDown } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/authStore'
import { PostOwnerMenu } from '@/components/shared/PostOwnerMenu'
import { useAnnouncementFeed, useMarkAnnouncementRead, useAcknowledgeAnnouncement, useUpdatePost, type FeedAnnouncement } from '@/hooks/useAnnouncements'

// Priority → left accent rail + shadcn Badge variant. The Badge variants carry
// design-system tokens with guaranteed contrast (≥4.5:1) in both themes, which
// the previous bespoke amber-on-amber / slate washes did not.
type BadgeVariant = 'secondary' | 'info' | 'warning' | 'destructive'
const PRIORITY: Record<string, { ring: string; label: string; variant: BadgeVariant }> = {
    low: { ring: 'border-s-slate-200', label: 'Low', variant: 'secondary' },
    normal: { ring: 'border-s-blue-400', label: 'Normal', variant: 'info' },
    high: { ring: 'border-s-amber-400', label: 'High', variant: 'warning' },
    critical: { ring: 'border-s-rose-500', label: 'Critical', variant: 'destructive' },
}
const CATEGORY_LABEL: Record<string, string> = {
    general: 'General', hr_policy: 'HR Policy', holiday: 'Holiday', event: 'Event', org_news: 'Org News',
    recognition: 'Recognition', emergency: 'Emergency', system_maintenance: 'Maintenance', payroll: 'Payroll',
    recruitment: 'Recruitment', training: 'Training',
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// HTML sanitizer for announcement bodies — DOMPurify with a tight allow-list
// (mirrors the admin app's RichTextDisplay). The feed mixes HR rich-HTML
// announcements with employee plain-text posts; both flow through
// dangerouslySetInnerHTML, so this is the last line of defence before render.
//
// We previously used a hand-rolled regex blocklist, which was bypassable
// (e.g. `<img/src=x/onerror=…>` — `/` instead of whitespace before the
// handler). DOMPurify parses the DOM and strips everything outside the
// allow-list, closing that whole class of bypass. Employee posts are also
// escaped server-side, so this is defence-in-depth for that path and the
// primary guard for HR-authored HTML.
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 's', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'code', 'pre']
const ALLOWED_ATTR = ['href', 'target', 'rel']

function sanitize(html: string): string {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR, FORCE_BODY: true })
}

export function AnnouncementsPage({ embedded = false }: { embedded?: boolean } = {}) {
    const { t } = useTranslation()
    const [kind, setKind] = useState<'announcement' | 'post'>('announcement')

    return (
        // Constrain to a comfortable reading column so long announcements don't
        // stretch edge-to-edge on wide screens (full width when embedded in a tab).
        <div className={embedded ? 'w-full space-y-5' : 'mx-auto w-full max-w-3xl space-y-5'}>
            {!embedded && (
                <PageHeader
                    title={t('announcements.title', { defaultValue: 'Announcements' })}
                    subtitle={t('announcements.subtitle', { defaultValue: 'Company news and updates relevant to you.' })}
                />
            )}

            {/* Two tabs — official HR announcements vs employee posts. They share
                the same card + engagement logic but never mix, so each surface
                reads clearly as one kind of content. */}
            <Tabs value={kind} onValueChange={(v) => setKind(v as 'announcement' | 'post')} className="space-y-4">
                <TabsList variant="underline">
                    <TabsTrigger value="announcement">
                        <Megaphone className="size-3.5" /> {t('announcements.tabAnnouncements', { defaultValue: 'Announcements' })}
                    </TabsTrigger>
                    <TabsTrigger value="post">
                        <MessageSquare className="size-3.5" /> {t('announcements.tabPosts', { defaultValue: 'Posts' })}
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="announcement" className="focus-visible:outline-none">
                    <AnnouncementFeed kind="announcement" />
                </TabsContent>
                <TabsContent value="post" className="focus-visible:outline-none">
                    <AnnouncementFeed kind="post" />
                </TabsContent>
            </Tabs>
        </div>
    )
}

/** One kind's paginated feed (announcements or posts). Same card + engagement
 *  logic for both; the server filters by `kind` so the lists never mix.
 *
 *  Exported so other portal pages (Home → Posts tab) can reuse the same
 *  scroll-loading + card design without duplicating the hook wiring or the
 *  empty-state copy. The hook's queryKey is keyed by `kind`, so two instances
 *  on the same page (e.g. Home's Posts tab + a future widget) share cache. */
export function AnnouncementFeed({ kind }: { kind: 'announcement' | 'post' }) {
    const { t } = useTranslation()
    const currentUserId = useAuthStore((s) => s.user?.id)
    const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useAnnouncementFeed(15, kind)
    const markRead = useMarkAnnouncementRead()
    const acknowledge = useAcknowledgeAnnouncement()
    const list = useMemo<FeedAnnouncement[]>(() => (data?.pages ?? []).flatMap((p) => p.data), [data])

    const sentinel = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        const el = sentinel.current
        if (!el) return
        const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage() }, { rootMargin: '200px' })
        io.observe(el)
        return () => io.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    if (isLoading) {
        return <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
    }
    if (list.length === 0) {
        return (
            <EmptyState
                icon={kind === 'post' ? <MessageSquare className="size-8" /> : <Megaphone className="size-8" />}
                title={kind === 'post' ? t('announcements.emptyPostsTitle', { defaultValue: 'No posts yet' }) : t('announcements.emptyTitle', { defaultValue: 'No announcements' })}
                description={kind === 'post' ? t('announcements.emptyPostsDesc', { defaultValue: 'Team posts will appear here.' }) : t('announcements.emptyDesc', { defaultValue: "You're all caught up." })}
            />
        )
    }
    return (
        <div className="space-y-3">
            {list.map((a) => (
                <AnnouncementCard
                    key={a.id}
                    a={a}
                    currentUserId={currentUserId}
                    onMarkRead={(id) => markRead.mutate(id)}
                    onAck={(id) => acknowledge.mutate(id, {
                        onSuccess: () => toast.success(t('announcements.acknowledged', { defaultValue: 'Acknowledged' })),
                        onError: (e: any) => toast.error(e?.message ?? t('common.error', { defaultValue: 'Something went wrong' })),
                    })}
                    ackPending={acknowledge.isPending}
                />
            ))}
            <div ref={sentinel} className="h-6" />
            {isFetchingNextPage && <div className="flex justify-center py-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>}
        </div>
    )
}

function AnnouncementCard({ a, currentUserId, onMarkRead, onAck, ackPending }: {
    a: FeedAnnouncement
    currentUserId?: string
    onMarkRead: (id: string) => void
    onAck: (id: string) => void
    ackPending: boolean
}) {
    const { t } = useTranslation()
    const p = PRIORITY[a.priority] ?? PRIORITY.normal
    const unread = !a.readAt
    const [expanded, setExpanded] = useState(false)
    const [canExpand, setCanExpand] = useState(false)
    const bodyRef = useRef<HTMLDivElement>(null)
    const markedRef = useRef(false)

    // Own posts (authored by the signed-in user) get edit/pin/delete — the same
    // controls as the home Feed card, so the two surfaces stay consistent.
    // Ownership is the `createdBy` match, so this never touches HR announcements.
    const isOwn = !!a.createdBy && !!currentUserId && a.createdBy === currentUserId
    const updatePost = useUpdatePost()
    const [editing, setEditing] = useState(false)
    const [editText, setEditText] = useState(a.body)

    function saveEdit() {
        const body = editText.trim()
        if (!body || updatePost.isPending) return
        updatePost.mutate(
            { id: a.id, body },
            {
                onSuccess: () => { setEditing(false); toast.success(t('post.updated', { defaultValue: 'Post updated' })) },
                onError: (err: unknown) =>
                    toast.error(err instanceof Error ? err.message : t('post.failed', { defaultValue: 'Could not update post' })),
            },
        )
    }

    // Detect whether the (clamped) body overflows, so we only show "Read more"
    // when there's actually more to read.
    useEffect(() => {
        const el = bodyRef.current
        if (el && !expanded) setCanExpand(el.scrollHeight > el.clientHeight + 4)
    }, [a.body, expanded])

    // Read tracking is INTENTIONAL (never on hover): expanding, acknowledging,
    // or tapping "Mark as read" records it — works on touch + avoids accidental
    // reads while scrolling.
    function ensureRead() {
        if (unread && !markedRef.current) { markedRef.current = true; onMarkRead(a.id) }
    }
    function toggleExpand() { setExpanded((v) => !v); ensureRead() }

    return (
        <Card className={cn('border-s-4 transition-shadow', p.ring, a.pinned && 'ring-1 ring-primary/15', unread && 'shadow-sm')}>
            <CardContent className="p-4">
                <div className="flex items-start gap-2">
                    {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label={t('announcements.unread', { defaultValue: 'Unread' })} />}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {a.pinned && <Pin className="size-3.5 text-primary" aria-label={t('announcements.pinned', { defaultValue: 'Pinned' })} />}
                            {a.priority === 'critical' && <AlertTriangle className="size-3.5 text-rose-600" />}
                            {a.title ? <h3 className={cn('text-sm', unread ? 'font-semibold' : 'font-medium')}>{a.title}</h3> : null}
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                            {a.kind === 'post' ? (
                                // Posts: a single neutral "Post" chip — priority/category are
                                // an HR-announcement concept and don't apply to social posts.
                                <Badge variant="secondary" className="gap-1 px-2 py-0.5 text-xs"><MessageSquare className="size-3" />{t('announcements.postBadge', { defaultValue: 'Post' })}</Badge>
                            ) : (
                                <>
                                    <Badge variant={p.variant} className="px-2 py-0.5 text-xs">{t(`announcements.priority.${a.priority}`, { defaultValue: p.label })}</Badge>
                                    <span>{t(`announcements.category.${a.category}`, { defaultValue: CATEGORY_LABEL[a.category] ?? a.category })}</span>
                                </>
                            )}
                            {/* Author — "who created" this, shown for both kinds. */}
                            {a.authorName && <span aria-hidden>·</span>}
                            {a.authorName && <span className="font-medium text-foreground/70">{a.authorName}</span>}
                            <span aria-hidden>·</span>
                            <span>{fmtDate(a.publishedAt ?? a.createdAt)}</span>
                        </div>
                    </div>
                    {isOwn && !editing ? (
                        <PostOwnerMenu item={a} onEdit={() => { setEditText(a.body); setEditing(true) }} />
                    ) : null}
                </div>

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
                ) : a.body ? (
                    // Posts are plain text (escaped server-side) — render with preserved
                    // line breaks, never as HTML. Announcements carry HR-authored rich
                    // HTML, sanitized before injection.
                    a.kind === 'post' ? (
                        <div
                            ref={bodyRef}
                            className={cn('mt-2.5 whitespace-pre-line text-sm leading-relaxed text-foreground/80 [overflow-wrap:anywhere]', !expanded && 'line-clamp-3')}
                        >
                            {a.body}
                        </div>
                    ) : (
                        <div
                            ref={bodyRef}
                            className={cn('mt-2.5 text-sm leading-relaxed text-foreground/80 [overflow-wrap:anywhere] [&_a]:text-primary [&_a]:underline', !expanded && 'line-clamp-3')}
                            dangerouslySetInnerHTML={{ __html: sanitize(a.body) }}
                        />
                    )
                ) : null}

                {(canExpand || a.requireAck || unread) && (
                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-2.5">
                        {canExpand ? (
                            <button type="button" onClick={toggleExpand} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                                {expanded ? t('announcements.showLess', { defaultValue: 'Show less' }) : t('announcements.readMore', { defaultValue: 'Read more' })}
                                <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
                            </button>
                        ) : <span />}

                        {a.requireAck ? (
                            a.acknowledgedAt ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-4" /> {t('announcements.ackd', { defaultValue: 'Acknowledged' })}</span>
                            ) : (
                                <Button size="sm" className="h-8 gap-1.5 px-3 text-xs" onClick={() => { onAck(a.id); markedRef.current = true }} disabled={ackPending}>
                                    {ackPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                                    {t('announcements.ack', { defaultValue: 'I have read this' })}
                                </Button>
                            )
                        ) : unread ? (
                            <button type="button" onClick={ensureRead} className="text-xs font-medium text-muted-foreground hover:text-foreground">
                                {t('announcements.markRead', { defaultValue: 'Mark as read' })}
                            </button>
                        ) : <span />}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
