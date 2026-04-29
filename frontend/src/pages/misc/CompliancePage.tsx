import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { RefreshCcw, CheckCircle2, AlertTriangle, XCircle, ArrowRight, FileText, Users, CreditCard, Shield, Clock } from 'lucide-react'
import { Badge, Card, Progress } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useComplianceReport } from '@/hooks/useCompliance'
import type { ComplianceCheck } from '@/hooks/useCompliance'

const CHECK_ICONS: Record<string, React.FC<{ className?: string }>> = {
    'WPS Compliance': CreditCard,
    'Emiratisation Ratio': Users,
    'Visa Validity': Shield,
    'Document Completeness': FileText,
    'Expiring Soon': Clock,
}

function statusIcon(status: 'pass' | 'warning' | 'fail') {
    if (status === 'pass') return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    if (status === 'warning') return <AlertTriangle className="h-4 w-4 text-amber-500" />
    return <XCircle className="h-4 w-4 text-red-500" />
}

function CheckDetailCounts({ label, counts }: { label: string; counts?: Record<string, number> }) {
    if (!counts) return null

    if (label === 'WPS Compliance') {
        return (
            <div className="flex gap-4 mt-2 flex-wrap">
                <span className="text-[11px] text-muted-foreground">Total runs: <span className="font-semibold text-foreground">{counts.total ?? 0}</span></span>
                <span className="text-[11px] text-emerald-700">Compliant: <span className="font-semibold">{counts.compliant ?? 0}</span></span>
                {(counts.nonCompliant ?? 0) > 0 && (
                    <span className="text-[11px] text-red-600">Pending/missed: <span className="font-semibold">{counts.nonCompliant}</span></span>
                )}
            </div>
        )
    }

    if (label === 'Emiratisation Ratio') {
        return (
            <div className="flex gap-4 mt-2 flex-wrap">
                <span className="text-[11px] text-muted-foreground">Total: <span className="font-semibold text-foreground">{counts.total ?? 0}</span></span>
                <span className="text-[11px] text-emerald-700">Emirati: <span className="font-semibold">{counts.emirati ?? 0}</span></span>
                <span className="text-[11px] text-muted-foreground">Expat: <span className="font-semibold text-foreground">{counts.expat ?? 0}</span></span>
                {(counts.gap ?? 0) > 0 && (
                    <span className="text-[11px] text-amber-600">Gap to target: <span className="font-semibold">{counts.gap} hire{counts.gap !== 1 ? 's' : ''}</span></span>
                )}
            </div>
        )
    }

    if (label === 'Visa Validity') {
        return (
            <div className="flex gap-4 mt-2 flex-wrap">
                <span className="text-[11px] text-muted-foreground">Active employees: <span className="font-semibold text-foreground">{counts.total ?? 0}</span></span>
                <span className="text-[11px] text-emerald-700">Valid visas: <span className="font-semibold">{counts.valid ?? 0}</span></span>
                {(counts.expired ?? 0) > 0 && (
                    <span className="text-[11px] text-red-600">Expired: <span className="font-semibold">{counts.expired}</span></span>
                )}
            </div>
        )
    }

    if (label === 'Document Completeness') {
        return (
            <div className="flex gap-4 mt-2 flex-wrap">
                <span className="text-[11px] text-muted-foreground">Total docs: <span className="font-semibold text-foreground">{counts.total ?? 0}</span></span>
                <span className="text-[11px] text-emerald-700">Valid: <span className="font-semibold">{counts.valid ?? 0}</span></span>
                {(counts.invalid ?? 0) > 0 && (
                    <span className="text-[11px] text-red-600">Invalid/expired: <span className="font-semibold">{counts.invalid}</span></span>
                )}
            </div>
        )
    }

    if (label === 'Expiring Soon') {
        const n = counts.expiringDocs ?? 0
        return (
            <div className="flex gap-4 mt-2">
                {n === 0 ? (
                    <span className="text-[11px] text-emerald-700">No documents expiring in the next 30 days</span>
                ) : (
                    <span className="text-[11px] text-amber-600"><span className="font-semibold">{n}</span> document{n !== 1 ? 's' : ''} expiring within 30 days</span>
                )}
            </div>
        )
    }

    return null
}

