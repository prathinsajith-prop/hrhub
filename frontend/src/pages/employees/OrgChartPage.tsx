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

// ─── Org Structure ────────────────────────────────────────────────────────────

function UnitHeader({
    icon: Icon,
    iconBg,
    iconColor,
    name,
    code,
    headEmployeeName,
    isActive,
    open,
    meta,
}: {
    icon: React.ElementType
    iconBg: string
    iconColor: string
    name: string
    code?: string | null
    headEmployeeName?: string | null
    isActive: boolean
    open: boolean
    meta?: React.ReactNode
}) {
    return (
        <div className="flex flex-wrap items-center gap-3 w-full">
            <div className={cn('w-9 h-9 rounded-lg border flex items-center justify-center shrink-0', iconBg)}>
                <Icon className={cn('h-4 w-4', iconColor)} />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm leading-tight">{name}</p>
                    {code && (
                        <span className="text-[10px] font-mono text-muted-foreground border rounded px-1.5 py-0.5 bg-muted/50">
                            {code}
                        </span>
                    )}
                    {!isActive && <Badge variant="secondary" className="text-[9px] h-4 px-1.5">Inactive</Badge>}
                </div>
                {headEmployeeName && (
                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <UserCircle className="h-3 w-3 shrink-0" />
                        {headEmployeeName}
                    </p>
                )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                {meta}
                <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform duration-200', !open && '-rotate-90')} />
            </div>
        </div>
    )
}

function DeptPill({ dept }: { dept: OrgUnitNode }) {
    return (
        <div className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 hover:bg-muted/40 transition-colors">
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
            {dept.code && <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">{dept.code}</span>}
            {!dept.isActive && <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0">Off</Badge>}
        </div>
    )
}

/** Dept card that also renders its branch children (leaf level). */
function DeptCard({ dept }: { dept: OrgUnitNode }) {
    const [open, setOpen] = useState(true)
    const branches = dept.children.filter(c => c.type === 'branch')
    const hasBranches = branches.length > 0

    return (
        <div className="rounded-xl border bg-card overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full px-4 py-3 text-left hover:bg-muted/30 transition-colors"
            >
                <UnitHeader
                    icon={Users2} iconBg="bg-sky-50 border-sky-100" iconColor="text-sky-600"
                    name={dept.name} code={dept.code} headEmployeeName={dept.headEmployeeName}
                    isActive={dept.isActive} open={open}
                    meta={hasBranches && (
                        <span className="text-[9px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                            {branches.length} branch{branches.length !== 1 ? 'es' : ''}
                        </span>
                    )}
                />
            </button>
            {open && hasBranches && (
                <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-border/40">
                    {branches.map(b => (
                        <div key={b.id} className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5 hover:bg-muted/40 transition-colors">
                            <div className="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                                <MapPin className="h-3 w-3 text-emerald-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-medium leading-tight truncate">{b.name}</p>
                                {b.headEmployeeName && (
                                    <p className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                                        <UserCircle className="h-2.5 w-2.5 shrink-0" />{b.headEmployeeName}
                                    </p>
                                )}
                            </div>
                            {b.code && <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">{b.code}</span>}
                            {!b.isActive && <Badge variant="secondary" className="text-[9px] h-4 px-1.5 shrink-0">Off</Badge>}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

function DivisionCard({ division }: { division: OrgUnitNode }) {
    const [open, setOpen] = useState(true)
    const depts = division.children.filter(c => c.type === 'department')
    const orphanBranches = division.children.filter(c => c.type === 'branch')

    return (
        <div className="rounded-xl border bg-card overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
            >
                <UnitHeader
                    icon={Layers} iconBg="bg-violet-50 border-violet-100" iconColor="text-violet-600"
                    name={division.name} code={division.code} headEmployeeName={division.headEmployeeName}
                    isActive={division.isActive} open={open}
                    meta={depts.length > 0 && (
                        <span className="text-[9px] font-medium text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                            {depts.length} dept{depts.length !== 1 ? 's' : ''}
                        </span>
                    )}
                />
            </button>
            {open && (
                <div className="px-3 pb-3 pt-1 space-y-1.5 border-t border-border/40">
                    {depts.length > 0
                        ? depts.map(dept => <DeptCard key={dept.id} dept={dept} />)
                        : orphanBranches.length === 0 && (
                            <p className="text-[11px] text-muted-foreground py-1">No departments assigned</p>
                        )
                    }
                    {orphanBranches.map(b => (
                        <div key={b.id} className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5">
                            <div className="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                                <MapPin className="h-3 w-3 text-emerald-600" />
                            </div>
                            <p className="text-xs font-medium truncate">{b.name}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

/** Top-level card for a branch node (admin full-tree view). */
function BranchPanel({ branch }: { branch: OrgUnitNode }) {
    const [open, setOpen] = useState(true)
    const divisions = branch.children.filter(c => c.type === 'division')
    const directDepts = branch.children.filter(c => c.type === 'department')
    const totalDepts = divisions.reduce((s, d) => s + d.children.filter(c => c.type === 'department').length, 0) + directDepts.length

    return (
        <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex flex-wrap items-center gap-4 px-6 py-5 text-left hover:bg-muted/20 transition-colors"
            >
                <UnitHeader
                    icon={MapPin} iconBg="bg-emerald-50 border-emerald-100" iconColor="text-emerald-600"
                    name={branch.name} code={branch.code} headEmployeeName={branch.headEmployeeName}
                    isActive={branch.isActive} open={open}
                    meta={
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {divisions.length > 0 && (
                                <span className="flex items-center gap-1 bg-muted rounded-full px-2.5 py-1 font-medium">
                                    <Layers className="h-3 w-3" />{divisions.length}
                                </span>
                            )}
                            {totalDepts > 0 && (
                                <span className="flex items-center gap-1 bg-muted rounded-full px-2.5 py-1 font-medium">
                                    <Users2 className="h-3 w-3" />{totalDepts}
                                </span>
                            )}
                        </div>
                    }
                />
            </button>
            {open && (
                <div className="border-t border-border/50 bg-muted/10 px-5 py-5">
                    {divisions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {divisions.map(div => <DivisionCard key={div.id} division={div} />)}
                        </div>
                    ) : directDepts.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                            {directDepts.map(dept => <DeptCard key={dept.id} dept={dept} />)}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground py-2">No divisions in this branch.</p>
                    )}
                </div>
            )}
        </div>
    )
}

/**
 * Lineage view for non-admin roles.
 * Always renders Branch → Division → Department (the canonical hierarchy).
 * The backend returns the scoped subtree; this component just renders it cleanly.
 */
function LineageView({ roots }: { roots: OrgUnitNode[] }) {
    if (roots.length === 0) return null

    return (
        <div className="space-y-3 max-w-2xl">
            {roots.map(branch => {
                const isBranch = branch.type === 'branch'
                const divisions = isBranch ? branch.children.filter(c => c.type === 'division') : []
                const directDepts = isBranch ? branch.children.filter(c => c.type === 'department') : []

                return (
                    <div key={branch.id} className="rounded-2xl border bg-card shadow-sm overflow-hidden">
                        {/* Branch header */}
                        <div className="flex items-center gap-3 px-5 py-4 border-b border-border/50 bg-emerald-50/30">
                            <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                                <MapPin className="h-4 w-4 text-emerald-600" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="font-semibold text-sm leading-tight">{branch.name}</p>
                                {branch.headEmployeeName && (
                                    <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                        <UserCircle className="h-3 w-3 shrink-0" />{branch.headEmployeeName}
                                    </p>
                                )}
                            </div>
                            {branch.code && (
                                <span className="text-[10px] font-mono text-muted-foreground border rounded px-1.5 py-0.5 bg-muted/50 shrink-0">
                                    {branch.code}
                                </span>
                            )}
                        </div>

                        {/* Divisions (with departments inside) */}
                        {divisions.length > 0 && (
                            <div className="px-4 py-4 space-y-3">
                                {divisions.map(div => {
                                    const depts = div.children.filter(c => c.type === 'department')
                                    return (
                                        <div key={div.id} className="rounded-xl border bg-background overflow-hidden">
                                            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 bg-violet-50/20">
                                                <div className="w-7 h-7 rounded-md bg-violet-50 border border-violet-100 flex items-center justify-center shrink-0">
                                                    <Layers className="h-3.5 w-3.5 text-violet-600" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-semibold leading-tight truncate">{div.name}</p>
                                                    {div.headEmployeeName && (
                                                        <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                                                            <UserCircle className="h-2.5 w-2.5 shrink-0" />{div.headEmployeeName}
                                                        </p>
                                                    )}
                                                </div>
                                                {div.code && <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">{div.code}</span>}
                                            </div>
                                            {depts.length > 0 ? (
                                                <div className="px-3 py-2.5 space-y-1.5">
                                                    {depts.map(dept => (
                                                        <div key={dept.id} className="flex items-center gap-2.5 rounded-lg border bg-card px-3 py-2.5">
                                                            <div className="w-6 h-6 rounded-md bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                                                                <Users2 className="h-3 w-3 text-sky-600" />
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-medium leading-tight truncate">{dept.name}</p>
                                                                {dept.headEmployeeName && (
                                                                    <p className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                                                                        <UserCircle className="h-2.5 w-2.5 shrink-0" />{dept.headEmployeeName}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            {dept.code && <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">{dept.code}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <p className="px-4 py-2.5 text-[11px] text-muted-foreground">No departments</p>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}

                        {/* Direct departments (no division between branch and dept) */}
                        {directDepts.length > 0 && (
                            <div className="px-4 py-3 space-y-1.5">
                                {directDepts.map(dept => (
                                    <div key={dept.id} className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5">
                                        <div className="w-6 h-6 rounded-md bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                                            <Users2 className="h-3 w-3 text-sky-600" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-medium leading-tight truncate">{dept.name}</p>
                                            {dept.headEmployeeName && (
                                                <p className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1">
                                                    <UserCircle className="h-2.5 w-2.5 shrink-0" />{dept.headEmployeeName}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {!isBranch && (
                            // Root was a division (no branch assigned) — render as plain division card
                            <div className="px-4 py-3 space-y-1.5">
                                {branch.children.filter(c => c.type === 'department').map(dept => (
                                    <div key={dept.id} className="flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5">
                                        <div className="w-6 h-6 rounded-md bg-sky-50 border border-sky-100 flex items-center justify-center shrink-0">
                                            <Users2 className="h-3 w-3 text-sky-600" />
                                        </div>
                                        <p className="text-xs font-medium truncate">{dept.name}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )
            })}
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
    const role = useAuthStore(s => s.user?.role)
    const isFullAccess = role === 'hr_manager' || role === 'super_admin'

    // Admin view: branches are root-level nodes; anything else is "orphan" units
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
            .filter(b => b.name.toLowerCase().includes(q) || b.children.length > 0)
    }, [branches, search])

    if (isLoading) return (
        <div className="space-y-4">
            {isFullAccess && <StatsRowSkeleton />}
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
                <p className="font-semibold text-sm">
                    {isFullAccess ? 'No structure defined yet' : 'No branch assigned yet'}
                </p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    {isFullAccess
                        ? <>Go to <strong>Organization Settings → Org Structure</strong> to add branches, divisions, and departments.</>
                        : 'Your profile has not been assigned to an org unit yet. Contact your HR manager.'
                    }
                </p>
            </div>
        </div>
    )

    // Non-admin: show the scoped lineage (Division → Department → Branch path)
    if (!isFullAccess) {
        return <LineageView roots={roots} />
    }

    return (
        <div className="space-y-5">
            {stats && (
                <StatsRow
                    branches={stats.branches}
                    divisions={stats.divisions}
                    departments={stats.departments}
                />
            )}

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

            {/* All roles see both tabs — backend scopes the data appropriately */}
            <Tabs defaultValue={isFullAccess ? 'structure' : 'reporting'}>
                <TabsList className="mb-6 bg-muted/60 p-1">
                    <TabsTrigger value="structure" className="gap-2 text-sm">
                        <GitBranch className="h-3.5 w-3.5" />
                        {isFullAccess ? 'Org Structure' : 'My Branch'}
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
        </PageWrapper>
    )
}
