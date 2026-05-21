import { useTranslation } from 'react-i18next'
import { Bell, Eye } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import { Section } from './_shared'
import { useOrgPolicy, useUpdateOrgPolicy } from '@/hooks/useSettings'
import type { OrgPolicy } from '@/hooks/useSettings'

type PrivacyKey = keyof OrgPolicy['privacyPolicy']

/**
 * Organisation Policy tab — three groups of org-wide toggles:
 *   1. Alerts: master notification kill-switch (gates ALL outbound email).
 *   2. Employee personal information: which sensitive fields peers can see
 *      on the directory / dashboard. Employees can further opt themselves
 *      out via My Profile → Privacy; this tab sets the org default.
 *   3. Directory: whether employees are searchable across the company.
 *
 * Each toggle persists immediately (no Save button) — the underlying
 * mutation is idempotent and the perceived latency for a single field is
 * lower than a batched form.
 */
export function OrganizationPolicyTab() {
    const { t } = useTranslation()
    const { data, isLoading } = useOrgPolicy()
    const update = useUpdateOrgPolicy()

    const setNotifications = async (enabled: boolean) => {
        try {
            await update.mutateAsync({ notificationsEnabled: enabled })
            toast.success(
                enabled
                    ? t('orgSettings.policy.toast.notificationsOn', 'Notifications enabled')
                    : t('orgSettings.policy.toast.notificationsOff', 'Notifications disabled'),
                enabled
                    ? t('orgSettings.policy.toast.notificationsOnDesc', 'Outbound emails will resume.')
                    : t('orgSettings.policy.toast.notificationsOffDesc', 'No outbound emails will be sent.'),
            )
        } catch {
            toast.error(t('common.error', 'Error'), t('orgSettings.policy.toast.saveFailed', 'Could not save the change.'))
        }
    }

    const setPrivacy = async (key: PrivacyKey, value: boolean) => {
        try {
            await update.mutateAsync({ privacyPolicy: { [key]: value } })
            toast.success(t('orgSettings.policy.toast.saved', 'Saved'))
        } catch {
            toast.error(t('common.error', 'Error'), t('orgSettings.policy.toast.saveFailed', 'Could not save the change.'))
        }
    }

    return (
        <div className="space-y-5">
            <Section
                icon={Bell}
                title={t('orgSettings.policy.alertsTitle', 'Alerts')}
                description={t('orgSettings.policy.alertsDesc', 'Control whether the platform sends email notifications across the entire tenant.')}
            >
                {isLoading ? (
                    <Skeleton className="h-16 w-full" />
                ) : (
                    <div className="border rounded-lg overflow-hidden">
                        <PolicyRow
                            label={t('orgSettings.policy.notifications', 'Notifications')}
                            description={t('orgSettings.policy.notificationsHint', 'Disabling stops all email communications, including reminders and approvals.')}
                            checked={data?.notificationsEnabled ?? true}
                            disabled={update.isPending}
                            onChange={setNotifications}
                        />
                    </div>
                )}
            </Section>

            <Section
                icon={Eye}
                title={t('orgSettings.policy.privacyTitle', 'Employee personal information')}
                description={t('orgSettings.policy.privacyDesc', 'Define which fields peers can see on the directory and dashboard. Employees can hide further from their own profile, but cannot reveal what you have hidden here.')}
            >
                {isLoading ? (
                    <Skeleton className="h-32 w-full" />
                ) : (
                    <div className="divide-y border rounded-lg overflow-hidden">
                        <PolicyRow
                            label={t('orgSettings.policy.birthday', 'Birthday')}
                            description={t('orgSettings.policy.birthdayHint', 'Allow employees to share their birthday on the directory and dashboard.')}
                            checked={data?.privacyPolicy.showBirthday ?? true}
                            disabled={update.isPending}
                            onChange={(v) => setPrivacy('showBirthday', v)}
                        />
                        <PolicyRow
                            label={t('orgSettings.policy.anniversary', 'Work anniversary')}
                            description={t('orgSettings.policy.anniversaryHint', 'Allow peers to see each employee’s join date and work anniversary.')}
                            checked={data?.privacyPolicy.showWorkAnniversary ?? true}
                            disabled={update.isPending}
                            onChange={(v) => setPrivacy('showWorkAnniversary', v)}
                        />
                        <PolicyRow
                            label={t('orgSettings.policy.mobile', 'Mobile number')}
                            description={t('orgSettings.policy.mobileHint', 'Show employees’ personal mobile number on the profile.')}
                            checked={data?.privacyPolicy.showMobile ?? true}
                            disabled={update.isPending}
                            onChange={(v) => setPrivacy('showMobile', v)}
                        />
                        <PolicyRow
                            label={t('orgSettings.policy.directory', 'Directory search')}
                            description={t('orgSettings.policy.directoryHint', 'Include employees in the company-wide search.')}
                            checked={data?.privacyPolicy.searchableInDirectory ?? true}
                            disabled={update.isPending}
                            onChange={(v) => setPrivacy('searchableInDirectory', v)}
                        />
                    </div>
                )}
            </Section>
        </div>
    )
}

interface PolicyRowProps {
    label: string
    description: string
    checked: boolean
    disabled?: boolean
    onChange: (v: boolean) => void
}

function PolicyRow({ label, description, checked, disabled, onChange }: PolicyRowProps) {
    return (
        <div className="flex items-start justify-between gap-4 px-4 py-3.5">
            <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            </div>
            <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
        </div>
    )
}
