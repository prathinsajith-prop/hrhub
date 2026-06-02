import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
    Award, ArrowLeft, Heart, ThumbsUp, PartyPopper, HandHeart, Crown, Sparkles,
    MessageSquare, Send, Pin, PinOff, Trash2, Loader2, Paperclip, Download,
    Eye, EyeOff, Users as UsersIcon, Calendar, Trophy, AlertCircle, RotateCcw, Upload,
} from 'lucide-react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, toast, ConfirmDialog } from '@/components/ui/overlays'
import {
    useRecognition, useRecognitionComments, useAddComment, useEditComment, useDeleteComment,
    useSetReaction, useRemoveReaction, useDeleteRecognition, usePinRecognition,
    useRecognitionCategories, useRecognitionBadges, useRejectRecognition,
    useReturnRecognition, useSubmitRecognition,
    type RecognitionComment, type ReactionType,
} from '@/hooks/useRecognition'
import { useAuthStore } from '@/store/authStore'
import { api } from '@/lib/api'
import { cn, formatDate, formatDateTime, getInitials } from '@/lib/utils'

const REACTION_META: Record<ReactionType, { label: string; Icon: typeof ThumbsUp; tone: string; activeTone: string }> = {
    like: { label: 'Like', Icon: ThumbsUp, tone: 'text-slate-500', activeTone: 'bg-blue-50 text-blue-700 ring-blue-200' },
    celebrate: { label: 'Celebrate', Icon: PartyPopper, tone: 'text-slate-500', activeTone: 'bg-amber-50 text-amber-700 ring-amber-200' },
    love: { label: 'Love', Icon: Heart, tone: 'text-slate-500', activeTone: 'bg-rose-50 text-rose-700 ring-rose-200' },
    support: { label: 'Support', Icon: HandHeart, tone: 'text-slate-500', activeTone: 'bg-violet-50 text-violet-700 ring-violet-200' },
    congrats: { label: 'Congrats', Icon: Crown, tone: 'text-slate-500', activeTone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
}
const REACTION_ORDER: ReactionType[] = ['like', 'celebrate', 'love', 'support', 'congrats']

const BADGE_LEVEL_TONE: Record<string, string> = {
    bronze: 'bg-amber-50 text-amber-800 ring-amber-200',
    silver: 'bg-slate-100 text-slate-700 ring-slate-300',
    gold: 'bg-yellow-50 text-yellow-800 ring-yellow-300',
    platinum: 'bg-sky-50 text-sky-800 ring-sky-200',
    diamond: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
}
const STATUS_TONE: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600',
    pending: 'bg-amber-50 text-amber-700',
    approved: 'bg-emerald-50 text-emerald-700',
    rejected: 'bg-rose-50 text-rose-700',
    published: 'bg-emerald-50 text-emerald-700',
    archived: 'bg-slate-100 text-slate-500',
}
const VISIBILITY_LABEL: Record<string, string> = {
    public: 'Everyone', team: 'Team', department: 'Department', branch: 'Branch',
    manager: 'Managers', hr: 'HR only', private: 'Private',
}

function threadComments(list: RecognitionComment[]): RecognitionComment[] {
    const byId = new Map<string, RecognitionComment & { replies: RecognitionComment[] }>()
    const roots: (RecognitionComment & { replies: RecognitionComment[] })[] = []
    list.forEach(c => byId.set(c.id, { ...c, replies: [] }))
    byId.forEach(c => {
        if (c.parentId && byId.has(c.parentId)) {
            byId.get(c.parentId)!.replies.push(c)
        } else {
            roots.push(c)
        }
    })
    roots.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    roots.forEach(r => r.replies.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)))
    return roots
}

