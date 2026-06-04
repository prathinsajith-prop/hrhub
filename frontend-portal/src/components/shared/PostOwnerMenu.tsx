import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react'

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useDeletePost, useTogglePinPost, type FeedAnnouncement } from '@/hooks/useAnnouncements'

/**
 * Owner-only actions menu for a feed post: Edit · Pin/Unpin · Delete.
 *
 * Shared by the home Feed card and the Announcements page card so the two
 * surfaces can never drift apart — pin and delete (identical everywhere) live
 * here; the inline edit UI differs per card, so editing is delegated to the
 * parent via `onEdit`. Render only when the post is owned by the signed-in
 * user; the backend re-checks ownership on every call, so this is UX, not
 * security.
 */
export function PostOwnerMenu({ item, onEdit }: { item: FeedAnnouncement; onEdit: () => void }) {
    const { t } = useTranslation()
    const togglePin = useTogglePinPost()
    const deletePost = useDeletePost()
    const [confirmDelete, setConfirmDelete] = useState(false)

    function runTogglePin() {
        const next = !item.pinned
        togglePin.mutate(
            { id: item.id, pinned: next },
            {
                onSuccess: () =>
                    toast.success(
                        next
                            ? t('post.pinned', { defaultValue: 'Post pinned' })
                            : t('post.unpinned', { defaultValue: 'Post unpinned' }),
                    ),
                onError: (err: unknown) =>
                    toast.error(err instanceof Error ? err.message : t('post.pinFailed', { defaultValue: 'Could not update pin' })),
            },
        )
    }

    function runDelete() {
        deletePost.mutate(item.id, {
            onSuccess: () => {
                setConfirmDelete(false)
                toast.success(t('post.deleted', { defaultValue: 'Post deleted' }))
            },
            onError: (err: unknown) => {
                setConfirmDelete(false)
                toast.error(err instanceof Error ? err.message : t('post.deleteFailed', { defaultValue: 'Could not delete post' }))
            },
        })
    }

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label={t('common.more', { defaultValue: 'More' })}
                        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                        <MoreHorizontal className="size-4" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={onEdit} className="gap-2.5">
                        <Pencil className="size-4" /> {t('common.edit', { defaultValue: 'Edit' })}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={runTogglePin} disabled={togglePin.isPending} className="gap-2.5">
                        {item.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
                        {item.pinned
                            ? t('post.unpin', { defaultValue: 'Unpin' })
                            : t('post.pin', { defaultValue: 'Pin to top' })}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onSelect={() => setConfirmDelete(true)}
                        className="gap-2.5 text-rose-600 focus:text-rose-700 dark:text-rose-300"
                    >
                        <Trash2 className="size-4" /> {t('common.delete', { defaultValue: 'Delete' })}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={t('post.deleteTitle', { defaultValue: 'Delete this post?' })}
                description={t('post.deleteDesc', { defaultValue: 'This permanently removes your post from the feed.' })}
                confirmLabel={t('common.delete', { defaultValue: 'Delete' })}
                onConfirm={runDelete}
                loading={deletePost.isPending}
                variant="destructive"
            />
        </>
    )
}
