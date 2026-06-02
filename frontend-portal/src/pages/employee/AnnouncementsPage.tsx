import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Megaphone, Pin, AlertTriangle, Check, Loader2, CheckCircle2, ChevronDown } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAnnouncementFeed, useMarkAnnouncementRead, useAcknowledgeAnnouncement, type FeedAnnouncement } from '@/hooks/useAnnouncements'

const PRIORITY: Record<string, { ring: string; label: string; tone: string }> = {
    low: { ring: 'border-l-slate-200', label: 'Low', tone: 'bg-slate-100 text-slate-600' },
    normal: { ring: 'border-l-blue-400', label: 'Normal', tone: 'bg-blue-50 text-blue-700' },
    high: { ring: 'border-l-amber-400', label: 'High', tone: 'bg-amber-50 text-amber-700' },
    critical: { ring: 'border-l-rose-500', label: 'Critical', tone: 'bg-rose-50 text-rose-700' },
}
const CATEGORY_LABEL: Record<string, string> = {
    general: 'General', hr_policy: 'HR Policy', holiday: 'Holiday', event: 'Event', org_news: 'Org News',
    recognition: 'Recognition', emergency: 'Emergency', system_maintenance: 'Maintenance', payroll: 'Payroll',
    recruitment: 'Recruitment', training: 'Training',
}

function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

// Minimal HTML sanitizer — strips script/style/event-handlers/iframe. The body
// is authored by HR (trusted) but we defang it before dangerouslySetInnerHTML.
function sanitize(html: string): string {
    return html
        .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
        .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
        .replace(/javascript:/gi, '')
}

export function AnnouncementsPage() {
    const { t } = useTranslation()
    const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useAnnouncementFeed()
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

    return (
        // Constrain to a comfortable reading column so long announcements don't
        // stretch edge-to-edge on wide screens.
        <div className="mx-auto w-full max-w-3xl space-y-5">
            <PageHeader
                title={t('announcements.title', { defaultValue: 'Announcements' })}
                subtitle={t('announcements.subtitle', { defaultValue: 'Company news and updates relevant to you.' })}
            />

            {isLoading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
            ) : list.length === 0 ? (
                <EmptyState
                    icon={<Megaphone className="size-8" />}
                    title={t('announcements.emptyTitle', { defaultValue: 'No announcements' })}
                    description={t('announcements.emptyDesc', { defaultValue: "You're all caught up." })}
                />
            ) : (
                <div className="space-y-3">
                    {list.map((a) => (
                        <AnnouncementCard
                            key={a.id}
                            a={a}
                            onMarkRead={(id) => markRead.mutate(id)}
                            onAck={(id) => acknowledge.mutate(id, {
                                onSuccess: () => toast.success(t('announcements.acknowledged', { defaultValue: 'Acknowledged' })),
                                onError: (e: any) => toast.error(e?.message ?? 'Failed'),
                            })}
                            ackPending={acknowledge.isPending}
                        />
                    ))}
                    <div ref={sentinel} className="h-6" />
                    {isFetchingNextPage && <div className="flex justify-center py-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>}
                </div>
            )}
        </div>
    )
}

function AnnouncementCard({ a, onMarkRead, onAck, ackPending }: {
    a: FeedAnnouncement
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
        <Card className={cn('border-l-4 transition-shadow', p.ring, a.pinned && 'ring-1 ring-primary/15', unread && 'shadow-sm')}>
            <CardContent className="p-4">
                <div className="flex items-start gap-2">
                    {unread && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="unread" />}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {a.pinned && <Pin className="size-3.5 text-primary" aria-label="pinned" />}
                            {a.priority === 'critical' && <AlertTriangle className="size-3.5 text-rose-600" />}
                            <h3 className={cn('text-sm', unread ? 'font-semibold' : 'font-medium')}>{a.title}</h3>
                        </div>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                            <span className={cn('rounded-full px-2 py-0.5 font-medium', p.tone)}>{p.label}</span>
                            <span>{CATEGORY_LABEL[a.category] ?? a.category}</span>
                            {a.authorName && <span aria-hidden>·</span>}
                            {a.authorName && <span>{a.authorName}</span>}
                            <span aria-hidden>·</span>
                            <span>{fmtDate(a.publishedAt ?? a.createdAt)}</span>
                        </div>
                    </div>
                </div>

                {a.body && (
                    <div
                        ref={bodyRef}
                        className={cn('mt-2.5 text-sm leading-relaxed text-foreground/80 [overflow-wrap:anywhere] [&_a]:text-primary [&_a]:underline', !expanded && 'line-clamp-3')}
                        dangerouslySetInnerHTML={{ __html: sanitize(a.body) }}
                    />
                )}

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