export function RecognitionDetailPage() {
    const { id = '' } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const me = useAuthStore(s => s.user)
    const { data: recognition, isLoading, error } = useRecognition(id)
    const { data: categories } = useRecognitionCategories()
    const { data: badges } = useRecognitionBadges()
    const { data: commentsList, isLoading: commentsLoading } = useRecognitionComments(id)

    const canModerate = me?.role === 'hr_manager' || me?.role === 'super_admin'
    const isGiver = !!recognition?.giverUserId && recognition.giverUserId === me?.id
    const canEdit = isGiver || canModerate

    const setReaction = useSetReaction()
    const removeReaction = useRemoveReaction()
    const pinMutation = usePinRecognition()
    const deleteMutation = useDeleteRecognition()
    const rejectMutation = useRejectRecognition()
    const returnMutation = useReturnRecognition()
    const submitMutation = useSubmitRecognition()

    const [confirmDelete, setConfirmDelete] = useState(false)
    const [rejectOpen, setRejectOpen] = useState(false)
    const [returnOpen, setReturnOpen] = useState(false)

    const category = useMemo(
        () => recognition && (recognition.category ?? categories?.find(c => c.key === recognition.categoryKey)),
        [recognition, categories],
    )
    const badge = useMemo(
        () => recognition && (recognition.badge ?? badges?.find(b => b.key === recognition.badgeKey)),
        [recognition, badges],
    )
    const threaded = useMemo(() => threadComments(commentsList ?? []), [commentsList])

    function onReact(type: ReactionType) {
        if (!recognition) return
        if (recognition.myReaction === type) {
            removeReaction.mutate(recognition.id, { onError: (e: any) => toast.error('Failed', e?.message) })
        } else {
            setReaction.mutate({ id: recognition.id, type }, { onError: (e: any) => toast.error('Failed', e?.message) })
        }
    }
    function onTogglePin() {
        if (!recognition) return
        pinMutation.mutate(
            { id: recognition.id, pin: !recognition.isPinned },
            {
                onSuccess: () => toast.success(recognition.isPinned ? 'Unpinned' : 'Pinned'),
                onError: (e: any) => toast.error('Failed', e?.message),
            },
        )
    }
    function onDelete() {
        if (!recognition) return
        deleteMutation.mutate(recognition.id, {
            onSuccess: () => { toast.success('Recognition deleted'); navigate('/recognition') },
            onError: (e: any) => toast.error('Failed', e?.message),
        })
    }
    async function onDownloadAttachment(att: { name: string; s3Key: string }) {
        // Authenticated download — must NOT use a raw <a href> (no Bearer token → 401).
        // Uses the documents download endpoint via api.download which attaches the JWT.
        try {
            const blob = await api.download(`/documents/download/${encodeURIComponent(att.s3Key)}`)
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = att.name
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (e: any) {
            toast.error('Download failed', e?.message ?? 'Could not download this attachment.')
        }
    }
    function onSubmitForApproval() {
        if (!recognition) return
        submitMutation.mutate(recognition.id, {
            onSuccess: () => toast.success('Submitted for approval'),
            onError: (e: any) => toast.error('Failed', e?.message),
        })
    }

    if (isLoading) {
        return (
            <PageWrapper>
                <div className="space-y-4">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-64 rounded-2xl" />
                    <Skeleton className="h-12 w-full rounded-lg" />
                    <Skeleton className="h-40 w-full rounded-lg" />
                </div>
            </PageWrapper>
        )
    }
    if (error || !recognition) {
        return (
            <PageWrapper>
                <BackLink />
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                        <div className="flex size-12 items-center justify-center rounded-full bg-rose-50">
                            <AlertCircle className="size-6 text-rose-600" />
                        </div>
                        <div>
                            <p className="text-sm font-medium">Recognition not found</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">It may have been deleted or you don't have permission to view it.</p>
                        </div>
                        <Button asChild variant="outline" size="sm"><Link to="/recognition">Back to feed</Link></Button>
                    </CardContent>
                </Card>
            </PageWrapper>
        )
    }

    const categoryColor = category?.color ?? '#6366f1'
    const reactionCounts = recognition.reactionCounts ?? { like: 0, celebrate: 0, love: 0, support: 0, congrats: 0, total: 0 }

    return (
        <PageWrapper>
            <BackLink />

            {/* Hero card */}
            <Card className="overflow-hidden">
                <div
                    className="relative px-6 py-7 sm:px-8 sm:py-9"
                    style={{
                        background: `linear-gradient(135deg, ${categoryColor}1A 0%, ${categoryColor}33 60%, ${categoryColor}1A 100%)`,
                    }}
                >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div
                                className="flex size-14 items-center justify-center rounded-2xl shadow-sm ring-1 ring-white/40"
                                style={{ backgroundColor: categoryColor }}
                                aria-hidden
                            >
                                <Award className="size-7 text-white" />
                            </div>
                            <div>
                                {category && (
                                    <Badge variant="secondary" className="capitalize" style={{ backgroundColor: `${categoryColor}1A`, color: categoryColor }}>
                                        {category.label}
                                    </Badge>
                                )}
                                <p className="mt-1.5 text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                                    {recognition.nominationType.replace(/_/g, ' ')}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                            {recognition.isPinned && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                    <Pin className="size-3" /> Pinned
                                </span>
                            )}
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', STATUS_TONE[recognition.status])}>
                                {recognition.status}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-white/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-black/5">
                                {recognition.visibility === 'private' ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                                {VISIBILITY_LABEL[recognition.visibility] ?? recognition.visibility}
                            </span>
                        </div>
                    </div>

                    <h1 className="mt-5 text-2xl font-semibold tracking-tight text-foreground font-display text-balance sm:text-3xl">
                        {recognition.title}
                    </h1>

                    {/* Giver → Recipients */}
                    <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
                        <PersonPill name={recognition.giverName ?? 'Unknown'} subtitle="appreciated" />
                        <span className="text-muted-foreground">→</span>
                        <div className="flex flex-wrap items-center gap-2">
                            {(recognition.recipients ?? []).slice(0, 6).map(r => (
                                <PersonPill key={r.employeeId} name={r.name} avatarUrl={r.avatarUrl} subtitle={r.designation ?? undefined} highlight />
                            ))}
                            {(recognition.recipients?.length ?? 0) > 6 && (
                                <span className="rounded-full bg-white/80 px-2 py-1 text-[11px] font-medium text-muted-foreground ring-1 ring-black/5">
                                    +{(recognition.recipients?.length ?? 0) - 6} more
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <CardContent className="space-y-5 p-6 sm:p-8">
                    {/* Message */}
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-foreground/90">
                        {recognition.message}
                    </p>

                    {/* Meta grid */}
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
                        {badge && (
                            <span className="inline-flex items-center gap-1.5">
                                <Trophy className="size-3.5" style={{ color: badge.color || '#eab308' }} />
                                <span className="font-medium text-foreground">{badge.label}</span>
                                <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize ring-1', BADGE_LEVEL_TONE[badge.level] ?? '')}>{badge.level}</span>
                            </span>
                        )}
                        {recognition.points > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                <Sparkles className="size-3" /> +{recognition.points} points
                            </span>
                        )}
                        {recognition.achievementDate && (
                            <span className="inline-flex items-center gap-1">
                                <Calendar className="size-3.5" /> Achievement: {formatDate(recognition.achievementDate)}
                            </span>
                        )}
                        <span>Created {formatDateTime(recognition.createdAt)}</span>
                        {recognition.publishedAt && <span>Published {formatDateTime(recognition.publishedAt)}</span>}
                    </div>

                    {/* Audience scope */}
                    {((recognition.teams?.length ?? 0) > 0 || (recognition.departments?.length ?? 0) > 0) && (
                        <div className="flex flex-wrap items-center gap-1.5 border-t pt-4 text-[11px]">
                            <UsersIcon className="size-3.5 text-muted-foreground" />
                            <span className="font-medium text-muted-foreground">Shared with:</span>
                            {recognition.teams?.map(t => (
                                <span key={t.teamId} className="rounded-full bg-muted px-2 py-0.5">{t.name}</span>
                            ))}
                            {recognition.departments?.map(d => (
                                <span key={d.orgUnitId} className="rounded-full bg-muted px-2 py-0.5">{d.name}</span>
                            ))}
                        </div>
                    )}

                    {/* Attachments */}
                    {recognition.attachments && recognition.attachments.length > 0 && (
                        <div className="space-y-1.5 border-t pt-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Attachments</p>
                            <ul className="space-y-1">
                                {recognition.attachments.map((a, i) => (
                                    <li key={`${a.s3Key}-${i}`}>
                                        <button
                                            type="button"
                                            onClick={() => onDownloadAttachment(a)}
                                            className="inline-flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                                        >
                                            <Paperclip className="size-3.5" />
                                            <span className="max-w-[260px] truncate">{a.name}</span>
                                            <Download className="size-3.5 text-muted-foreground" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Action row */}
                    {(canEdit || canModerate) && (
                        <div className="flex flex-wrap items-center gap-2 border-t pt-4">
                            {canModerate && (
                                <Button variant="outline" size="sm" onClick={onTogglePin} disabled={pinMutation.isPending}>
                                    {recognition.isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                                    <span className="ml-1.5">{recognition.isPinned ? 'Unpin' : 'Pin'}</span>
                                </Button>
                            )}
                            {isGiver && recognition.status === 'draft' && (
                                <Button size="sm" onClick={onSubmitForApproval} disabled={submitMutation.isPending}>
                                    {submitMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
                                    <span className="ml-1.5">Submit for approval</span>
                                </Button>
                            )}
                            {canModerate && recognition.status === 'pending' && (
                                <>
                                    <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}>
                                        <RotateCcw className="size-4" /><span className="ml-1.5">Return for revision</span>
                                    </Button>
                                    <Button variant="outline" size="sm" onClick={() => setRejectOpen(true)} className="text-rose-600 hover:text-rose-700">
                                        Reject
                                    </Button>
                                </>
                            )}
                            {canEdit && (
                                <Button variant="outline" size="sm" onClick={() => setConfirmDelete(true)} className="text-rose-600 hover:text-rose-700">
                                    <Trash2 className="size-4" /><span className="ml-1.5">Delete</span>
                                </Button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Reactions bar */}
            <Card className="mt-4">
                <CardContent className="flex flex-wrap items-center gap-2 p-3">
                    {REACTION_ORDER.map(type => {
                        const meta = REACTION_META[type]
                        const count = reactionCounts[type] ?? 0
                        const active = recognition.myReaction === type
                        return (
                            <button
                                key={type}
                                type="button"
                                onClick={() => onReact(type)}
                                className={cn(
                                    'group inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ring-1',
                                    active
                                        ? cn(meta.activeTone, 'ring-current/30 shadow-sm')
                                        : 'bg-card text-muted-foreground ring-border hover:bg-muted hover:text-foreground',
                                )}
                                aria-pressed={active}
                            >
                                <meta.Icon className={cn('size-3.5 transition-transform group-hover:scale-110', active && 'fill-current')} />
                                <span>{meta.label}</span>
                                {count > 0 && <span className={cn('rounded-full px-1.5 py-0.5 text-[10px]', active ? 'bg-white/60' : 'bg-muted')}>{count}</span>}
                            </button>
                        )
                    })}
                    {reactionCounts.total > 0 && (
                        <span className="ml-auto text-[11px] text-muted-foreground">{reactionCounts.total} reaction{reactionCounts.total === 1 ? '' : 's'}</span>
                    )}
                </CardContent>
            </Card>

            {/* Comments */}
            <Card className="mt-4">
                <CardContent className="p-5 sm:p-6">
                    <div className="mb-4 flex items-center justify-between">
                        <h2 className="text-base font-semibold">
                            <MessageSquare className="mr-1.5 inline size-4 -translate-y-0.5" />
                            {recognition.commentCount ?? threaded.length} comment{(recognition.commentCount ?? threaded.length) === 1 ? '' : 's'}
                        </h2>
                        {recognition.commentsDisabled && (
                            <Badge variant="secondary" className="text-[11px]">Comments disabled</Badge>
                        )}
                    </div>

                    {!recognition.commentsDisabled && (
                        <CommentComposer recognitionId={recognition.id} />
                    )}

                    {commentsLoading ? (
                        <div className="mt-4 space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
                    ) : threaded.length === 0 ? (
                        <div className="mt-6 flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
                            <MessageSquare className="size-6 opacity-50" />
                            <p>No comments yet. Be the first to share kind words.</p>
                        </div>
                    ) : (
                        <ul className="mt-4 space-y-4">
                            {threaded.map(c => (
                                <CommentNode
                                    key={c.id}
                                    comment={c}
                                    recognitionId={recognition.id}
                                    me={me}
                                    canModerate={canModerate}
                                    commentsDisabled={!!recognition.commentsDisabled}
                                />
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                variant="destructive"
                title="Delete recognition?"
                description={`"${recognition.title}" will be permanently removed. This cannot be undone.`}
                confirmLabel="Delete"
                onConfirm={onDelete}
            />
            {rejectOpen && (
                <RejectDialog
                    open={rejectOpen}
                    onOpenChange={setRejectOpen}
                    onReject={(reason) => rejectMutation.mutate({ id: recognition.id, reason }, {
                        onSuccess: () => { toast.success('Recognition rejected'); setRejectOpen(false) },
                        onError: (e: any) => toast.error('Failed', e?.message),
                    })}
                    pending={rejectMutation.isPending}
                />
            )}
            {returnOpen && (
                <ReturnDialog
                    open={returnOpen}
                    onOpenChange={setReturnOpen}
                    onReturn={(comment) => returnMutation.mutate({ id: recognition.id, comment }, {
                        onSuccess: () => { toast.success('Returned for revision'); setReturnOpen(false) },
                        onError: (e: any) => toast.error('Failed', e?.message),
                    })}
                    pending={returnMutation.isPending}
                />
            )}
        </PageWrapper>
    )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function BackLink() {
    return (
        <div className="mb-4">
            <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground hover:text-foreground">
                <Link to="/recognition"><ArrowLeft className="size-4" /><span className="ml-1.5">Back to feed</span></Link>
            </Button>
        </div>
    )
}

function PersonPill({ name, subtitle, avatarUrl, highlight }: { name: string; subtitle?: string; avatarUrl?: string | null; highlight?: boolean }) {
    return (
        <span className={cn(
            'inline-flex items-center gap-2 rounded-full py-1 pr-3 pl-1 ring-1',
            highlight
                ? 'bg-white text-foreground ring-black/5 shadow-sm'
                : 'bg-white/70 text-foreground ring-black/5',
        )}>
            <Avatar className="size-7">
                {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
                <AvatarFallback className={cn('text-[10px]', highlight && 'bg-primary text-primary-foreground')}>
                    {getInitials(name)}
                </AvatarFallback>
            </Avatar>
            <span className="flex flex-col leading-tight">
                <span className="text-[13px] font-medium">{name}</span>
                {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
            </span>
        </span>
    )
}

function CommentComposer({ recognitionId, parentId, onDone }: { recognitionId: string; parentId?: string | null; onDone?: () => void }) {
    const add = useAddComment()
    const [body, setBody] = useState('')
    const me = useAuthStore(s => s.user)

    function submit() {
        const trimmed = body.trim()
        if (!trimmed) return
        add.mutate({ recognitionId, body: trimmed, parentId: parentId ?? null }, {
            onSuccess: () => { setBody(''); onDone?.() },
            onError: (e: any) => toast.error('Failed', e?.message),
        })
    }

    return (
        <div className="flex items-start gap-2">
            <Avatar className="mt-0.5 size-8 shrink-0">
                {me?.avatarUrl && <AvatarImage src={me.avatarUrl} alt={me.name} />}
                <AvatarFallback className="text-[11px]">{getInitials(me?.name ?? '')}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1.5">
                <Textarea
                    rows={parentId ? 2 : 2}
                    value={body}
                    onChange={e => setBody(e.target.value)}
                    placeholder={parentId ? 'Write a reply…' : 'Add a comment…'}
                    onKeyDown={e => {
                        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
                    }}
                />
                <div className="flex items-center justify-end gap-2">
                    {onDone && (
                        <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
                    )}
                    <Button size="sm" onClick={submit} disabled={!body.trim() || add.isPending}>
                        {add.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                        <span className="ml-1.5">{parentId ? 'Reply' : 'Post'}</span>
                    </Button>
                </div>
            </div>
        </div>
    )
}

function CommentNode({
    comment, recognitionId, me, canModerate, commentsDisabled, depth = 0,
}: {
    comment: RecognitionComment & { replies?: RecognitionComment[] }
    recognitionId: string
    me: ReturnType<typeof useAuthStore.getState>['user']
    canModerate: boolean
    commentsDisabled: boolean
    depth?: number
}) {
    const edit = useEditComment()
    const del = useDeleteComment()
    const [editing, setEditing] = useState(false)
    const [body, setBody] = useState(comment.body)
    const [replying, setReplying] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const isOwn = !!(comment.userId && me?.id === comment.userId)
    const canEdit = isOwn
    const canDelete = isOwn || canModerate
    const isDeleted = !!comment.deletedAt

    function save() {
        const trimmed = body.trim()
        if (!trimmed || trimmed === comment.body) { setEditing(false); return }
        edit.mutate({ recognitionId, commentId: comment.id, body: trimmed }, {
            onSuccess: () => setEditing(false),
            onError: (e: any) => toast.error('Failed', e?.message),
        })
    }

    return (
        <li className={cn(depth > 0 && 'ml-10 border-l pl-4')}>
            <div className="flex items-start gap-2.5">
                <Avatar className="mt-0.5 size-8 shrink-0">
                    <AvatarFallback className="text-[11px]">{getInitials(comment.authorName ?? '?')}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                    <div className="rounded-2xl bg-muted/50 px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                            <span className="text-[13px] font-medium">{comment.authorName ?? 'Someone'}</span>
                            <span className="text-[10px] text-muted-foreground">{formatDate(comment.createdAt, 'relative')}</span>
                            {comment.editedAt && <span className="text-[10px] text-muted-foreground">· edited</span>}
                        </div>
                        {editing ? (
                            <div className="mt-1.5 space-y-1.5">
                                <Textarea rows={2} value={body} onChange={e => setBody(e.target.value)} />
                                <div className="flex justify-end gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => { setBody(comment.body); setEditing(false) }}>Cancel</Button>
                                    <Button size="sm" onClick={save} disabled={edit.isPending || !body.trim()}>
                                        {edit.isPending ? <Loader2 className="size-3.5 animate-spin" /> : 'Save'}
                                    </Button>
                                </div>
                            </div>
                        ) : isDeleted ? (
                            <p className="mt-0.5 text-[13px] italic text-muted-foreground">[comment deleted]</p>
                        ) : (
                            <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">{comment.body}</p>
                        )}
                    </div>
                    {!editing && !isDeleted && (
                        <div className="mt-1 ml-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                            {depth === 0 && !commentsDisabled && (
                                <button type="button" className="font-medium hover:text-foreground" onClick={() => setReplying(v => !v)}>
                                    Reply
                                </button>
                            )}
                            {canEdit && (
                                <button type="button" className="font-medium hover:text-foreground" onClick={() => setEditing(true)}>
                                    Edit
                                </button>
                            )}
                            {canDelete && (
                                <button type="button" className="font-medium hover:text-rose-600" onClick={() => setConfirmDelete(true)}>
                                    Delete
                                </button>
                            )}
                        </div>
                    )}
                    {replying && (
                        <div className="mt-2">
                            <CommentComposer recognitionId={recognitionId} parentId={comment.id} onDone={() => setReplying(false)} />
                        </div>
                    )}
                    {!!comment.replies?.length && (
                        <ul className="mt-3 space-y-3">
                            {comment.replies.map(r => (
                                <CommentNode
                                    key={r.id}
                                    comment={r}
                                    recognitionId={recognitionId}
                                    me={me}
                                    canModerate={canModerate}
                                    commentsDisabled={commentsDisabled}
                                    depth={depth + 1}
                                />
                            ))}
                        </ul>
                    )}
                </div>
            </div>
            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                variant="destructive"
                title="Delete comment?"
                description="This comment will be removed."
                confirmLabel="Delete"
                onConfirm={() => del.mutate({ recognitionId, commentId: comment.id }, {
                    onSuccess: () => toast.success('Comment deleted'),
                    onError: (e: any) => toast.error('Failed', e?.message),
                })}
            />
        </li>
    )
}

function RejectDialog({
    open, onOpenChange, onReject, pending,
}: { open: boolean; onOpenChange: (o: boolean) => void; onReject: (reason: string) => void; pending: boolean }) {
    const [reason, setReason] = useState('')
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Reject recognition</DialogTitle></DialogHeader>
                <DialogBody className="space-y-2">
                    <p className="text-xs text-muted-foreground">Provide a reason so the giver can revise and resubmit.</p>
                    <Textarea rows={4} value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason for rejection…" />
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
                    <Button
                        onClick={() => onReject(reason.trim())}
                        disabled={!reason.trim() || pending}
                        className="bg-rose-600 hover:bg-rose-700 text-white"
                    >
                        {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}Reject
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function ReturnDialog({
    open, onOpenChange, onReturn, pending,
}: { open: boolean; onOpenChange: (o: boolean) => void; onReturn: (comment: string) => void; pending: boolean }) {
    const [comment, setComment] = useState('')
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader><DialogTitle>Return for revision</DialogTitle></DialogHeader>
                <DialogBody className="space-y-2">
                    <p className="text-xs text-muted-foreground">Send this back to the giver as a draft. An optional comment helps them revise.</p>
                    <Textarea rows={4} value={comment} onChange={e => setComment(e.target.value)} placeholder="Optional comment…" />
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
                    <Button onClick={() => onReturn(comment.trim())} disabled={pending}>
                        {pending && <Loader2 className="mr-1.5 size-4 animate-spin" />}Return
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
