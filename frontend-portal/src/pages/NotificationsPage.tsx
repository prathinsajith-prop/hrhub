import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Bell, CheckCheck, CheckCircle2, AlertCircle, AlertTriangle, Info } from 'lucide-react'

import {
    useMarkAllNotificationsRead,
    useMarkNotificationRead,
    useNotifications,
    useUnreadNotificationsCount,
} from '@/hooks/useNotifications'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Notification } from '@/types'

const TYPE_ICON: Record<Notification['type'], { node: React.ReactNode; tone: string }> = {
    info: { node: <Info className="size-4" />, tone: 'bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300' },
    success: { node: <CheckCircle2 className="size-4" />, tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' },
    warning: { node: <AlertTriangle className="size-4" />, tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
    error: { node: <AlertCircle className="size-4" />, tone: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' },
}

export function NotificationsPage() {
    const { t } = useTranslation()
    const { data: items = [], isLoading } = useNotifications({ limit: 50 })
    const { data: unread = 0 } = useUnreadNotificationsCount()
    const markRead = useMarkNotificationRead()
    const markAll = useMarkAllNotificationsRead()

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('notifications.title')}
                subtitle={unread > 0 ? t('notifications.unread', { count: unread }) : undefined}
                action={
                    unread > 0 ? (
                        <Button variant="outline" size="sm" onClick={() => markAll.mutate()} loading={markAll.isPending}>
                            <CheckCheck className="size-4" /> {t('notifications.markAllRead')}
                        </Button>
                    ) : null
                }
            />

            {isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                </div>
            ) : items.length === 0 ? (
                <EmptyState icon={<Bell className="size-8" />} title={t('notifications.empty')} />
            ) : (
                <ul className="space-y-2">
                    {items.map((n) => {
                        const tone = TYPE_ICON[n.type]
                        const card = (
                            <Card className={cn('border-border/70 transition-colors', !n.isRead && 'border-primary/40 bg-primary/5')}>
                                <CardContent className="flex items-start gap-3 p-4">
                                    <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full', tone.tone)}>
                                        {tone.node}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-start gap-2">
                                            <h3 className={cn('truncate text-sm font-semibold', !n.isRead && 'text-foreground')}>
                                                {n.title}
                                            </h3>
                                            {!n.isRead ? <span className="mt-1 size-1.5 shrink-0 rounded-full bg-rose-500" /> : null}
                                        </div>
                                        <p className="mt-1 text-sm text-muted-foreground">{n.message}</p>
                                        <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                                            {new Date(n.createdAt).toLocaleString()}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                        return (
                            <li key={n.id}>
                                {n.actionUrl ? (
                                    <Link to={n.actionUrl} onClick={() => !n.isRead && markRead.mutate(n.id)} className="block">
                                        {card}
                                    </Link>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() => !n.isRead && markRead.mutate(n.id)}
                                        className="block w-full text-start"
                                    >
                                        {card}
                                    </button>
                                )}
                            </li>
                        )
                    })}
                </ul>
            )}
        </div>
    )
}
