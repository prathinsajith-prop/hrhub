import { useMemo, useState } from 'react'
import {
    Award, Plus, Sparkles, Loader2, Pencil, Archive, ShieldCheck, ShieldAlert,
    CheckCircle2, XCircle, PauseCircle, Tag, Trophy, Users, Inbox, Undo2,
} from 'lucide-react'
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, toast, ConfirmDialog } from '@/components/ui/overlays'
import {
    useRecognitionCategories, useCreateCategory, useUpdateCategory, useArchiveCategory, useSeedDefaultCategories,
    useRecognitionBadges, useCreateBadge, useUpdateBadge, useArchiveBadge, useSeedDefaultBadges,
    usePendingApprovals, useApproveRecognition, useRejectRecognition, useHoldRecognition, useReturnRecognition,
    type RecognitionCategory, type RecognitionBadge, type Recognition, type BadgeLevel, type CategoryInput, type BadgeInput,
} from '@/hooks/useRecognition'
import { useAuthStore } from '@/store/authStore'
import { cn, formatDate } from '@/lib/utils'

// ── Tone maps ────────────────────────────────────────────────────────────────
const LEVEL_TONE: Record<BadgeLevel, string> = {
    bronze: 'bg-amber-50 text-amber-800 ring-amber-200',
    silver: 'bg-slate-100 text-slate-700 ring-slate-300',
    gold: 'bg-yellow-50 text-yellow-800 ring-yellow-300',
    platinum: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
    diamond: 'bg-sky-50 text-sky-800 ring-sky-200',
}
const LEVEL_LABEL: Record<BadgeLevel, string> = {
    bronze: 'Bronze', silver: 'Silver', gold: 'Gold', platinum: 'Platinum', diamond: 'Diamond',
}
const LEVELS: BadgeLevel[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond']

// ── Helpers ──────────────────────────────────────────────────────────────────
function slugify(s: string) {
    return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}
function timeAgo(iso?: string | null) {
    if (!iso) return ''
    const ms = Date.now() - new Date(iso).getTime()
    const m = Math.floor(ms / 60000)
    if (m < 1) return 'just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.floor(h / 24)
    if (d < 30) return `${d}d ago`
    return formatDate(iso)
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function RecognitionAdminPage() {
    const role = useAuthStore(s => s.user?.role)
    if (role !== 'hr_manager' && role !== 'super_admin') {
        return (
            <PageWrapper>
                <PageHeader title="Recognition Settings" />
                <div className="text-center py-12 text-muted-foreground">
                    You don't have permission to access this page.
                </div>
            </PageWrapper>
        )
    }

    return (
        <PageWrapper>
            <PageHeader
                eyebrow="Admin"
                title="Recognition Settings"
                description="Manage categories, badges, and pending approvals"
            />

            <Tabs defaultValue="categories" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="categories" className="gap-2"><Tag className="size-4" /> Categories</TabsTrigger>
                    <TabsTrigger value="badges" className="gap-2"><Trophy className="size-4" /> Badges</TabsTrigger>
                    <TabsTrigger value="approvals" className="gap-2"><ShieldCheck className="size-4" /> Approvals</TabsTrigger>
                </TabsList>

                <TabsContent value="categories"><CategoriesTab /></TabsContent>
                <TabsContent value="badges"><BadgesTab /></TabsContent>
                <TabsContent value="approvals"><ApprovalsTab /></TabsContent>
            </Tabs>
        </PageWrapper>
    )
}

// ── Categories ───────────────────────────────────────────────────────────────
function CategoriesTab() {
    const { data, isLoading } = useRecognitionCategories()
    const seed = useSeedDefaultCategories()
    const [creating, setCreating] = useState(false)
    const [editing, setEditing] = useState<RecognitionCategory | null>(null)

    const list = data ?? []
    const active = list.filter(c => !c.isArchived)
    const archived = list.filter(c => c.isArchived)

    const runSeed = () => seed.mutate(undefined, {
        onSuccess: () => toast.success('Default categories seeded'),
        onError: (e: any) => toast.error('Failed to seed', e?.message),
    })

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="font-medium">{active.length} active</Badge>
                    {archived.length > 0 && <Badge variant="outline" className="font-medium text-muted-foreground">{archived.length} archived</Badge>}
                </div>
                <div className="flex items-center gap-2">
                    {!isLoading && list.length === 0 && (
                        <Button variant="outline" onClick={runSeed} disabled={seed.isPending} leftIcon={<Sparkles className="size-4" />}>
                            {seed.isPending ? 'Seeding…' : 'Seed defaults'}
                        </Button>
                    )}
                    <Button onClick={() => setCreating(true)} leftIcon={<Plus className="size-4" />}>Add category</Button>
                </div>
            </div>

            {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
                </div>
            ) : list.length === 0 ? (
                <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted"><Tag className="size-6 text-muted-foreground" /></div>
                    <div>
                        <p className="text-sm font-medium">No categories yet</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Seed the 12 defaults or add your own to get started.</p>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                        <Button variant="outline" onClick={runSeed} disabled={seed.isPending} leftIcon={<Sparkles className="size-4" />}>Seed defaults</Button>
                        <Button onClick={() => setCreating(true)} leftIcon={<Plus className="size-4" />}>Add category</Button>
                    </div>
                </CardContent></Card>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map(c => <CategoryCard key={c.id} c={c} onEdit={() => setEditing(c)} />)}
                </div>
            )}

            {(creating || editing) && (
                <CategoryDialog
                    category={editing}
                    open
                    onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null) } }}
                />
            )}
        </div>
    )
}

