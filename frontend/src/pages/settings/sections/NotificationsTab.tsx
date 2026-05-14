import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/overlays'
import { useNotifPrefs, useUpdateNotifPrefs } from '@/hooks/useSettings'
import { SettingsCard } from './_shared'
import { useTranslation } from 'react-i18next'

// ─── Notifications Tab ────────────────────────────────────────────────────────
const notifGroups = [
    {
        key: 'visaCompliance',
        titleKey: 'settingsDetail.notifications.visaComplianceTitle',
        items: [
            { id: 'visa_expiry', labelKey: 'settingsDetail.notifications.visaExpiry', descKey: 'settingsDetail.notifications.visaExpiryDesc', email: true, push: true },
            { id: 'eid_expiry', labelKey: 'settingsDetail.notifications.eidExpiry', descKey: 'settingsDetail.notifications.eidExpiryDesc', email: true, push: true },
            { id: 'doc_missing', labelKey: 'settingsDetail.notifications.docMissing', descKey: 'settingsDetail.notifications.docMissingDesc', email: true, push: false },
        ],
    },
    {
        key: 'leaveAttendance',
        titleKey: 'settingsDetail.notifications.leaveAttendanceTitle',
        items: [
            { id: 'leave_request', labelKey: 'settingsDetail.notifications.leaveRequest', descKey: 'settingsDetail.notifications.leaveRequestDesc', email: true, push: true },
            { id: 'leave_approved', labelKey: 'settingsDetail.notifications.leaveApproved', descKey: 'settingsDetail.notifications.leaveApprovedDesc', email: true, push: true },
        ],
    },
    {
        key: 'payroll',
        titleKey: 'settingsDetail.notifications.payrollTitle',
        items: [
            { id: 'payroll_ready', labelKey: 'settingsDetail.notifications.payrollReady', descKey: 'settingsDetail.notifications.payrollReadyDesc', email: true, push: true },
            { id: 'wps_submitted', labelKey: 'settingsDetail.notifications.wpsSubmitted', descKey: 'settingsDetail.notifications.wpsSubmittedDesc', email: true, push: false },
        ],
    },
]

export function NotificationsTab() {
    const { t } = useTranslation()
    const { data: savedPrefs, isLoading } = useNotifPrefs()
    const updatePrefs = useUpdateNotifPrefs()

    // Local state mirrors the server — initialised from API, changes are local until Save
    const [settings, setSettings] = useState<Record<string, boolean>>({})

    useEffect(() => {
        if (!savedPrefs) return
        const flat: Record<string, boolean> = {}
        for (const group of notifGroups) {
            for (const item of group.items) {
                flat[`${item.id}_email`] = savedPrefs[item.id]?.email ?? item.email
                flat[`${item.id}_push`] = savedPrefs[item.id]?.push ?? item.push
            }
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings(flat)
    }, [savedPrefs])

    const toggle = (key: string) => setSettings(prev => ({ ...prev, [key]: !prev[key] }))

    const handleSave = async () => {
        const prefs: Record<string, { email: boolean; push: boolean }> = {}
        for (const group of notifGroups) {
            for (const item of group.items) {
                prefs[item.id] = {
                    email: settings[`${item.id}_email`] ?? item.email,
                    push: settings[`${item.id}_push`] ?? item.push,
                }
            }
        }
        try {
            await updatePrefs.mutateAsync(prefs)
            toast.success(t('settingsDetail.notifications.prefsSaved'), t('settingsDetail.notifications.prefsSavedDesc'))
        } catch {
            toast.error(t('settingsDetail.notifications.saveFailed'), t('settingsDetail.notifications.saveFailedDesc'))
        }
    }

    if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">{t('common.loading')}</div>

    return (
        <div className="space-y-5">
            {notifGroups.map((group) => (
                <SettingsCard key={group.key}>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-semibold">{t(group.titleKey)}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">{t('settingsDetail.notifications.chooseNotification')}</p>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                <span className="w-12 text-center">{t('settingsDetail.notifications.emailLabel')}</span>
                                <span className="w-12 text-center">{t('settingsDetail.notifications.pushLabel')}</span>
                            </div>
                        </div>
                        <div className="divide-y border rounded-lg overflow-hidden">
                            {group.items.map((item) => (
                                <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium leading-tight">{t(item.labelKey)}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{t(item.descKey)}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="w-12 flex justify-center">
                                            <Switch
                                                checked={settings[`${item.id}_email`] ?? item.email}
                                                onCheckedChange={() => toggle(`${item.id}_email`)}
                                                aria-label={`${t(item.labelKey)} — ${t('settingsDetail.notifications.emailLabel')}`}
                                            />
                                        </div>
                                        <div className="w-12 flex justify-center">
                                            <Switch
                                                checked={settings[`${item.id}_push`] ?? item.push}
                                                onCheckedChange={() => toggle(`${item.id}_push`)}
                                                aria-label={`${t(item.labelKey)} — ${t('settingsDetail.notifications.pushLabel')}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </SettingsCard>
            ))}
            <div className="flex justify-end pt-2">
                <Button onClick={handleSave} loading={updatePrefs.isPending} leftIcon={<Save className="h-4 w-4" />}>
                    {t('settingsDetail.notifications.savePrefs')}
                </Button>
            </div>
        </div>
    )
}
