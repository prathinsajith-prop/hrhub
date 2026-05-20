import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Briefcase, Building2, CalendarDays, ChevronRight, Mail, Phone, Search, Users } from 'lucide-react'

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
import { cn, formatDate, initialsOf } from '@/lib/utils'

// Status pill colours kept local to the team page. Mirrors the palette used
// on the MemberDetailPage hero so the visual identity is consistent
// between the list and the detail view.
const STATUS_TONE: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
    onboarding: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
    suspended: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
    terminated: 'bg-muted text-muted-foreground',
    visa_expired: 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
}

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
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
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
                    <FilterChip active={dept === ALL} onClick={() => pickDept(ALL)} icon={<Building2 className="size-3" />}>
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
                    icon={<Users className="size-8" />}
                    title={dept === ALL ? t('team.noTeam') : `No one in ${dept}`}
                />
            ) : (
                <div className="space-y-2">
                    {filteredMembers.map((m) => {
                        // Show the most useful contact + role detail in one
                        // tidy card. Empty rows hide automatically so we never
                        // render a stretch of em-dashes.
                        const phone = m.mobileNo || m.phone || null
                        return (
                            <Link key={m.id} to={ROUTES.managerMemberDetail(m.id)} className="block">
                                <Card className="border-border/70 transition-all hover:border-primary/40 hover:shadow-md">
                                    <CardContent className="flex items-center gap-3 p-3.5 sm:gap-4">
                                        <Avatar className="size-12 shrink-0">
                                            <AvatarImage src={m.avatarUrl ?? undefined} />
                                            <AvatarFallback>{initialsOf(`${m.firstName} ${m.lastName}`)}</AvatarFallback>
                                        </Avatar>

                                        <div className="min-w-0 flex-1 space-y-1">
                                            {/* Row 1 — name + status pill */}
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <span className="truncate font-semibold leading-tight">
                                                    {m.firstName} {m.lastName}
                                                </span>
                                                <Badge
                                                    className={cn(
                                                        'border-0 text-[10px] uppercase tracking-wider',
                                                        STATUS_TONE[m.status] ?? STATUS_TONE.terminated,
                                                    )}
                                                >
                                                    {m.status.replace('_', ' ')}
                                                </Badge>
                                                {m.employeeNo ? (
                                                    <span className="text-[11px] text-muted-foreground tabular-figures">
                                                        #{m.employeeNo}
                                                    </span>
                                                ) : null}
                                            </div>

                                            {/* Row 2 — designation + department */}
                                            {(m.designation || m.department) ? (
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                    {m.designation ? (
                                                        <span className="inline-flex items-center gap-1 truncate">
                                                            <Briefcase className="size-3" />
                                                            {m.designation}
                                                        </span>
                                                    ) : null}
                                                    {m.department ? (
                                                        <span className="inline-flex items-center gap-1 truncate">
                                                            <Building2 className="size-3" />
                                                            {m.department}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            ) : null}

                                            {/* Row 3 — contact + join date.
                                                Hidden on the narrowest viewport (extra rows would
                                                wrap awkwardly); shown from sm+ where there's room. */}
                                            <div className="hidden flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground sm:flex">
                                                {m.email ? (
                                                    <span className="inline-flex items-center gap-1 truncate">
                                                        <Mail className="size-3" />
                                                        {m.email}
                                                    </span>
                                                ) : null}
                                                {phone ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Phone className="size-3" />
                                                        {phone}
                                                    </span>
                                                ) : null}
                                                {m.joinDate ? (
                                                    <span className="inline-flex items-center gap-1">
                                                        <CalendarDays className="size-3" />
                                                        Joined {formatDate(m.joinDate, { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>

                                        <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 sm:block" />
                                    </CardContent>
                                </Card>
                            </Link>
                        )
                    })}
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
