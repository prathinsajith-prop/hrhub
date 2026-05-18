import { useCallback, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
    AlertCircle,
    AlertTriangle,
    BellIcon,
    CheckCheck,
    CheckCircle2,
    Info,
} from 'lucide-react'

import {
    useMarkAllRead,
    useMarkNotificationRead,
    useNotificationsList,
    useUnreadCount,
    type Notification,
} from '@/hooks/useNotifications'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'

const POPOVER_LIMIT = 5

const TYPE_TONE: Record<Notification['type'], { Icon: typeof Info; tone: string }> = {
    info: { Icon: Info, tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
    success: { Icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
    warning: { Icon: AlertTriangle, tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    error: { Icon: AlertCircle, tone: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
}

// Whitelist: same-origin app paths (single leading `/`) or absolute http(s) URLs.
// Anything else — `javascript:`, `data:`, protocol-relative `//evil`, etc. — is
// rejected so a server-supplied actionUrl can't become a script-execution or
// phishing vector.
function resolveActionUrl(raw: string): { kind: 'internal' | 'external'; url: string } | null {
    if (raw.startsWith('/') && !raw.startsWith('//')) {
        return { kind: 'internal', url: raw }
    }
    try {
        const parsed = new URL(raw)
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return { kind: 'external', url: parsed.toString() }
        }
    } catch {
        // Invalid URL — fall through to null.
    }
    return null
}

interface Props {
    triggerClassName?: string
}

/**
 * Bell + dropdown popover for the site header.
 * - Badge updates instantly via WebSocket; polling is the fallback.
 * - Opening the popover invalidates the queries so the list can't trail the badge.
 * - Items sort unread-first, then newest-first.
 * - Clicking marks the item read and follows a whitelisted action URL.
 */
export function NotificationsBell({ triggerClassName }: Props) {
    const { t, i18n } = useTranslation()
    const qc = useQueryClient()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)

    const { data: unread = 0 } = useUnreadCount()
    const { data: page } = useNotificationsList({ limit: POPOVER_LIMIT, offset: 0 })
    const items = page?.data

    const markRead = useMarkNotificationRead()
    const markAll = useMarkAllRead()

    const rtf = useMemo(
        () => new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }),
        [i18n.language],
    )

    const formatTimeAgo = useCallback(
        (iso: string) => {
            const diffSec = Math.round((Date.now() - new Date(iso).getTime()) / 1000)
            if (diffSec < 60) return rtf.format(-diffSec, 'second')
            const diffMin = Math.round(diffSec / 60)
            if (diffMin < 60) return rtf.format(-diffMin, 'minute')
            const diffHr = Math.round(diffMin / 60)
            if (diffHr < 24) return rtf.format(-diffHr, 'hour')
            const diffDay = Math.round(diffHr / 24)
            if (diffDay < 7) return rtf.format(-diffDay, 'day')
            return new Date(iso).toLocaleDateString(i18n.language)
        },
        [rtf, i18n.language],
    )

    const sortedItems = useMemo(() => {
        if (!items?.length) return []
        return [...items].sort((a, b) => {
            if (a.isRead !== b.isRead) return a.isRead ? 1 : -1
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
    }, [items])

    const handleOpenChange = useCallback(
        (next: boolean) => {
            setOpen(next)
            // Prefix match invalidates every ['notifications', ...] key in one call.
            if (next) qc.invalidateQueries({ queryKey: ['notifications'] })
        },
        [qc],
    )

    const handleItemClick = useCallback(
        (n: Notification) => {
            if (!n.isRead) markRead.mutate(n.id)
            setOpen(false)
            if (!n.actionUrl) return
            const resolved = resolveActionUrl(n.actionUrl)
            if (!resolved) return
            if (resolved.kind === 'external') {
                window.open(resolved.url, '_blank', 'noopener,noreferrer')
            } else {
                navigate(resolved.url)
            }
        },
        [markRead, navigate],
    )

    const handleViewAllClick = useCallback(() => setOpen(false), [])
    const handleMarkAllClick = useCallback(() => markAll.mutate(), [markAll])

    const badge = unread > 99 ? '99+' : String(unread)

    return (
        <Popover open={open} onOpenChange={handleOpenChange}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    size="icon"
                    aria-label={`${t('profile.notifications', { defaultValue: 'Notifications' })}${unread ? ` (${unread})` : ''}`}
                    className={cn('relative', triggerClassName)}
                >
                    <BellIcon className="size-4" />
                    {unread > 0 ? (
                        <span
                            aria-hidden
                            className="absolute -end-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground shadow-sm"
                        >
                            {badge}
                        </span>
                    ) : null}
                </Button>
            </PopoverTrigger>

            <PopoverContent align="end" className="w-[22rem] p-0">
                <div className="flex items-center justify-between border-b px-3 py-2.5">
                    <div className="text-sm font-semibold">
                        {t('notifications.title', { defaultValue: 'Notifications' })}
                    </div>
                    {unread > 0 ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={handleMarkAllClick}
                            loading={markAll.isPending}
                        >
                            <CheckCheck className="size-3.5" />
                            {t('notifications.markAllRead', { defaultValue: 'Mark all as read' })}
                        </Button>
                    ) : null}
                </div>

                <div className="max-h-[60vh] overflow-y-auto">
                    {sortedItems.length === 0 ? (
                        <div className="flex flex-col items-center gap-1 px-3 py-10 text-center text-sm text-muted-foreground">
                            <CheckCircle2 className="size-7 opacity-50" />
                            {t('notifications.empty', { defaultValue: "You're all caught up" })}
                        </div>
                    ) : (
                        <ul className="divide-y">
                            {sortedItems.map((n) => {
                                const { Icon, tone } = TYPE_TONE[n.type] ?? TYPE_TONE.info
                                return (
                                    <li key={n.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleItemClick(n)}
                                            className="block w-full text-start transition-colors hover:bg-muted/50"
                                        >
                                            <div className="flex items-start gap-2.5 p-3">
                                                <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', tone)}>
                                                    <Icon className="size-4" />
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start gap-2">
                                                        <span className={cn('truncate text-sm font-medium', !n.isRead && 'text-foreground')}>
                                                            {n.title}
                                                        </span>
                                                        {!n.isRead ? (
                                                            <span aria-hidden className="mt-1 size-1.5 shrink-0 rounded-full bg-destructive" />
                                                        ) : null}
                                                    </div>
                                                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                                                    <p className="mt-1 text-[11px] text-muted-foreground/70">{formatTimeAgo(n.createdAt)}</p>
                                                </div>
                                            </div>
                                        </button>
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

                <div className="border-t p-2">
                    <Link
                        to={ROUTES.notifications}
                        onClick={handleViewAllClick}
                        className="block rounded-md px-2 py-1.5 text-center text-xs font-medium text-primary hover:bg-muted"
                    >
                        {t('notifications.viewAll', { defaultValue: 'View all notifications' })}
                    </Link>
                </div>
            </PopoverContent>
        </Popover>
    )
}
