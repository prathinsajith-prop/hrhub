import { useTranslation } from 'react-i18next'
import { Building2, Bell, Shield, UserCircle, Clock } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'

import { CompanyTab } from './sections/CompanyTab'
import { ProfileTab } from './sections/ProfileTab'
import { NotificationsTab } from './sections/NotificationsTab'
import { SecurityTab, ActivityTab } from './sections/SecurityTab'

// ─── Main Page ────────────────────────────────────────────────────────────────
export function SettingsPage() {
    const { t } = useTranslation()

    const tabs = [
        { value: 'profile', label: 'My Profile', icon: UserCircle, desc: 'Photo, name & department' },
        { value: 'company', label: 'Company', icon: Building2, desc: 'Profile, regional & legal info' },
        { value: 'notifications', label: 'Notifications', icon: Bell, desc: 'Email & push preferences' },
        { value: 'security', label: 'Security', icon: Shield, desc: 'Password, 2FA, IP allowlist' },
        { value: 'activity', label: 'Activity', icon: Clock, desc: 'Login & session history' },
    ] as const

    return (
        <PageWrapper width="default">
            <PageHeader
                eyebrow="Workspace"
                title={t('settings.title')}
                description={t('settings.description')}
            />

            <Tabs
                defaultValue="profile"
                orientation="vertical"
                className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-10 lg:items-start"
            >
                {/* ─── Mobile: horizontal underline tabs ────────────────────── */}
                <TabsList className="lg:hidden w-full justify-start border-b rounded-none bg-transparent p-0 h-auto gap-0 overflow-x-auto">
                    {tabs.map((tab) => (
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

                {/* ─── Desktop: sticky vertical nav rail in its own card ───── */}
                <aside className="hidden lg:block sticky top-20 self-start">
                    <div className="rounded-xl border bg-card shadow-sm p-3">
                        <TabsList className="flex flex-col items-stretch h-auto bg-transparent p-0 gap-0.5 w-full">
                            {tabs.map((tab) => (
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

                {/* ─── Content: full width, no width cap ─── */}
                <div className="pt-6 lg:pt-0">
                    <TabsContent value="profile" className="mt-0"><ProfileTab /></TabsContent>
                    <TabsContent value="company" className="mt-0"><CompanyTab /></TabsContent>
                    <TabsContent value="notifications" className="mt-0"><NotificationsTab /></TabsContent>
                    <TabsContent value="security" className="mt-0"><SecurityTab /></TabsContent>
                    <TabsContent value="activity" className="mt-0"><ActivityTab /></TabsContent>
                </div>
            </Tabs>
        </PageWrapper>
    )
}
