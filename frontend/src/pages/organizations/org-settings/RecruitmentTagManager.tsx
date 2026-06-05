import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GraduationCap, Loader2, Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react'

import { Card, Input, Label } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/EmptyState'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogBody,
    DialogFooter,
    ConfirmDialog,
    toast,
} from '@/components/ui/overlays'
import {
    useRecruitmentTags,
    useCreateRecruitmentTag,
    useUpdateRecruitmentTag,
    useDeleteRecruitmentTag,
    type RecruitmentTagKind,
    type RecruitmentTag,
} from '@/hooks/useRecruitment'

// Icon per catalog kind — all copy lives in the locale files under
// `recruitment.tagManager.<kind>.*` (EN + AR, per project i18n rule).
const ICONS: Record<RecruitmentTagKind, typeof Sparkles> = {
    skills: Sparkles,
    qualifications: GraduationCap,
}

/**
 * CRUD for one recruitment tag catalog (skills or qualifications). Reused for
 * both kinds via the `kind` prop — same list + add/edit dialog + delete confirm.
 *
 * Server-paginated: the table renders 10 rows initially and loads 10 more each
 * time the bottom-sentinel scrolls into view (IntersectionObserver). Search
 * is server-side via the `q` query string, debounced 250 ms so each keystroke
 * doesn't fire a fetch.
 */
