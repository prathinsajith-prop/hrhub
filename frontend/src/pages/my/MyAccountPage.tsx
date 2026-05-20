import { useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { UserCircle, CalendarDays, Receipt } from 'lucide-react'

// Tab content - imported from existing pages stripped of their outer wrapper
import { MyProfileContent } from './MyProfilePage'
import { MyLeaveContent } from './MyLeavePage'
import { MyPayslipsContent } from './MyPayslipsPage'

type TabId = 'profile' | 'leave' | 'payslips'

export function MyAccountPage() {
    const { t } = useTranslation()
    const TABS = [
        { id: 'profile' as const,  label: t('myAccount.tabProfile'),  icon: UserCircle  },
        { id: 'leave' as const,    label: t('myAccount.tabLeave'),    icon: CalendarDays },
        { id: 'payslips' as const, label: t('myAccount.tabPayslips'), icon: Receipt     },
    ]
    const [params, setParams] = useSearchParams()
    const active = (params.get('tab') ?? 'profile') as TabId
    const validTab = TABS.some(tab => tab.id === active) ? active : 'profile'

    // Correct invalid tab values in the URL silently
    useEffect(() => {
        if (validTab !== active) setParams({ tab: validTab }, { replace: true })
    }, [active, validTab, setParams])

    function switchTab(id: TabId) {
        setParams({ tab: id }, { replace: true })
    }

    return (
        <PageWrapper>
            <PageHeader
                title={t('myAccount.title')}
                description={t('myAccount.description')}
            />

            {/* Tab bar */}
            <div className="flex items-center gap-1 border-b border-border mb-6 -mt-2">
                {TABS.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        type="button"
                        onClick={() => switchTab(id)}
                        className={cn(
                            'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                            validTab === id
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                        )}
                    >
                        <Icon className="size-4" />
                        {label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {validTab === 'profile'  && <MyProfileContent />}
            {validTab === 'leave'    && <MyLeaveContent />}
            {validTab === 'payslips' && <MyPayslipsContent />}
        </PageWrapper>
    )
}
