/**
 * Small building blocks shared by the recruitment recommendation panels
 * (job → recommended candidates, candidate → recommended jobs).
 *
 * Score colour thresholds mirror the existing `ScoreBadge` on
 * CandidateProfilePage: ≥80 success/green · ≥60 warning/amber · else muted.
 * Skill chips reuse the shared `TagChip` (emerald for matched, slate for
 * missing) so the visual language stays consistent with the rest of the
 * recruitment module.
 */
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { TagChip } from '@/components/shared/JobBadges'
import { cn } from '@/lib/utils'

// Tailwind classes for a bordered match-percentage badge, keyed to the same
// thresholds used elsewhere for candidate scores.
function matchTone(score: number) {
    if (score >= 80) return 'bg-success/10 text-success border-success/20'
    if (score >= 60) return 'bg-warning/10 text-warning border-warning/20'
    return 'bg-muted text-muted-foreground border-border'
}

export function MatchScoreBadge({ score, className }: { score: number; className?: string }) {
    const { t } = useTranslation()
    return (
        <Badge
            variant="outline"
            className={cn('text-[11px] font-semibold tabular-nums px-2 py-0.5', matchTone(score), className)}
        >
            {t('recruitment.recommendations.matchPct', { defaultValue: '{{score}}% match', score })}
        </Badge>
    )
}

/**
 * Matched (emerald) + missing (slate) skill chips. Caps the number rendered
 * and shows a "+N" overflow chip so a long list doesn't blow out the layout.
 */
export function MatchSkillChips({
    matched,
    missing,
    max = 6,
}: {
    matched: string[]
    missing: string[]
    max?: number
}) {
    const { t } = useTranslation()
    if (matched.length === 0 && missing.length === 0) return null

    const matchedShown = matched.slice(0, max)
    const matchedOverflow = matched.length - matchedShown.length
    const missingShown = missing.slice(0, max)
    const missingOverflow = missing.length - missingShown.length

    return (
        <div className="space-y-1.5">
            {matchedShown.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                        {t('recruitment.recommendations.matched', { defaultValue: 'Matched' })}
                    </span>
                    {matchedShown.map((s, i) => (
                        <TagChip key={`m-${i}-${s}`} tone="emerald">{s}</TagChip>
                    ))}
                    {matchedOverflow > 0 && (
                        <span className="text-[11px] text-muted-foreground">+{matchedOverflow}</span>
                    )}
                </div>
            )}
            {missingShown.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                        {t('recruitment.recommendations.missing', { defaultValue: 'Missing' })}
                    </span>
                    {missingShown.map((s, i) => (
                        <TagChip key={`x-${i}-${s}`} tone="slate" className="opacity-80">{s}</TagChip>
                    ))}
                    {missingOverflow > 0 && (
                        <span className="text-[11px] text-muted-foreground">+{missingOverflow}</span>
                    )}
                </div>
            )}
        </div>
    )
}
