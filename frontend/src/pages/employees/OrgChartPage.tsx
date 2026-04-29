import React, { memo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    Users, GitBranch, Layers, Users2, MapPin, UserCircle,
    Building2, ChevronRight,
} from 'lucide-react'
import { useOrgUnitTree, useOrgUnitStats, type OrgUnitNode } from '@/hooks/useOrgUnits'

// ─── Employee Reporting Tree ──────────────────────────────────────────────────

interface OrgNode {
    id: string
    fullName: string
    designation?: string
    department?: string
    status: string
    children: OrgNode[]
}

const STATUS_DOT: Record<string, string> = {
    active: 'bg-emerald-500',
    onboarding: 'bg-blue-500',
    probation: 'bg-amber-500',
    suspended: 'bg-orange-500',
    terminated: 'bg-red-500',
    visa_expired: 'bg-red-400',
}

const EmpCard = memo(function EmpCard({ node, isRoot }: { node: OrgNode; isRoot?: boolean }) {
    const initials = node.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    return (
        <div className="flex flex-col items-center">
            <Card className={`p-3 text-center min-w-[150px] max-w-[170px] shadow-sm border ${isRoot ? 'border-primary/40 bg-primary/5' : ''}`}>
                <div className="relative w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2 text-primary font-bold text-sm">
                    {initials}
                    <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${STATUS_DOT[node.status] ?? 'bg-gray-400'}`} />
                </div>
                <p className="font-semibold text-xs leading-tight truncate">{node.fullName}</p>
                {node.designation && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{node.designation}</p>}
                {node.department && <p className="text-[10px] text-primary/70 mt-0.5 truncate">{node.department}</p>}
            </Card>
            {node.children.length > 0 && (
                <div className="flex flex-col items-center">
                    <div className="w-px h-6 bg-border" />
                    <div className="relative flex gap-6 items-start">
                        {node.children.length > 1 && (
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px w-[calc(100%-40px)] bg-border" />
                        )}
                        {node.children.map(child => (
                            <div key={child.id} className="flex flex-col items-center">
                                <div className="w-px h-4 bg-border" />
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
    })
    const list = Array.isArray(data) ? data : []

    if (isLoading) return (
        <div className="flex gap-8 justify-center py-6">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border p-4 w-44 space-y-3">
                    <div className="flex items-center gap-3">
                        <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                        <div className="space-y-1.5 flex-1">
                            <Skeleton className="h-4 w-24" />
                            <Skeleton className="h-3 w-16" />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    )

    if (list.length === 0) return (
        <div className="flex flex-col items-center gap-3 py-16">
            <Users className="h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">No employees yet. Add employees to see the reporting chart.</p>
        </div>
    )

    return (
        <div className="overflow-x-auto py-4">
            <div className="flex gap-10 justify-center min-w-max pb-4">
                {list.map((node: OrgNode) => (
                    <EmpCard key={node.id} node={node} isRoot />
                ))}
            </div>
        </div>
    )
}

// ─── Org Structure — 3-level hierarchy ───────────────────────────────────────

function DeptRow({ dept }: { dept: OrgUnitNode }) {
    return (
        <div className="flex items-center gap-2.5 rounded-lg bg-background border border-blue-100 px-3 py-2 hover:border-blue-200 transition-colors">
            <div className="w-6 h-6 rounded-md bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <Users2 className="h-3 w-3 text-blue-600" />
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
                <span className="text-[9px] font-mono text-muted-foreground shrink-0">{dept.code}</span>
            )}
            {!dept.isActive && <Badge variant="secondary" className="text-[9px] shrink-0 h-4 px-1">Off</Badge>}
        </div>
    )
}

function DivisionCard({ division }: { division: OrgUnitNode }) {
    const depts = division.children
    return (
        <div className="rounded-xl border border-violet-200/80 bg-violet-50/40 dark:bg-violet-950/10">
            {/* Division header */}
            <div className="flex items-start gap-3 p-4 pb-3">
                <div className="w-9 h-9 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center shrink-0 mt-0.5">
                    <Layers className="h-4 w-4 text-violet-700" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-600 mb-0.5">Division</p>
                    <p className="font-semibold text-sm leading-tight truncate">{division.name}</p>
                    {division.headEmployeeName && (
                        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                            <UserCircle className="h-2.5 w-2.5 shrink-0" />
                            {division.headEmployeeName}
                        </p>
                    )}
                </div>
                {division.code && (
                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">{division.code}</span>
                )}
                {!division.isActive && <Badge variant="secondary" className="text-[9px] shrink-0">Inactive</Badge>}
            </div>

            {/* Departments */}
            {depts.length > 0 ? (
                <div className="px-4 pb-4 space-y-1.5 border-t border-violet-100">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground pt-3 pb-1 flex items-center gap-1">
                        <ChevronRight className="h-2.5 w-2.5" />
                        Departments · {depts.length}
                    </p>
                    {depts.map(dept => <DeptRow key={dept.id} dept={dept} />)}
                </div>
            ) : (
                <p className="px-4 pb-4 text-[11px] text-muted-foreground italic border-t border-violet-100 pt-3">
                    No departments assigned
                </p>
            )}
        </div>
    )
}

function BranchSection({ branch }: { branch: OrgUnitNode }) {
    const divisions = branch.children
    const totalDepts = divisions.reduce((sum, d) => sum + d.children.length, 0)

    return (
        <div className="mb-8 last:mb-0">
            {/* Branch header */}
            <div className="flex flex-wrap items-center gap-3 mb-5 p-4 rounded-xl border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/10">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
                    <MapPin className="h-5 w-5 text-emerald-700" />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 mb-0.5">Branch</p>
                    <p className="font-bold text-base leading-tight">{branch.name}</p>
                    {branch.headEmployeeName && (
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <UserCircle className="h-3 w-3 shrink-0" />
                            {branch.headEmployeeName}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    {branch.code && (
                        <span className="text-xs font-mono text-muted-foreground bg-background border rounded px-2 py-0.5">
                            {branch.code}
                        </span>
                    )}
                    <div className="flex gap-2">
                        <span className="inline-flex items-center gap-1 text-[11px] bg-violet-100 text-violet-700 rounded-full px-2.5 py-1 font-medium">
                            <Layers className="h-3 w-3" /> {divisions.length} division{divisions.length !== 1 ? 's' : ''}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[11px] bg-blue-100 text-blue-700 rounded-full px-2.5 py-1 font-medium">
                            <Users2 className="h-3 w-3" /> {totalDepts} dept{totalDepts !== 1 ? 's' : ''}
                        </span>
                    </div>
                    {!branch.isActive && <Badge variant="secondary">Inactive</Badge>}
                </div>
            </div>

            {/* Divisions grid */}
            {divisions.length > 0 ? (
                <div className="ml-4 pl-4 border-l-2 border-emerald-200 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {divisions.map(division => (
                        <DivisionCard key={division.id} division={division} />
                    ))}
                </div>
            ) : (
                <p className="ml-4 pl-4 border-l-2 border-emerald-200 text-sm text-muted-foreground italic py-2">
                    No divisions assigned to this branch
                </p>
            )}
        </div>
    )
}

function StatsBar({ branches, divisions, departments }: { branches: number; divisions: number; departments: number }) {
    const stats = [
        { label: 'Branches', value: branches, icon: MapPin, color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
        { label: 'Divisions', value: divisions, icon: Layers, color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200' },
        { label: 'Departments', value: departments, icon: Users2, color: 'text-blue-700', bg: 'bg-blue-50 border-blue-200' },
    ]
    return (
        <div className="grid grid-cols-3 gap-3 mb-6">
            {stats.map(s => {
                const Icon = s.icon
                return (
                    <div key={s.label} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${s.bg}`}>
                        <Icon className={`h-5 w-5 shrink-0 ${s.color}`} />
                        <div>
                            <p className={`text-xl font-bold leading-none ${s.color}`}>{s.value}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

function StatsBarSkeleton() {
    return (
        <div className="grid grid-cols-3 gap-3 mb-6">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border px-4 py-3">
                    <Skeleton className="h-6 w-8 mb-1" />
                    <Skeleton className="h-3 w-16" />
                </div>
            ))}
        </div>
    )
}

