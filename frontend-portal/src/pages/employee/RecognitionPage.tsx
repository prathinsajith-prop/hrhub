import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Trophy, Award, Plus, Loader2, MessageCircle, Send, Pin, Check } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { ROUTES } from '@/lib/routes'
import { useColleagues } from '@/hooks/useTeam'
import {
    useRecognitionFeed, useRecognition, useRecognitionCategories, useGiveRecognition,
    useSetReaction, useRecognitionComments, useAddComment,
    type Recognition, type ReactionType,
} from '@/hooks/useRecognition'

// Emoji glyphs + their default (English) accessible labels. The visible
// label is always resolved at render via t('recognition.reaction.<type>').
const REACTIONS: { type: ReactionType; emoji: string; label: string }[] = [
    { type: 'like', emoji: '👍', label: 'Like' },
    { type: 'celebrate', emoji: '🎉', label: 'Celebrate' },
    { type: 'love', emoji: '❤️', label: 'Love' },
    { type: 'support', emoji: '🙌', label: 'Support' },
    { type: 'congrats', emoji: '👏', label: 'Congrats' },
]
// Used only when the API returns no categories. `label` is the English
// fallback; the rendered label comes from t('recognition.category.<key>').
const FALLBACK_CATEGORIES = [
    { key: 'great_work', label: 'Great Work' },
    { key: 'helping_hand', label: 'Helping Hand' },
    { key: 'innovation', label: 'Innovation' },
    { key: 'teamwork', label: 'Teamwork' },
    { key: 'leadership', label: 'Leadership' },
    { key: 'going_above_beyond', label: 'Above & Beyond' },
]
// Values only — labels resolved via t('recognition.visibility.<value>').
const VISIBILITIES = ['public', 'department', 'private'] as const
// English fallbacks for the visibility labels (used as t() defaultValue).
const VISIBILITY_LABELS: Record<(typeof VISIBILITIES)[number], string> = {
    public: 'Everyone',
    department: 'My department',
    private: 'Just the recipient',
}

function initials(name: string) {
    return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?'
}
function fmtDate(iso: string | null) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export function RecognitionPage() {
    const { t } = useTranslation()
    const { id: routeId } = useParams()
    const navigate = useNavigate()
    const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useRecognitionFeed()
    const [giving, setGiving] = useState(false)
    const [detailId, setDetailId] = useState<string | null>(null)
    const list = useMemo<Recognition[]>(() => (data?.pages ?? []).flatMap((p) => p.data), [data])

    // Deep-link: /me/recognition/:id opens the detail dialog.
    useEffect(() => { if (routeId) setDetailId(routeId) }, [routeId])

    const sentinel = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        const el = sentinel.current
        if (!el) return
        const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) fetchNextPage() }, { rootMargin: '200px' })
        io.observe(el)
        return () => io.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    function closeDetail() {
        setDetailId(null)
        if (routeId) navigate(ROUTES.employeeRecognition, { replace: true })
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('recognition.title', { defaultValue: 'Recognition' })}
                subtitle={t('recognition.subtitle', { defaultValue: 'Celebrate great work across the company.' })}
                action={
                    <Button onClick={() => setGiving(true)} className="gap-2">
                        <Plus className="size-4" /> {t('recognition.give', { defaultValue: 'Give recognition' })}
                    </Button>
                }
            />

            {isLoading ? (
                <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>
            ) : list.length === 0 ? (
                <EmptyState
                    icon={<Trophy className="size-8" />}
                    title={t('recognition.emptyTitle', { defaultValue: 'No recognitions yet' })}
                    description={t('recognition.emptyDesc', { defaultValue: 'Be the first to appreciate a colleague.' })}
                    action={<Button onClick={() => setGiving(true)} className="gap-2"><Plus className="size-4" /> {t('recognition.give', { defaultValue: 'Give recognition' })}</Button>}
                />
            ) : (
                <div className="space-y-3">
                    {list.map((r) => <RecognitionCard key={r.id} r={r} onOpen={() => setDetailId(r.id)} />)}
                    <div ref={sentinel} className="h-6" />
                    {isFetchingNextPage && <div className="flex justify-center py-2"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>}
                </div>
            )}

            {giving && <GiveDialog open onClose={() => setGiving(false)} />}
            {detailId && <DetailDialog id={detailId} onClose={closeDetail} />}
        </div>
    )
}

function ReactionBar({ r }: { r: Recognition }) {
    const { t } = useTranslation()
    const setReaction = useSetReaction()
    const mine = r.myReaction
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {REACTIONS.map((rx) => {
                const count = r.reactionCounts[rx.type]
                const active = mine === rx.type
                const label = t(`recognition.reaction.${rx.type}`, { defaultValue: rx.label }) as string
                return (
                    <button
                        key={rx.type}
                        type="button"
                        title={label}
                        aria-label={label}
                        aria-pressed={active}
                        disabled={setReaction.isPending}
                        onClick={() => setReaction.mutate({ id: r.id, type: active ? null : rx.type })}
                        className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                            active ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                        )}
                    >
                        <span aria-hidden>{rx.emoji}</span>
                        {count > 0 && <span className="tabular-nums">{count}</span>}
                    </button>
                )
            })}
        </div>
    )
}

