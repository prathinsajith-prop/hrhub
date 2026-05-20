import { memo } from 'react'
import { cn } from '@/lib/utils'
import { resolveStageColor, type RecruitmentStage } from '@/lib/recruitmentStages'

/**
 * Shared stage chip used across the recruitment surface (kanban column header,
 * list filter pills, candidate profile, job-detail table). All three pages
 * previously kept their own STAGE_CONFIG constant - this component is the
 * single source of truth. Stage data is fetched once via `useRecruitmentStages`
 * and passed in by parents that already need the full list anyway, so this
 * component is presentational and doesn't fetch on its own.
 */

type StageLike = Pick<RecruitmentStage, 'label' | 'colorKey'>

interface StageBadgeProps {
    stage: StageLike | undefined
    /** Show a leading colour dot. Defaults to true. */
    showDot?: boolean
    /** Append a count after the label, e.g. "Interview · 4". */
    count?: number
    /** Use the "active" highlighted style (filled bg). */
    active?: boolean
    className?: string
}

export const StageBadge = memo(function StageBadge({
    stage,
    showDot = true,
    count,
    active = false,
    className,
}: StageBadgeProps) {
    const color = resolveStageColor(stage?.colorKey)
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                active
                    ? color.bgClass
                    : 'bg-background text-muted-foreground border-border',
                className,
            )}
        >
            {showDot && <span className={cn('size-1.5 rounded-full shrink-0', color.dotClass)} />}
            <span className="truncate">{stage?.label ?? '—'}</span>
            {count !== undefined && <span className="text-muted-foreground/70">· {count}</span>}
        </span>
    )
})

/**
 * Dot-only renderer for compact contexts (e.g. inside table cells). Saves the
 * caller from importing resolveStageColor directly.
 */
export const StageDot = memo(function StageDot({ stage, className }: { stage: StageLike | undefined; className?: string }) {
    const color = resolveStageColor(stage?.colorKey)
    return <span className={cn('size-2 rounded-full inline-block', color.dotClass, className)} aria-hidden="true" />
})
