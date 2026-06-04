import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'

import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { initialsOf } from '@/lib/utils'
import { useCreatePost } from '@/hooks/useAnnouncements'

/**
 * "Start a post" composer for the home feed. Collapsed it's a single pill that
 * reads like an input; tapping it expands an inline textarea + Post button.
 * Only rendered for users with the `portalPostEnabled` permission (the parent
 * gates it) — the backend re-checks on submit, so this is UX, not security.
 */
export function StartPostComposer({ displayName, avatarUrl }: { displayName?: string; avatarUrl?: string | null }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [text, setText] = useState('')
    const create = useCreatePost()

    function submit() {
        const body = text.trim()
        if (!body || create.isPending) return
        create.mutate(body, {
            onSuccess: () => {
                setText('')
                setOpen(false)
                toast.success(t('post.published', { defaultValue: 'Post published' }))
            },
            onError: (e: unknown) =>
                toast.error(e instanceof Error ? e.message : t('post.failed', { defaultValue: 'Could not publish post' })),
        })
    }

    return (
        <Card className="border-border/70">
            <CardContent className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                    <Avatar className="size-9 shrink-0">
                        <AvatarImage src={avatarUrl ?? undefined} />
                        <AvatarFallback className="bg-gradient-to-br from-indigo-100 to-sky-100 text-[11px] font-semibold text-indigo-700 dark:from-indigo-950/60 dark:to-sky-950/40 dark:text-indigo-200">
                            {initialsOf(displayName)}
                        </AvatarFallback>
                    </Avatar>

                    {open ? (
                        <div className="min-w-0 flex-1">
                            <textarea
                                autoFocus
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                rows={3}
                                maxLength={5000}
                                placeholder={t('post.placeholder', { defaultValue: 'Share something with your team…' })}
                                className="w-full resize-none rounded-xl border border-border/70 bg-background px-3.5 py-2.5 text-sm leading-relaxed outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
                            />
                            <div className="mt-2 flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setOpen(false)
                                        setText('')
                                    }}
                                >
                                    {t('common.cancel', { defaultValue: 'Cancel' })}
                                </Button>
                                <Button type="button" size="sm" onClick={submit} disabled={!text.trim() || create.isPending}>
                                    {create.isPending ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <Send className="size-4" data-rtl-flip />
                                    )}
                                    <span className="ms-1.5">{t('post.publish', { defaultValue: 'Post' })}</span>
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setOpen(true)}
                            className="min-h-9 flex-1 rounded-full border border-border/70 bg-muted/40 px-4 text-start text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/70"
                        >
                            {t('post.start', { defaultValue: 'Start a post' })}
                        </button>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
