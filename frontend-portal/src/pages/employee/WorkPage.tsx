import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, CalendarDays, Clock, Sparkles } from 'lucide-react'

import { PageHeader } from '@/components/shared/PageHeader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScheduleCard } from '@/components/shared/ScheduleCard'
import { useMyEmployee } from '@/hooks/useMe'
import { EmployeeAttendancePage } from './AttendancePage'
import { EmployeeLeavePage } from './LeavePage'
import { EmployeePerformancePage } from './PerformancePage'

const TABS = ['attendance', 'schedule', 'leave', 'performance'] as const
type WorkTab = (typeof TABS)[number]

/**
 * "My Work" — a single home for the employee's time + performance: attendance,
 * schedule (assigned shift + weekly off), leave, and performance reviews. Each
 * tab embeds the existing page (rendered without its own header via the
 * `embedded` flag), so there's one source of truth per feature. The active tab
 * is reflected in the URL (`?tab=`) so it's deep-linkable and back-friendly.
 *
 * Schedule lives here (not on Profile) so all of an employee's time-related
 * info sits together; the Profile page is for personal/contact details.
 */
export function EmployeeWorkPage() {
    const { t } = useTranslation()
    const { data: me } = useMyEmployee()
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
                    defaultValue: 'Your schedule, attendance, leave and performance — all in one place.',
                })}
            />

            <Tabs value={tab} onValueChange={setTab} className="space-y-5">
                <TabsList variant="underline">
                    <TabsTrigger value="attendance">
                        <Clock className="size-3.5" /> {t('nav.attendance')}
                    </TabsTrigger>
                    <TabsTrigger value="schedule">
                        <CalendarClock className="size-3.5" /> {t('profile.schedule', { defaultValue: 'Schedule' })}
                    </TabsTrigger>
                    <TabsTrigger value="leave">
                        <CalendarDays className="size-3.5" /> {t('nav.leave')}
                    </TabsTrigger>
                    <TabsTrigger value="performance">
                        <Sparkles className="size-3.5" /> {t('nav.performance')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="attendance" className="focus-visible:outline-none">
                    <EmployeeAttendancePage embedded />
                </TabsContent>
                <TabsContent value="schedule" className="focus-visible:outline-none">
                    {/* The employee's assigned shift — working hours + weekly off. */}
                    <div className="max-w-xl">
                        <ScheduleCard shift={me?.shift ?? null} />
                    </div>
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
