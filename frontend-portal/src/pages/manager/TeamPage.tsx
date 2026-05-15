import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, Search, Users } from 'lucide-react'

import { useTeam } from '@/hooks/useTeam'
import { useAuthStore } from '@/store/authStore'
import { PageHeader } from '@/components/shared/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { ROUTES } from '@/lib/routes'
import { cn, initialsOf } from '@/lib/utils'

const ALL = 'All' as const

export function ManagerTeamPage() {
    const { t } = useTranslation()
    const user = useAuthStore((s) => s.user)
    const [params, setParams] = useSearchParams()
    const initialDept = params.get('department') ?? ALL

    const [search, setSearch] = useState('')
    const [dept, setDept] = useState<string>(initialDept)
    const { data, isLoading } = useTeam({ limit: 100, search: search.trim() || undefined })

    const allMembers = (data?.data ?? []).filter((m) => m.id !== user?.employeeId)

    // Build the department filter chips from the actual team — sorted by headcount.
    const departments = useMemo(() => {
        const counts = new Map<string, number>()
        for (const m of allMembers) {
            const d = (m.department ?? '').trim() || 'Unassigned'
            counts.set(d, (counts.get(d) ?? 0) + 1)
        }
        return Array.from(counts.entries())
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
    }, [allMembers])

    const filteredMembers =
        dept === ALL
            ? allMembers
            : allMembers.filter((m) => ((m.department ?? '').trim() || 'Unassigned') === dept)

    function pickDept(next: string) {
        setDept(next)
        if (next === ALL) {
            const p = new URLSearchParams(params)
            p.delete('department')
            setParams(p, { replace: true })
        } else {
            const p = new URLSearchParams(params)
            p.set('department', next)
            setParams(p, { replace: true })
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('team.title')}
                subtitle={
                    allMembers.length > 0
                        ? `${filteredMembers.length} of ${allMembers.length} member${allMembers.length === 1 ? '' : 's'}`
                        : undefined
                }
            />

            <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t('common.search')}
                    className="h-10 pl-9"
                />
            </div>

            {/* ── Department filter chips ────────────────────────────── */}
            {departments.length > 1 ? (
                <div className="flex flex-wrap gap-1.5">
                    <FilterChip active={dept === ALL} onClick={() => pickDept(ALL)} icon={<Building2 className="h-3 w-3" />}>
                        All <span className="opacity-70">· {allMembers.length}</span>
                    </FilterChip>
                    {departments.map((d) => (
                        <FilterChip key={d.name} active={dept === d.name} onClick={() => pickDept(d.name)}>
                            {d.name} <span className="opacity-70">· {d.count}</span>
                        </FilterChip>
                    ))}
                </div>
            ) : null}

            {isLoading ? (
                <div className="space-y-2">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                </div>
            ) : filteredMembers.length === 0 ? (
                <EmptyState
                    icon={<Users className="h-8 w-8" />}
                    title={dept === ALL ? t('team.noTeam') : `No one in ${dept}`}
                />
            ) : (
                <div className="space-y-2">
                    {filteredMembers.map((m) => (
                        <Link key={m.id} to={ROUTES.managerMemberDetail(m.id)}>
                            <Card className="border-border/70 transition-all hover:border-primary/40 hover:shadow-md">
                                <CardContent className="flex items-center gap-3 p-3">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={m.avatarUrl ?? undefined} />
                                        <AvatarFallback>{initialsOf(`${m.firstName} ${m.lastName}`)}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-medium">{m.firstName} {m.lastName}</div>
                                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                            {m.designation ? <span className="truncate">{m.designation}</span> : null}
                                            {m.department ? (
                                                <span className="inline-flex items-center gap-1 truncate">
                                                    <Building2 className="h-3 w-3" />
                                                    {m.department}
                                                </span>
                                            ) : null}
                                            {!m.designation && !m.department ? <span>#{m.employeeNo}</span> : null}
                                        </div>
                                    </div>
                                    <Badge
                                        variant="secondary"
                                        className="hidden sm:inline-flex text-[10px] uppercase tracking-wider"
                                    >
                                        {m.status}
                                    </Badge>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    )
}

function FilterChip({
    active,
    onClick,
    icon,
    children,
}: {
    active: boolean
    onClick: () => void
    icon?: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all',
                active
                    ? 'border-transparent bg-gradient-to-br from-indigo-500 to-sky-500 text-white shadow-sm shadow-indigo-300/40'
                    : 'border-border bg-card/70 text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
        >
            {icon}
            {children}
        </button>
    )
}
