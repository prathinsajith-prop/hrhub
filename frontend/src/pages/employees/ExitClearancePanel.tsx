// ─── Exit Clearance Panel ────────────────────────────────────────────────────
// Renders inside the Exit Detail dialog: shows the per-exit clearance items
// auto-instantiated from the offboarding-flow templates. HR managers can flip
// status here; non-HR owners can update only their own rows (enforced server
// side).

import { useTranslation } from 'react-i18next'
import { ListChecks, Check, Clock as ClockIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import { useExitClearances, useUpdateClearanceItem } from '@/hooks/useOffboardingFlow'
import { formatDate } from '@/lib/utils'

export function ExitClearancePanel({ exitId }: { exitId: string }) {
    const { t } = useTranslation()
    const { data, isLoading } = useExitClearances(exitId)
    const upd = useUpdateClearanceItem(exitId)

    if (isLoading) return <Skeleton className="h-32 w-full" />
    if (!data || data.length === 0) return null

    const completed = data.filter(i => i.status === 'completed' || i.status === 'waived').length
    const progress = Math.round((completed / data.length) * 100)

    return (
        <div className="rounded-lg border divide-y text-sm overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30">
                <ListChecks className="size-3.5 text-muted-foreground" />
                <span className="font-medium text-xs uppercase tracking-wide text-muted-foreground">
                    {t('exit.clearancePanel.title', { defaultValue: 'Clearance Checklist' })}
                </span>
                <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                    {completed} / {data.length}
                </span>
            </div>
            <div className="px-4 py-2.5">
                <Progress value={progress} className="h-1.5" />
            </div>
            <ul className="divide-y">
                {data.map(item => {
                    const done = item.status === 'completed' || item.status === 'waived'
                    return (
                        <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                            <div className={`size-7 rounded-full flex items-center justify-center shrink-0 ${done ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
                                {done ? <Check className="size-3.5" /> : <ClockIcon className="size-3.5" />}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className={`text-sm ${done ? 'line-through text-muted-foreground' : 'font-medium'}`}>
                                    {item.name}
                                </div>
                                {item.dueDate && (
                                    <div className="text-[11px] text-muted-foreground">
                                        {t('exit.clearancePanel.due', { defaultValue: 'Due' })} {formatDate(item.dueDate)}
                                    </div>
                                )}
                            </div>
                            <Badge
                                variant={done ? 'success' : item.status === 'in_progress' ? 'warning' : 'secondary'}
                                className="text-[10px] capitalize shrink-0"
                            >
                                {item.status.replace('_', ' ')}
                            </Badge>
                            {!done && (
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                        upd.mutate({ itemId: item.id, status: 'completed' }, {
                                            onSuccess: () => toast.success(t('exit.clearancePanel.markedDone', { defaultValue: 'Marked complete' })),
                                            onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
                                        })
                                    }}
                                    disabled={upd.isPending}
                                >
                                    <Check className="size-3 me-1" />
                                    {t('exit.clearancePanel.markDone', { defaultValue: 'Done' })}
                                </Button>
                            )}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
