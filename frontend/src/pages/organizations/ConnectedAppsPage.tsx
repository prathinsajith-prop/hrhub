import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import {
    Plus, Copy, RefreshCcw, AlertTriangle, RefreshCw,
    Plug2, Clock, Activity, ChevronRight, MoreHorizontal,
    ShieldCheck, Wifi, WifiOff,
} from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { Textarea } from '@/components/ui/textarea'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { ScopeMatrix } from '@/components/apps/ScopeMatrix'
import { formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const APP_COLORS = [
    'bg-violet-500', 'bg-blue-500', 'bg-emerald-500',
    'bg-amber-500', 'bg-rose-500', 'bg-cyan-500',
]
function appColor(name: string) {
    let h = 0
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff
    return APP_COLORS[h % APP_COLORS.length]
}

function truncateKey(key: string) {
    return key.length > 22 ? `${key.slice(0, 10)}…${key.slice(-8)}` : key
}

// ─── App Row ──────────────────────────────────────────────────────────────────

function AppRow({
    app,
    canManage,
    onToggle,
    onRegen,
    onDelete,
    onClick,
}: {
    app: ConnectedApp
    canManage: boolean
    onToggle: (app: ConnectedApp) => void
    onRegen: (app: ConnectedApp) => void
    onDelete: (app: ConnectedApp) => void
    onClick: (app: ConnectedApp) => void
}) {
    const { t } = useTranslation()
    const isActive = app.status === 'active'
    const visibleScopes = app.scopes.slice(0, 3)
    const extraScopes = app.scopes.length - visibleScopes.length

    return (
        <div
            onClick={() => onClick(app)}
            className="group flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-muted/40 transition-colors border-b border-border last:border-0"
        >
            {/* Icon */}
            <div className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white text-sm font-bold shadow-sm',
                appColor(app.name),
            )}>
                {app.name[0].toUpperCase()}
            </div>

            {/* Name + key */}
            <div className="min-w-0 w-48 shrink-0">
                <p className="text-sm font-semibold leading-tight truncate">{app.name}</p>
                {app.description
                    ? <p className="text-xs text-muted-foreground truncate mt-0.5">{app.description}</p>
                    : null}
                <button
                    type="button"
                    className="mt-1 flex items-center gap-1 group/key"
                    onClick={(e) => {
                        e.stopPropagation()
                        navigator.clipboard.writeText(app.appKey)
                        toast.success(t('apps.copied'))
                    }}
                    title={app.appKey}
                >
                    <code className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded group-hover/key:bg-primary/10 group-hover/key:text-primary transition-colors">
                        {truncateKey(app.appKey)}
                    </code>
                    <Copy className="h-2.5 w-2.5 text-muted-foreground/50 group-hover/key:text-primary transition-colors shrink-0" />
                </button>
            </div>

            {/* Scopes */}
            <div className="flex-1 min-w-0 flex flex-wrap gap-1 items-center">
                {app.scopes.length === 0
                    ? <span className="text-xs text-muted-foreground/60 italic">No scopes</span>
                    : visibleScopes.map((s) => (
                        <Badge key={s} variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-5 rounded-md bg-muted border-0">
                            {s}
                        </Badge>
                    ))}
                {extraScopes > 0 && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 rounded-md">
                        +{extraScopes}
                    </Badge>
                )}
            </div>

            {/* Stats */}
            <div className="hidden lg:flex items-center gap-5 shrink-0 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5 w-28">
                    <Clock className="size-3 shrink-0" />
                    <span>{app.lastUsedAt ? formatDate(app.lastUsedAt) : t('apps.never')}</span>
                </div>
                <div className="flex items-center gap-1.5 w-20">
                    <Activity className="size-3 shrink-0" />
                    <span className="tabular-nums">{(app.requestCount ?? 0).toLocaleString()} req</span>
                </div>
            </div>

            {/* Status */}
            <div className="shrink-0 flex items-center gap-1.5">
                {isActive
                    ? <Wifi className="size-3.5 text-emerald-500" />
                    : <WifiOff className="size-3.5 text-muted-foreground/50" />}
                <span className={cn('text-xs font-medium', isActive ? 'text-emerald-600' : 'text-muted-foreground')}>
                    {isActive ? 'Active' : 'Revoked'}
                </span>
            </div>

            {/* Actions */}
            {canManage ? (
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onRegen(app) }} className="gap-2">
                            <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                            {t('apps.regenerateSecret')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggle(app) }} className="gap-2">
                            {isActive
                                ? <WifiOff className="h-3.5 w-3.5 text-muted-foreground" />
                                : <Wifi className="h-3.5 w-3.5 text-muted-foreground" />}
                            {isActive ? t('apps.revoke') : t('apps.reactivate')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            onClick={(e) => { e.stopPropagation(); onDelete(app) }}
                            className="gap-2 text-destructive focus:text-destructive focus:bg-destructive/10"
                        >
                            {t('apps.delete')}
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
            )}
        </div>
    )
}

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

    return (
        <PageWrapper>
            <PageHeader
                title={t('apps.title')}
                description={t('apps.description')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />}
                            onClick={() => refetch()}
                            disabled={isFetching}
                        >
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

            {/* KPI cards — same design as dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <KpiCardCompact
                    label="Total Apps"
                    value={isLoading ? undefined : (apps?.length ?? 0)}
                    icon={Plug2}
                    color="blue"
                    loading={isLoading}
                />
                <KpiCardCompact
                    label="Active"
                    value={isLoading ? undefined : (apps?.filter(a => a.status === 'active').length ?? 0)}
                    icon={ShieldCheck}
                    color="green"
                    loading={isLoading}
                />
                <KpiCardCompact
                    label="Total Requests"
                    value={isLoading ? undefined : (apps?.reduce((s, a) => s + (a.requestCount ?? 0), 0).toLocaleString() ?? '0')}
                    icon={Activity}
                    color="cyan"
                    loading={isLoading}
                />
            </div>

            {/* App list */}
            <Card className="overflow-hidden border-border/60 shadow-sm p-0">
                <CardHeader className="px-5 py-3 border-b border-border bg-muted/30">
                    <CardTitle className="text-sm font-semibold">Apps</CardTitle>
                </CardHeader>
                {/* Column labels */}
                <div className="hidden md:flex items-center gap-4 px-5 py-2 border-b border-border/60 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/60 bg-muted/20">
                    <div className="w-10 shrink-0" />
                    <div className="w-48 shrink-0">App</div>
                    <div className="flex-1">Scopes</div>
                    <div className="hidden lg:flex items-center gap-5 shrink-0">
                        <span className="w-28">Last Used</span>
                        <span className="w-20">Requests</span>
                    </div>
                    <div className="shrink-0 w-20">Status</div>
                    {canManage && <div className="w-7 shrink-0" />}
                </div>

                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="divide-y divide-border">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="flex items-center gap-4 px-5 py-4">
                                    <Skeleton className="h-10 w-10 rounded-xl shrink-0" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-3.5 w-32" />
                                        <Skeleton className="h-3 w-48" />
                                    </div>
                                    <div className="flex gap-1.5">
                                        <Skeleton className="h-5 w-20 rounded-md" />
                                        <Skeleton className="h-5 w-20 rounded-md" />
                                    </div>
                                    <Skeleton className="h-5 w-14 rounded-full" />
                                </div>
                            ))}
                        </div>
                    ) : !apps || apps.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-4">
                                <Plug2 className="size-7 text-muted-foreground/40" />
                            </div>
                            <p className="text-sm font-semibold text-foreground">{t('common.noData')}</p>
                            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                                Create an API app to connect external systems like ERP, payroll, or analytics tools.
                            </p>
                            {canManage && (
                                <Button size="sm" className="mt-4" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={openCreate}>
                                    {t('apps.newApp')}
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div>
                            {apps.map((app) => (
                                <AppRow
                                    key={app.id}
                                    app={app}
                                    canManage={canManage}
                                    onToggle={onToggleStatus}
                                    onRegen={setRegenTarget}
                                    onDelete={setDeleteTarget}
                                    onClick={(a) => navigate(`/apps/${a.id}`)}
                                />
                            ))}
                        </div>
                    )}
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
                        <DialogDescription>{t('apps.secretRevealedDesc')}</DialogDescription>
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
