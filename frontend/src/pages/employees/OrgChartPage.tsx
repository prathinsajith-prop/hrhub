import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Users } from 'lucide-react'
interface OrgNode {
    id: string
    fullName: string
    designation?: string
    department?: string
    status: string
    children: OrgNode[]
}

function OrgCard({ node, depth = 0 }: { node: OrgNode; depth?: number }) {
    return (
        <div className="flex flex-col items-center">
            <Card className="p-3 text-center min-w-[140px] max-w-[160px] border shadow-sm">
                <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2 text-primary font-bold text-sm">
                    {node.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <p className="font-semibold text-xs leading-tight">{node.fullName}</p>
                {node.designation && <p className="text-xs text-muted-foreground mt-0.5 truncate">{node.designation}</p>}
                {node.department && <p className="text-xs text-primary/70 mt-0.5">{node.department}</p>}
            </Card>
            {node.children.length > 0 && (
                <div className="flex flex-col items-center">
                    <div className="w-px h-6 bg-border" />
                    <div className="flex gap-4 items-start">
                        {node.children.map((child) => (
                            <div key={child.id} className="flex flex-col items-center">
                                {node.children.length > 1 && (
                                    <div className="h-px w-full bg-border mb-0" />
                                )}
                                <div className="w-px h-4 bg-border" />
                                <OrgCard node={child} depth={depth + 1} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}

export function OrgChartPage() {
    const { data: roots, isLoading } = useQuery({
        queryKey: ['org-chart'],
        queryFn: () => api.get<OrgNode[]>('/employees/org-chart'),
    })

    const list = Array.isArray(roots) ? roots : []

    return (
        <PageWrapper>
            <PageHeader
                title="Org Chart"
                description="Visual organizational hierarchy of your company"
            />

            {isLoading && <p className="text-muted-foreground text-sm">Loading org chart...</p>}

            {!isLoading && list.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-16">
                    <Users className="h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground text-sm">No employees found. Add employees to see the org chart.</p>
                </div>
            )}

            <div className="overflow-x-auto py-4">
                <div className="flex gap-8 justify-center min-w-max">
                    {list.map((node: OrgNode) => (
                        <OrgCard key={node.id} node={node} />
                    ))}
                </div>
            </div>
        </PageWrapper>
    )
}