export function RecruitmentTagManager({ kind }: { kind: RecruitmentTagKind }) {
    const { t } = useTranslation()
    const Icon = ICONS[kind]
    // Per-kind key prefix: recruitment.tagManager.skills.* / .qualifications.*
    const tk = `recruitment.tagManager.${kind}`

    // Search state — `search` is the input value (instant); `query` is the
    // debounced value pushed into the query key. Keeps typing snappy and
    // prevents a fetch per keystroke.
    const [search, setSearch] = useState('')
    const [query, setQuery] = useState('')
    useEffect(() => {
        const id = window.setTimeout(() => setQuery(search.trim()), 250)
        return () => window.clearTimeout(id)
    }, [search])

    const {
        data,
        isLoading,
        isFetchingNextPage,
        hasNextPage,
        fetchNextPage,
    } = useRecruitmentTags(kind, query)

    // Flatten the paged response. `total` from the first page is the authoritative
    // count (post-filter) — surfaced in the title badge so the user always sees
    // the search-scoped denominator, not just "loaded so far".
    const items = useMemo<RecruitmentTag[]>(
        () => data?.pages.flatMap((p) => p.data) ?? [],
        [data],
    )
    const total = data?.pages[0]?.total ?? 0

    const create = useCreateRecruitmentTag(kind)
    const update = useUpdateRecruitmentTag(kind)
    const remove = useDeleteRecruitmentTag(kind)

    const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; tag?: RecruitmentTag } | null>(null)
    const [name, setName] = useState('')
    const [pendingDelete, setPendingDelete] = useState<RecruitmentTag | null>(null)

    const saving = create.isPending || update.isPending

    function openCreate() { setName(''); setDialog({ mode: 'create' }) }
    function openEdit(tag: RecruitmentTag) { setName(tag.name); setDialog({ mode: 'edit', tag }) }
    function closeDialog() { setDialog(null); setName('') }

    async function save() {
        const value = name.trim()
        if (!value || saving) return
        try {
            if (dialog?.mode === 'edit' && dialog.tag) {
                await update.mutateAsync({ id: dialog.tag.id, name: value })
                toast.success(t(`${tk}.updated`))
            } else {
                await create.mutateAsync(value)
                toast.success(t(`${tk}.added`))
            }
            closeDialog()
        } catch {
            // The hook surfaces the server message (incl. the duplicate-name 409).
        }
    }

    async function confirmDelete() {
        if (!pendingDelete) return
        try {
            await remove.mutateAsync(pendingDelete.id)
            toast.success(t(`${tk}.deleted`))
        } finally {
            setPendingDelete(null)
        }
    }

    // IntersectionObserver — wires the bottom-sentinel <li> in the list to
    // fetchNextPage. The observer's root is the surrounding scroll container
    // (`scrollRef`), so the trigger fires when the user scrolls the list
    // itself, not the page.
    const scrollRef = useRef<HTMLDivElement | null>(null)
    const sentinelRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        if (!hasNextPage || isFetchingNextPage) return
        const sentinel = sentinelRef.current
        const root = scrollRef.current
        if (!sentinel || !root) return
        const io = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) fetchNextPage()
            },
            { root, rootMargin: '80px' },
        )
        io.observe(sentinel)
        return () => io.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    // Search is shown whenever the user has either typed (so they can clear)
    // or the catalog has enough entries to need it. We use the server's
    // `total` (post-filter) but treat an empty search specially: show the
    // search bar once the catalog has at least one page worth of items.
    const showSearch = query.length > 0 || total > 8 || isLoading

    return (
        <div className="space-y-4">
            <Card className="p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div className="flex items-start gap-3 min-w-0">
                        <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                            <Icon className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base font-semibold flex items-center gap-2">
                                {t(`${tk}.title`)}
                                {total > 0 && (
                                    <Badge variant="secondary" className="tabular-nums">{total}</Badge>
                                )}
                            </h2>
                            <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">{t(`${tk}.desc`)}</p>
                        </div>
                    </div>
                    <Button type="button" size="sm" leftIcon={<Plus className="size-3.5" />} onClick={openCreate}>
                        {t(`${tk}.addLabel`)}
                    </Button>
                </div>

                {showSearch && (
                    <div className="relative mb-3">
                        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={t(`${tk}.searchPlaceholder`)}
                            className="ps-9"
                        />
                    </div>
                )}

                {/* Initial load — full skeleton, sized for one page. */}
                {isLoading ? (
                    <div className="space-y-2">
                        {[0, 1, 2, 3].map((i) => <Skeleton key={`s-${i}`} className="h-10 rounded-lg" />)}
                    </div>
                ) : items.length === 0 && query.length === 0 ? (
                    // Truly empty catalog (no search applied).
                    <EmptyState
                        icon={Icon}
                        title={t(`${tk}.emptyTitle`)}
                        description={t(`${tk}.emptyDesc`)}
                        action={(
                            <Button type="button" size="sm" leftIcon={<Plus className="size-3.5" />} onClick={openCreate}>
                                {t(`${tk}.addLabel`)}
                            </Button>
                        )}
                    />
                ) : items.length === 0 ? (
                    // Search yielded nothing.
                    <p className="py-6 text-center text-sm text-muted-foreground">{t('recruitment.tagManager.noMatches', { query })}</p>
                ) : (
                    // Scroll container — the IntersectionObserver root. The
                    // max-height caps the dialog so the page itself doesn't
                    // grow with the catalog; users scroll the list.
                    <div
                        ref={scrollRef}
                        className="max-h-[28rem] overflow-y-auto rounded-md border border-border/40"
                    >
                        <ul className="divide-y divide-border/60">
                            {items.map((tag) => (
                                <li
                                    key={tag.id}
                                    className="group flex items-center justify-between gap-3 bg-card px-3 py-2 transition-colors hover:bg-muted/30"
                                >
                                    <span className="min-w-0 truncate text-sm text-foreground">{tag.name}</span>
                                    <div className="flex items-center gap-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                        <Button type="button" variant="ghost" size="icon-sm" aria-label={t(`${tk}.editLabel`)} onClick={() => openEdit(tag)}>
                                            <Pencil className="size-3.5" />
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon-sm"
                                            aria-label={t(`${tk}.deleteLabel`)}
                                            className="text-rose-600 hover:text-rose-700"
                                            onClick={() => setPendingDelete(tag)}
                                        >
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                    </div>
                                </li>
                            ))}
                        </ul>

                        {/* Sentinel — only rendered when more pages exist.
                            Doubles as a discoverability cue with a small footer
                            line so users on browsers without IntersectionObserver
                            still get a visible "Loading more…" indicator. */}
                        {hasNextPage && (
                            <div
                                ref={sentinelRef}
                                aria-hidden="true"
                                className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs text-muted-foreground"
                            >
                                {isFetchingNextPage ? (
                                    <><Loader2 className="size-3.5 animate-spin" /> {t('recruitment.tagManager.loadingMore')}</>
                                ) : (
                                    <>{t('recruitment.tagManager.scrollForMore', { loaded: items.length, total })}</>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </Card>

            <Dialog open={!!dialog} onOpenChange={(o) => !o && closeDialog()}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{dialog?.mode === 'edit' ? t(`${tk}.editLabel`) : t(`${tk}.addLabel`)}</DialogTitle>
                    </DialogHeader>
                    <DialogBody>
                        <div className="space-y-1.5">
                            <Label>{t('common.name')}</Label>
                            <Input
                                autoFocus
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder={t(`${tk}.placeholder`)}
                                maxLength={80}
                                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save() } }}
                            />
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeDialog} disabled={saving}>{t('common.cancel')}</Button>
                        <Button type="button" onClick={save} loading={saving} disabled={!name.trim()}>{t('common.save')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!pendingDelete}
                onOpenChange={(o) => !o && setPendingDelete(null)}
                title={pendingDelete ? t('recruitment.tagManager.deleteTitle', { name: pendingDelete.name }) : ''}
                description={t(`${tk}.deleteDesc`)}
                confirmLabel={t('common.delete')}
                variant="destructive"
                onConfirm={confirmDelete}
            />
        </div>
    )
}
