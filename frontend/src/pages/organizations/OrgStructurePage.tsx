import { useTranslation } from 'react-i18next'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { OrgStructureTab } from './org-settings/OrgStructureTab'

export function OrgStructurePage() {
    const { t } = useTranslation()
    return (
        <PageWrapper width="default">
            <PageHeader
                eyebrow="Organization"
                title={t('orgStructure.title', { defaultValue: 'Org Structure' })}
                description={t('orgStructure.description', { defaultValue: 'Manage branches, divisions and departments.' })}
            />
            <OrgStructureTab />
        </PageWrapper>
    )
}
