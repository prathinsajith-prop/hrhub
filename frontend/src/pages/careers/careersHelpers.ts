/**
 * Non-component helpers for the careers portal — kept out of careersShared.tsx
 * so that file only exports components (clean Fast Refresh boundaries).
 */
import { useTranslation } from 'react-i18next'
import { formatCurrency } from '@/lib/utils'

export function useJobTypeLabel() {
    const { t } = useTranslation()
    return (type: string) => t(`careers.type.${type}`, { defaultValue: type })
}

/** Translates workplace_type codes to display labels. Public-careers safe. */
export function useWorkplaceLabel() {
    const { t } = useTranslation()
    return (workplace: string) => t(`careers.workplace.${workplace}`, {
        defaultValue: workplace === 'on_site' ? 'On-site' : workplace === 'hybrid' ? 'Hybrid' : workplace === 'remote' ? 'Remote' : workplace,
    })
}

/** "AED 8,000 – 12,000", "From AED 8,000", or '' when no salary is set. */
export function formatSalaryRange(min: string | null, max: string | null): string {
    const lo = min ? Number(min) : null
    const hi = max ? Number(max) : null
    if (lo && hi) return `${formatCurrency(lo)} – ${formatCurrency(hi)}`
    if (lo) return formatCurrency(lo)
    if (hi) return formatCurrency(hi)
    return ''
}
