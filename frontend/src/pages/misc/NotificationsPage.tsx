import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow, format } from 'date-fns'
import { BellIcon, CheckCheckIcon, InfoIcon, AlertTriangleIcon, XCircleIcon, CheckCircleIcon, RefreshCcw } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
    useNotificationsList,
    useMarkNotificationRead,
    useMarkAllRead,
    type Notification,
} from '@/hooks/useNotifications'

const TYPE_CONFIG: Record<Notification['type'], { icon: typeof InfoIcon; classes: string; badgeClass: string }> = {
    info: { icon: InfoIcon, classes: 'text-blue-600', badgeClass: 'bg-blue-100 text-blue-800 border-blue-200' },
    warning: { icon: AlertTriangleIcon, classes: 'text-amber-600', badgeClass: 'bg-amber-100 text-amber-800 border-amber-200' },
    error: { icon: XCircleIcon, classes: 'text-red-600', badgeClass: 'bg-red-100 text-red-800 border-red-200' },
    success: { icon: CheckCircleIcon, classes: 'text-emerald-600', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
}

export function NotificationsPage() {
    const { t } = useTranslation()
    const [unreadOnly, setUnreadOnly] = useState(false)
    const [page, setPage] = useState(0)
    const limit = 20

    const { data, isLoading, isFetching, refetch } = useNotificationsList({ limit, offset: page * limit, unreadOnly })
    const markRead = useMarkNotificationRead()
    const markAll = useMarkAllRead()

    const notifications: Notification[] = data?.data ?? []
    const total = data?.total ?? 0
    const hasMore = data?.hasMore ?? false

    const unreadCount = notifications.filter(n => !n.isRead).length

    return (
        <PageWrapper>
            <PageHeader
                title={t('profile.notifications', 'Notifications')}
                description={`${total} total — ${unreadCount} unread`}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
                            Refresh
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => markAll.mutate()}
                            disabled={markAll.isPending || unreadCount === 0}
                        >
                            <CheckCheckIcon className="size-4 mr-2" />
                            Mark all as read
                        </Button>
                    </div>
                }
            />

            {/* Filter bar */}
            <div className="flex gap-2 mb-4">
                <Button
                    variant={unreadOnly ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => { setUnreadOnly(!unreadOnly); setPage(0) }}
                >
                    {unreadOnly ? 'Showing unread only' : 'Show unread only'}
                </Button>
            </div>

            <Card className="divide-y divide-border overflow-hidden">
                {isLoading ? (
                    <div className="divide-y">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex gap-4 p-4">
                                <Skeleton className="h-5 w-5 rounded-full mt-0.5 shrink-0" />
                                <div className="flex-1 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Skeleton className="h-4 w-48" />
                                        <Skeleton className="h-4 w-16 rounded-full" />
                                    </div>
                                    <Skeleton className="h-3 w-full" />
                                    <Skeleton className="h-3 w-3/4" />
                                    <Skeleton className="h-2.5 w-24" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="py-16 text-center">
                        <BellIcon className="size-10 text-muted-foreground/40 mx-auto mb-3" />
                        <p className="text-sm font-medium text-muted-foreground">
                            {unreadOnly ? 'No unread notifications' : 'No notifications yet'}
                        </p>
                    </div>
                ) : notifications.map(n => {
                    const cfg = TYPE_CONFIG[n.type] ?? TYPE_CONFIG.info
                    const Icon = cfg.icon
                    return (
                        <div
                            key={n.id}
                            className={cn(
                                'flex gap-4 p-4 transition-colors',
                                !n.isRead ? 'bg-muted/30' : 'bg-background',
                                'hover:bg-muted/50 cursor-pointer',
                            )}
                            onClick={() => !n.isRead && markRead.mutate(n.id)}
                        >
                            {/* Icon */}
                            <div className={cn('mt-0.5 shrink-0', cfg.classes)}>
                                <Icon className="size-5" />
                            </div>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-2 mb-0.5">
                                    <p className={cn('text-sm font-medium', !n.isRead && 'font-semibold')}>
                                        {n.title}
                                    </p>
                                    <Badge variant="outline" className={cn('text-[10px] shrink-0', cfg.badgeClass)}>
                                        {n.type}
                                    </Badge>
                                    {!n.isRead && (
                                        <span className="ml-auto h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">{n.message}</p>
                                <p className="text-[11px] text-muted-foreground/70 mt-1">
                                    {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                                    {' · '}
                                    {format(new Date(n.createdAt), 'dd MMM yyyy, HH:mm')}
                                </p>
                            </div>

                            {/* Mark read button */}
                            {!n.isRead && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0 mt-0.5 h-7 w-7"
                                    title="Mark as read"
                                    aria-label="Mark as read"
                                    onClick={e => { e.stopPropagation(); markRead.mutate(n.id) }}
                                >
                                    <CheckCircleIcon className="size-4" />
                                </Button>
                            )}
                        </div>
                    )
                })}
            </Card>

            {/* Pagination */}
            {(page > 0 || hasMore) && (
                <div className="flex justify-between items-center mt-4">
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                        Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                        {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasMore}>
                        Next
                    </Button>
                </div>
            )}
        </PageWrapper>
    )
}
