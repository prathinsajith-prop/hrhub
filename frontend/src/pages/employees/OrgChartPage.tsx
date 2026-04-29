import { memo, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
    Users, GitBranch, Layers, Users2, UserCircle,
    Building2, ChevronDown, Search, MapPin,
} from 'lucide-react'
import { useOrgUnitTree, useOrgUnitStats, type OrgUnitNode } from '@/hooks/useOrgUnits'

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

const EmpCard = memo(function EmpCard({ node, isRoot }: { node: OrgNode; isRoot?: boolean }) {
    const initials = node.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    const dot = STATUS_DOT[node.status] ?? 'bg-muted-foreground'
    const isAncestor = node.isAncestor === true

    return (
        <div className="flex flex-col items-center">
            <div className={cn(
                'relative flex flex-col items-center text-center rounded-2xl border px-4 py-4 w-48 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5',
                isAncestor
                    ? 'bg-muted/40 border-border/40 opacity-75'
                    : isRoot
                        ? 'bg-card border-primary/25 shadow-primary/10 shadow-md ring-1 ring-primary/10'
                        : 'bg-card border-border/60',
            )}>
                {isRoot && !isAncestor && (
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
                        : isRoot
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
                                <EmpCard node={child} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
})

function ReportingChart() {
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
                    <EmpCard key={node.id} node={node} isRoot />
                ))}
            </div>
        </div>
    )
}

// ─── Org Structure ────────────────────────────────────────────────────────────

function DeptPill({ dept }: { dept: OrgUnitNode }) {
    return (
        <div className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 hover:bg-muted/40 transition-colors group">
            <div className="w-6 h-6 rounded-md bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                <Users2 className="h-3 w-3 text-sky-600" />
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium leading-tight truncate">{dept.name}</p>
                {dept.headEmployeeName && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                        <UserCircle className="h-2.5 w-2.5 shrink-0" />
                        {dept.headEmployeeName}
                    </p>
                )}
            </div>
            {dept.code && (
                <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">{dept.code}</span>
            )}
            {!dept.isActive && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0">Off</Badge>
            )}
        </div>
    )
}

