import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, Clock, Sparkles } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmployeeAttendancePage } from './AttendancePage'
import { EmployeeLeavePage } from './LeavePage'
import { EmployeePerformancePage } from './PerformancePage'

const TABS = ['attendance', 'leave', 'performance'] as const
type WorkTab = (typeof TABS)[number]

/**
 * "My Work" — a single home for the employee's time + performance: attendance,
 * leave, and performance reviews. Each tab embeds the existing page (rendered
 * without its own header via the `embedded` flag), so there's one source of
 * truth per feature and no duplicated logic. The active tab is reflected in the
 * URL (`?tab=`) so it's deep-linkable and back-button friendly.
 *
 * Shift/schedule is intentionally NOT here — it's static, read-only info that
 * lives on the Profile page (see ScheduleCard there).
 */
export function EmployeeWorkPage() {
    const { t } = useTranslation()
    const [params, setParams] = useSearchParams()
    const raw = params.get('tab') ?? ''
    const tab: WorkTab = (TABS as readonly string[]).includes(raw) ? (raw as WorkTab) : 'attendance'
    const setTab = (value: string) =>
        setParams(
            (prev) => {
                const next = new URLSearchParams(prev)
                next.set('tab', value)
                return next
            },
            { replace: true },
        )

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('work.title', { defaultValue: 'My Work' })}
                subtitle={t('work.subtitle', {
                    defaultValue: 'Your attendance, leave and performance — all in one place.',
                })}
            />

            <Tabs value={tab} onValueChange={setTab} className="space-y-5">
                <TabsList className="flex w-full justify-start gap-1 overflow-x-auto sm:w-auto">
                    <TabsTrigger value="attendance" className="gap-1.5">
                        <Clock className="size-3.5" /> {t('nav.attendance')}
                    </TabsTrigger>
                    <TabsTrigger value="leave" className="gap-1.5">
                        <CalendarDays className="size-3.5" /> {t('nav.leave')}
                    </TabsTrigger>
                    <TabsTrigger value="performance" className="gap-1.5">
                        <Sparkles className="size-3.5" /> {t('nav.performance')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="attendance" className="focus-visible:outline-none">
                    <EmployeeAttendancePage embedded />
                </TabsContent>
                <TabsContent value="leave" className="focus-visible:outline-none">
                    <EmployeeLeavePage embedded />
                </TabsContent>
                <TabsContent value="performance" className="focus-visible:outline-none">
                    <EmployeePerformancePage embedded />
                </TabsContent>
            </Tabs>
        </div>
    )
}
