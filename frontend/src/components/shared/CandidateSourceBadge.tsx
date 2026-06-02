/**
 * Shows where a candidate came from — referral, careers site, or added by HR.
 * Used on the recruitment kanban cards, the candidate list rows, and the
 * candidate profile header so the origin is always explicit.
 */
import { UserPlus, Globe, Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

type Source = 'direct' | 'referral' | 'careers' | undefined

export function CandidateSourceBadge({
    source,
    referredByName,
    className,
}: {
    source?: Source
    referredByName?: string | null
    className?: string
}) {
    const { t } = useTranslation()
    const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1'

    if (source === 'referral') {
        return (
            <span className={cn(base, 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:ring-violet-900/50', className)}>
                <UserPlus className="size-2.5" />
                {referredByName ? t('recruitment.source.referredBy', { name: referredByName }) : t('recruitment.source.referral')}
            </span>
        )
    }
    if (source === 'careers') {
        return (
            <span className={cn(base, 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900/50', className)}>
                <Globe className="size-2.5" />
                {t('recruitment.source.careers')}
            </span>
        )
    }
    // 'direct' / undefined → added manually by HR
    return (
        <span className={cn(base, 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50', className)}>
            <Building2 className="size-2.5" />
            {t('recruitment.source.hr')}
        </span>
    )
}
