import { useMemo, useState } from 'react'
import { Megaphone, Plus, Pin, Loader2, Send, Archive, Trash2, Pencil, BarChart3, AlertTriangle, Clock } from 'lucide-react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, toast, ConfirmDialog } from '@/components/ui/overlays'
import { useOrgUnits } from '@/hooks/useOrgUnits'
import { useDesignations } from '@/hooks/useDesignations'
import {
    useAnnouncements, useCreateAnnouncement, useUpdateAnnouncement, useAnnouncementAction, useDeleteAnnouncement,
    useAnnouncementReceipts, type Announcement, type AudienceRule, type AnnouncementPriority,
} from '@/hooks/useAnnouncements'
import { cn, formatDate } from '@/lib/utils'

const CATEGORIES = [
    'general', 'hr_policy', 'holiday', 'event', 'org_news', 'recognition',
    'emergency', 'system_maintenance', 'payroll', 'recruitment', 'training',
]
const CATEGORY_LABEL: Record<string, string> = {
    general: 'General', hr_policy: 'HR Policy', holiday: 'Holiday', event: 'Event', org_news: 'Org News',
    recognition: 'Recognition', emergency: 'Emergency', system_maintenance: 'System Maintenance',
    payroll: 'Payroll', recruitment: 'Recruitment', training: 'Training',
}
const PRIORITY_TONE: Record<AnnouncementPriority, string> = {
    low: 'bg-slate-50 text-slate-600 ring-slate-200',
    normal: 'bg-blue-50 text-blue-700 ring-blue-200',
    high: 'bg-amber-50 text-amber-700 ring-amber-200',
    critical: 'bg-rose-50 text-rose-700 ring-rose-200',
}
const STATUS_TONE: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-600', scheduled: 'bg-indigo-50 text-indigo-700',
    published: 'bg-emerald-50 text-emerald-700', expired: 'bg-amber-50 text-amber-700', archived: 'bg-slate-100 text-slate-500',
}
const EMPLOYMENT_TYPES = ['permanent', 'contract', 'part_time', 'probation']

