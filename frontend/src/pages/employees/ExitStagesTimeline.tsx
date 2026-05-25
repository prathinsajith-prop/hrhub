// ─── Exit Stages Timeline ────────────────────────────────────────────────────
// Visualises where an exit request currently sits in the offboarding flow.
// Six discrete stages, each turning into "done" / "active" / "pending":
//   1. Submitted        — always done once the request exists
//   2. Clearance        — done when all clearance items hit terminal state
//   3. Exit Interview   — done when the employee submits at least one answer
//   4. Approval         — done when status === approved / completed
//   5. Settlement       — done when settlementPaid === true
//   6. Closed           — done when status === completed
//
// Drives both the inline list-row chip and the prominent timeline header
// inside the detail dialog. Status colours map to the same emerald / amber /
// muted palette used elsewhere in the app.

import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import type { ExitRequest } from '@/hooks/useExit'

export type StageState = 'done' | 'active' | 'pending'

export interface StageInfo {
    key: 'submitted' | 'clearance' | 'interview' | 'approval' | 'settlement' | 'closed'
    label: string
    state: StageState
}

/**
 * Pure function so it can be reused by the list-row badge as well as the
 * detail timeline. Doesn't depend on React.
 */
export function deriveStages(e: ExitRequest): StageInfo[] {
    const isRejected = e.status === 'rejected'
    const total = e.clearanceTotal ?? 0
    const done = e.clearanceCompleted ?? 0
    const clearanceDone = total > 0 && done >= total
    const isApproved = e.status === 'approved' || e.status === 'completed'
    const isCompleted = e.status === 'completed'
    const settlementPaid = !!e.settlementPaid

    // Pick the first non-done stage as "active". Rejected exits short-circuit
    // — everything after Submitted is dimmed.
    const stages: StageInfo[] = [
        { key: 'submitted', label: 'Submitted', state: 'done' },
        {
            key: 'clearance', label: 'Clearance',
            state: isRejected ? 'pending' : clearanceDone ? 'done' : total > 0 ? 'active' : 'pending',
        },
        {
            key: 'interview', label: 'Exit Interview',
            state: isRejected ? 'pending' : e.interviewSubmitted ? 'done' : 'pending',
        },
        {
            key: 'approval', label: 'Approval',
            state: isRejected ? 'pending' : isApproved ? 'done' : clearanceDone ? 'active' : 'pending',
        },
        {
            key: 'settlement', label: 'Settlement',
            state: isRejected ? 'pending' : settlementPaid ? 'done' : isApproved ? 'active' : 'pending',
        },
        {
            key: 'closed', label: 'Closed',
            state: isCompleted ? 'done' : 'pending',
        },
    ]
    return stages
}

export function ExitStagesTimeline({
    exit,
    compact,
    onStageClick,
}: {
    exit: ExitRequest
    compact?: boolean
    /** When set, each stage becomes a button that calls back with its key.
     *  Used by the detail dialog to scroll to the corresponding section. */
    onStageClick?: (stage: StageInfo['key']) => void
}) {
    const stages = deriveStages(exit)
    return (
        <div className={cn(
            'flex items-center w-full',
            compact ? 'gap-1' : 'gap-1.5',
        )}>
            {stages.map((s, idx) => {
                const isLast = idx === stages.length - 1
                return (
                    <div key={s.key} className="flex-1 flex items-center min-w-0">
                        <StageNode info={s} compact={compact} onClick={onStageClick ? () => onStageClick(s.key) : undefined} />
                        {!isLast && (
                            <span className={cn(
                                'flex-1 h-px',
                                s.state === 'done' ? 'bg-emerald-500/50' : 'bg-border',
                            )} />
                        )}
                    </div>
                )
            })}
        </div>
    )
}

function StageNode({ info, compact, onClick }: { info: StageInfo; compact?: boolean; onClick?: () => void }) {
    const tone =
        info.state === 'done'
            ? 'bg-emerald-500 text-white border-emerald-500'
            : info.state === 'active'
                ? 'bg-primary text-primary-foreground border-primary ring-4 ring-primary/15'
                : 'bg-background text-muted-foreground border-border'

    const inner = (
        <>
            <div
                className={cn(
                    'rounded-full border-2 flex items-center justify-center transition-colors',
                    compact ? 'size-3.5' : 'size-6',
                    tone,
                )}
                aria-label={`${info.label}: ${info.state}`}
            >
                {info.state === 'done' && !compact && <Check className="size-3.5" />}
            </div>
            {!compact && (
                <span className={cn(
                    'text-[10px] font-medium leading-tight whitespace-nowrap',
                    info.state === 'done' ? 'text-emerald-700 dark:text-emerald-400' :
                        info.state === 'active' ? 'text-foreground' :
                            'text-muted-foreground',
                )}>
                    {info.label}
                </span>
            )}
        </>
    )

    if (onClick) {
        return (
            <button
                type="button"
                onClick={onClick}
                className="flex flex-col items-center gap-1 shrink-0 cursor-pointer rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 hover:opacity-80 transition-opacity"
                aria-label={`Jump to ${info.label} section`}
            >
                {inner}
            </button>
        )
    }
    return <div className="flex flex-col items-center gap-1 shrink-0">{inner}</div>
}

/**
 * Lightweight inline progress chip for the list view: rounded pill with the
 * stage index ("3 / 6") + the active stage label.
 */
export function ExitProgressBadge({ exit }: { exit: ExitRequest }) {
    const stages = deriveStages(exit)
    const doneCount = stages.filter(s => s.state === 'done').length
    const active = stages.find(s => s.state === 'active') ?? stages.slice().reverse().find(s => s.state === 'done')
    const total = stages.length
    const pct = Math.round((doneCount / total) * 100)

    return (
        <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="tabular-nums font-medium text-foreground">{doneCount} / {total}</span>
                <span className="truncate">{active?.label ?? '—'}</span>
            </div>
            <div className="h-1 rounded-full bg-muted overflow-hidden w-full max-w-[140px]">
                <div
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                />
            </div>
        </div>
    )
}
