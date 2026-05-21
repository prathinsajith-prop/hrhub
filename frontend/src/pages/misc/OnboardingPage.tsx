import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
    CheckCircle2, Plus, Users, UserPlus, AlertTriangle, TrendingUp,
    RefreshCcw, Search, X, Calendar, Clock, Eye, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge, Card, Progress } from '@/components/ui/primitives'
import { toast, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, DialogClose } from '@/components/ui/overlays'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { DatePicker } from '@/components/ui/date-picker'
import { cn, formatDate, onActivate } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOnboardingChecklists, useCreateOnboardingChecklist, useOnboardingAnalytics, type OnboardingChecklist } from '@/hooks/useOnboarding'
import { EmployeeSelect } from '@/components/shared/EmployeeSelect'
import { InitialsAvatar } from '@/components/shared/Avatar'
import { deriveSteps, progressTone } from './onboarding-helpers'
import { Label } from '@/components/ui/label'

// ── Constants ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12

type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'completed' | 'overdue'

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'not_started', label: 'Not started' },
    { key: 'completed', label: 'Completed' },
    { key: 'overdue', label: 'Overdue' },
]

// ── Onboarding card - memoised to avoid re-renders on window expansion ────────

const STATUS_ACCENT = {
    completed: 'bg-success',
    in_progress: 'bg-info',
    not_started: 'bg-muted-foreground/30',
} as const

