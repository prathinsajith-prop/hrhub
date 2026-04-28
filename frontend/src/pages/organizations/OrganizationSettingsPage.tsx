import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import {
    Building2,
    Users,
    Shield,
    ArrowRightLeft,
    KeyRound,
    CalendarDays,
    CreditCard,
    GitBranch,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermissions } from '@/hooks/usePermissions'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import type { Permission } from '@/lib/permissions'

import { ProfileTab } from './org-settings/ProfileTab'
import { MembersTab } from './org-settings/MembersTab'
import { SecurityTab } from './org-settings/SecurityTab'
import { SwitchTab } from './org-settings/SwitchTab'
import { RolesPermissionsTab } from './org-settings/RolesPermissionsTab'
import { HolidaysTab } from './org-settings/HolidaysTab'
import { OrgStructureTab } from './org-settings/OrgStructureTab'
import { SubscriptionTab } from './org-settings/SubscriptionTab'

// ─── Page ─────────────────────────────────────────────────────────────────────
const tabs = [
    { value: 'profile', label: 'Organization Profile', desc: 'Company details & regional settings', icon: Building2, requires: 'manage_settings' as Permission | null },
    { value: 'structure', label: 'Org Structure', desc: 'Divisions, departments & branches', icon: GitBranch, requires: 'manage_settings' as Permission | null },
    { value: 'members', label: 'Users', desc: 'Users, roles & access', icon: Users, requires: 'manage_users' as Permission | null },
    { value: 'roles', label: 'Roles & Permissions', desc: 'View built-in role permissions', icon: KeyRound, requires: 'manage_users' as Permission | null },
    { value: 'holidays', label: 'Public Holidays', desc: 'Manage company-wide holidays by year', icon: CalendarDays, requires: 'manage_settings' as Permission | null },
    { value: 'subscription', label: 'Subscription', desc: 'Plan, usage & billing', icon: CreditCard, requires: 'manage_settings' as Permission | null },
    { value: 'security', label: 'Security', desc: 'Policies, IP allowlist & data', icon: Shield, requires: 'manage_settings' as Permission | null },
    { value: 'switch', label: 'Switch Organization', desc: 'Change active workspace', icon: ArrowRightLeft, requires: null as Permission | null },
]

export function OrganizationSettingsPage() {
    const { t } = useTranslation()
    const { can } = usePermissions()
    const location = useLocation()
    const visibleTabs = tabs.filter((tab) => tab.requires === null || can(tab.requires))
    const locationTab = (location.state as { tab?: string } | null)?.tab
    const defaultTab = (locationTab && visibleTabs.some(t => t.value === locationTab))
        ? locationTab
        : (visibleTabs[0]?.value ?? 'switch')

    return (
        <PageWrapper width="default">
            <PageHeader
                eyebrow="Organization"
                title={t('organizations.settings', { defaultValue: 'Organization Settings' })}
                description={t('organizations.settingsDescription', { defaultValue: 'Manage your organization profile, members, and security.' })}
            />

            <Tabs
                defaultValue={defaultTab}
                orientation="vertical"
                className="xl:grid xl:grid-cols-[240px_minmax(0,1fr)] xl:gap-8 xl:items-start"
            >
                {/* Mobile/Tablet: horizontal tabs */}
                <TabsList className="xl:hidden w-full justify-start border-b rounded-none bg-transparent p-0 h-auto gap-0 overflow-x-auto">
                    {visibleTabs.map(tab => (
                        <TabsTrigger
                            key={tab.value}
                            value={tab.value}
                            className="flex items-center gap-2 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none pb-3 px-4 text-muted-foreground data-[state=active]:text-foreground"
                        >
                            <tab.icon className="h-4 w-4" />
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>

                {/* Desktop: sticky vertical nav rail */}
                <aside className="hidden xl:block sticky top-20 self-start">
                    <div className="rounded-xl border bg-card shadow-sm p-3">
                        <TabsList className="flex flex-col items-stretch h-auto bg-transparent p-0 gap-0.5 w-full">
                            {visibleTabs.map(tab => (
                                <TabsTrigger
                                    key={tab.value}
                                    value={tab.value}
                                    className="group justify-start gap-3 px-3 py-2.5 h-auto rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none transition-colors"
                                >
                                    <tab.icon className="h-4 w-4 shrink-0 text-muted-foreground group-data-[state=active]:text-primary" />
                                    <div className="flex flex-col items-start min-w-0 text-start">
                                        <span className="text-sm leading-tight">{tab.label}</span>
                                        <span className="text-[11px] text-muted-foreground/80 group-data-[state=active]:text-muted-foreground leading-tight mt-0.5 truncate max-w-[180px]">
                                            {tab.desc}
                                        </span>
                                    </div>
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </div>
                </aside>

                {/* Content */}
                <div className="pt-6 xl:pt-0 min-w-0">
                    <TabsContent value="profile" className="mt-0"><ProfileTab /></TabsContent>
                    <TabsContent value="structure" className="mt-0"><OrgStructureTab /></TabsContent>
                    <TabsContent value="members" className="mt-0"><MembersTab /></TabsContent>
                    <TabsContent value="roles" className="mt-0"><RolesPermissionsTab /></TabsContent>
                    <TabsContent value="holidays" className="mt-0"><HolidaysTab /></TabsContent>
                    <TabsContent value="subscription" className="mt-0"><SubscriptionTab /></TabsContent>
                    <TabsContent value="security" className="mt-0"><SecurityTab /></TabsContent>
                    <TabsContent value="switch" className="mt-0"><SwitchTab /></TabsContent>
                </div>
            </Tabs>
        </PageWrapper>
    )
}
