import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarDays } from 'lucide-react'

import { useLeaveRequests } from '@/hooks/useLeave'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatDate } from '@/lib/utils'

function toISO(d: Date) {
    return d.toISOString().slice(0, 10)
}

export function ManagerTeamCalendarPage() {
    const { t } = useTranslation()

    const { from, to } = useMemo(() => {
        const today = new Date()
        const start = new Date(today.getFullYear(), today.getMonth(), 1)
        const end = new Date(today.getFullYear(), today.getMonth() + 2, 0)
        return { from: toISO(start), to: toISO(end) }
    }, [])

    const { data, isLoading } = useLeaveRequests({
        status: 'approved',
        from,
        to,
        limit: 100,
    })

    return (
        <div className="space-y-5">
            <PageHeader title={t('team.calendarTitle')} subtitle={`${formatDate(from)} → ${formatDate(to)}`} />

            {isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                </div>
            ) : !data?.data?.length ? (
                <EmptyState icon={<CalendarDays className="size-8" />} title={t('common.empty')} />
            ) : (
                <div className="space-y-2">
                    {data.data.map((r) => (
                        <Card key={r.id} className="border-border/70">
                            <CardContent className="flex items-center justify-between gap-3 p-3 text-sm">
                                <div>
                                    <div className="font-medium">{r.employeeName ?? r.employeeId}</div>
                                    <div className="text-xs text-muted-foreground">
                                        {formatDate(r.startDate)} → {formatDate(r.endDate)} · {r.days}{' '}
                                        {r.days === 1 ? 'day' : 'days'}
                                    </div>
                                </div>
                                <Badge variant="secondary" className="text-[10px] uppercase tracking-wider capitalize">
                                    {r.leaveType}
                                </Badge>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
