import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
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
    info: { node: <Info className="size-4" />, tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
    success: { node: <CheckCircle2 className="size-4" />, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
    warning: { node: <AlertTriangle className="size-4" />, tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    error: { node: <AlertCircle className="size-4" />, tone: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
}

// Max items rendered inline in the dropdown — keeps the popover compact and
// pushes anyone who needs more to the full notifications page.
const POPOVER_LIMIT = 5

// Whitelist for notification actionUrls: same-origin app paths (single leading
// `/`) or absolute http(s) URLs. Anything else — `javascript:`, `data:`,
// protocol-relative `//evil`, etc. — is rejected so a server-supplied URL
// can't become a script-execution or phishing vector.
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

export function NotificationsBell() {
    const { t } = useTranslation()
    const qc = useQueryClient()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)
    const { data: unread = 0 } = useUnreadNotificationsCount()
    const { data: items = [] } = useNotifications({ limit: POPOVER_LIMIT })
    const markRead = useMarkNotificationRead()
    const markAll = useMarkAllNotificationsRead()

    // Surface unread first, then read — keeps the latest actionable items
    // at the top of the dropdown regardless of when each arrived.
    const sortedItems = useMemo(() => {
        if (items.length === 0) return items
        return [...items].sort((a, b) => {
            if (a.isRead !== b.isRead) return a.isRead ? 1 : -1
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        })
    }, [items])

    const displayCount = unread > 99 ? '99+' : String(unread)

    function handleOpenChange(next: boolean) {
        setOpen(next)
        // Force a fresh fetch every time the user opens the dropdown so the
        // list never drifts from the badge. Cheap query — single index hit.
        if (next) {
            qc.invalidateQueries({ queryKey: ['portal', 'notifications'] })
            qc.invalidateQueries({ queryKey: ['portal', 'notifications-unread'] })
        }
    }

    function handleItemClick(n: Notification) {
        if (!n.isRead) markRead.mutate(n.id)
        setOpen(false)
        if (!n.actionUrl) return
        const resolved = resolveActionUrl(n.actionUrl)
        if (!resolved) return
        if (resolved.kind === 'external') {
            // noopener prevents the new page from reaching back into our
            // window via window.opener.
            window.open(resolved.url, '_blank', 'noopener,noreferrer')
        } else {
            navigate(resolved.url)
        }
    }

    return (
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`${t('notifications.title')}${unread ? ` (${unread})` : ''}`}
                    className="relative"
                >
                    <Bell className="size-4" />
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
                            <CheckCheck className="size-3.5" /> {t('notifications.markAllRead')}
                        </Button>
                    ) : null}
                </div>

                <div className="max-h-[60vh] overflow-y-auto">
                    {sortedItems.length === 0 ? (
                        <div className="flex flex-col items-center gap-1 px-3 py-10 text-center text-sm text-muted-foreground">
                            <CheckCircle2 className="size-7 opacity-50" />
                            {t('notifications.empty')}
                        </div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {sortedItems.map((n) => {
                                const tone = TYPE_ICON[n.type]
                                return (
                                    <li key={n.id}>
                                        <button
                                            type="button"
                                            onClick={() => handleItemClick(n)}
                                            className="block w-full text-start transition-colors hover:bg-muted/50"
                                        >
                                            <div className="flex items-start gap-2.5 p-3">
                                                <span className={cn('mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full', tone.tone)}>
                                                    {tone.node}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-start gap-2">
                                                        <span className={cn('truncate text-sm font-medium', !n.isRead && 'text-foreground')}>
                                                            {n.title}
                                                        </span>
                                                        {!n.isRead ? <span className="mt-1 size-1.5 shrink-0 rounded-full bg-rose-500" /> : null}
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
