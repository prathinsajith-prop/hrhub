import { memo, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Filter as FilterIcon, Users } from 'lucide-react'
import { OrgUnitFilters, EMPTY_ORG_FILTERS, isOrgFiltersActive, type OrgFilters } from '@/components/shared/OrgUnitFilters'
import { useOrgUnits } from '@/hooks/useOrgUnits'
import { useDesignations } from '@/hooks/useDesignations'
import { useEmployees } from '@/hooks/useEmployees'
import type { Employee } from '@/types'

// ─── Reporting Tree ───────────────────────────────────────────────────────────

interface OrgNode {
    id: string
    fullName: string
    designation?: string
    department?: string
    status: string
    isAncestor?: boolean
    /** Marks nodes that satisfied the active filter (vs. ancestors kept for context). */
    isMatch?: boolean
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
    const isMatch = node.isMatch === true
    const isMe = !!currentEmployeeId && node.id === currentEmployeeId

    return (
        <div className="flex flex-col items-center">
            <div className={cn(
                'relative flex flex-col items-center text-center rounded-2xl border px-4 py-4 w-48 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5',
                isAncestor
                    ? 'bg-muted/40 border-border/40 opacity-75'
                    : isMatch
                        ? 'bg-card border-emerald-300 shadow-emerald-100 shadow-md ring-1 ring-emerald-200'
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
                {isMatch && !isMe && !isAncestor && (
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2">
                        <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-500 text-white px-2 py-0.5 rounded-full">
                            Match
                        </span>
                    </div>
                )}
                <div className={cn(
                    'relative size-12 rounded-full flex items-center justify-center mb-3 text-sm font-bold',
                    isAncestor
                        ? 'bg-muted text-muted-foreground'
                        : isMe
                            ? 'bg-primary/10 text-primary ring-2 ring-primary/20'
                            : 'bg-muted text-foreground',
                )}>
                    {initials}
                    <span className={cn('absolute bottom-0.5 right-0.5 size-2.5 rounded-full border-2 border-card', dot)} />
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

/**
 * Walk the org-chart tree and prune branches that contain no employees matching
 * the filter set. Behavior:
 *   - Direct matches are kept and tagged isMatch=true.
 *   - The full subtree under a matched node is kept (so reports of a matched
 *     manager stay visible — important when searching for a single person).
 *   - Ancestors of any match are kept and tagged isAncestor=true so the
 *     reporting chain renders dimmed for context.
 *
 * Pass `inMatchSubtree=true` to skip the per-node match check and keep every
 * descendant; that branch is already inside a confirmed match.
 */
function pruneTree(nodes: OrgNode[], matches: Set<string>, inMatchSubtree: boolean): OrgNode[] {
    const out: OrgNode[] = []
    for (const n of nodes) {
        const selfMatch = matches.has(n.id)
        const nextInSubtree = inMatchSubtree || selfMatch
        const prunedChildren = pruneTree(n.children, matches, nextInSubtree)
        if (inMatchSubtree || selfMatch || prunedChildren.length > 0) {
            out.push({
                ...n,
                isMatch: selfMatch,
                // Anything kept that isn't itself a match is context — render it dimmed.
                isAncestor: !selfMatch && !inMatchSubtree,
                children: prunedChildren,
            })
        }
    }
    return out
}

function ReportingChart({ filters }: { filters: OrgFilters }) {
    const { user } = useAuthStore()
    const currentEmployeeId = user?.employeeId ?? undefined
    const { data, isLoading } = useQuery({
        queryKey: ['org-chart'],
        queryFn: () => api.get<OrgNode[]>('/employees/org-chart'),
        staleTime: 3 * 60 * 1000,
    })

    // Employees + their org-unit ids so we can filter by branch/division/department.
    // The /employees/org-chart endpoint only echoes department NAME, so we join
    // against this list to resolve real ids. The org chart renders every node, so
    // we need the whole roster — request a high cap and flag when it's exceeded.
    const EMP_FETCH_LIMIT = 1000
    const { data: empResp, isLoading: empLoading } = useEmployees({ limit: EMP_FETCH_LIMIT })
    const allEmployees = useMemo<Employee[]>(
        () => (Array.isArray(empResp) ? empResp : (empResp as { data?: Employee[] } | undefined)?.data ?? []) as Employee[],
        [empResp],
    )
    const employeesTotal = (empResp as { total?: number } | undefined)?.total ?? allEmployees.length
    const employeesTruncated = employeesTotal > allEmployees.length

    const list = useMemo(() => (Array.isArray(data) ? data : []), [data])
    const filtersActive = isOrgFiltersActive(filters)
    // employeeId is matched against node ids directly; the rest need the roster join.
    const needsEmpData = !!(filters.branchId || filters.divisionId || filters.departmentId || filters.designation)
    // Filtering before the roster resolves would wrongly prune the whole tree.
    const filterPending = needsEmpData && empLoading && allEmployees.length === 0

    const filteredList = useMemo(() => {
        if (!filtersActive || filterPending) return list
        const byId = new Map(allEmployees.map(e => [e.id, e]))
        const matches = new Set<string>()
        // Walk every node in the tree and decide if it satisfies the filters.
        const visit = (nodes: OrgNode[]) => {
            for (const n of nodes) {
                const emp = byId.get(n.id)
                let keep = true
                if (filters.employeeId && n.id !== filters.employeeId) keep = false
                if (keep && filters.branchId && emp?.branchId !== filters.branchId) keep = false
                if (keep && filters.divisionId && emp?.divisionId !== filters.divisionId) keep = false
                if (keep && filters.departmentId && emp?.departmentId !== filters.departmentId) keep = false
                if (keep && filters.designation && (emp?.designation ?? n.designation) !== filters.designation) keep = false
                if (keep) matches.add(n.id)
                visit(n.children)
            }
        }
        visit(list)
        return pruneTree(list, matches, false)
    }, [list, allEmployees, filters, filtersActive, filterPending])

    if (isLoading) return (
        <div className="flex gap-8 justify-center py-12">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl border bg-card p-4 w-48 space-y-3 shadow-sm">
                    <Skeleton className="size-12 rounded-full mx-auto" />
                    <Skeleton className="h-3.5 w-28 mx-auto" />
                    <Skeleton className="h-3 w-20 mx-auto" />
                </div>
            ))}
        </div>
    )

    if (list.length === 0) return (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
            <div className="size-14 rounded-2xl bg-muted flex items-center justify-center">
                <Users className="size-6 text-muted-foreground" />
            </div>
            <p className="font-semibold text-sm">No reporting structure yet</p>
            <p className="text-sm text-muted-foreground max-w-xs">
                Assign managers to employees to visualize the reporting hierarchy.
            </p>
        </div>
    )

    if (filteredList.length === 0) return (
        <div className="flex flex-col items-center gap-2 py-20 text-center">
            <FilterIcon className="size-8 text-muted-foreground" />
            <p className="font-semibold text-sm">No employees match these filters</p>
            <p className="text-sm text-muted-foreground max-w-xs">
                Adjust or clear the filters above to see the reporting tree.
            </p>
        </div>
    )

    return (
        <div className="overflow-x-auto pb-6">
            {filtersActive && needsEmpData && employeesTruncated && (
                <div className="mb-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <FilterIcon className="size-3.5 shrink-0" />
                    <span>
                        Showing matches from the first {allEmployees.length} of {employeesTotal} employees — some
                        people may not appear. Narrow with the employee search for an exact match.
                    </span>
                </div>
            )}
            <div className="flex gap-16 justify-center min-w-max py-8 px-6">
                {filteredList.map((node: OrgNode) => (
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

    const [filters, setFilters] = useState<OrgFilters>(EMPTY_ORG_FILTERS)
    const { data: units = [] } = useOrgUnits()
    const { data: designations = [] } = useDesignations()
    const showFilters = isFullAccess && units.length > 0
    const filtersActive = isOrgFiltersActive(filters)

    return (
        <PageWrapper>
            <div className="mb-6">
                <h1 className="text-2xl font-semibold tracking-tight">
                    {t('orgChart.title', { defaultValue: 'Organization Chart' })}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>

            {showFilters && (
                <div className="mb-4">
                    <OrgUnitFilters
                        filters={filters}
                        onChange={setFilters}
                        units={units}
                        designations={designations}
                    />
                    {filtersActive && (
                        <div className="mt-2 flex justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_ORG_FILTERS)}>
                                {t('orgSettings.structure.clearFilters', { defaultValue: 'Clear' })}
                            </Button>
                        </div>
                    )}
                </div>
            )}

            <ReportingChart filters={filters} />
        </PageWrapper>
    )
}