function RecipientStack({ r, size = 'sm' }: { r: Recognition; size?: 'sm' | 'md' }) {
    const sz = size === 'md' ? 'size-8' : 'size-6'
    const names = r.recipients.map((x) => x.name)
    const label = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} +${names.length - 1}`
    return (
        <div className="flex items-center gap-2 min-w-0">
            <div className="flex -space-x-2">
                {r.recipients.slice(0, 3).map((rc) => (
                    <Avatar key={rc.employeeId} className={cn(sz, 'ring-2 ring-background')}>
                        {rc.avatarUrl ? <AvatarImage src={rc.avatarUrl} alt={rc.name} /> : null}
                        <AvatarFallback className="text-[10px]">{initials(rc.name)}</AvatarFallback>
                    </Avatar>
                ))}
            </div>
            <span className="truncate text-sm font-medium">{label}</span>
        </div>
    )
}

function RecognitionCard({ r, onOpen }: { r: Recognition; onOpen: () => void }) {
    const { t } = useTranslation()
    return (
        <Card className={cn(r.isPinned && 'ring-1 ring-primary/20')}>
            <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                    <RecipientStack r={r} />
                    <div className="flex items-center gap-1.5 shrink-0">
                        {r.isPinned && <Pin className="size-3.5 text-primary" />}
                        {r.points > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/60">
                                <Award className="size-3" /> {r.points}
                            </span>
                        )}
                    </div>
                </div>
                <button type="button" onClick={onOpen} className="block w-full text-left">
                    <h3 className="text-sm font-semibold">{r.title}</h3>
                    <p className="mt-0.5 line-clamp-3 text-sm text-muted-foreground [overflow-wrap:anywhere]">{r.message}</p>
                </button>
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>{r.giverName ? `${t('recognition.from', { defaultValue: 'From' })} ${r.giverName}` : ''} · {fmtDate(r.publishedAt ?? r.createdAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-2.5">
                    <ReactionBar r={r} />
                    <button type="button" onClick={onOpen} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                        <MessageCircle className="size-4" /> {r.commentCount > 0 ? r.commentCount : ''}
                    </button>
                </div>
            </CardContent>
        </Card>
    )
}

function GiveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation()
    const colleagues = useColleagues()
    const categories = useRecognitionCategories()
    const give = useGiveRecognition()
    const cats = (categories.data && categories.data.length > 0)
        ? categories.data.map((c) => ({ key: c.key, label: c.label }))
        : FALLBACK_CATEGORIES

    const [recipientIds, setRecipientIds] = useState<string[]>([])
    const [search, setSearch] = useState('')
    const [form, setForm] = useState({ categoryKey: cats[0]?.key ?? 'great_work', title: '', message: '', visibility: 'public', points: '' })

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        const all = colleagues.data ?? []
        if (!q) return all
        return all.filter((c) => `${c.firstName} ${c.lastName} ${c.designation ?? ''}`.toLowerCase().includes(q))
    }, [colleagues.data, search])

    const toggle = (id: string) => setRecipientIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
    const canSave = recipientIds.length > 0 && form.title.trim().length > 0 && form.message.trim().length > 0

    function submit() {
        if (!canSave) return
        give.mutate({
            categoryKey: form.categoryKey,
            title: form.title.trim(),
            message: form.message.trim(),
            visibility: form.visibility,
            points: form.points ? Math.max(0, Number(form.points) || 0) : 0,
            recipientEmployeeIds: recipientIds,
        }, {
            onSuccess: () => { toast.success(t('recognition.sent', { defaultValue: 'Recognition sent' })); onClose() },
            onError: (e: any) => toast.error(e?.message ?? t('recognition.sendFailed', { defaultValue: 'Could not send recognition' })),
        })
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>{t('recognition.give', { defaultValue: 'Give recognition' })}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>{t('recognition.recipients', { defaultValue: 'Who are you recognizing?' })}</Label>
                        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search', { defaultValue: 'Search colleagues…' })} />
                        <div className="max-h-44 overflow-auto rounded-lg border border-border divide-y divide-border">
                            {colleagues.isLoading ? (
                                <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                                    <Loader2 className="size-4 animate-spin" />
                                    {t('recognition.loadingColleagues', { defaultValue: 'Loading colleagues…' })}
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="p-3 text-sm text-muted-foreground">{t('recognition.noColleagues', { defaultValue: 'No colleagues found.' })}</div>
                            ) : filtered.map((c) => {
                                const name = `${c.firstName} ${c.lastName}`.trim()
                                const checked = recipientIds.includes(c.id)
                                return (
                                    <button key={c.id} type="button" role="checkbox" aria-checked={checked} aria-label={name} onClick={() => toggle(c.id)}
                                        className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors', checked ? 'bg-primary/5' : 'hover:bg-muted')}>
                                        <Avatar className="size-7">
                                            {c.avatarUrl ? <AvatarImage src={c.avatarUrl} alt={name} /> : null}
                                            <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
                                        </Avatar>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate font-medium">{name}</span>
                                            {c.designation && <span className="block truncate text-xs text-muted-foreground">{c.designation}</span>}
                                        </span>
                                        <span className={cn('flex size-4 shrink-0 items-center justify-center rounded border transition-colors', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                                            {checked && <Check className="size-3" aria-hidden />}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>
                        {recipientIds.length > 0 && <p className="text-xs text-muted-foreground">{recipientIds.length} {t('recognition.selected', { defaultValue: 'selected' })}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>{t('recognition.category', { defaultValue: 'Category' })}</Label>
                            <Select value={form.categoryKey} onValueChange={(v) => setForm((f) => ({ ...f, categoryKey: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{cats.map((c) => <SelectItem key={c.key} value={c.key}>{t(`recognition.category.${c.key}`, { defaultValue: c.label })}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('recognition.visibility', { defaultValue: 'Visibility' })}</Label>
                            <Select value={form.visibility} onValueChange={(v) => setForm((f) => ({ ...f, visibility: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{VISIBILITIES.map((v) => <SelectItem key={v} value={v}>{t(`recognition.visibility.${v}`, { defaultValue: VISIBILITY_LABELS[v] })}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t('recognition.headline', { defaultValue: 'Headline' })}</Label>
                        <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder={t('recognition.headlinePh', { defaultValue: 'e.g. Outstanding client save' })} />
                    </div>
                    <div className="space-y-1.5">
                        <Label>{t('recognition.message', { defaultValue: 'Message' })}</Label>
                        <Textarea rows={4} value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder={t('recognition.messagePh', { defaultValue: 'Say what they did and why it mattered…' })} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={give.isPending}>{t('common.cancel', { defaultValue: 'Cancel' })}</Button>
                    <Button onClick={submit} disabled={!canSave || give.isPending} className="gap-2">
                        {give.isPending && <Loader2 className="size-4 animate-spin" />}{t('recognition.send', { defaultValue: 'Send' })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function DetailDialog({ id, onClose }: { id: string; onClose: () => void }) {
    const { t } = useTranslation()
    const { data: r, isLoading } = useRecognition(id)
    const { data: comments } = useRecognitionComments(id)
    const addComment = useAddComment()
    const [body, setBody] = useState('')

    function postComment() {
        const text = body.trim()
        if (!text) return
        addComment.mutate({ id, body: text }, {
            onSuccess: () => setBody(''),
            onError: (e: any) => toast.error(e?.message ?? t('common.error', { defaultValue: 'Something went wrong' })),
        })
    }

    return (
        <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-auto">
                {isLoading || !r ? (
                    <div className="space-y-3 py-4"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-20 w-full" /></div>
                ) : (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2"><Trophy className="size-4 text-amber-500" /> {r.title}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                            <RecipientStack r={r} size="md" />
                            <p className="whitespace-pre-wrap text-sm text-foreground/90 [overflow-wrap:anywhere]">{r.message}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {r.giverName && <span>{t('recognition.from', { defaultValue: 'From' })} {r.giverName}</span>}
                                <span>· {fmtDate(r.publishedAt ?? r.createdAt)}</span>
                                {r.points > 0 && <span className="inline-flex items-center gap-1 text-amber-600">· <Award className="size-3" /> {r.points} {t('recognition.pts', { defaultValue: 'pts' })}</span>}
                            </div>
                            <div className="border-t border-border pt-3"><ReactionBar r={r} /></div>

                            {/* Comments */}
                            <div className="space-y-3 border-t border-border pt-3">
                                <p className="text-xs font-semibold text-muted-foreground">{t('recognition.comments', { defaultValue: 'Comments' })}{(comments?.length ?? 0) > 0 ? ` (${comments?.length})` : ''}</p>
                                {(comments ?? []).filter((c) => !c.deletedAt).map((c) => (
                                    <div key={c.id} className="flex gap-2.5">
                                        <Avatar className="size-7"><AvatarFallback className="text-[10px]">{initials(c.authorName ?? '?')}</AvatarFallback></Avatar>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs"><span className="font-medium">{c.authorName ?? t('common.someone', { defaultValue: 'Someone' })}</span> <span className="text-muted-foreground">· {fmtDate(c.createdAt)}</span></p>
                                            <p className="text-sm [overflow-wrap:anywhere]">{c.body}</p>
                                        </div>
                                    </div>
                                ))}
                                {!r.commentsDisabled && (
                                    <div className="flex items-center gap-2">
                                        <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder={t('recognition.addComment', { defaultValue: 'Add a comment…' })}
                                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); postComment() } }} />
                                        <Button size="icon" onClick={postComment} disabled={!body.trim() || addComment.isPending}>
                                            {addComment.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
