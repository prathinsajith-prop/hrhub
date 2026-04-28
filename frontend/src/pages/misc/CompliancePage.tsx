import { useTranslation } from 'react-i18next'
import { RefreshCcw } from 'lucide-react'
import { Badge, Card, Progress } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useComplianceReport } from '@/hooks/useCompliance'

export function CompliancePage() {
    const { t } = useTranslation()
    const { data: report, isLoading, isFetching, refetch } = useComplianceReport()
    const checks = report?.checks ?? []
    const overall = report?.overall ?? 0

    return (
        <PageWrapper>
            <PageHeader
                title={t('compliance.title')}
                description={t('compliance.description')}
                actions={
                    <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
                        Refresh
                    </Button>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Card className="p-6 flex flex-col items-center justify-center text-center">
                    <div className={cn('text-5xl font-bold mb-2 font-display', overall >= 95 ? 'text-emerald-600' : overall >= 80 ? 'text-amber-600' : 'text-red-600')}>
                        {overall}
                    </div>
                    <p className="text-sm font-medium">Overall Compliance Score</p>
                    <p className="text-sm text-muted-foreground mt-1">Out of 100 points</p>
                    <Badge variant={overall >= 95 ? 'success' : overall >= 80 ? 'warning' : 'destructive'} className="mt-3">
                        {overall >= 95 ? 'Excellent' : overall >= 80 ? 'Needs Attention' : 'Critical'}
                    </Badge>
                </Card>
                <Card className="lg:col-span-2 p-4">
                    <h3 className="font-semibold mb-4 text-sm">Compliance Breakdown</h3>
                    {isLoading ? (
                        <div className="space-y-4">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="space-y-1.5">
                                    <div className="flex justify-between">
                                        <Skeleton className="h-4 w-40" />
                                        <Skeleton className="h-4 w-16" />
                                    </div>
                                    <Skeleton className="h-1.5 w-full rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : checks.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-6 text-center">No compliance data available yet.</p>
                    ) : (
                        <div className="space-y-3">
                            {checks.map(c => (
                                <div key={c.label} className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm">{c.label}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground">{c.desc}</span>
                                            <span className={cn('text-xs font-bold', c.score >= 98 ? 'text-emerald-600' : c.score >= 90 ? 'text-amber-600' : 'text-red-600')}>{c.score}%</span>
                                        </div>
                                    </div>
                                    <Progress value={c.score} className="h-1.5" color={c.score >= 98 ? 'bg-emerald-500' : c.score >= 90 ? 'bg-amber-500' : 'bg-red-500'} />
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </div>
        </PageWrapper>
    )
}