function ComplianceCheckCard({ check, onClick }: { check: ComplianceCheck; onClick?: () => void }) {
    const Icon = CHECK_ICONS[check.label] ?? FileText
    const isClickable = !!check.route

    return (
        <div
            className={cn(
                'group rounded-xl border p-4 transition-all',
                isClickable && 'cursor-pointer hover:border-primary/40 hover:bg-muted/30',
                check.status === 'fail' && 'border-red-200 bg-red-50/30 dark:border-red-900/30 dark:bg-red-950/10',
                check.status === 'warning' && 'border-amber-200/60',
            )}
            onClick={isClickable ? onClick : undefined}
            role={isClickable ? 'button' : undefined}
        >
            <div className="flex items-start gap-3">
                <div className={cn(
                    'p-1.5 rounded-lg shrink-0',
                    check.status === 'pass' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        check.status === 'warning' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                            'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                )}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{check.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                            {statusIcon(check.status)}
                            <span className={cn(
                                'text-sm font-bold tabular-nums',
                                check.score >= 98 ? 'text-emerald-600' : check.score >= 80 ? 'text-amber-600' : 'text-red-600'
                            )}>{check.score}%</span>
                            {isClickable && (
                                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                            )}
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{check.desc}</p>
                    <CheckDetailCounts label={check.label} counts={check.counts} />
                    <Progress
                        value={check.score}
                        className={cn('h-1.5 mt-3', check.score >= 98 ? 'bg-emerald-100' : check.score >= 80 ? 'bg-amber-100' : 'bg-red-100')}
                        color={check.score >= 98 ? 'bg-emerald-500' : check.score >= 80 ? 'bg-amber-500' : 'bg-red-500'}
                    />
                </div>
            </div>
        </div>
    )
}

export function CompliancePage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { data: report, isLoading, isFetching, refetch } = useComplianceReport()
    const checks = report?.checks ?? []
    const overall = report?.overall ?? 0

    const failingChecks = checks.filter(c => c.status !== 'pass')
    const passingChecks = checks.filter(c => c.status === 'pass')

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

            {/* Score summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="p-6 flex flex-col items-center justify-center text-center">
                    <div className={cn('text-5xl font-bold mb-2 font-display', overall >= 95 ? 'text-emerald-600' : overall >= 80 ? 'text-amber-600' : 'text-red-600')}>
                        {isLoading ? <Skeleton className="h-12 w-20 mx-auto" /> : overall}
                    </div>
                    <p className="text-sm font-medium">Overall Score</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Out of 100 points</p>
                    {!isLoading && (
                        <Badge variant={overall >= 95 ? 'success' : overall >= 80 ? 'warning' : 'destructive'} className="mt-3">
                            {overall >= 95 ? 'Excellent' : overall >= 80 ? 'Needs Attention' : 'Critical'}
                        </Badge>
                    )}
                </Card>

                <Card className="p-5 flex flex-col justify-center gap-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Checks Passed</p>
                    {isLoading ? (
                        <Skeleton className="h-8 w-16" />
                    ) : (
                        <>
                            <div className="flex items-end gap-1">
                                <span className="text-3xl font-bold text-emerald-600">{passingChecks.length}</span>
                                <span className="text-sm text-muted-foreground mb-1">/ {checks.length}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {passingChecks.map(c => (
                                    <span key={c.label} className="text-[10px] bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5">{c.label}</span>
                                ))}
                            </div>
                        </>
                    )}
                </Card>

                <Card className="p-5 flex flex-col justify-center gap-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action Required</p>
                    {isLoading ? (
                        <Skeleton className="h-8 w-16" />
                    ) : failingChecks.length === 0 ? (
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                            <span className="text-sm font-medium text-emerald-700">All checks passed</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex items-end gap-1">
                                <span className="text-3xl font-bold text-amber-600">{failingChecks.length}</span>
                                <span className="text-sm text-muted-foreground mb-1">item{failingChecks.length !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                                {failingChecks.map(c => (
                                    <span key={c.label} className={cn('text-[10px] rounded-full px-2 py-0.5', c.status === 'fail' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')}>
                                        {c.label}
                                    </span>
                                ))}
                            </div>
                        </>
                    )}
                </Card>
            </div>

            {/* Detailed check cards */}
            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="rounded-xl border p-4 space-y-3">
                            <div className="flex justify-between">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-4 w-16" />
                            </div>
                            <Skeleton className="h-3 w-64" />
                            <Skeleton className="h-1.5 w-full rounded-full" />
                        </div>
                    ))}
                </div>
            ) : checks.length === 0 ? (
                <Card className="p-8 text-center">
                    <p className="text-sm text-muted-foreground">No compliance data available yet.</p>
                </Card>
            ) : (
                <div className="space-y-2">
                    {/* Show failing/warning first */}
                    {[...failingChecks, ...passingChecks].map(c => (
                        <ComplianceCheckCard
                            key={c.label}
                            check={c}
                            onClick={c.route ? () => navigate(c.route!) : undefined}
                        />
                    ))}
                </div>
            )}
        </PageWrapper>
    )
}
