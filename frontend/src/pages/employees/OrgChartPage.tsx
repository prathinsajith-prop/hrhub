import { memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { Users } from 'lucide-react'

// ─── Reporting Tree ───────────────────────────────────────────────────────────

interface OrgNode {
    id: string
    fullName: string
    designation?: string
    department?: string
    status: string
    isAncestor?: boolean
    children: OrgNode[]
}

const STATUS_DOT: Record<string, string> = {
    active: 'bg-emerald-500',
    onboarding: 'bg-sky-500',
    probation: 'bg-amber-400',
    suspended: 'bg-orange-500',
    terminated: 'bg-red-500',
    visa_expired: 'bg-red-400',
}

const EmpCard = memo(function EmpCard({ node, currentEmployeeId }: { node: OrgNode; currentEmployeeId?: string }) {
    const initials = node.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    const dot = STATUS_DOT[node.status] ?? 'bg-muted-foreground'
    const isAncestor = node.isAncestor === true
    const isMe = !!currentEmployeeId && node.id === currentEmployeeId

    return (
        <div className="flex flex-col items-center">
            <div className={cn(
                'relative flex flex-col items-center text-center rounded-2xl border px-4 py-4 w-48 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5',
                isAncestor
                    ? 'bg-muted/40 border-border/40 opacity-75'
                    : isMe
                        ? 'bg-card border-primary/25 shadow-primary/10 shadow-md ring-1 ring-primary/10'
                        : 'bg-card border-border/60',
            )}>
                {isMe && !isAncestor && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5 rounded-full">
                            You
                        </span>
                    </div>
                )}
                {isAncestor && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <span className="text-[9px] font-semibold uppercase tracking-wider bg-muted text-muted-foreground border px-2 py-0.5 rounded-full">
                            Manager
                        </span>
                    </div>
                )}
                <div className={cn(
                    'relative w-12 h-12 rounded-full flex items-center justify-center mb-3 text-sm font-bold',
                    isAncestor
                        ? 'bg-muted text-muted-foreground'
                        : isMe
                            ? 'bg-primary/10 text-primary ring-2 ring-primary/20'
                            : 'bg-muted text-foreground',
                )}>
                    {initials}
                    <span className={cn('absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full border-2 border-card', dot)} />
                </div>
                <p className={cn('text-xs font-semibold leading-snug truncate w-full', isAncestor && 'text-muted-foreground')}>
                    {node.fullName}
                </p>
                {node.designation && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate w-full">{node.designation}</p>
                )}
                {node.department && (
                    <p className={cn('text-[10px] mt-0.5 truncate w-full', isAncestor ? 'text-muted-foreground/60' : 'text-primary/70')}>
                        {node.department}
                    </p>
                )}
            </div>

            {node.children.length > 0 && (
                <div className="flex flex-col items-center w-full">
                    <div className={cn('w-px h-6', isAncestor ? 'bg-border/50 border-dashed' : 'bg-border')} />
                    <div className="relative flex gap-6 items-start">
                        {node.children.length > 1 && (
                            <div
                                className="absolute top-0 left-1/2 -translate-x-1/2 h-px bg-border"
                                style={{ width: `calc(100% - 48px)` }}
                            />
                        )}
                        {node.children.map(child => (
                            <div key={child.id} className="flex flex-col items-center">
                                <div className={cn('w-px h-6', isAncestor ? 'bg-border/50' : 'bg-border')} />
                                <EmpCard node={child} currentEmployeeId={currentEmployeeId} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
})

function ReportingChart() {
    const { user } = useAuthStore()
    const currentEmployeeId = user?.employeeId ?? undefined
    const { data, isLoading } = useQuery({
        queryKey: ['org-chart'],
        queryFn: () => api.get<OrgNode[]>('/employees/org-chart'),
        staleTime: 3 * 60 * 1000,
    })
    const list = Array.isArray(data) ? data : []

    if (isLoading) return (
        <div className="flex gap-8 justify-center py-12">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border bg-card p-4 w-48 space-y-3 shadow-sm">
                    <Skeleton className="h-12 w-12 rounded-full mx-auto" />
                    <Skeleton className="h-3.5 w-28 mx-auto" />
                    <Skeleton className="h-3 w-20 mx-auto" />
                </div>
            ))}
        </div>
    )

    if (list.length === 0) return (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="font-semibold text-sm">No reporting structure yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
                Assign managers to employees to visualize the reporting hierarchy.
            </p>
        </div>
    )

    return (
        <div className="overflow-x-auto pb-6">
            <div className="flex gap-16 justify-center min-w-max py-8 px-6">
                {list.map((node: OrgNode) => (
                    <EmpCard key={node.id} node={node} currentEmployeeId={currentEmployeeId} />
                ))}
            </div>
        </div>
    )
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export function OrgChartPage() {
    const { t } = useTranslation()
    const role = useAuthStore(s => s.user?.role)
    const isFullAccess = role === 'hr_manager' || role === 'super_admin'

    const description = isFullAccess
        ? t('orgChart.description', { defaultValue: 'Visualize your company structure and reporting lines.' })
        : role === 'dept_head'
            ? t('orgChart.descriptionDeptHead', { defaultValue: 'Your branch structure and reporting lines within your team.' })
            : t('orgChart.descriptionEmployee', { defaultValue: 'Your branch structure and your position in the reporting hierarchy.' })

    return (
        <PageWrapper>
            <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">
                    {t('orgChart.title', { defaultValue: 'Organization Chart' })}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>

            {/* Org Structure tab is temporarily hidden — show Reporting Lines only. */}
            <ReportingChart />
        </PageWrapper>
    )
}