const OnboardingCard = memo(function OnboardingCard({
    checklist: c,
    onStart,
}: {
    checklist: OnboardingChecklist
    onStart: () => void
}) {
    const navigate = useNavigate()
    const tone = progressTone(c.progress)
    const overdueCount = useMemo(() => c.steps.filter(s => s.status === 'overdue').length, [c.steps])
    const hasChecklist = !!c.id

    const statusKey: keyof typeof STATUS_ACCENT = !hasChecklist || c.progress === 0
        ? 'not_started'
        : c.progress >= 100 ? 'completed' : 'in_progress'
    const statusLabel = statusKey === 'not_started' ? 'Not started' : statusKey === 'completed' ? 'Completed' : 'In progress'
    const statusVariant: 'success' | 'info' | 'secondary' =
        statusKey === 'completed' ? 'success' : statusKey === 'in_progress' ? 'info' : 'secondary'

    const openChecklist = () => navigate(`/onboarding/${c.employeeId}`)

    return (
        <div
            className={cn(
                'group relative grid items-center gap-x-6 gap-y-1 pl-4 pr-3 py-3 border-b border-border/50 last:border-b-0 transition-colors',
                'grid-cols-[2rem_minmax(0,1fr)_5rem]',
                'sm:grid-cols-[2rem_minmax(0,1fr)_7rem_5rem]',
                'md:grid-cols-[2rem_minmax(0,1fr)_9rem_7rem_5rem]',
                'lg:grid-cols-[2rem_minmax(0,1fr)_9rem_8rem_7rem_5rem]',
                hasChecklist && 'cursor-pointer hover:bg-muted/40',
            )}
            onClick={hasChecklist ? openChecklist : undefined}
            onKeyDown={hasChecklist ? onActivate(openChecklist) : undefined}
            role={hasChecklist ? 'button' : undefined}
            tabIndex={hasChecklist ? 0 : undefined}
        >
            {/* Status accent bar */}
            <span
                className={cn(
                    'absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full transition-opacity',
                    STATUS_ACCENT[statusKey],
                    statusKey === 'not_started' ? 'opacity-40' : 'opacity-90',
                )}
                aria-hidden
            />

            {/* Col 1 - Avatar */}
            <InitialsAvatar name={c.employeeName} src={c.avatarUrl ?? undefined} size="sm" />

            {/* Col 2 - Identity */}
            <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                    <p className="text-sm font-semibold truncate text-foreground leading-tight">{c.employeeName}</p>
                    {c.employeeNo && (
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 px-1 py-0.5 rounded bg-muted">
                            {c.employeeNo}
                        </span>
                    )}
                </div>
                {(c.designation || c.department) && (
                    <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                        {[c.designation, c.department].filter(Boolean).join(' · ')}
                    </p>
                )}
            </div>

            {/* Col 3 - Progress (md+) */}
            <div className="hidden md:flex flex-col gap-1 min-w-0">
                {hasChecklist ? (
                    <>
                        <div className="flex items-center justify-between text-[10px] leading-none">
                            <span className="text-muted-foreground tabular-nums">{c.completedCount}/{c.totalCount}</span>
                            <span className={cn('font-semibold tabular-nums', tone.color)}>{c.progress}%</span>
                        </div>
                        <Progress value={c.progress} className="h-1" />
                    </>
                ) : (
                    <>
                        <span className="text-[10px] text-muted-foreground/60">—</span>
                        <div className="h-1 rounded-full bg-muted/60" />
                    </>
                )}
            </div>

            {/* Col 4 - Due date (lg+) */}
            <div className="hidden lg:flex items-center gap-1.5 text-[11px] tabular-nums min-w-0">
                {c.dueDate ? (
                    <>
                        <Clock className={cn('size-3 shrink-0', overdueCount > 0 ? 'text-destructive' : 'text-muted-foreground')} />
                        <span className={cn('truncate', overdueCount > 0 ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                            {formatDate(c.dueDate)}
                        </span>
                    </>
                ) : c.startDate ? (
                    <>
                        <Calendar className="size-3 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground truncate">{formatDate(c.startDate)}</span>
                    </>
                ) : (
                    <span className="text-muted-foreground/50">—</span>
                )}
            </div>

            {/* Col 5 - Status pill (sm+) */}
            <div className="hidden sm:flex justify-start min-w-0">
                {overdueCount > 0 ? (
                    <Badge variant="destructive" className="text-[10px] gap-1">
                        <AlertTriangle className="size-2.5" />
                        {overdueCount} overdue
                    </Badge>
                ) : (
                    <Badge variant={statusVariant} className="text-[10px]">
                        {statusLabel}
                    </Badge>
                )}
            </div>

            {/* Col 6 - Action */}
            <div onClick={e => e.stopPropagation()} className="flex justify-end">
                {hasChecklist ? (
                    <Button
                        size="sm"
                        variant="ghost"
                        className="size-7 p-0 opacity-60 group-hover:opacity-100 transition-opacity"
                        onClick={() => navigate(`/onboarding/${c.employeeId}`)}
                        aria-label="View checklist"
                    >
                        <Eye className="size-3.5" />
                    </Button>
                ) : (
                    <Button size="sm" className="h-7 px-2.5 text-xs" leftIcon={<Plus className="size-3" />} onClick={onStart}>
                        Start
                    </Button>
                )}
            </div>
        </div>
    )
})

// ── Column header row (matches OnboardingCard grid layout) ────────────────────

function ListHeader() {
    return (
        <div
            className={cn(
                'hidden sm:grid items-center gap-x-6 pl-4 pr-3 py-2 border-b bg-muted/30 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground',
                'sm:grid-cols-[2rem_minmax(0,1fr)_7rem_5rem]',
                'md:grid-cols-[2rem_minmax(0,1fr)_9rem_7rem_5rem]',
                'lg:grid-cols-[2rem_minmax(0,1fr)_9rem_8rem_7rem_5rem]',
            )}
        >
            <div /> {/* avatar slot */}
            <div>Employee</div>
            <div className="hidden md:block">Progress</div>
            <div className="hidden lg:block">Due</div>
            <div>Status</div>
            <div className="text-right">Actions</div>
        </div>
    )
}

// ── Row skeleton (matches OnboardingCard grid) ───────────────────────────────

function RowSkeleton() {
    return (
        <div
            className={cn(
                'grid items-center gap-x-6 pl-4 pr-3 py-3 border-b border-border/50 last:border-b-0 animate-pulse',
                'grid-cols-[2rem_minmax(0,1fr)_5rem]',
                'sm:grid-cols-[2rem_minmax(0,1fr)_7rem_5rem]',
                'md:grid-cols-[2rem_minmax(0,1fr)_9rem_7rem_5rem]',
                'lg:grid-cols-[2rem_minmax(0,1fr)_9rem_8rem_7rem_5rem]',
            )}
        >
            <div className="size-8 rounded-full bg-muted" />
            <div className="space-y-1.5">
                <div className="h-3 bg-muted rounded w-32" />
                <div className="h-2.5 bg-muted rounded w-24" />
            </div>
            <div className="hidden md:block h-2 bg-muted rounded-full" />
            <div className="hidden lg:block h-2.5 bg-muted rounded w-24" />
            <div className="hidden sm:block h-5 w-20 bg-muted rounded-full" />
            <div className="size-7 bg-muted rounded-md justify-self-end" />
        </div>
    )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function OnboardingPage() {
    const { t } = useTranslation()
    const {
        data: onboardingList,
        isLoading: onboardingLoading,
        isFetching: onboardingFetching,
        refetch: refetchOnboarding,
    } = useOnboardingChecklists()
    const { data: analyticsData } = useOnboardingAnalytics()
    const createChecklist = useCreateOnboardingChecklist()

    // Dialog state
    const [newOpen, setNewOpen] = useState(false)
    const [newEmpId, setNewEmpId] = useState('')
    const [newStartDate, setNewStartDate] = useState('')
    const [newDueDate, setNewDueDate] = useState('')
    const [useTemplate, setUseTemplate] = useState(true)

    // Filter state
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

    // Windowed rendering
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
    const sentinelRef = useRef<HTMLDivElement>(null)

    // Enrich steps with overdue status
    const enriched = useMemo<OnboardingChecklist[]>(() => {
        return (onboardingList ?? []).map(c => ({ ...c, steps: deriveSteps(c.steps) }))
    }, [onboardingList])

    // Sort priority: started (in progress) first, then not started, then completed.
    // Within each group, overdue items come first, then by most recently updated.
    const sortPriority = (c: OnboardingChecklist): number => {
        const hasChecklist = !!c.id
        if (hasChecklist && c.progress > 0 && c.progress < 100) return 0   // in progress
        if (!hasChecklist || c.progress === 0) return 1                    // not started
        return 2                                                           // completed
    }

    // Client-side filter + sort
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase()
        const result = enriched.filter(c => {
            if (q) {
                const hit = c.employeeName.toLowerCase().includes(q)
                    || (c.designation ?? '').toLowerCase().includes(q)
                    || (c.department ?? '').toLowerCase().includes(q)
                    || (c.employeeNo ?? '').toLowerCase().includes(q)
                if (!hit) return false
            }
            if (statusFilter === 'completed' && c.progress < 100) return false
            if (statusFilter === 'in_progress' && (c.progress >= 100 || c.progress === 0)) return false
            if (statusFilter === 'not_started' && c.progress > 0) return false
            if (statusFilter === 'overdue' && !c.steps.some(s => s.status === 'overdue')) return false
            return true
        })

        return result.sort((a, b) => {
            // 1. Group: in progress → not started → completed
            const groupDiff = sortPriority(a) - sortPriority(b)
            if (groupDiff !== 0) return groupDiff
            // 2. Within group: overdue first
            const aOverdue = a.steps.some(s => s.status === 'overdue') ? 0 : 1
            const bOverdue = b.steps.some(s => s.status === 'overdue') ? 0 : 1
            if (aOverdue !== bOverdue) return aOverdue - bOverdue
            // 3. Recently updated first
            return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
        })
    }, [enriched, search, statusFilter])

    // Reset window when filter changes
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setVisibleCount(PAGE_SIZE) }, [search, statusFilter])

    // IntersectionObserver - auto-expand window as sentinel scrolls into view
    useEffect(() => {
        const el = sentinelRef.current
        if (!el || visibleCount >= filtered.length) return
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) setVisibleCount(c => Math.min(c + PAGE_SIZE, filtered.length))
            },
            { rootMargin: '200px' },
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [filtered.length, visibleCount])

    const visibleItems = filtered.slice(0, visibleCount)
    const hasMore = visibleCount < filtered.length

    // Counts for filter pills
    const statusCounts = useMemo(() => ({
        all: enriched.length,
        in_progress: enriched.filter(c => c.progress > 0 && c.progress < 100).length,
        not_started: enriched.filter(c => c.progress === 0).length,
        completed: enriched.filter(c => c.progress >= 100).length,
        overdue: enriched.filter(c => c.steps.some(s => s.status === 'overdue')).length,
    }), [enriched])

    const totalOverdue = enriched.reduce((n, c) => n + c.steps.filter(s => s.status === 'overdue').length, 0)

    // Stable callbacks so card children don't re-render on window expansion
    const handleStart = useCallback((empId: string) => {
        setNewEmpId(empId)
        setNewOpen(true)
    }, [])

    const closeDialog = useCallback(() => {
        setNewOpen(false); setNewEmpId(''); setNewStartDate(''); setNewDueDate(''); setUseTemplate(true)
    }, [])

    const startOnboarding = () => {
        if (!newEmpId) { toast.error('Select an employee', 'Choose an employee to start onboarding.'); return }
        createChecklist.mutate(
            { employeeId: newEmpId, startDate: newStartDate || undefined, dueDate: newDueDate || undefined, useTemplate },
            {
                onSuccess: () => {
                    toast.success('Onboarding started', useTemplate ? 'Checklist created with 9 default steps.' : 'Empty checklist created.')
                    closeDialog()
                },
                onError: (err: Error) => toast.error('Failed', err.message ?? 'Could not create checklist.'),
            },
        )
    }

    return (
        <PageWrapper>
            <PageHeader
                title={t('onboarding.title')}
                description={t('onboarding.description')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<RefreshCcw className={cn('size-3.5', onboardingFetching && 'animate-spin')} />}
                            onClick={() => refetchOnboarding()}
                            disabled={onboardingFetching}
                        >
                            Refresh
                        </Button>
                        <Button size="sm" leftIcon={<Plus className="size-3.5" />} onClick={() => setNewOpen(true)}>
                            New Onboarding
                        </Button>
                    </div>
                }
            />

            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                <KpiCardCompact label="Active" value={analyticsData?.inProgress ?? enriched.filter(c => c.progress > 0 && c.progress < 100).length} icon={Users} color="blue" loading={onboardingLoading} />
                <KpiCardCompact label="Completed" value={analyticsData?.completed ?? enriched.filter(c => c.progress >= 100).length} icon={CheckCircle2} color="green" loading={onboardingLoading} />
                <KpiCardCompact label="Overdue Steps" value={analyticsData?.overdueSteps ?? totalOverdue} icon={AlertTriangle} color="red" loading={onboardingLoading} />
                <KpiCardCompact label="Avg Progress" value={`${analyticsData?.avgProgress ?? 0}%`} icon={TrendingUp} color="amber" loading={onboardingLoading} />
            </div>

            {/* Search + status pill bar */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                        className="pl-8 h-9 text-sm"
                        placeholder="Search by name, role, department…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                    {search && (
                        <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="size-3.5" />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                    {STATUS_FILTERS.map(f => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setStatusFilter(f.key)}
                            disabled={f.key !== 'all' && statusCounts[f.key] === 0}
                            className={cn(
                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                                statusFilter === f.key
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-background text-muted-foreground border-border hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:pointer-events-none',
                            )}
                        >
                            {f.label}
                            <span className={cn(
                                'text-[10px] px-1.5 py-0.5 rounded-full tabular-nums',
                                statusFilter === f.key ? 'bg-primary-foreground/20' : 'bg-muted',
                            )}>
                                {statusCounts[f.key]}
                            </span>
                        </button>
                    ))}
                </div>
            </div>

            {/* List */}
            {onboardingLoading ? (
                <Card className="overflow-hidden">
                    <ListHeader />
                    {[...Array(PAGE_SIZE)].map((_, i) => <RowSkeleton key={`rowskeleton-${i}`} />)}
                </Card>
            ) : enriched.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <div className="size-12 rounded-full bg-muted flex items-center justify-center">
                        <UserPlus className="size-6 text-muted-foreground" />
                    </div>
                    <div>
                        <p className="text-sm font-medium">No onboarding checklists yet</p>
                        <p className="text-xs text-muted-foreground mt-1">
                            New employees with status "onboarding" appear here automatically.
                        </p>
                    </div>
                    <Button size="sm" leftIcon={<Plus className="size-3.5" />} onClick={() => setNewOpen(true)}>
                        New Onboarding
                    </Button>
                </Card>
            ) : filtered.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-12 text-center gap-2">
                    <Search className="size-8 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">No checklists match your filters.</p>
                    <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('all') }}>
                        Clear filters
                    </Button>
                </Card>
            ) : (
                <>
                    <Card className="overflow-hidden">
                        <ListHeader />
                        {visibleItems.map(c => (
                            <OnboardingCard
                                key={c.id ?? `stub-${c.employeeId}`}
                                checklist={c}
                                onStart={() => handleStart(c.employeeId)}
                            />
                        ))}

                        {/* Inline loading more rows */}
                        {hasMore && (
                            <div ref={sentinelRef}>
                                {[...Array(Math.min(PAGE_SIZE, filtered.length - visibleCount))].map((_, i) => (
                                    <RowSkeleton key={i} />
                                ))}
                            </div>
                        )}
                    </Card>

                    {!hasMore && filtered.length > PAGE_SIZE && (
                        <p className="text-center text-xs text-muted-foreground py-4">
                            Showing all {filtered.length} records
                        </p>
                    )}
                </>
            )}

            {/* New Onboarding Dialog */}
            <Dialog open={newOpen} onOpenChange={open => { if (!open) closeDialog() }}>
                <DialogContent className="max-w-xl">
                    <DialogHeader><DialogTitle>Start Onboarding</DialogTitle></DialogHeader>
                    <DialogBody className="space-y-4">
                        <div className="space-y-1">
                            <Label className="text-xs font-medium text-muted-foreground">Employee *</Label>
                            <EmployeeSelect value={newEmpId} onValueChange={setNewEmpId} clearable />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-muted-foreground">Start date</Label>
                                <DatePicker value={newStartDate} onChange={setNewStartDate} className="h-9" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs font-medium text-muted-foreground">Due date</Label>
                                <DatePicker value={newDueDate} onChange={setNewDueDate} className="h-9" />
                            </div>
                        </div>
                        <Label className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border cursor-pointer hover:bg-muted/80 transition-colors">
                            <input
                                type="checkbox"
                                checked={useTemplate}
                                onChange={e => setUseTemplate(e.target.checked)}
                                className="mt-0.5 size-4 rounded accent-primary"
                            />
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <Sparkles className="size-3.5 text-primary" />
                                    <span className="text-sm font-medium">Use default template</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Auto-creates 9 standard onboarding steps (HR docs, IT setup, orientation, 30-day check-in, etc.)
                                </p>
                            </div>
                        </Label>
                    </DialogBody>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
                        <Button size="sm" loading={createChecklist.isPending} onClick={startOnboarding}>
                            Start Onboarding
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageWrapper>
    )
}
