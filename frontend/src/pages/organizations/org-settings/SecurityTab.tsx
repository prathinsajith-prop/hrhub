import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, Globe, AlertCircle, Plus, Trash2, FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
    useIpAllowlist,
    useUpdateIpAllowlist,
    useSecuritySettings,
    useUpdateSecuritySettings,
} from '@/hooks/useSettings'
import { useDeleteTenant } from '@/hooks/useTenants'
import { useAuthStore } from '@/store/authStore'
import { ApiError } from '@/lib/api'
import { Section } from './_shared'
import { useTranslation } from 'react-i18next'

// ─── Security Tab ─────────────────────────────────────────────────────────────
function isValidCidr(value: string) {
    return /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(value)
}

export function SecurityTab() {
    const { t } = useTranslation()
    const { data: security, isLoading: secLoading } = useSecuritySettings()
    const updateSecurity = useUpdateSecuritySettings()
    const { data: ipList, isLoading: ipLoading } = useIpAllowlist()
    const updateList = useUpdateIpAllowlist()
    const [list, setList] = useState<string[]>([])
    const [newEntry, setNewEntry] = useState('')
    const tenant = useAuthStore(s => s.tenant)
    const userRole = useAuthStore(s => s.user?.role)
    const logout = useAuthStore(s => s.logout)
    const navigate = useNavigate()
    const deleteTenant = useDeleteTenant()
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [confirmName, setConfirmName] = useState('')

    const canDelete = userRole === 'super_admin'

    async function handleDeleteOrg() {
        if (!tenant?.name) return
        try {
            await deleteTenant.mutateAsync(confirmName)
            toast.success(t('orgSettings.security.orgDeleted'), t('orgSettings.security.orgDeletedDesc', { name: tenant.name }))
            setDeleteOpen(false)
            setConfirmName('')
            // Sign the user out — their JWT now points to a deleted tenant
            logout()
            navigate('/login', { replace: true })
        } catch (err) {
            toast.error(t('orgSettings.security.deleteFailed'), err instanceof ApiError ? err.message : t('orgSettings.security.deleteFailedDesc'))
        }
    }

    // Sync IP list when data loads from server — track previous value in state to avoid
    // overwriting user edits on every re-render.
    const [prevIpList, setPrevIpList] = useState<string[] | undefined>(undefined)
    if (ipList?.ipAllowlist && ipList.ipAllowlist !== prevIpList) {
        setPrevIpList(ipList.ipAllowlist)
        setList(ipList.ipAllowlist)
    }

    const handleSessionToggle = async (checked: boolean) => {
        try {
            await updateSecurity.mutateAsync({ sessionTimeoutMinutes: checked ? 480 : 0 })
        } catch {
            toast.error(t('common.error'), t('settingsDetail.security.sessionTimeoutFailed'))
        }
    }

    const handleAuditToggle = async () => {
        if (!security) return
        try {
            await updateSecurity.mutateAsync({ auditLoggingEnabled: !security.auditLoggingEnabled })
        } catch {
            toast.error(t('common.error'), t('orgSettings.security.auditToggleFailed'))
        }
    }

    const handleAddIp = async () => {
        const trimmed = newEntry.trim()
        if (!trimmed) return
        if (!isValidCidr(trimmed)) { toast.warning(t('settingsDetail.security.invalidEntry'), t('settingsDetail.security.invalidEntryDesc')); return }
        if (list.includes(trimmed)) { toast.warning(t('settingsDetail.security.duplicate'), t('settingsDetail.security.duplicateDesc')); return }
        try {
            await updateList.mutateAsync([...list, trimmed])
            setNewEntry('')
            toast.success(t('settingsDetail.security.ipAdded'), t('settingsDetail.security.ipAddedDesc', { ip: trimmed }))
        } catch {
            toast.error(t('settingsDetail.security.updateFailed'), t('settingsDetail.security.ipUpdateFailedDesc'))
        }
    }

    const handleRemoveIp = async (ip: string) => {
        try {
            await updateList.mutateAsync(list.filter(x => x !== ip))
            toast.success(t('settingsDetail.security.ipRemoved'))
        } catch {
            toast.error(t('settingsDetail.security.updateFailed'), t('settingsDetail.security.ipUpdateFailedDesc'))
        }
    }

    return (
        <div className="space-y-5">
            <Section icon={Shield} title={t('settingsDetail.security.policiesTitle')} description={t('settingsDetail.security.policiesDesc')}>
                {secLoading ? (
                    <Skeleton className="h-20 w-full" />
                ) : (
                    <div className="divide-y border rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3.5">
                            <div>
                                <p className="text-sm font-medium">{t('settingsDetail.security.sessionTimeoutTitle')}</p>
                                <p className="text-xs text-muted-foreground">
                                    {t('settingsDetail.security.sessionTimeoutActive', { minutes: security?.sessionTimeoutMinutes ?? 480 })}
                                </p>
                            </div>
                            <Switch
                                checked={(security?.sessionTimeoutMinutes ?? 480) < 1440}
                                onCheckedChange={handleSessionToggle}
                                disabled={updateSecurity.isPending}
                            />
                        </div>
                        <div className="flex items-center justify-between px-4 py-3.5">
                            <div>
                                <p className="text-sm font-medium">{t('settingsDetail.security.auditLoggingTitle')}</p>
                                <p className="text-xs text-muted-foreground">{t('orgSettings.security.auditLoggingComplianceDesc')}</p>
                            </div>
                            <Switch
                                checked={security?.auditLoggingEnabled ?? true}
                                onCheckedChange={handleAuditToggle}
                                disabled={updateSecurity.isPending}
                            />
                        </div>
                    </div>
                )}
            </Section>

            <Section icon={Globe} title={t('settingsDetail.security.ipAllowlistTitle')} description={t('orgSettings.security.ipAllowlistDesc')}>
                {ipLoading ? (
                    <Skeleton className="h-20 w-full" />
                ) : (
                    <div className="space-y-4">
                        {list.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">{t('settingsDetail.security.noIpRestrictions')}</p>
                        ) : (
                            <div className="divide-y border rounded-lg overflow-hidden">
                                {list.map(ip => (
                                    <div key={ip} className="flex items-center justify-between px-3 py-2">
                                        <span className="text-sm font-mono">{ip}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                            onClick={() => handleRemoveIp(ip)}
                                            disabled={updateList.isPending}
                                            aria-label={t('settingsDetail.security.removeIp', { ip })}
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <Input
                                placeholder="e.g. 192.168.1.0/24"
                                value={newEntry}
                                onChange={e => setNewEntry(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAddIp() }}
                                className="font-mono"
                            />
                            <Button size="sm" onClick={handleAddIp} loading={updateList.isPending} leftIcon={<Plus className="h-3.5 w-3.5" />}>
                                {t('common.add')}
                            </Button>
                        </div>
                    </div>
                )}
            </Section>

            <Section icon={AlertCircle} title={t('settingsDetail.security.dangerZoneTitle')} description={t('settingsDetail.security.dangerZoneDesc')} className="border-destructive/30">
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div className="min-w-0">
                            <p className="text-sm font-medium">{t('settingsDetail.security.exportAllData')}</p>
                            <p className="text-xs text-muted-foreground">{t('orgSettings.security.exportOrgDataDesc')}</p>
                        </div>
                        <Button variant="outline" size="sm" leftIcon={<FileText className="h-3.5 w-3.5" />} className="shrink-0">{t('common.export')}</Button>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-destructive">{t('orgSettings.security.deleteOrgTitle')}</p>
                            <p className="text-xs text-muted-foreground">
                                {canDelete
                                    ? t('orgSettings.security.deleteOrgDesc')
                                    : t('orgSettings.security.deleteOrgNoPermission')}
                            </p>
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                            className="shrink-0"
                            disabled={!canDelete}
                            onClick={() => { setConfirmName(''); setDeleteOpen(true) }}
                        >
                            {t('common.delete')}
                        </Button>
                    </div>
                </div>
            </Section>

            <Dialog open={deleteOpen} onOpenChange={(o) => { if (!o) { setDeleteOpen(false); setConfirmName('') } }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            {t('orgSettings.security.deleteOrgTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('orgSettings.security.deleteOrgDialogDesc', { name: tenant?.name ?? '' })}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-1">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
                            {t('orgSettings.security.deleteOrgWarning')}
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm-name">
                                {t('orgSettings.security.typeToConfirm', { name: tenant?.name ?? '' })}
                            </Label>
                            <Input
                                id="confirm-name"
                                value={confirmName}
                                onChange={e => setConfirmName(e.target.value)}
                                placeholder={tenant?.name ?? ''}
                                autoComplete="off"
                                className="font-mono"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setDeleteOpen(false); setConfirmName('') }}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteOrg}
                            disabled={
                                deleteTenant.isPending
                                || !tenant?.name
                                || confirmName.trim().toLowerCase() !== tenant.name.trim().toLowerCase()
                            }
                            leftIcon={deleteTenant.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        >
                            {deleteTenant.isPending ? t('orgSettings.security.deleting') : t('orgSettings.security.deleteForever')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
