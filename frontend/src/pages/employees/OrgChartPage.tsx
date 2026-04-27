import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { useTranslation } from 'react-i18next'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Users, GitBranch, Layers, Users2, MapPin, UserCircle } from 'lucide-react'
import { useOrgUnitTree, type OrgUnitNode } from '@/hooks/useOrgUnits'

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

function EmpCard({ node, isRoot }: { node: OrgNode; isRoot?: boolean }) {
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
}

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

// ─── Org Structure Chart ───────────────────────────────────────────────────────

const TYPE_STYLE: Record<string, { icon: React.FC<{ className?: string }>; label: string; color: string; bg: string; border: string }> = {
    division:   { icon: Layers,  label: 'Division',   color: 'text-violet-700', bg: 'bg-violet-50',   border: 'border-violet-200' },
    department: { icon: Users2,  label: 'Department', color: 'text-blue-700',   bg: 'bg-blue-50',     border: 'border-blue-200' },
    branch:     { icon: MapPin,  label: 'Branch',     color: 'text-emerald-700',bg: 'bg-emerald-50',  border: 'border-emerald-200' },
}

function StructureNode({ node, depth = 0 }: { node: OrgUnitNode; depth?: number }) {
    const style = TYPE_STYLE[node.type] ?? { icon: GitBranch, label: node.type, color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-200' }
    const Icon = style.icon

    return (
        <div className="flex flex-col items-center">
            <div className={`rounded-xl border shadow-sm p-4 min-w-[160px] max-w-[200px] text-center ${style.bg} ${style.border} ${depth === 0 ? 'shadow-md' : ''}`}>
                <div className={`w-9 h-9 rounded-lg ${style.bg} ${style.border} border flex items-center justify-center mx-auto mb-2`}>
                    <Icon className={`h-4 w-4 ${style.color}`} />
                </div>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${style.color} mb-1`}>{style.label}</p>
                <p className="font-semibold text-sm leading-tight">{node.name}</p>
                {node.code && <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{node.code}</p>}
                {node.headEmployeeName && (
                    <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-muted-foreground border-t pt-1.5">
                        <UserCircle className="h-3 w-3 shrink-0" />
                        <span className="truncate">{node.headEmployeeName}</span>
                    </div>
                )}
                {!node.isActive && <Badge variant="secondary" className="mt-1.5 text-[9px]">Inactive</Badge>}
            </div>

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
                                <StructureNode node={child} depth={depth + 1} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

function StructureChart() {
    const { data: roots = [], isLoading } = useOrgUnitTree()

    if (isLoading) return (
        <div className="flex gap-8 justify-center py-6">
            {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border p-4 w-44">
                    <Skeleton className="h-9 w-9 rounded-lg mx-auto mb-2" />
                    <Skeleton className="h-4 w-24 mx-auto mb-1" />
                    <Skeleton className="h-3 w-16 mx-auto" />
                </div>
            ))}
        </div>
    )

    if (roots.length === 0) return (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
            <GitBranch className="h-10 w-10 text-muted-foreground" />
            <div>
                <p className="font-medium text-sm">No org structure defined</p>
                <p className="text-sm text-muted-foreground mt-1">
                    Go to <strong>Organization Settings → Org Structure</strong> to add divisions, departments, and branches.
                </p>
            </div>
        </div>
    )

    return (
        <div className="overflow-x-auto py-4">
            <div className="flex gap-12 justify-center min-w-max pb-4">
                {roots.map(node => (
                    <StructureNode key={node.id} node={node} />
                ))}
            </div>
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
                <TabsList className="mb-4">
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
