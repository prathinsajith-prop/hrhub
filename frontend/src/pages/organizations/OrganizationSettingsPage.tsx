import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import {
    Building2,
    Shield,
    KeyRound,
    CalendarDays,
    CreditCard,
    Briefcase,
    CalendarClock,
    GraduationCap,
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
import { SubscriptionTab } from './org-settings/SubscriptionTab'
import { LeaveSettingsTab } from './org-settings/LeaveSettingsTab'

// ─── Tab definitions ──────────────────────────────────────────────────────────
const tabs = [
    { value: 'profile',       label: 'Organization Profile', desc: 'Company details & regional settings',    icon: Building2,     requires: 'manage_settings' as Permission | null },
    { value: 'designations',  label: 'Designations',         desc: 'Job titles & designations',               icon: Briefcase,     requires: 'manage_settings' as Permission | null },
    { value: 'grade-levels',  label: 'Grade Levels',         desc: 'Employee grade & band configuration',     icon: GraduationCap, requires: 'manage_settings' as Permission | null },
    { value: 'roles',         label: 'Roles & Permissions',  desc: 'View built-in role permissions',          icon: KeyRound,      requires: 'manage_users'    as Permission | null },
    { value: 'holidays',      label: 'Public Holidays',      desc: 'Manage company-wide holidays by year',    icon: CalendarDays,  requires: 'manage_settings' as Permission | null },
    { value: 'leave',         label: 'Leave Settings',       desc: 'Rollover gate & leave policies',          icon: CalendarClock, requires: 'manage_settings' as Permission | null },
    { value: 'subscription',  label: 'Subscription',         desc: 'Plan, usage & billing',                   icon: CreditCard,    requires: 'manage_settings' as Permission | null },
    { value: 'security',      label: 'Security',             desc: 'Policies, IP allowlist & data',           icon: Shield,        requires: 'manage_settings' as Permission | null },
]

export function OrganizationSettingsPage() {
    const { t } = useTranslation()
    const { can } = usePermissions()
    const location = useLocation()

    const visibleTabs = tabs.filter(tab => tab.requires === null || can(tab.requires))

    const locationTab = (location.state as { tab?: string } | null)?.tab
    const defaultTab = (locationTab && visibleTabs.some(t => t.value === locationTab))
        ? locationTab
        : (visibleTabs[0]?.value ?? 'switch')

    const [activeTab, setActiveTab] = useState(defaultTab)

    return (
        <PageWrapper width="default">
            <PageHeader
                eyebrow="Organization"
                title={t('organizations.settings', { defaultValue: 'Organization Settings' })}
                description={t('organizations.settingsDescription', { defaultValue: 'Manage your organization profile, members, and security.' })}
            />

            <Tabs
                value={activeTab}
                onValueChange={setActiveTab}
                orientation="vertical"
                className="xl:grid xl:grid-cols-[240px_minmax(0,1fr)] xl:gap-8 xl:items-start"
            >
                {/* Mobile / Tablet: OverflowTabsList — same pattern as EmployeeDetailPage */}
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
                                            'h-4 w-4 shrink-0 transition-colors',
                                            isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
                                        )} />
                                        <div className="flex flex-col items-start min-w-0">
                                            <span className="text-sm leading-tight">{tab.label}</span>
                                            <span className="text-[11px] text-muted-foreground/80 leading-tight mt-0.5 truncate max-w-[180px]">
                                                {tab.desc}
                                            </span>
                                        </div>
                                        {isActive && (
                                            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
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
                    <TabsContent value="subscription" className="mt-0"><SubscriptionTab /></TabsContent>
                    <TabsContent value="security"     className="mt-0"><SecurityTab /></TabsContent>
                </div>
            </Tabs>
        </PageWrapper>
    )
}
