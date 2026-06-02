import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Megaphone, Pin, AlertTriangle, Check, Loader2, CheckCircle2 } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useAnnouncementFeed, useMarkAnnouncementRead, useAcknowledgeAnnouncement, type FeedAnnouncement } from '@/hooks/useAnnouncements'

const PRIORITY: Record<string, { ring: string; label: string; tone: string }> = {
    low: { ring: 'border-l-slate-300', label: 'Low', tone: 'bg-slate-100 text-slate-600' },
    normal: { ring: 'border-l-blue-400', label: 'Normal', tone: 'bg-blue-50 text-blue-700' },
    high: { ring: 'border-l-amber-400', label: 'High', tone: 'bg-amber-50 text-amber-700' },
    critical: { ring: 'border-l-rose-500', label: 'Critical', tone: 'bg-rose-50 text-rose-700' },
}
const CATEGORY_LABEL: Record<string, string> = {
    general: 'General', hr_policy: 'HR Policy', holiday: 'Holiday', event: 'Event', org_news: 'Org News',
    recognition: 'Recognition', emergency: 'Emergency', system_maintenance: 'Maintenance', payroll: 'Payroll',
    recruitment: 'Recruitment', training: 'Training',
}

export function AnnouncementsPage() {
    const { t } = useTranslation()
    const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useAnnouncementFeed()
    const markRead = useMarkAnnouncementRead()
    const acknowledge = useAcknowledgeAnnouncement()
    const list = useMemo<FeedAnnouncement[]>(() => (data?.pages ?? []).flatMap((p) => p.data), [data])

    // Infinite scroll sentinel.
    const sentinel = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        const el = sentinel.current
        if (!el) return
        const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage() }, { rootMargin: '200px' })
        io.observe(el)
        return () => io.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    function onAck(a: FeedAnnouncement) {
        acknowledge.mutate(a.id, {
            onSuccess: () => toast.success(t('announcements.acknowledged', { defaultValue: 'Acknowledged' })),
            onError: (e: any) => toast.error(e?.message ?? 'Failed'),
        })
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('announcements.title', { defaultValue: 'Announcements' })}
                subtitle={t('announcements.subtitle', { defaultValue: 'Company news and updates relevant to you.' })}
            />

            {isLoading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
            ) : list.length === 0 ? (
                <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted"><Megaphone className="size-6 text-muted-foreground" /></div>
                    <div>
                        <p className="text-sm font-medium">{t('announcements.emptyTitle', { defaultValue: 'No announcements' })}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{t('announcements.emptyDesc', { defaultValue: "You're all caught up." })}</p>
                    </div>
                </CardContent></Card>
            ) : (
                <div className="space-y-3">
                    {list.map((a) => {
                        const p = PRIORITY[a.priority] ?? PRIORITY.normal
                        const unread = !a.readAt
                        return (
                            <Card key={a.id} className={cn('border-l-4', p.ring, a.pinned && 'ring-1 ring-primary/20')}
                                onMouseEnter={() => { if (unread) markRead.mutate(a.id) }}>
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {a.pinned && <Pin className="size-3.5 text-primary" />}
                                                {a.priority === 'critical' && <AlertTriangle className="size-3.5 text-rose-600" />}
                                                {unread && <span className="size-2 rounded-full bg-primary" aria-label="unread" />}
                                                <h3 className="text-sm font-semibold">{a.title}</h3>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground">
                                                <span className={cn('rounded-full px-2 py-0.5 font-medium', p.tone)}>{p.label}</span>
                                                <span>{CATEGORY_LABEL[a.category] ?? a.category}</span>
                                                {a.authorName && <span>· {a.authorName}</span>}
                                                <span>· {new Date(a.publishedAt ?? a.createdAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {a.body && (
                                        <div className="mt-2 text-sm text-foreground/90 [overflow-wrap:anywhere] prose-sm" dangerouslySetInnerHTML={{ __html: sanitize(a.body) }} />
                                    )}
                                    {a.requireAck && (
                                        <div className="mt-3 flex items-center gap-2">
                                            {a.acknowledgedAt ? (
                                                <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="size-4" /> {t('announcements.ackd', { defaultValue: 'Acknowledged' })}</span>
                                            ) : (
                                                <Button size="sm" onClick={() => onAck(a)} disabled={acknowledge.isPending} className="gap-2">
                                                    {acknowledge.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                                                    {t('announcements.ack', { defaultValue: 'I have read this' })}
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )
                    })}
                    <div ref={sentinel} className="h-6" />
                    {isFetchingNextPage && <div className="flex justify-center py-2 text-xs text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>}
                </div>
            )}
        </div>
    )
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
