import { useMemo, useState } from 'react'
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

// Cap of items rendered inline — keeps the popover compact; the full page
// (linked at the bottom) handles deeper history + pagination.
const POPOVER_LIMIT = 5

const TYPE_TONE: Record<Notification['type'], { Icon: typeof Info; tone: string }> = {
    info: { Icon: Info, tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
    success: { Icon: CheckCircle2, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
    warning: { Icon: AlertTriangle, tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    error: { Icon: AlertCircle, tone: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
}

function timeAgo(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const s = Math.round(diff / 1000)
    if (s < 60) return 'just now'
    const m = Math.round(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.round(h / 24)
    if (d < 7) return `${d}d ago`
    return new Date(iso).toLocaleDateString()
}

/**
 * Bell + dropdown popover for the admin app's site header.
 *
 *   - Badge polls every 5 min as a fallback; updates instantly via WebSocket.
 *   - Opening the popover invalidates both queries so the list never trails
 *     the badge.
 *   - Items are sorted unread-first, then newest-first — actionable items
 *     stay at the top regardless of how recently each arrived.
 *   - Each item is a click target. Clicking marks it read AND navigates to
 *     the action URL (if any).
 */
interface Props {
    triggerClassName?: string
}

export function NotificationsBell({ triggerClassName }: Props) {
    const { t } = useTranslation()
    const qc = useQueryClient()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)

    const { data: unread = 0 } = useUnreadCount()
    const { data: page } = useNotificationsList({ limit: POPOVER_LIMIT, offset: 0 })
    const items = page?.data ?? []

    const markRead = useMarkNotificationRead()
    const markAll = useMarkAllRead()

    const sortedItems = useMemo(() => {
        if (items.length === 0) return items
        return [...items].sort((a, b) => {
            if (a.isRead !== b.isRead) return a.isRead ? 1 : -1
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
    }, [items])

    function handleOpenChange(next: boolean) {
        setOpen(next)
        if (next) {
            // Force a refetch on each open so the list can't drift from the badge.
            qc.invalidateQueries({ queryKey: ['notifications'] })
        }
    }

    function handleItemClick(n: Notification) {
        if (!n.isRead) markRead.mutate(n.id)
        setOpen(false)
        if (n.actionUrl) {
            // Use react-router for in-app paths, full assign for cross-origin.
            const url = n.actionUrl
            if (url.startsWith('http://') || url.startsWith('https://')) {
                window.location.assign(url)
            } else {
                navigate(url)
            }
        }
    }

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
                            onClick={() => markAll.mutate()}
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
                                                    <p className="mt-1 text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
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
                        onClick={() => setOpen(false)}
                        className="block rounded-md px-2 py-1.5 text-center text-xs font-medium text-primary hover:bg-muted"
                    >
                        {t('notifications.viewAll', { defaultValue: 'View all notifications' })}
                    </Link>
                </div>
            </PopoverContent>
        </Popover>
    )
}