function DivisionCard({ division }: { division: OrgUnitNode }) {
    const [open, setOpen] = useState(true)
    const depts = division.children

    return (
        <div className="rounded-xl border bg-card overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
            >
                <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                    <Layers className="h-3.5 w-3.5 text-violet-600" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-tight truncate">{division.name}</p>
                    {division.headEmployeeName && (
                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                            <UserCircle className="h-2.5 w-2.5" />
                            {division.headEmployeeName}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {depts.length > 0 && (
                        <span className="text-[9px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                            {depts.length} dept{depts.length !== 1 ? 's' : ''}
                        </span>
                    )}
                    {!division.isActive && (
                        <Badge variant="secondary" className="text-[9px] h-4 px-1">Off</Badge>
                    )}
                    <ChevronDown className={cn(
                        'h-3.5 w-3.5 text-muted-foreground transition-transform duration-200',
                        !open && '-rotate-90',
                    )} />
                </div>
            </button>

            {open && (
                depts.length > 0 ? (
                    <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-border/40">
                        {depts.map(dept => <DeptPill key={dept.id} dept={dept} />)}
                    </div>
                ) : (
                    <p className="px-4 pb-3 pt-2 text-[11px] text-muted-foreground border-t border-border/40">
                        No departments assigned
                    </p>
                )
            )}
        </div>
    )
}

function BranchPanel({ branch }: { branch: OrgUnitNode }) {
    const [open, setOpen] = useState(true)
    const divisions = branch.children
    const totalDepts = divisions.reduce((s, d) => s + d.children.length, 0)

    return (
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            {/* Branch header */}
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex flex-wrap items-center gap-4 px-6 py-5 text-left hover:bg-muted/20 transition-colors"
            >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-emerald-600" />
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm leading-tight">{branch.name}</p>
                        {branch.code && (
                            <span className="text-[10px] font-mono text-muted-foreground border rounded px-1.5 py-0.5 bg-muted/50">
                                {branch.code}
                            </span>
                        )}
                        {!branch.isActive && (
                            <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                        )}
                    </div>
                    {branch.headEmployeeName && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                            <UserCircle className="h-3 w-3 shrink-0" />
                            {branch.headEmployeeName}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1 bg-muted rounded-full px-2.5 py-1 font-medium">
                            <Layers className="h-3 w-3" />
                            {divisions.length}
                        </span>
                        <span className="flex items-center gap-1 bg-muted rounded-full px-2.5 py-1 font-medium">
                            <Users2 className="h-3 w-3" />
                            {totalDepts}
                        </span>
                    </div>
                    <ChevronDown className={cn(
                        'h-4 w-4 text-muted-foreground transition-transform duration-200',
                        !open && '-rotate-90',
                    )} />
                </div>
            </button>

            {/* Divisions */}
            {open && (
                <div className="border-t border-border/50 bg-muted/10 px-5 py-5">
                    {divisions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {divisions.map(div => (
                                <DivisionCard key={div.id} division={div} />
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground py-2">No divisions in this branch.</p>
                    )}
                </div>
            )}
        </div>
    )
}

// ─── Stats row ────────────────────────────────────────────────────────────────

function StatsRow({ branches, divisions, departments }: { branches: number; divisions: number; departments: number }) {
    const items = [
        { label: 'Branches', value: branches, icon: MapPin, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' },
        { label: 'Divisions', value: divisions, icon: Layers, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
        { label: 'Departments', value: departments, icon: Users2, color: 'text-sky-600', bg: 'bg-sky-50 border-sky-100' },
    ]
    return (
        <div className="grid grid-cols-3 gap-3">
            {items.map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-4 shadow-sm">
                    <div className={cn('w-9 h-9 rounded-lg border flex items-center justify-center shrink-0', bg)}>
                        <Icon className={cn('h-4 w-4', color)} />
                    </div>
                    <div>
                        <p className="text-xl font-bold leading-none">{value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    </div>
                </div>
            ))}
        </div>
    )
}

function StatsRowSkeleton() {
    return (
        <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-4 shadow-sm">
                    <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                    <div className="space-y-1.5">
                        <Skeleton className="h-5 w-8" />
                        <Skeleton className="h-3 w-16" />
                    </div>
                </div>
            ))}
        </div>
    )
}

// ─── Structure Chart ──────────────────────────────────────────────────────────

function StructureChart() {
    const { data: roots = [], isLoading } = useOrgUnitTree()
    const { data: stats } = useOrgUnitStats()
    const [search, setSearch] = useState('')

    const branches = useMemo(() => roots.filter(n => n.type === 'branch'), [roots])
    const orphans = useMemo(() => roots.filter(n => n.type !== 'branch'), [roots])

    const filteredBranches = useMemo(() => {
        if (!search.trim()) return branches
        const q = search.toLowerCase()
        return branches
            .map(b => ({
                ...b,
                children: b.children
                    .map(div => ({
                        ...div,
                        children: div.children.filter(dept =>
                            dept.name.toLowerCase().includes(q) ||
                            div.name.toLowerCase().includes(q) ||
                            b.name.toLowerCase().includes(q)
                        ),
                    }))
                    .filter(div =>
                        div.name.toLowerCase().includes(q) ||
                        b.name.toLowerCase().includes(q) ||
                        div.children.length > 0
                    ),
            }))
            .filter(b =>
                b.name.toLowerCase().includes(q) || b.children.length > 0
            )
    }, [branches, search])

    if (isLoading) return (
        <div className="space-y-4">
            <StatsRowSkeleton />
            <div className="space-y-3 pt-2">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                        <div className="flex items-center gap-4 px-6 py-5">
                            <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
                            <div className="space-y-1.5 flex-1">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-3 w-24" />
                            </div>
                        </div>
                        <div className="border-t bg-muted/10 px-5 py-5 grid grid-cols-3 gap-3">
                            {Array.from({ length: 3 }).map((_, j) => (
                                <div key={j} className="rounded-xl border bg-card p-4 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Skeleton className="w-8 h-8 rounded-lg" />
                                        <div className="space-y-1.5">
                                            <Skeleton className="h-3 w-24" />
                                            <Skeleton className="h-2.5 w-16" />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )

    if (roots.length === 0) return (
        <div className="flex flex-col items-center gap-4 py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <Building2 className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
                <p className="font-semibold text-sm">No structure defined yet</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    Go to <strong>Organization Settings → Org Structure</strong> to add branches, divisions, and departments.
                </p>
            </div>
        </div>
    )

    return (
        <div className="space-y-5">
            {stats && (
                <StatsRow
                    branches={stats.branches}
                    divisions={stats.divisions}
                    departments={stats.departments}
                />
            )}

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search branches, divisions, departments…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-9"
                />
            </div>

            {filteredBranches.length === 0 && search ? (
                <div className="text-center py-16 text-sm text-muted-foreground">
                    No results for <span className="font-medium">"{search}"</span>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredBranches.map(branch => (
                        <BranchPanel key={branch.id} branch={branch} />
                    ))}
                </div>
            )}

            {orphans.length > 0 && !search && (
                <div className="pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                        Unassigned Units
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {orphans.map(node => (
                            node.type === 'division'
                                ? <DivisionCard key={node.id} division={node} />
                                : <DeptPill key={node.id} dept={node} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function OrgChartPage() {
    const { t } = useTranslation()
    const role = useAuthStore(s => s.user?.role)
    const isDeptHead = role === 'dept_head'

    return (
        <PageWrapper>
            <div className="mb-6">
                <h1 className="text-2xl font-bold tracking-tight">
                    {t('orgChart.title', { defaultValue: 'Organization Chart' })}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    {isDeptHead
                        ? t('orgChart.descriptionDeptHead', { defaultValue: 'Reporting lines within your team.' })
                        : t('orgChart.description', { defaultValue: 'Visualize your company structure and reporting lines.' })
                    }
                </p>
            </div>

            {isDeptHead ? (
                // dept_head: reporting lines only, scoped to their subtree by the backend
                <ReportingChart />
            ) : (
                <Tabs defaultValue="structure">
                    <TabsList className="mb-6 bg-muted/60 p-1">
                        <TabsTrigger value="structure" className="gap-2 text-sm">
                            <GitBranch className="h-3.5 w-3.5" />
                            Org Structure
                        </TabsTrigger>
                        <TabsTrigger value="reporting" className="gap-2 text-sm">
                            <Users className="h-3.5 w-3.5" />
                            Reporting Lines
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="structure" className="mt-0">
                        <StructureChart />
                    </TabsContent>
                    <TabsContent value="reporting" className="mt-0">
                        <ReportingChart />
                    </TabsContent>
                </Tabs>
            )}
        </PageWrapper>
    )
}
