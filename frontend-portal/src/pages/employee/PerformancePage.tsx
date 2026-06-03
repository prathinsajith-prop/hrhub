import { useTranslation } from 'react-i18next'

import { PageHeader } from '@/components/shared/PageHeader'
import { PerformanceCard } from '@/components/shared/PerformanceCard'

export function EmployeePerformancePage() {
    const { t } = useTranslation()
    return (
        <div className="space-y-5">
            <PageHeader
                title={t('performance.title', { defaultValue: 'Performance' })}
                subtitle={t('performance.subtitle', { defaultValue: 'Your reviews and any warnings on record' })}
            />
            <PerformanceCard variant="me" />
        </div>
    )
}
