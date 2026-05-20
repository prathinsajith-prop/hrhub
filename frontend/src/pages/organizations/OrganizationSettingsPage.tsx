import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import {
    Building2,
    Shield,
    KeyRound,
    CalendarDays,
    Briefcase,
    CalendarClock,
    GraduationCap,
    ListOrdered,
    Workflow,
    Clock,
} from 'lucide-react'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { usePermissions } from '@/hooks/usePermissions'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { OverflowTabsList } from '@/components/shared/OverflowTabsList'
import { cn } from '@/lib/utils'
import type { Permission } from '@/lib/permissions'

import { ProfileTab } from './org-settings/ProfileTab'
import { SecurityTab } from './org-settings/SecurityTab'
import { RolesPermissionsTab } from './org-settings/RolesPermissionsTab'
import { HolidaysTab } from './org-settings/HolidaysTab'
import { DesignationsTab } from './org-settings/DesignationsTab'
import { GradeLevelsTab } from './org-settings/GradeLevelsTab'
import { LeaveSettingsTab } from './org-settings/LeaveSettingsTab'
import { OnboardingTemplateTab } from './org-settings/OnboardingTemplateTab'
import { RecruitmentStagesTab } from './org-settings/RecruitmentStagesTab'
import { ShiftsTab } from './org-settings/ShiftsTab'

// ─── Tab definitions ──────────────────────────────────────────────────────────
// Label/description resolved via `t()` per-render so they react to language changes.
const TAB_KEYS = [
    { value: 'profile',       i18nKey: 'orgSettings.tabs.profile',       icon: Building2,     requires: 'manage_settings' as Permission | null },
    { value: 'designations',  i18nKey: 'orgSettings.tabs.designations',  icon: Briefcase,     requires: 'manage_settings' as Permission | null },
    { value: 'grade-levels',  i18nKey: 'orgSettings.tabs.gradeLevels',   icon: GraduationCap, requires: 'manage_settings' as Permission | null },
    { value: 'roles',         i18nKey: 'orgSettings.tabs.roles',         icon: KeyRound,      requires: 'manage_users'    as Permission | null },
    { value: 'holidays',      i18nKey: 'orgSettings.tabs.holidays',      icon: CalendarDays,  requires: 'manage_settings' as Permission | null },
    { value: 'leave',         i18nKey: 'orgSettings.tabs.leave',         icon: CalendarClock, requires: 'manage_settings' as Permission | null },
    { value: 'onboarding',    i18nKey: 'orgSettings.tabs.onboarding',    icon: ListOrdered,   requires: 'manage_settings' as Permission | null },
    { value: 'recruitment-stages', i18nKey: 'orgSettings.tabs.recruitmentStages', icon: Workflow,  requires: 'manage_settings' as Permission | null },
    { value: 'shifts',        i18nKey: 'orgSettings.tabs.shifts',        icon: Clock,         requires: 'manage_settings' as Permission | null },
    { value: 'security',      i18nKey: 'orgSettings.tabs.security',      icon: Shield,        requires: 'manage_settings' as Permission | null },
]

export function OrganizationSettingsPage() {
    const { t } = useTranslation()
    const { can } = usePermissions()
    const location = useLocation()

    const tabs = TAB_KEYS.map(tab => ({
        ...tab,
        label: t(`${tab.i18nKey}.label`),
        desc: t(`${tab.i18nKey}.desc`),
    }))

    const visibleTabs = tabs.filter(tab => tab.requires === null || can(tab.requires))

    const locationTab = (location.state as { tab?: string } | null)?.tab
    const defaultTab = (locationTab && visibleTabs.some(t => t.value === locationTab))
        ? locationTab
        : (visibleTabs[0]?.value ?? 'profile')

    const [activeTab, setActiveTab] = useState(defaultTab)

    return (
        <PageWrapper width="default">
            <PageHeader
                eyebrow={t('orgSettings.eyebrow')}
                title={t('organizations.settings', { defaultValue: 'Organization Settings' })}
                description={t('organizations.settingsDescription', { defaultValue: 'Manage your organization profile, members, and security.' })}
            />

            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                orientation="vertical"
                className="xl:grid xl:grid-cols-[240px_minmax(0,1fr)] xl:gap-8 xl:items-start"
            >
                {/* Mobile / Tablet: OverflowTabsList - same pattern as EmployeeDetailPage */}
                <div className="xl:hidden">
                    <OverflowTabsList
                        tabs={visibleTabs}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                    />
                </div>

                {/* Desktop (xl+): sticky vertical nav rail */}
                <aside className="hidden xl:block sticky top-20 self-start">
                    <div className="rounded-xl border bg-card shadow-sm p-3">
                        <nav className="flex flex-col gap-0.5">
                            {visibleTabs.map(tab => {
                                const isActive = activeTab === tab.value
                                return (
                                    <button
                                        key={tab.value}
                                        type="button"
                                        onClick={() => setActiveTab(tab.value)}
                                        className={cn(
                                            'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-start w-full',
                                            isActive
                                                ? 'bg-muted text-foreground'
                                                : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                                        )}
                                    >
                                        <tab.icon className={cn(
                                            'size-4 shrink-0 transition-colors',
                                            isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                                        )} />
                                        <div className="flex flex-col items-start min-w-0">
                                            <span className="text-sm leading-tight">{tab.label}</span>
                                            <span className="text-[11px] text-muted-foreground/80 leading-tight mt-0.5 truncate max-w-[180px]">
                                                {tab.desc}
                                            </span>
                                        </div>
                                        {isActive && (
                                            <span className="ml-auto size-1.5 rounded-full bg-primary shrink-0" />
                                        )}
                                    </button>
                                )
                            })}
                        </nav>
                    </div>
                </aside>

                {/* Content */}
                <div className="pt-6 xl:pt-0 min-w-0">
                    <TabsContent value="profile"      className="mt-0"><ProfileTab /></TabsContent>
                    <TabsContent value="designations" className="mt-0"><DesignationsTab /></TabsContent>
                    <TabsContent value="grade-levels" className="mt-0"><GradeLevelsTab /></TabsContent>
                    <TabsContent value="roles"        className="mt-0"><RolesPermissionsTab /></TabsContent>
                    <TabsContent value="holidays"     className="mt-0"><HolidaysTab /></TabsContent>
                    <TabsContent value="leave"        className="mt-0"><LeaveSettingsTab /></TabsContent>
                    <TabsContent value="onboarding"   className="mt-0"><OnboardingTemplateTab /></TabsContent>
                    <TabsContent value="recruitment-stages" className="mt-0"><RecruitmentStagesTab /></TabsContent>
                    <TabsContent value="shifts"       className="mt-0"><ShiftsTab /></TabsContent>
                    <TabsContent value="security"     className="mt-0"><SecurityTab /></TabsContent>
                </div>
            </Tabs>
        </PageWrapper>
    )
}
