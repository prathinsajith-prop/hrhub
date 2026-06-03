import { Cake, PartyPopper } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { useUpcomingBirthdays, type UpcomingBirthday } from '@/hooks/useBirthdays'
import { cn } from '@/lib/utils'

/**
 * Compact card listing colleagues whose birthday is **today**, inside the
 * user's scope (department for employees, reporting subtree for dept_heads).
 *
 * Deliberately only renders today's birthdays — upcoming ones were noisy
 * and pushed the actionable "wish them now" entries off the page. If nobody
 * has a birthday today we show a one-line "No birthdays today" message
 * rather than a long list of upcoming dates.
 */
export function BirthdaysCard({
    title = 'Birthdays today',
    className,
}: {
    title?: string
    className?: string
}) {
    // Server returns "within the next N days" — we ask for 0 so we only get
    // today's matches, then defensively filter in JS in case timezone math
    // ever drifts.
    const { data, isLoading } = useUpcomingBirthdays(0)
    const rows = (data ?? []).filter((b) => b.isToday)

    return (
        // Padding matches the rest of the right-rail siblings
        // (AttendanceSidebarCard / OpenTasksCard / WhoIsOutCard all use
        // `p-5 sm:p-6` on the card body with a `mb-3` heading). The card
        // was previously split into a separate header block with
        // `px-6 pb-3 pt-5` which broke the vertical rhythm of the rail.
        <Card className={cn('overflow-hidden border-border/70', className)}>
            <CardContent className="p-5 sm:p-6 space-y-3"><div className="flex flex-row items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                    <Cake className="size-4 text-pink-500" />
                    {title}
                </h3>
                {rows.length > 0 && (
                    <Badge className="border-0 bg-pink-600 text-[10px] uppercase tracking-wide text-white">
                        <PartyPopper className="me-1 size-3" />
                        {rows.length} {rows.length === 1 ? 'birthday' : 'birthdays'}
                    </Badge>
                )}
            </div>
                {isLoading ? (
                    Array.from({ length: 2 }).map((_, i) => (
                        <Skeleton key={i} className="h-12 w-full rounded-lg" />
                    ))
                ) : rows.length === 0 ? (
                    <EmptyState
                        icon={<Cake className="size-6 text-muted-foreground/40" />}
                        title="No birthdays today"
                        description="Check back tomorrow."
                    />
                ) : (
                    rows.map((b) => <BirthdayRow key={b.id} b={b} />)
                )}
            </CardContent>
        </Card>
    )
}

function BirthdayRow({ b }: { b: UpcomingBirthday }) {
    const initials = b.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase() ?? '')
        .join('')

    return (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 transition-colors dark:border-pink-900/60 dark:bg-pink-950/30">
            <div className="flex min-w-0 items-center gap-3">
                {b.avatarUrl ? (
                    <img
                        src={b.avatarUrl}
                        alt={b.name}
                        className="size-9 shrink-0 rounded-full object-cover ring-1 ring-border"
                    />
                ) : (
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-pink-200 to-rose-200 text-xs font-bold text-pink-700 dark:from-pink-950/60 dark:to-rose-950/60 dark:text-pink-200">
                        {initials || '?'}
                    </span>
                )}
                <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{b.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                        {b.designation || b.department || b.employeeNo || ' '}
                    </p>
                </div>
            </div>
            <Badge className="shrink-0 border-0 bg-pink-600 text-[10px] uppercase tracking-wide text-white">
                <PartyPopper className="me-1 size-3" />
                Today
            </Badge>
        </div>
    )
}
