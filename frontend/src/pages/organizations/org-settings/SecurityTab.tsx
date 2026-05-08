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

// ─── Security Tab ─────────────────────────────────────────────────────────────
function isValidCidr(value: string) {
    return /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/.test(value)
}

export function SecurityTab() {
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
            toast.success('Organization deleted', `${tenant.name} has been permanently removed.`)
            setDeleteOpen(false)
            setConfirmName('')
            // Sign the user out — their JWT now points to a deleted tenant
            logout()
            navigate('/login', { replace: true })
        } catch (err) {
            toast.error('Delete failed', err instanceof ApiError ? err.message : 'Could not delete organization.')
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
            toast.error('Save failed', 'Could not update session timeout.')
        }
    }

    const handleAuditToggle = async () => {
        if (!security) return
        try {
            await updateSecurity.mutateAsync({ auditLoggingEnabled: !security.auditLoggingEnabled })
        } catch {
            toast.error('Save failed', 'Could not update audit logging.')
        }
    }

    const handleAddIp = async () => {
        const trimmed = newEntry.trim()
        if (!trimmed) return
        if (!isValidCidr(trimmed)) { toast.warning('Invalid entry', 'Enter a valid IP address or CIDR range.'); return }
        if (list.includes(trimmed)) { toast.warning('Duplicate', 'This IP is already in the allowlist.'); return }
        try {
            await updateList.mutateAsync([...list, trimmed])
            setNewEntry('')
            toast.success('IP added', `${trimmed} added to allowlist.`)
        } catch {
            toast.error('Update failed', 'Could not update IP allowlist.')
        }
    }

    const handleRemoveIp = async (ip: string) => {
        try {
            await updateList.mutateAsync(list.filter(x => x !== ip))
            toast.success('IP removed')
        } catch {
            toast.error('Update failed', 'Could not update IP allowlist.')
        }
    }

    return (
        <div className="space-y-5">
            <Section icon={Shield} title="Security Policies" description="Workspace-wide protection rules">
                {secLoading ? (
                    <Skeleton className="h-20 w-full" />
                ) : (
                    <div className="divide-y border rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3.5">
                            <div>
                                <p className="text-sm font-medium">Auto Session Timeout</p>
                                <p className="text-xs text-muted-foreground">
                                    Log out after {security?.sessionTimeoutMinutes ?? 480} minutes of inactivity
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
                                <p className="text-sm font-medium">Audit Logging</p>
                                <p className="text-xs text-muted-foreground">Record all admin actions for compliance</p>
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

            <Section icon={Globe} title="IP Allowlist" description="Restrict logins to specific IP addresses or CIDR ranges. Leave empty to allow all IPs.">
                {ipLoading ? (
                    <Skeleton className="h-20 w-full" />
                ) : (
                    <div className="space-y-4">
                        {list.length === 0 ? (
                            <p className="text-sm text-muted-foreground italic">No restrictions — all IPs are allowed.</p>
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
                                            aria-label={`Remove ${ip}`}
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
                                Add
                            </Button>
                        </div>
                    </div>
                )}
            </Section>

            <Section icon={AlertCircle} title="Danger Zone" description="Irreversible workspace actions" className="border-destructive/30">
                <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div className="min-w-0">
                            <p className="text-sm font-medium">Export All Data</p>
                            <p className="text-xs text-muted-foreground">Download a complete export of your organization data</p>
                        </div>
                        <Button variant="outline" size="sm" leftIcon={<FileText className="h-3.5 w-3.5" />} className="shrink-0">Export</Button>
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/20 bg-destructive/5">
                        <div className="min-w-0">
                            <p className="text-sm font-medium text-destructive">Delete Organization</p>
                            <p className="text-xs text-muted-foreground">
                                {canDelete
                                    ? 'Permanently delete this workspace and all its data'
                                    : 'Only a super admin can delete this organization'}
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
                            Delete
                        </Button>
                    </div>
                </div>
            </Section>

            <Dialog open={deleteOpen} onOpenChange={(o) => { if (!o) { setDeleteOpen(false); setConfirmName('') } }}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="h-4 w-4" />
                            Delete Organization
                        </DialogTitle>
                        <DialogDescription>
                            This will permanently delete <span className="font-semibold text-foreground">{tenant?.name}</span> and
                            every employee, document, payroll record, and team it contains. This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-1">
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed">
                            All members will lose access immediately. You will be signed out after the deletion completes.
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="confirm-name">
                                Type <span className="font-mono font-semibold">{tenant?.name}</span> to confirm
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
                            Cancel
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
                            {deleteTenant.isPending ? 'Deleting…' : 'Delete forever'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
