import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { CheckCircle2, Plus, Users, UserPlus, AlertTriangle, Eye, Sparkles, TrendingUp, RefreshCcw } from 'lucide-react'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Badge, Card, Progress } from '@/components/ui/primitives'
import { toast, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, DialogClose } from '@/components/ui/overlays'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { formatDate, cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOnboardingChecklists, useCreateOnboardingChecklist, useOnboardingAnalytics, type OnboardingChecklist } from '@/hooks/useOnboarding'
import { useEmployees } from '@/hooks/useEmployees'
import type { Employee } from '@/types'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import { InitialsAvatar } from '@/components/shared/Avatar'
import {
    ONBOARDING_FILTERS,
    ONBOARDING_QUICK_FILTERS,
    progressTone,
    deriveSteps,
} from './onboarding-helpers'

export function OnboardingPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { data: onboardingList, isLoading: onboardingLoading, isFetching: onboardingFetching, refetch: refetchOnboarding } = useOnboardingChecklists()
    const { data: analyticsData } = useOnboardingAnalytics()
    const analytics = analyticsData
    const createChecklist = useCreateOnboardingChecklist()
    // Include both active and onboarding employees in the "start checklist" dropdown
    const { data: empDataActive } = useEmployees({ limit: 100, status: 'active' })
    const { data: empDataOnboarding } = useEmployees({ limit: 100, status: 'onboarding' })
    const allEmployees = useMemo<Employee[]>(() => {
        const active: Employee[] = empDataActive?.data ?? []
        const onboarding: Employee[] = empDataOnboarding?.data ?? []
        const seen = new Set(active.map(e => e.id))
        return [...active, ...onboarding.filter(e => !seen.has(e.id))]
    }, [empDataActive?.data, empDataOnboarding?.data])

    const [newOpen, setNewOpen] = useState(false)
    const [newEmpId, setNewEmpId] = useState('')
    const [newStartDate, setNewStartDate] = useState('')
    const [newDueDate, setNewDueDate] = useState('')
    const [useTemplate, setUseTemplate] = useState(true)

    const search = useSearchFilters({
        storageKey: 'hrhub.onboarding.searchHistory',
        availableFilters: ONBOARDING_FILTERS,
    })

    const enriched = useMemo<OnboardingChecklist[]>(() => {
        const checklists = onboardingList ?? []
        return checklists.map((c) => ({ ...c, steps: deriveSteps(c.steps) }))
    }, [onboardingList])

    // IDs of employees who already have a checklist
    const enrolledIds = useMemo(() => new Set(enriched.map((c) => c.employeeId)), [enriched])

    const filtered = useMemo(() => {
        const q = search.searchInput.trim().toLowerCase()
        const f = search.appliedFilters
        const matchesText = (s: string | null | undefined, v: unknown) =>
            typeof v === 'string' ? (s ?? '').toLowerCase().includes(v.toLowerCase()) : true
        return enriched.filter((c) => {
            if (q) {
                const hit = c.employeeName.toLowerCase().includes(q)
                    || (c.designation ?? '').toLowerCase().includes(q)
                    || (c.department ?? '').toLowerCase().includes(q)
                    || (c.employeeNo ?? '').toLowerCase().includes(q)
                if (!hit) return false
            }
            const status = f.status?.value
            if (status === 'completed' && c.progress < 100) return false
            if (status === 'in_progress' && (c.progress >= 100 || c.progress === 0)) return false
            if (status === 'not_started' && c.progress > 0) return false
            if (f.department && !matchesText(c.department, f.department.value)) return false
            if (f.designation && !matchesText(c.designation, f.designation.value)) return false
            if (f.progress && typeof f.progress.value === 'object' && f.progress.value && !Array.isArray(f.progress.value)) {
                const r = f.progress.value as { min?: number; max?: number }
                if (r.min !== undefined && c.progress < r.min) return false
                if (r.max !== undefined && c.progress > r.max) return false
            }
            const dateRange = (val: unknown, target: string | null) => {
                if (!val || typeof val !== 'object' || Array.isArray(val) || !target) return true
                const r = val as { from?: string; to?: string }
                if (r.from && target < r.from) return false
                if (r.to && target > r.to) return false
                return true
            }
            if (f.startDate && !dateRange(f.startDate.value, c.startDate)) return false
            if (f.dueDate && !dateRange(f.dueDate.value, c.dueDate)) return false
            if (f.overdue?.value === true && !c.steps.some((s) => s.status === 'overdue')) return false
            return true
        })
    }, [enriched, search.searchInput, search.appliedFilters])

    const totalOverdue = enriched.reduce((n, c) => n + c.steps.filter((s) => s.status === 'overdue').length, 0)

    const startOnboarding = () => {
        if (!newEmpId) { toast.error('Select an employee', 'Choose an employee to start onboarding.'); return }
        createChecklist.mutate(
            { employeeId: newEmpId, startDate: newStartDate || undefined, dueDate: newDueDate || undefined, useTemplate },
            {
                onSuccess: () => {
                    toast.success('Onboarding started', useTemplate ? 'Checklist created with 9 default steps.' : 'Empty checklist created.')
                    setNewOpen(false); setNewEmpId(''); setNewStartDate(''); setNewDueDate(''); setUseTemplate(true)
                },
                onError: (err: Error) => {
                    toast.error('Failed', err.message ?? 'Could not create checklist.')
                },
            },
        )
    }

    const columns = useMemo<ColumnDef<OnboardingChecklist>[]>(() => [
        {
            accessorKey: 'employeeName',
            header: 'Employee',
            cell: ({ row: { original: c } }) => (
                <div className="flex items-center gap-3 min-w-0">
                    <InitialsAvatar name={c.employeeName} src={c.avatarUrl ?? undefined} size="sm" />
                    <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{c.employeeName}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{c.employeeNo ?? '—'}</p>
                    </div>
                </div>
            ),
        },
        {
            accessorKey: 'designation',
            header: 'Role',
            cell: ({ row: { original: c } }) => (
                <div className="min-w-0">
                    <p className="text-sm truncate">{c.designation ?? '—'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{c.department ?? '—'}</p>
                </div>
            ),
        },
        { accessorKey: 'startDate', header: 'Start', cell: ({ row: { original: c }, getValue }) => c.id ? <span className="text-sm">{formatDate(getValue() as string)}</span> : <span className="text-xs text-muted-foreground">—</span> },
        { accessorKey: 'dueDate', header: 'Due', cell: ({ row: { original: c }, getValue }) => c.id ? <span className="text-sm">{formatDate(getValue() as string)}</span> : <span className="text-xs text-muted-foreground">—</span> },
        {
            accessorKey: 'progress',
            header: 'Progress',
            cell: ({ row: { original: c } }) => {
                if (!c.id) {
                    return <Badge variant="secondary" className="text-[10px] font-normal">No checklist</Badge>
                }
                const tone = progressTone(c.progress)
                return (
                    <div className="min-w-[140px]">
                        <div className="flex items-center justify-between mb-1">
                            <span className={cn('text-xs font-semibold', tone.color)}>{c.progress}%</span>
                            <span className="text-[11px] text-muted-foreground">{c.completedCount}/{c.totalCount}</span>
                        </div>
                        <Progress value={c.progress} />
                    </div>
                )
            },
        },
        {
            id: 'overdue',
            header: 'Overdue',
            cell: ({ row: { original: c } }) => {
                if (!c.id) return <span className="text-xs text-muted-foreground">—</span>
                const n = c.steps.filter((s) => s.status === 'overdue').length
                return n > 0
                    ? <Badge variant="destructive" className="text-[10px]">{n}</Badge>
                    : <span className="text-xs text-muted-foreground">—</span>
            },
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row: { original: c } }) => (
                <div onClick={(e) => e.stopPropagation()}>
                    {c.id ? (
                        <Button asChild size="sm" variant="outline">
                            <Link to={`/onboarding/${c.employeeId}`}><Eye className="h-3.5 w-3.5 mr-1.5" />View</Link>
                        </Button>
                    ) : (
                        <Button size="sm" variant="default" leftIcon={<Plus className="h-3.5 w-3.5" />}
                            onClick={() => { setNewEmpId(c.employeeId); setNewOpen(true) }}>
                            Start
                        </Button>
                    )}
                </div>
            ),
        },
    ], [enrolledIds])

    return (
        <PageWrapper>
            <PageHeader
                title={t('onboarding.title')}
                description={t('onboarding.description')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={onboardingFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetchOnboarding()} disabled={onboardingFetching}>
                            Refresh
                        </Button>
                        <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setNewOpen(true)}>
                            New Onboarding
                        </Button>
                    </div>
                }
            />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <KpiCardCompact label="Active" value={analytics?.inProgress ?? enriched.filter(c => c.progress > 0 && c.progress < 100).length} icon={Users} color="blue" loading={onboardingLoading} />
                <KpiCardCompact label="Completed" value={analytics?.completed ?? enriched.filter(c => c.progress >= 100).length} icon={CheckCircle2} color="green" loading={onboardingLoading} />
                <KpiCardCompact label="Overdue Steps" value={analytics?.overdueSteps ?? totalOverdue} icon={AlertTriangle} color="red" loading={onboardingLoading} />
                <KpiCardCompact label="Avg Progress" value={`${analytics?.avgProgress ?? 0}%`} icon={TrendingUp} color="amber" loading={onboardingLoading} />
            </div>

            {onboardingLoading ? (
                <Card className="p-4 space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </Card>
            ) : enriched.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <UserPlus className="h-10 w-10 text-muted-foreground" />
                    <div>
                        <p className="text-sm font-medium">No active onboarding checklists</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            New employees with status "onboarding" will appear here automatically.
                        </p>
                    </div>
                </Card>
            ) : (
                <Card className="p-4">
                    <DataTable
                        columns={columns}
                        data={filtered}
                        getRowId={(row) => row.id ?? `stub-${row.employeeId}`}
                        onRowClick={(row) => { if (row.id) navigate(`/onboarding/${row.employeeId}`) }}
                        advancedFilter={{
                            search,
                            filters: ONBOARDING_FILTERS,
                            quickFilters: ONBOARDING_QUICK_FILTERS,
                            placeholder: 'Search by employee, role, department, employee №…',
                        }}
                        pageSize={10}
                        emptyMessage="No checklists match your filters"
                    />
                </Card>
            )}

            {/* New Onboarding Dialog */}
            <Dialog open={newOpen} onOpenChange={(open) => { setNewOpen(open); if (!open) { setNewEmpId(''); setNewStartDate(''); setNewDueDate(''); setUseTemplate(true) } }}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Start Onboarding</DialogTitle></DialogHeader>
                    <DialogBody className="space-y-4">
                        {!newEmpId ? (
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Employee *</label>
                                <Select value={newEmpId} onValueChange={setNewEmpId}>
                                    <SelectTrigger className="h-9">
                                        <SelectValue placeholder="Select employee…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {allEmployees.filter((e) => !enrolledIds.has(e.id)).map((e) => (
                                            <SelectItem key={e.id} value={e.id}>
                                                {e.firstName} {e.lastName}
                                                {e.designation ? ` — ${e.designation}` : ''}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {allEmployees.filter((e) => !enrolledIds.has(e.id)).length === 0 && (
                                    <p className="text-xs text-muted-foreground">All active employees already have a checklist.</p>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 rounded-lg bg-muted/50 border px-3 py-2">
                                <span className="text-sm font-medium">
                                    {(() => { const e = allEmployees.find((e) => e.id === newEmpId); return e ? `${e.firstName} ${e.lastName}` : '' })()}
                                </span>
                                {(() => { const e = allEmployees.find((e) => e.id === newEmpId); return e?.designation ? <span className="text-xs text-muted-foreground">— {e.designation}</span> : null })()}
                            </div>
                        )}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Start date</label>
                                <DatePicker value={newStartDate} onChange={setNewStartDate} className="h-9" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Due date</label>
                                <DatePicker value={newDueDate} onChange={setNewDueDate} className="h-9" />
                            </div>
                        </div>
                        <label className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border cursor-pointer hover:bg-muted/80 transition-colors">
                            <input
                                type="checkbox"
                                checked={useTemplate}
                                onChange={(e) => setUseTemplate(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded accent-primary"
                            />
                            <div>
                                <div className="flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                                    <span className="text-sm font-medium">Use default template</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Auto-creates 9 standard onboarding steps (HR docs, IT setup, orientation, 30-day check-in, etc.)
                                </p>
                            </div>
                        </label>
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
