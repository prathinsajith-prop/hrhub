import { useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { cn } from '@/lib/utils'
import { UserCircle, CalendarDays, Receipt } from 'lucide-react'

// Tab content — imported from existing pages stripped of their outer wrapper
import { MyProfileContent } from './MyProfilePage'
import { MyLeaveContent } from './MyLeavePage'
import { MyPayslipsContent } from './MyPayslipsPage'

const TABS = [
    { id: 'profile',  label: 'Profile',     icon: UserCircle  },
    { id: 'leave',    label: 'Leave',        icon: CalendarDays },
    { id: 'payslips', label: 'Payslips',     icon: Receipt     },
] as const

type TabId = typeof TABS[number]['id']

export function MyAccountPage() {
    const [params, setParams] = useSearchParams()
    const active = (params.get('tab') ?? 'profile') as TabId
    const validTab = TABS.some(t => t.id === active) ? active : 'profile'

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
                title="My Account"
                description="Your personal workspace — profile, leave, and payslips in one place."
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
                        <Icon className="h-4 w-4" />
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
