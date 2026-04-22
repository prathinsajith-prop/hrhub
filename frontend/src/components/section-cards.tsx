import { TrendingUpIcon, TrendingDownIcon, Users, Briefcase, Plane, CalendarClock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDashboardKPIs } from '@/hooks/useDashboard'

export function SectionCards() {
    const { data: kpis, isLoading } = useDashboardKPIs()

    const cards = [
        {
            title: 'Total Employees',
            value: kpis?.totalEmployees ?? 0,
            icon: Users,
            description: 'Active headcount',
            trend: null,
        },
        {
            title: 'Open Positions',
            value: kpis?.openJobs ?? 0,
            icon: Briefcase,
            description: 'Jobs currently open',
            trend: null,
        },
        {
            title: 'Active Visas',
            value: kpis?.activeVisas ?? 0,
            icon: Plane,
            description: 'In-progress applications',
            trend: null,
        },
        {
            title: 'Pending Leave',
            value: kpis?.pendingLeave ?? 0,
            icon: CalendarClock,
            description: 'Awaiting approval',
            trend: kpis?.pendingLeave && kpis.pendingLeave > 5 ? 'up' : null,
        },
    ]

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {cards.map((card) => (
                <Card key={card.title}>
                    <CardHeader className="relative pb-2">
                        <CardDescription className="flex items-center gap-1.5">
                            <card.icon className="h-3.5 w-3.5" />
                            {card.title}
                        </CardDescription>
                        <CardTitle className="text-3xl font-semibold tabular-nums">
                            {isLoading ? <Skeleton className="h-8 w-16" /> : card.value.toLocaleString()}
                        </CardTitle>
                        {card.trend && (
                            <div className="absolute right-4 top-4">
                                {card.trend === 'up' ? (
                                    <TrendingUpIcon className="h-4 w-4 text-warning" />
                                ) : (
                                    <TrendingDownIcon className="h-4 w-4 text-success" />
                                )}
                            </div>
                        )}
                    </CardHeader>
                    <CardContent>
                        <p className="text-xs text-muted-foreground">{card.description}</p>
                    </CardContent>
                </Card>
            ))}
        </div>
    )
}
