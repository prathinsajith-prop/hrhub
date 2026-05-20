import { Crown, ShieldCheck, Users2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { useMyTeams, useEmployeeTeams, type TeamMembership } from '@/hooks/useMyTeams'
import { cn } from '@/lib/utils'

type Props =
    | { variant: 'me'; employeeId?: undefined; title?: string }
    | { variant: 'employee'; employeeId: string | undefined; title?: string }

/**
 * Card listing the team memberships for either the signed-in user
 * (`variant="me"`) or any other employee (`variant="employee"`).
 *
 * Why two variants instead of always passing an id: 'me' uses /teams/my which
 * doesn't need an employee id in the URL and so plays nicely with cached
 * auth state. 'employee' hits /teams/by-employee/:id which the backend
 * gates with `canAccessEmployee` so a regular employee can't snoop on
 * someone else's memberships by guessing IDs.
 */
export function MyTeamsCard(props: Props) {
    const title = props.title ?? (props.variant === 'me' ? 'My teams' : 'Team memberships')
    const me = useMyTeams(props.variant === 'me')
    const other = useEmployeeTeams(props.variant === 'employee' ? props.employeeId : undefined)
    const query = props.variant === 'me' ? me : other
    const teams: TeamMembership[] = query.data ?? []

    return (
        <Card className="overflow-hidden border-border/70">
            <div className="flex flex-row items-center justify-between gap-2 px-6 pb-3 pt-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Users2 className="size-4 text-indigo-500" />
                    {title}
                </h3>
                {teams.length > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                        {teams.length} {teams.length === 1 ? 'team' : 'teams'}
                    </Badge>
                )}
            </div>
            <CardContent className="space-y-2 pt-0">
                {query.isLoading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                        <Skeleton key={i} className="h-14 w-full rounded-lg" />
                    ))
                ) : teams.length === 0 ? (
                    <EmptyState
                        icon={<Users2 className="size-6 text-muted-foreground/40" />}
                        title="No team memberships"
                        description={
                            props.variant === 'me'
                                ? "You aren't on any cross-functional team yet."
                                : "Not a member of any cross-functional team."
                        }
                    />
                ) : (
                    teams.map((t) => <TeamRow key={t.id} team={t} />)
                )}
            </CardContent>
        </Card>
    )
}

function TeamRow({ team }: { team: TeamMembership }) {
    // Distinguish leadership roles visually — `manager` and `administrator`
    // get an icon + colour so the card answers "where do I lead?" at a glance.
    const isLead = team.memberRole === 'manager' || team.memberRole === 'administrator'
    const roleLabel =
        team.memberRole === 'administrator'
            ? 'Admin'
            : team.memberRole === 'manager'
                ? 'Lead'
                : 'Member'
    const RoleIcon =
        team.memberRole === 'administrator' ? ShieldCheck : team.memberRole === 'manager' ? Crown : Users2

    return (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-border/70 bg-card/60 px-3 py-2.5 transition-colors hover:border-indigo-300 hover:bg-card dark:hover:border-indigo-800">
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{team.name}</span>
                    <Badge
                        className={cn(
                            'border-0 text-[10px] uppercase tracking-wide',
                            isLead
                                ? 'bg-indigo-600 text-white'
                                : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300',
                        )}
                    >
                        <RoleIcon className="me-1 size-3" />
                        {roleLabel}
                    </Badge>
                </div>
                {(team.description || team.department) && (
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {team.description ?? team.department}
                    </p>
                )}
            </div>
        </div>
    )
}