function StructureChart() {
    const { data: roots = [], isLoading } = useOrgUnitTree()
    const { data: stats } = useOrgUnitStats()

    if (isLoading) return (
        <div>
            <StatsBarSkeleton />
            <div className="space-y-6">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="rounded-xl border p-4 space-y-3">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-10 rounded-xl" />
                            <div className="space-y-1.5">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-20" />
                            </div>
                        </div>
                        <div className="ml-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {Array.from({ length: 3 }).map((_, j) => (
                                <div key={j} className="rounded-xl border p-3 space-y-2">
                                    <Skeleton className="h-9 w-9 rounded-lg" />
                                    <Skeleton className="h-3.5 w-28" />
                                    <Skeleton className="h-3 w-20" />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )

    if (roots.length === 0) return (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <div>
                <p className="font-medium text-sm">No org structure defined</p>
                <p className="text-sm text-muted-foreground mt-1">
                    Go to <strong>Organization Settings → Org Structure</strong> to add branches, divisions, and departments.
                </p>
            </div>
        </div>
    )

    // Separate branches from any orphaned divisions/departments
    const branches = roots.filter(n => n.type === 'branch')
    const orphans = roots.filter(n => n.type !== 'branch')

    return (
        <div>
            {stats && (
                <StatsBar
                    branches={stats.branches}
                    divisions={stats.divisions}
                    departments={stats.departments}
                />
            )}

            {branches.map(branch => (
                <BranchSection key={branch.id} branch={branch} />
            ))}

            {/* Orphaned nodes (divisions/departments with no parent branch) */}
            {orphans.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                        Unassigned Units
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {orphans.map(node => (
                            node.type === 'division'
                                ? <DivisionCard key={node.id} division={node} />
                                : <DeptRow key={node.id} dept={node} />
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

    return (
        <PageWrapper>
            <PageHeader
                title={t('orgChart.title', { defaultValue: 'Organization Chart' })}
                description={t('orgChart.description', { defaultValue: 'Visualize your company structure and reporting lines.' })}
            />

            <Tabs defaultValue="structure">
                <TabsList className="mb-6">
                    <TabsTrigger value="structure" className="gap-2">
                        <GitBranch className="h-4 w-4" /> Org Structure
                    </TabsTrigger>
                    <TabsTrigger value="reporting" className="gap-2">
                        <Users className="h-4 w-4" /> Reporting Lines
                    </TabsTrigger>
                </TabsList>
                <TabsContent value="structure" className="mt-0">
                    <StructureChart />
                </TabsContent>
                <TabsContent value="reporting" className="mt-0">
                    <ReportingChart />
                </TabsContent>
            </Tabs>
        </PageWrapper>
    )
}