function CategoryCard({ c, onEdit }: { c: RecognitionCategory; onEdit: () => void }) {
    const archive = useArchiveCategory()
    const [confirmArchive, setConfirmArchive] = useState(false)

    return (
        <Card className={cn(c.isArchived && 'opacity-70')}>
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg text-base font-semibold ring-1 ring-inset"
                        style={{ backgroundColor: `${c.color}15`, color: c.color, borderColor: `${c.color}40` }}
                    >
                        <span aria-hidden>{c.icon || '⭐'}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold truncate">{c.label}</p>
                            {c.isDefault && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                            {c.isArchived ? (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">Archived</span>
                            ) : (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">Active</span>
                            )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground font-mono truncate">{c.key}</p>
                        {c.description && <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{c.description}</p>}
                        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>Sort #{c.sortOrder}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                                <span className="size-2 rounded-full ring-1 ring-inset ring-border" style={{ backgroundColor: c.color }} />
                                {c.color}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={onEdit} leftIcon={<Pencil className="size-3.5" />}>Edit</Button>
                    {!c.isArchived && (
                        <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(true)} leftIcon={<Archive className="size-3.5" />}>Archive</Button>
                    )}
                </div>
            </CardContent>
            <ConfirmDialog
                open={confirmArchive} onOpenChange={setConfirmArchive} variant="warning"
                title="Archive this category?" description={`"${c.label}" will be hidden from new recognitions but kept for existing records.`}
                onConfirm={() => archive.mutate(c.id, {
                    onSuccess: () => toast.success('Category archived'),
                    onError: (e: any) => toast.error('Failed', e?.message),
                })}
            />
        </Card>
    )
}

function CategoryDialog({ category, open, onOpenChange }: { category: RecognitionCategory | null; open: boolean; onOpenChange: (o: boolean) => void }) {
    const isEdit = !!category
    const create = useCreateCategory()
    const update = useUpdateCategory()

    const [form, setForm] = useState<CategoryInput>({
        key: category?.key ?? '',
        label: category?.label ?? '',
        description: category?.description ?? '',
        icon: category?.icon ?? '⭐',
        color: category?.color ?? '#6366f1',
        sortOrder: category?.sortOrder ?? 0,
    })
    const [keyTouched, setKeyTouched] = useState(isEdit)

    const onLabelChange = (v: string) => {
        setForm(f => ({ ...f, label: v, key: keyTouched ? f.key : slugify(v) }))
    }
    const set = <K extends keyof CategoryInput>(k: K) => (v: CategoryInput[K]) => setForm(f => ({ ...f, [k]: v }))

    const canSave = form.key.trim().length > 0 && form.label.trim().length > 0
    const pending = create.isPending || update.isPending

    function submit() {
        if (!canSave) return
        const input: CategoryInput = {
            key: form.key.trim(),
            label: form.label.trim(),
            description: form.description?.trim() || undefined,
            icon: form.icon || '⭐',
            color: form.color || '#6366f1',
            sortOrder: Number(form.sortOrder) || 0,
        }
        const onDone = () => { toast.success(isEdit ? 'Category updated' : 'Category created'); onOpenChange(false) }
        const onErr = (e: any) => toast.error('Failed', e?.message)
        if (isEdit) update.mutate({ id: category!.id, patch: input }, { onSuccess: onDone, onError: onErr })
        else create.mutate(input, { onSuccess: onDone, onError: onErr })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>{isEdit ? 'Edit category' : 'New category'}</DialogTitle></DialogHeader>
                <DialogBody className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Label *</Label>
                            <Input value={form.label} onChange={e => onLabelChange(e.target.value)} placeholder="e.g. Above and Beyond" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Key *</Label>
                            <Input
                                value={form.key}
                                onChange={e => { setKeyTouched(true); set('key')(slugify(e.target.value)) }}
                                placeholder="above_and_beyond"
                                className="font-mono text-sm"
                                disabled={isEdit}
                            />
                            <p className="text-[10px] text-muted-foreground">Lowercase, underscores only. Cannot be changed later.</p>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Description</Label>
                        <Textarea
                            rows={3}
                            value={form.description ?? ''}
                            onChange={e => set('description')(e.target.value)}
                            placeholder="When should this category be used?"
                        />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label>Icon</Label>
                            <Input value={form.icon ?? ''} onChange={e => set('icon')(e.target.value)} placeholder="⭐ or icon name" />
                            <p className="text-[10px] text-muted-foreground">Emoji or short label.</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Color</Label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={form.color ?? '#6366f1'}
                                    onChange={e => set('color')(e.target.value)}
                                    className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background"
                                />
                                <Input value={form.color ?? ''} onChange={e => set('color')(e.target.value)} className="font-mono text-sm" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Sort order</Label>
                            <Input
                                type="number"
                                value={form.sortOrder ?? 0}
                                onChange={e => set('sortOrder')(Number(e.target.value))}
                            />
                        </div>
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
                    <Button onClick={submit} disabled={!canSave || pending} className="gap-2">
                        {pending && <Loader2 className="size-4 animate-spin" />}
                        {isEdit ? 'Save' : 'Create'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ── Badges ───────────────────────────────────────────────────────────────────
function BadgesTab() {
    const { data, isLoading } = useRecognitionBadges()
    const { data: categories } = useRecognitionCategories()
    const seed = useSeedDefaultBadges()
    const [creating, setCreating] = useState(false)
    const [editing, setEditing] = useState<RecognitionBadge | null>(null)

    const list = data ?? []
    const active = list.filter(b => !b.isArchived)
    const archived = list.filter(b => b.isArchived)

    const runSeed = () => seed.mutate(undefined, {
        onSuccess: () => toast.success('Default badges seeded'),
        onError: (e: any) => toast.error('Failed to seed', e?.message),
    })

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="font-medium">{active.length} active</Badge>
                    {archived.length > 0 && <Badge variant="outline" className="font-medium text-muted-foreground">{archived.length} archived</Badge>}
                </div>
                <div className="flex items-center gap-2">
                    {!isLoading && list.length === 0 && (
                        <Button variant="outline" onClick={runSeed} disabled={seed.isPending} leftIcon={<Sparkles className="size-4" />}>
                            {seed.isPending ? 'Seeding…' : 'Seed defaults'}
                        </Button>
                    )}
                    <Button onClick={() => setCreating(true)} leftIcon={<Plus className="size-4" />}>Add badge</Button>
                </div>
            </div>

            {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
                </div>
            ) : list.length === 0 ? (
                <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-muted"><Trophy className="size-6 text-muted-foreground" /></div>
                    <div>
                        <p className="text-sm font-medium">No badges yet</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Seed the 12 defaults or design your own award badges.</p>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                        <Button variant="outline" onClick={runSeed} disabled={seed.isPending} leftIcon={<Sparkles className="size-4" />}>Seed defaults</Button>
                        <Button onClick={() => setCreating(true)} leftIcon={<Plus className="size-4" />}>Add badge</Button>
                    </div>
                </CardContent></Card>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map(b => (
                        <BadgeCard
                            key={b.id} b={b}
                            categoryLabel={categories?.find(c => c.key === b.categoryKey)?.label}
                            onEdit={() => setEditing(b)}
                        />
                    ))}
                </div>
            )}

            {(creating || editing) && (
                <BadgeDialog
                    badge={editing}
                    categories={categories ?? []}
                    open
                    onOpenChange={(o) => { if (!o) { setCreating(false); setEditing(null) } }}
                />
            )}
        </div>
    )
}

function BadgeCard({ b, categoryLabel, onEdit }: { b: RecognitionBadge; categoryLabel?: string; onEdit: () => void }) {
    const archive = useArchiveBadge()
    const [confirmArchive, setConfirmArchive] = useState(false)

    return (
        <Card className={cn(b.isArchived && 'opacity-70')}>
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <div
                        className="flex size-12 shrink-0 items-center justify-center rounded-lg text-lg ring-1 ring-inset"
                        style={{ backgroundColor: `${b.color}15`, color: b.color, borderColor: `${b.color}40` }}
                    >
                        <Award className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold truncate">{b.label}</p>
                            <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium capitalize ring-1', LEVEL_TONE[b.level])}>
                                {LEVEL_LABEL[b.level]}
                            </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground font-mono truncate">{b.key}</p>
                        {b.description && <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{b.description}</p>}
                        <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                            {categoryLabel && <span className="rounded-full bg-muted px-1.5 py-0.5">{categoryLabel}</span>}
                            <span>{b.defaultPoints} pts</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                                <span className="size-2 rounded-full ring-1 ring-inset ring-border" style={{ backgroundColor: b.color }} />
                                {b.color}
                            </span>
                            {b.isArchived && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600">Archived</span>}
                        </div>
                    </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={onEdit} leftIcon={<Pencil className="size-3.5" />}>Edit</Button>
                    {!b.isArchived && (
                        <Button variant="ghost" size="sm" onClick={() => setConfirmArchive(true)} leftIcon={<Archive className="size-3.5" />}>Archive</Button>
                    )}
                </div>
            </CardContent>
            <ConfirmDialog
                open={confirmArchive} onOpenChange={setConfirmArchive} variant="warning"
                title="Archive this badge?" description={`"${b.label}" will be hidden from new recognitions but kept for existing records.`}
                onConfirm={() => archive.mutate(b.id, {
                    onSuccess: () => toast.success('Badge archived'),
                    onError: (e: any) => toast.error('Failed', e?.message),
                })}
            />
        </Card>
    )
}

function BadgeDialog({ badge, categories, open, onOpenChange }: { badge: RecognitionBadge | null; categories: RecognitionCategory[]; open: boolean; onOpenChange: (o: boolean) => void }) {
    const isEdit = !!badge
    const create = useCreateBadge()
    const update = useUpdateBadge()

    const [form, setForm] = useState<BadgeInput>({
        key: badge?.key ?? '',
        label: badge?.label ?? '',
        description: badge?.description ?? '',
        icon: badge?.icon ?? 'award',
        color: badge?.color ?? '#f59e0b',
        level: badge?.level ?? 'bronze',
        categoryKey: badge?.categoryKey ?? null,
        defaultPoints: badge?.defaultPoints ?? 10,
    })
    const [keyTouched, setKeyTouched] = useState(isEdit)

    const onLabelChange = (v: string) => {
        setForm(f => ({ ...f, label: v, key: keyTouched ? f.key : slugify(v) }))
    }
    const set = <K extends keyof BadgeInput>(k: K) => (v: BadgeInput[K]) => setForm(f => ({ ...f, [k]: v }))

    const canSave = form.key.trim().length > 0 && form.label.trim().length > 0
    const pending = create.isPending || update.isPending

    function submit() {
        if (!canSave) return
        const input: BadgeInput = {
            key: form.key.trim(),
            label: form.label.trim(),
            description: form.description?.trim() || undefined,
            icon: form.icon || 'award',
            color: form.color || '#f59e0b',
            level: form.level,
            categoryKey: form.categoryKey || null,
            defaultPoints: Number(form.defaultPoints) || 0,
        }
        const onDone = () => { toast.success(isEdit ? 'Badge updated' : 'Badge created'); onOpenChange(false) }
        const onErr = (e: any) => toast.error('Failed', e?.message)
        if (isEdit) update.mutate({ id: badge!.id, patch: input }, { onSuccess: onDone, onError: onErr })
        else create.mutate(input, { onSuccess: onDone, onError: onErr })
    }

    const activeCategories = categories.filter(c => !c.isArchived)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader><DialogTitle>{isEdit ? 'Edit badge' : 'New badge'}</DialogTitle></DialogHeader>
                <DialogBody className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Label *</Label>
                            <Input value={form.label} onChange={e => onLabelChange(e.target.value)} placeholder="e.g. Gold Star" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Key *</Label>
                            <Input
                                value={form.key}
                                onChange={e => { setKeyTouched(true); set('key')(slugify(e.target.value)) }}
                                placeholder="gold_star"
                                className="font-mono text-sm"
                                disabled={isEdit}
                            />
                            <p className="text-[10px] text-muted-foreground">Lowercase, underscores only.</p>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Description</Label>
                        <Textarea
                            rows={2}
                            value={form.description ?? ''}
                            onChange={e => set('description')(e.target.value)}
                            placeholder="What does this badge represent?"
                        />
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>Level *</Label>
                            <Select value={form.level} onValueChange={(v) => set('level')(v as BadgeLevel)}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {LEVELS.map(l => (
                                        <SelectItem key={l} value={l}>{LEVEL_LABEL[l]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Category</Label>
                            <Select value={form.categoryKey ?? '__none__'} onValueChange={(v) => set('categoryKey')(v === '__none__' ? null : v)}>
                                <SelectTrigger><SelectValue placeholder="No category" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No category</SelectItem>
                                    {activeCategories.map(c => (
                                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                            <Label>Icon</Label>
                            <Input value={form.icon ?? ''} onChange={e => set('icon')(e.target.value)} placeholder="award" />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Color</Label>
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={form.color ?? '#f59e0b'}
                                    onChange={e => set('color')(e.target.value)}
                                    className="h-10 w-12 cursor-pointer rounded-md border border-input bg-background"
                                />
                                <Input value={form.color ?? ''} onChange={e => set('color')(e.target.value)} className="font-mono text-sm" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Default points</Label>
                            <Input
                                type="number"
                                value={form.defaultPoints ?? 0}
                                onChange={e => set('defaultPoints')(Number(e.target.value))}
                            />
                        </div>
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
                    <Button onClick={submit} disabled={!canSave || pending} className="gap-2">
                        {pending && <Loader2 className="size-4 animate-spin" />}
                        {isEdit ? 'Save' : 'Create'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ── Approvals ────────────────────────────────────────────────────────────────
type ApprovalDialogMode = null | { kind: 'approve' | 'reject' | 'hold' | 'return'; r: Recognition }

function ApprovalsTab() {
    const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = usePendingApprovals({ limit: 20 })
    const list = useMemo<Recognition[]>(() => (data?.pages ?? []).flatMap(p => p.data), [data])
    const [dialog, setDialog] = useState<ApprovalDialogMode>(null)

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="font-medium">{list.length} pending</Badge>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
            ) : list.length === 0 ? (
                <Card><CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                    <div className="flex size-12 items-center justify-center rounded-full bg-emerald-50">
                        <Inbox className="size-6 text-emerald-600" />
                    </div>
                    <div>
                        <p className="text-sm font-medium">All caught up — no pending approvals</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">Great job keeping the queue clean.</p>
                    </div>
                </CardContent></Card>
            ) : (
                <div className="space-y-2.5">
                    {list.map(r => (
                        <ApprovalRow
                            key={r.id} r={r}
                            onApprove={() => setDialog({ kind: 'approve', r })}
                            onReject={() => setDialog({ kind: 'reject', r })}
                            onHold={() => setDialog({ kind: 'hold', r })}
                            onReturn={() => setDialog({ kind: 'return', r })}
                        />
                    ))}
                    {hasNextPage && (
                        <div className="flex justify-center pt-2">
                            <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
                                {isFetchingNextPage ? <Loader2 className="size-4 animate-spin" /> : 'Load more'}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            {dialog && (
                <ApprovalDialog
                    mode={dialog.kind}
                    recognition={dialog.r}
                    open
                    onOpenChange={(o) => { if (!o) setDialog(null) }}
                />
            )}
        </div>
    )
}

function ApprovalRow({ r, onApprove, onReject, onHold, onReturn }: { r: Recognition; onApprove: () => void; onReject: () => void; onHold: () => void; onReturn: () => void }) {
    const recipients = r.recipients ?? []
    const recipNames = recipients.slice(0, 3).map(p => p.name).join(', ')
    const extra = recipients.length > 3 ? ` +${recipients.length - 3}` : ''

    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{r.giverName ?? 'Unknown'}</span>
                            <span aria-hidden>→</span>
                            <span className="font-medium text-foreground inline-flex items-center gap-1">
                                <Users className="size-3" />
                                {recipNames || '—'}{extra}
                            </span>
                            {r.category && <Badge variant="secondary" className="text-[10px]">{r.category.label}</Badge>}
                            {!r.category && <Badge variant="secondary" className="text-[10px]">{r.categoryKey}</Badge>}
                            {r.badge && <Badge variant="outline" className={cn('text-[10px] capitalize ring-1', LEVEL_TONE[r.badge.level])}>{r.badge.label}</Badge>}
                        </div>
                        <p className="mt-1.5 text-sm font-semibold truncate">{r.title}</p>
                        {r.message && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.message}</p>}
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                            <ShieldAlert className="size-3" />
                            Submitted {timeAgo(r.submittedAt ?? r.createdAt)}
                            {r.points > 0 && <span>· {r.points} pts</span>}
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1 flex-wrap justify-end">
                        <Button variant="outline" size="sm" onClick={onReturn} leftIcon={<Undo2 className="size-3.5" />}>Return</Button>
                        <Button variant="outline" size="sm" onClick={onHold} leftIcon={<PauseCircle className="size-3.5" />}>Hold</Button>
                        <Button variant="outline" size="sm" onClick={onReject} leftIcon={<XCircle className="size-3.5 text-rose-600" />}>Reject</Button>
                        <Button size="sm" onClick={onApprove} leftIcon={<CheckCircle2 className="size-3.5" />}>Approve</Button>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

function ApprovalDialog({ mode, recognition, open, onOpenChange }: { mode: 'approve' | 'reject' | 'hold' | 'return'; recognition: Recognition; open: boolean; onOpenChange: (o: boolean) => void }) {
    const approve = useApproveRecognition()
    const reject = useRejectRecognition()
    const hold = useHoldRecognition()
    const returnForRevision = useReturnRecognition()

    const [text, setText] = useState('')
    const pending = approve.isPending || reject.isPending || hold.isPending || returnForRevision.isPending

    const config = {
        approve: { title: 'Approve recognition', label: 'Comment (optional)', placeholder: 'Add a note for the audit trail…', cta: 'Approve', required: false, icon: <CheckCircle2 className="size-4" /> },
        reject: { title: 'Reject recognition', label: 'Reason *', placeholder: 'Why is this being rejected? The giver will be notified.', cta: 'Reject', required: true, icon: <XCircle className="size-4 text-rose-600" /> },
        hold: { title: 'Hold for review', label: 'Comment (optional)', placeholder: 'What additional review is needed?', cta: 'Hold', required: false, icon: <PauseCircle className="size-4" /> },
        return: { title: 'Return for revision', label: 'Comment (optional)', placeholder: 'What needs to be revised before resubmission?', cta: 'Return', required: false, icon: <Undo2 className="size-4" /> },
    }[mode]

    const canSave = config.required ? text.trim().length > 0 : true

    function submit() {
        if (!canSave) return
        const successMsg =
            mode === 'approve' ? 'Approved'
                : mode === 'reject' ? 'Rejected'
                    : mode === 'hold' ? 'On hold'
                        : 'Recognition returned for revision'
        const onDone = () => {
            toast.success(successMsg)
            onOpenChange(false)
        }
        const onErr = (e: any) => toast.error('Failed', e?.message)
        if (mode === 'approve') approve.mutate({ id: recognition.id, comment: text.trim() || undefined }, { onSuccess: onDone, onError: onErr })
        else if (mode === 'reject') reject.mutate({ id: recognition.id, reason: text.trim() }, { onSuccess: onDone, onError: onErr })
        else if (mode === 'hold') hold.mutate({ id: recognition.id, comment: text.trim() || undefined }, { onSuccess: onDone, onError: onErr })
        else returnForRevision.mutate({ id: recognition.id, comment: text.trim() || undefined }, { onSuccess: onDone, onError: onErr })
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">{config.icon} {config.title}</DialogTitle>
                </DialogHeader>
                <DialogBody className="space-y-4">
                    <div className="rounded-lg border bg-muted/30 p-3">
                        <p className="text-xs text-muted-foreground">
                            <span className="font-medium text-foreground">{recognition.giverName ?? 'Unknown'}</span>
                            <span> recognized </span>
                            <span className="font-medium text-foreground">
                                {(recognition.recipients ?? []).map(r => r.name).join(', ') || '—'}
                            </span>
                        </p>
                        <p className="mt-1 text-sm font-semibold truncate">{recognition.title}</p>
                    </div>
                    <div className="space-y-1.5">
                        <Label>{config.label}</Label>
                        <Textarea
                            rows={4}
                            value={text}
                            onChange={e => setText(e.target.value)}
                            placeholder={config.placeholder}
                            autoFocus
                        />
                    </div>
                </DialogBody>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
                    <Button
                        onClick={submit}
                        disabled={!canSave || pending}
                        className={cn('gap-2', mode === 'reject' && 'bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500')}
                    >
                        {pending && <Loader2 className="size-4 animate-spin" />}
                        {config.cta}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
