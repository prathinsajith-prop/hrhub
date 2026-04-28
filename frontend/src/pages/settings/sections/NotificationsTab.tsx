import { useState, useEffect } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/overlays'
import { useNotifPrefs, useUpdateNotifPrefs } from '@/hooks/useSettings'
import { SettingsCard } from './_shared'

// ─── Notifications Tab ────────────────────────────────────────────────────────
const notifGroups = [
    {
        title: 'Visa & Compliance',
        items: [
            { id: 'visa_expiry', label: 'Visa expiry reminders', desc: 'Alerts 30, 14, 7 days before expiry', email: true, push: true },
            { id: 'eid_expiry', label: 'Emirates ID expiry', desc: 'Alerts before EID expires', email: true, push: true },
            { id: 'doc_missing', label: 'Missing documents', desc: 'Notify when employee docs are incomplete', email: true, push: false },
        ],
    },
    {
        title: 'Leave & Attendance',
        items: [
            { id: 'leave_request', label: 'New leave request', desc: 'When employees submit leave requests', email: true, push: true },
            { id: 'leave_approved', label: 'Leave approved/rejected', desc: 'Notify employee of decision', email: true, push: true },
        ],
    },
    {
        title: 'Payroll',
        items: [
            { id: 'payroll_ready', label: 'Payroll run ready for approval', desc: 'Monthly payroll notification', email: true, push: true },
            { id: 'wps_submitted', label: 'WPS submission confirmation', desc: 'After successful WPS upload to MOHRE', email: true, push: false },
        ],
    },
]

export function NotificationsTab() {
    const { data: savedPrefs, isLoading } = useNotifPrefs()
    const updatePrefs = useUpdateNotifPrefs()

    // Local state mirrors the server — initialised from API, changes are local until Save
    const [settings, setSettings] = useState<Record<string, boolean>>({})

    useEffect(() => {
        if (!savedPrefs) return
        const flat: Record<string, boolean> = {}
        for (const item of notifGroups.flatMap(g => g.items)) {
            flat[`${item.id}_email`] = savedPrefs[item.id]?.email ?? item.email
            flat[`${item.id}_push`] = savedPrefs[item.id]?.push ?? item.push
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSettings(flat)
    }, [savedPrefs])

    const toggle = (key: string) => setSettings(prev => ({ ...prev, [key]: !prev[key] }))

    const handleSave = async () => {
        const prefs: Record<string, { email: boolean; push: boolean }> = {}
        for (const item of notifGroups.flatMap(g => g.items)) {
            prefs[item.id] = {
                email: settings[`${item.id}_email`] ?? item.email,
                push: settings[`${item.id}_push`] ?? item.push,
            }
        }
        try {
            await updatePrefs.mutateAsync(prefs)
            toast.success('Preferences saved', 'Your notification settings have been updated.')
        } catch {
            toast.error('Save failed', 'Could not save notification preferences.')
        }
    }

    if (isLoading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>

    return (
        <div className="space-y-5">
            {notifGroups.map((group) => (
                <SettingsCard key={group.title}>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-sm font-semibold">{group.title}</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">Choose how you'd like to be notified</p>
                            </div>
                            <div className="flex items-center gap-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                                <span className="w-12 text-center">Email</span>
                                <span className="w-12 text-center">Push</span>
                            </div>
                        </div>
                        <div className="divide-y border rounded-lg overflow-hidden">
                            {group.items.map((item) => (
                                <div key={item.id} className="flex items-center gap-4 px-4 py-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium leading-tight">{item.label}</p>
                                        <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                                    </div>
                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="w-12 flex justify-center">
                                            <Switch
                                                checked={settings[`${item.id}_email`] ?? item.email}
                                                onCheckedChange={() => toggle(`${item.id}_email`)}
                                                aria-label={`${item.label} — Email`}
                                            />
                                        </div>
                                        <div className="w-12 flex justify-center">
                                            <Switch
                                                checked={settings[`${item.id}_push`] ?? item.push}
                                                onCheckedChange={() => toggle(`${item.id}_push`)}
                                                aria-label={`${item.label} — Push`}
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
                    Save Preferences
                </Button>
            </div>
        </div>
    )
}
