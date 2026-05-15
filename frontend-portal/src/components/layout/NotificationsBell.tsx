import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bell, CheckCheck, Info, AlertTriangle, AlertCircle, CheckCircle2 } from 'lucide-react'

import {
    useMarkAllNotificationsRead,
    useMarkNotificationRead,
    useNotifications,
    useUnreadNotificationsCount,
} from '@/hooks/useNotifications'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ROUTES } from '@/lib/routes'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types'

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

const TYPE_ICON: Record<Notification['type'], { node: React.ReactNode; tone: string }> = {
    info: { node: <Info className="h-4 w-4" />, tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
    success: { node: <CheckCircle2 className="h-4 w-4" />, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
    warning: { node: <AlertTriangle className="h-4 w-4" />, tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    error: { node: <AlertCircle className="h-4 w-4" />, tone: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
}

export function NotificationsBell() {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const { data: unread = 0 } = useUnreadNotificationsCount()
    const { data: items = [] } = useNotifications({ limit: 6 })
    const markRead = useMarkNotificationRead()
    const markAll = useMarkAllNotificationsRead()

    const displayCount = unread > 99 ? '99+' : String(unread)

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t('notifications.title')}${unread ? ` (${unread})` : ''}`}
                    className="relative"
                >
                    <Bell className="h-4 w-4" />
                    {unread > 0 ? (
                        <span
                            aria-hidden
                            className="absolute -end-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white shadow-sm badge-pulse"
                        >
                            {displayCount}
                        </span>
                    ) : null}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                    <div className="text-sm font-semibold">{t('notifications.title')}</div>
                    {unread > 0 ? (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => markAll.mutate()}
                            loading={markAll.isPending}
                        >
                            <CheckCheck className="h-3.5 w-3.5" /> {t('notifications.markAllRead')}
                        </Button>
                    ) : null}
                </div>

                <div className="max-h-[60vh] overflow-y-auto">
                    {items.length === 0 ? (
                        <div className="flex flex-col items-center gap-1 px-3 py-10 text-center text-sm text-muted-foreground">
                            <CheckCircle2 className="h-7 w-7 opacity-50" />
                            {t('notifications.empty')}
                        </div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {items.map((n) => {
                                const tone = TYPE_ICON[n.type]
                                const onClick = () => {
                                    if (!n.isRead) markRead.mutate(n.id)
                                    setOpen(false)
                                }
                                const Inner = (
                                    <div className="flex items-start gap-2.5 p-3">
                                        <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', tone.tone)}>
                                            {tone.node}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start gap-2">
                                                <span className={cn('truncate text-sm font-medium', !n.isRead && 'text-foreground')}>
                                                    {n.title}
                                                </span>
                                                {!n.isRead ? <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" /> : null}
                                            </div>
                                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.message}</p>
                                            <p className="mt-1 text-[11px] text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
                                        </div>
                                    </div>
                                )
                                return (
                                    <li key={n.id}>
                                        {n.actionUrl ? (
                                            <Link
                                                to={n.actionUrl}
                                                onClick={onClick}
                                                className="block hover:bg-muted/50"
                                            >
                                                {Inner}
                                            </Link>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={onClick}
                                                className="block w-full text-start hover:bg-muted/50"
                                            >
                                                {Inner}
                                            </button>
                                        )}
                                    </li>
                                )
                            })}
                        </ul>
                    )}
                </div>

                <div className="border-t border-border p-2">
                    <Link
                        to={ROUTES.notifications}
                        onClick={() => setOpen(false)}
                        className="block rounded-md px-2 py-1.5 text-center text-xs font-medium text-primary hover:bg-muted"
                    >
                        {t('notifications.viewAll')}
                    </Link>
                </div>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}
