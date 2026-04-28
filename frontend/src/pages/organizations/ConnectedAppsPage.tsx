import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { type ColumnDef } from '@tanstack/react-table'
import { Plus, MoreHorizontal, Copy, RefreshCw, AlertTriangle, RefreshCcw } from 'lucide-react'
import {
    useConnectedApps,
    useCreateApp,
    useUpdateApp,
    useRegenerateAppSecret,
    useDeleteApp,
    type ConnectedApp,
} from '@/hooks/useApps'
import { usePermissions } from '@/hooks/usePermissions'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { DataTable } from '@/components/ui/data-table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { Textarea } from '@/components/ui/textarea'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { ScopeMatrix } from '@/components/apps/ScopeMatrix'
import { formatDate } from '@/lib/utils'

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ConnectedAppsPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { can } = usePermissions()
    const canManage = can('manage_apps')
    const { data: apps, isLoading, isFetching, refetch } = useConnectedApps()
    const createMut = useCreateApp()
    const updateMut = useUpdateApp()
    const regenMut = useRegenerateAppSecret()
    const deleteMut = useDeleteApp()

    const [createOpen, setCreateOpen] = useState(false)
    const [form, setForm] = useState({ name: '', description: '', ipAllowlist: '' })
    const [selectedScopes, setSelectedScopes] = useState<string[]>([])
    const [revealedSecret, setRevealedSecret] = useState<{ key: string; secret: string } | null>(null)
    const [deleteTarget, setDeleteTarget] = useState<ConnectedApp | null>(null)
    const [regenTarget, setRegenTarget] = useState<ConnectedApp | null>(null)

    const openCreate = () => {
        setForm({ name: '', description: '', ipAllowlist: '' })
        setSelectedScopes([])
        setCreateOpen(true)
    }

    const submitCreate = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            const ipAllowlist = form.ipAllowlist.split(',').map(s => s.trim()).filter(Boolean)
            const res = await createMut.mutateAsync({
                name: form.name,
                description: form.description || undefined,
                scopes: selectedScopes,
                ipAllowlist,
            })
            setRevealedSecret({ key: res.app.appKey, secret: res.appSecret })
            setCreateOpen(false)
            toast.success(t('apps.copySecretNow'))
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('apps.createFailed'))
        }
    }

    const onToggleStatus = async (app: ConnectedApp) => {
        try {
            await updateMut.mutateAsync({
                id: app.id,
                patch: { status: app.status === 'active' ? 'revoked' : 'active' },
            })
            toast.success(app.status === 'active' ? t('apps.appRevoked') : t('apps.appReactivated'))
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('common.error'))
        }
    }

    const confirmRegen = async () => {
        if (!regenTarget) return
        try {
            const res = await regenMut.mutateAsync(regenTarget.id)
            setRevealedSecret({ key: res.app.appKey, secret: res.appSecret })
            toast.success(t('apps.secretRegenerated'))
            setRegenTarget(null)
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('common.error'))
        }
    }

    const confirmDelete = async () => {
        if (!deleteTarget) return
        try {
            await deleteMut.mutateAsync(deleteTarget.id)
            toast.success(t('apps.appDeleted'))
            setDeleteTarget(null)
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('common.error'))
        }
    }

    const columns = useMemo<ColumnDef<ConnectedApp>[]>(() => [
        {
            accessorKey: 'name',
            header: t('apps.name'),
            cell: ({ row }) => (
                <div>
                    <div className="text-sm font-medium">{row.original.name}</div>
                    {row.original.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{row.original.description}</div>
                    )}
                </div>
            ),
        },
        {
            accessorKey: 'appKey',
            header: t('apps.appKey'),
            cell: ({ row }) => (
                <div className="flex items-center gap-1.5">
                    <code className="text-[11px] bg-muted rounded px-1.5 py-0.5">{row.original.appKey}</code>
                    <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(row.original.appKey); toast.success(t('apps.copied')) }}
                    >
                        <Copy className="h-3 w-3" />
                    </Button>
                </div>
            ),
            size: 280,
        },
        {
            accessorKey: 'scopes',
            header: t('apps.scopes'),
            cell: ({ row }) => (
                <div className="flex flex-wrap gap-1">
                    {row.original.scopes.length === 0
                        ? <span className="text-xs text-muted-foreground">—</span>
                        : row.original.scopes.slice(0, 3).map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px]">{s}</Badge>
                        ))}
                    {row.original.scopes.length > 3 && (
                        <Badge variant="outline" className="text-[10px]">+{row.original.scopes.length - 3}</Badge>
                    )}
                </div>
            ),
        },
        {
            accessorKey: 'status',
            header: t('apps.status'),
            cell: ({ row }) => (
                <Badge variant={row.original.status === 'active' ? 'default' : 'destructive'} className="text-[10px] capitalize">
                    {t(`team.statuses.${row.original.status}`, { defaultValue: row.original.status })}
                </Badge>
            ),
            size: 90,
        },
        {
            accessorKey: 'lastUsedAt',
            header: t('apps.lastUsed'),
            cell: ({ getValue }) => {
                const v = getValue() as string | null
                return <span className="text-xs text-muted-foreground">{v ? formatDate(v) : t('apps.never')}</span>
            },
            size: 110,
        },
        {
            accessorKey: 'requestCount',
            header: t('apps.requests'),
            cell: ({ getValue }) => <span className="text-xs tabular-nums">{(getValue() as number).toLocaleString()}</span>,
            size: 90,
        },
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => {
                if (!canManage) return null
                const app = row.original
                return (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                                <MoreHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setRegenTarget(app)}>
                                <RefreshCw className="h-3.5 w-3.5 mr-2" /> {t('apps.regenerateSecret')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onToggleStatus(app)}>
                                {app.status === 'active' ? t('apps.revoke') : t('apps.reactivate')}
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(app)}>
                                {t('apps.delete')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                )
            },
            size: 44,
        },
    ], [canManage, t])

    return (
        <PageWrapper>
            <PageHeader
                title={t('apps.title')}
                description={t('apps.description')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
                            Refresh
                        </Button>
                        {canManage && (
                            <Button size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
                                {t('apps.newApp')}
                            </Button>
                        )}
                    </div>
                }
            />

            <Card>
                <CardContent className="p-0 pt-0">
                    <DataTable
                        columns={columns}
                        data={apps ?? []}
                        isLoading={isLoading}
                        emptyMessage={t('common.noData')}
                        onRowClick={(row: ConnectedApp) => navigate(`/apps/${row.id}`)}
                    />
                </CardContent>
            </Card>

            {/* Create dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t('apps.createTitle')}</DialogTitle>
                        <DialogDescription>{t('apps.createDescription')}</DialogDescription>
                    </DialogHeader>
                    <form id="create-app-form" onSubmit={submitCreate} className="space-y-5">
                        <div className="space-y-1.5">
                            <Label htmlFor="app-name">{t('apps.name')} *</Label>
                            <Input
                                id="app-name"
                                placeholder="e.g. My ERP Integration"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="app-desc">{t('apps.descriptionField')}</Label>
                            <Textarea
                                id="app-desc"
                                rows={2}
                                placeholder="What does this app do?"
                                value={form.description}
                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                            />
                        </div>
                        <ScopeMatrix value={selectedScopes} onChange={setSelectedScopes} />
                        <div className="space-y-1.5">
                            <Label htmlFor="app-ip">{t('apps.ipAllowlist')}</Label>
                            <Input
                                id="app-ip"
                                placeholder={t('apps.ipAllowlistPlaceholder')}
                                value={form.ipAllowlist}
                                onChange={(e) => setForm({ ...form, ipAllowlist: e.target.value })}
                            />
                            <p className="text-xs text-muted-foreground">Leave blank to allow requests from any IP.</p>
                        </div>
                    </form>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" form="create-app-form" loading={createMut.isPending}>{t('common.add')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reveal secret modal */}
            <Dialog open={!!revealedSecret} onOpenChange={(o) => !o && setRevealedSecret(null)}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-500" /> {t('apps.secretRevealedTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('apps.secretRevealedDesc')}
                        </DialogDescription>
                    </DialogHeader>
                    {revealedSecret && (
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <Label className="text-xs">{t('apps.appKey')}</Label>
                                <div className="flex gap-2">
                                    <code className="flex-1 text-xs bg-muted rounded px-2 py-2 break-all">{revealedSecret.key}</code>
                                    <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(revealedSecret.key); toast.success(t('apps.copied')) }}>
                                        <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t('apps.appSecret')}</Label>
                                <div className="flex gap-2">
                                    <code className="flex-1 text-xs bg-muted rounded px-2 py-2 break-all">{revealedSecret.secret}</code>
                                    <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(revealedSecret.secret); toast.success(t('apps.copied')) }}>
                                        <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={() => setRevealedSecret(null)}>{t('common.close')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!deleteTarget}
                onOpenChange={(o) => !o && setDeleteTarget(null)}
                title={t('apps.deleteConfirmTitle')}
                description={t('apps.deleteConfirmDesc')}
                confirmLabel={t('apps.delete')}
                variant="destructive"
                onConfirm={confirmDelete}
            />

            <ConfirmDialog
                open={!!regenTarget}
                onOpenChange={(o) => !o && setRegenTarget(null)}
                title={t('apps.regenerateConfirmTitle')}
                description={t('apps.regenerateConfirmDesc')}
                confirmLabel={t('apps.regenerateSecret')}
                variant="warning"
                onConfirm={confirmRegen}
            />
        </PageWrapper>
    )
}