export function AnnouncementsPage() {
    const [statusFilter, setStatusFilter] = useState<string>('')
    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useAnnouncements({ status: statusFilter || undefined })
    const [editing, setEditing] = useState<Announcement | null>(null)
    const [creating, setCreating] = useState(false)
    const list = useMemo<Announcement[]>(() => (data?.pages ?? []).flatMap(p => p.data), [data])

    return (
        <PageWrapper>
            <PageHeader
                eyebrow="Communication"
                title="Announcements"
                description="Publish company-wide and targeted announcements. Track who has read and acknowledged them."
                actions={<Button onClick={() => setCreating(true)} leftIcon={<Plus className="size-4" />}>New announcement</Button>}
            />

            <div className="mb-4 flex items-center gap-1.5">
                {['', 'draft', 'scheduled', 'published', 'expired', 'archived'].map(s => (
                    <button key={s || 'all'} type="button" onClick={() => setStatusFilter(s)}
                        className={cn('rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                            statusFilter === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
                        {s || 'All'}
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
            ) : list.length === 0 ? (
                <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted"><Megaphone className="size-6 text-muted-foreground" /></div>
                    <div><p className="text-sm font-medium">No announcements</p><p className="mt-0.5 text-xs text-muted-foreground">Create your first announcement to start communicating.</p></div>
                </CardContent></Card>
            ) : (
                <div className="space-y-2.5">
                    {list.map(a => <AnnouncementRow key={a.id} a={a} onEdit={() => setEditing(a)} />)}
                    {hasNextPage && (
                        <div className="flex justify-center pt-2">
                            <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                                {isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : 'Load more'}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {(creating || editing) && (
                <AnnouncementDialog
                    announcement={editing}
                    open
                    onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null) } }}
                />
            )}
        </PageWrapper>
    )
}

function AnnouncementRow({ a, onEdit }: { a: Announcement; onEdit: () => void }) {
    const action = useAnnouncementAction()
    const del = useDeleteAnnouncement()
    const [showStats, setShowStats] = useState(false)
    const { data: stats } = useAnnouncementReceipts(a.id, showStats)
    const [confirmDelete, setConfirmDelete] = useState(false)

    const TOASTS: Record<'publish' | 'archive' | 'schedule', string> = { publish: 'Published', archive: 'Archived', schedule: 'Scheduled' }
    const run = (act: 'publish' | 'archive' | 'schedule') => action.mutate({ id: a.id, action: act }, {
        onSuccess: () => toast.success(TOASTS[act]),
        onError: (e: any) => toast.error('Failed', e?.message),
    })
    // A draft with a future publish time can be scheduled (auto-publishes then).
    const canSchedule = a.status === 'draft' && !!a.publishAt && new Date(a.publishAt).getTime() > Date.now()

    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            {a.pinned && <Pin className="size-3.5 text-primary" />}
                            {a.priority === 'critical' && <AlertTriangle className="size-3.5 text-rose-600" />}
                            <p className="text-sm font-semibold truncate">{a.title}</p>
                        </div>
                        <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px]">
                            <span className={cn('rounded-full px-2 py-0.5 font-medium capitalize', STATUS_TONE[a.status])}>{a.status}</span>
                            <span className={cn('rounded-full px-2 py-0.5 font-medium capitalize ring-1', PRIORITY_TONE[a.priority])}>{a.priority}</span>
                            <Badge variant="secondary" className="text-[10px]">{CATEGORY_LABEL[a.category] ?? a.category}</Badge>
                            <span className="text-muted-foreground">· {a.audienceType === 'all' ? 'Everyone' : 'Targeted'}</span>
                            {a.requireAck && <span className="text-muted-foreground">· Ack required</span>}
                            <span className="text-muted-foreground">· {formatDate(a.publishedAt ?? a.createdAt)}</span>
                        </div>
                        {showStats && stats && (
                            <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                                <span>Targeted <strong className="text-foreground">{stats.targeted}</strong></span>
                                <span>Read <strong className="text-emerald-700">{stats.readPct}%</strong></span>
                                <span>Ack <strong className="text-blue-700">{stats.ackPct}%</strong></span>
                                <span>Unread <strong className="text-amber-700">{stats.unreadPct}%</strong></span>
                            </div>
                        )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        <Button variant="ghost" size="icon" title="Read stats" onClick={() => setShowStats(v => !v)}><BarChart3 className="size-4" /></Button>
                        {canSchedule && (
                            <Button variant="ghost" size="icon" title="Schedule" onClick={() => run('schedule')} disabled={action.isPending}><Clock className="size-4" /></Button>
                        )}
                        {(a.status === 'draft' || a.status === 'scheduled' || a.status === 'archived') && (
                            <Button variant="ghost" size="icon" title={canSchedule ? 'Publish now' : 'Publish'} onClick={() => run('publish')} disabled={action.isPending}><Send className="size-4" /></Button>
                        )}
                        {a.status === 'published' && (
                            <Button variant="ghost" size="icon" title="Archive" onClick={() => run('archive')} disabled={action.isPending}><Archive className="size-4" /></Button>
                        )}
                        <Button variant="ghost" size="icon" title="Edit" onClick={onEdit}><Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" title="Delete" onClick={() => setConfirmDelete(true)}><Trash2 className="size-4 text-rose-600" /></Button>
                    </div>
                </div>
            </CardContent>
            <ConfirmDialog
                open={confirmDelete} onOpenChange={setConfirmDelete} variant="destructive"
                title="Delete announcement?" description={`"${a.title}" will be permanently removed.`}
                onConfirm={() => del.mutate(a.id, { onSuccess: () => toast.success('Deleted'), onError: (e: any) => toast.error('Failed', e?.message) })}
            />
        </Card>
    )
}

function AnnouncementDialog({ announcement, open, onOpenChange }: { announcement: Announcement | null; open: boolean; onOpenChange: (o: boolean) => void }) {
    const isEdit = !!announcement
    const create = useCreateAnnouncement()
    const update = useUpdateAnnouncement()
    const orgUnits = useOrgUnits()
    const designations = useDesignations()

    const initAud = announcement?.audiences ?? [{ kind: 'all' as const }]
    const [form, setForm] = useState({
        title: announcement?.title ?? '',
        body: announcement?.body ?? '',
        category: announcement?.category ?? 'general',
        priority: (announcement?.priority ?? 'normal') as AnnouncementPriority,
        pinned: announcement?.pinned ?? false,
        requireAck: announcement?.requireAck ?? false,
        publishAt: announcement?.publishAt?.slice(0, 16) ?? '',
        expireAt: announcement?.expireAt?.slice(0, 16) ?? '',
    })
    const [everyone, setEveryone] = useState(initAud.some(a => a.kind === 'all'))
    const [rules, setRules] = useState<AudienceRule[]>(initAud.filter(a => a.kind !== 'all'))

    const branches = (orgUnits.data ?? []).filter(u => u.type === 'branch')
    const divisions = (orgUnits.data ?? []).filter(u => u.type === 'division')
    const departments = (orgUnits.data ?? []).filter(u => u.type === 'department')

    const toggleRule = (kind: AudienceRule['kind'], value: string) => {
        setRules(prev => {
            const exists = prev.some(r => r.kind === kind && r.value === value)
            return exists ? prev.filter(r => !(r.kind === kind && r.value === value)) : [...prev, { kind, value }]
        })
    }
    const has = (kind: AudienceRule['kind'], value: string) => rules.some(r => r.kind === kind && r.value === value)

    const audiences: AudienceRule[] = everyone ? [{ kind: 'all' }] : rules
    const canSave = form.title.trim().length > 0 && (everyone || rules.length > 0)

    function submit() {
        if (!canSave) return
        const input = {
            title: form.title.trim(), body: form.body, category: form.category, priority: form.priority,
            pinned: form.pinned, requireAck: form.requireAck,
            publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : null,
            expireAt: form.expireAt ? new Date(form.expireAt).toISOString() : null,
            audiences,
        }
        const onDone = () => { toast.success(isEdit ? 'Saved' : 'Created as draft'); onOpenChange(false) }
        const onErr = (e: any) => toast.error('Failed', e?.message)
        if (isEdit) update.mutate({ id: announcement!.id, input }, { onSuccess: onDone, onError: onErr })
        else create.mutate(input, { onSuccess: onDone, onError: onErr })
    }

    const pending = create.isPending || update.isPending
    const set = (k: keyof typeof form) => (v: any) => setForm(f => ({ ...f, [k]: v }))

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>{isEdit ? 'Edit announcement' : 'New announcement'}</DialogTitle></DialogHeader>
                <DialogBody className="space-y-4">
                    <div className="space-y-1.5">
                        <Label>Title *</Label>
                        <Input value={form.title} onChange={e => set('title')(e.target.value)} placeholder="e.g. Office closed for Eid" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label>Category</Label>
                            <Select value={form.category} onValueChange={set('category')}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{CATEGORY_LABEL[c] ?? c}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Priority</Label>
                            <Select value={form.priority} onValueChange={(v) => set('priority')(v as AnnouncementPriority)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{(['low', 'normal', 'high', 'critical'] as const).map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Message</Label>
                        <Textarea rows={5} value={form.body} onChange={e => set('body')(e.target.value)} placeholder="Write the announcement…" />
                    </div>

                    {/* Audience */}
                    <div className="space-y-2 rounded-lg border p-3">
                        <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Audience</Label>
                        <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={everyone} onChange={e => setEveryone(e.target.checked)} /> Entire organization
                        </label>
                        {!everyone && (
                            <div className="space-y-2.5 pt-1">
                                <AudienceGroup label="Departments" items={departments.map(d => ({ value: d.id, label: d.name }))} kind="department" has={has} onToggle={toggleRule} />
                                <AudienceGroup label="Branches" items={branches.map(b => ({ value: b.id, label: b.name }))} kind="branch" has={has} onToggle={toggleRule} />
                                <AudienceGroup label="Divisions" items={divisions.map(d => ({ value: d.id, label: d.name }))} kind="division" has={has} onToggle={toggleRule} />
                                <AudienceGroup label="Designations" items={(designations.data ?? []).filter(d => d.isActive).map(d => ({ value: d.name, label: d.name }))} kind="designation" has={has} onToggle={toggleRule} />
                                <AudienceGroup label="Employment type" items={EMPLOYMENT_TYPES.map(t => ({ value: t, label: t.replace('_', ' ') }))} kind="employment_type" has={has} onToggle={toggleRule} />
                                {rules.length === 0 && <p className="text-[11px] text-amber-600">Select at least one group, or choose Entire organization.</p>}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-5">
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.pinned} onChange={e => set('pinned')(e.target.checked)} /> Pin to top</label>
                        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.requireAck} onChange={e => set('requireAck')(e.target.checked)} /> Require acknowledgement</label>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5"><Label className="text-xs">Schedule publish (optional)</Label><Input type="datetime-local" value={form.publishAt} onChange={e => set('publishAt')(e.target.value)} /></div>
                        <div className="space-y-1.5"><Label className="text-xs">Expire (optional)</Label><Input type="datetime-local" value={form.expireAt} onChange={e => set('expireAt')(e.target.value)} /></div>
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
                    <Button onClick={submit} disabled={!canSave || pending} className="gap-2">
                        {pending && <Loader2 className="size-4 animate-spin" />}{isEdit ? 'Save' : 'Save draft'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function AudienceGroup({ label, items, kind, has, onToggle }: {
    label: string; items: { value: string; label: string }[]; kind: AudienceRule['kind']
    has: (k: AudienceRule['kind'], v: string) => boolean; onToggle: (k: AudienceRule['kind'], v: string) => void
}) {
    if (!items.length) return null
    return (
        <div>
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">{label}</p>
            <div className="flex flex-wrap gap-1.5">
                {items.map(it => (
                    <button key={it.value} type="button" onClick={() => onToggle(kind, it.value)}
                        className={cn('rounded-full border px-2.5 py-1 text-[11px] capitalize transition-colors',
                            has(kind, it.value) ? 'border-primary bg-primary/10 text-primary' : 'border-input text-muted-foreground hover:bg-muted')}>
                        {it.label}
                    </button>
                ))}
            </div>
        </div>
    )
}
