import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart as RechartsPie, Pie, Cell,
} from 'recharts'
import {
    ArrowLeft, RefreshCw, Edit2, KeyRound, Trash2, Activity,
    CheckCircle2, AlertTriangle, Zap, Copy, AlertCircle,
    BarChart2, TrendingUp, Layers, Globe, Hash, PieChart, ShieldCheck, ShieldOff, MoreHorizontal,
    Terminal, BookOpen, ChevronRight,
} from 'lucide-react'
import { useApp, useUpdateApp, useRegenerateAppSecret, useDeleteApp, useAppAnalytics, useAppRequestLogs, type AppRequestLog } from '@/hooks/useApps'
import { ApiError } from '@/lib/api'
import { usePermissions } from '@/hooks/usePermissions'
import { ScopeMatrix } from '@/components/apps/ScopeMatrix'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ConfirmDialog, toast } from '@/components/ui/overlays'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate, cn } from '@/lib/utils'

const TABS = ['overview', 'api-docs', 'request-logs', 'errors', 'configuration'] as const
type Tab = typeof TABS[number]

const TAB_LABELS: Record<Tab, string> = {
    'overview': 'Overview',
    'api-docs': 'API Docs',
    'request-logs': 'Request Logs',
    'errors': 'Errors',
    'configuration': 'Configuration',
}

function StatCard({
    label, value, sub, icon: Icon, iconColor,
}: {
    label: string
    value: string | number
    sub?: string
    icon: React.ElementType
    iconColor?: string
}) {
    return (
        <Card className="flex-1 min-w-0">
            <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
                        <p className="text-2xl font-bold leading-none tracking-tight">{value}</p>
                        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
                    </div>
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', iconColor ?? 'bg-muted/60')}>
                        <Icon className="h-4 w-4" />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}

function EmptyChart({ label, sub }: { label: string; sub?: string }) {
    return (
        <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <BarChart2 className="h-6 w-6 mb-2 opacity-30" />
            <p className="text-sm">{label}</p>
            {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
        </div>
    )
}

// ─── Scope → endpoint reference ───────────────────────────────────────────────
const SCOPE_ENDPOINTS: Record<string, { method: string; path: string; desc: string; params?: string[] }[]> = {
    'employees:read': [
        { method: 'GET', path: '/employees', desc: 'List all employees (paginated)', params: ['page', 'limit', 'search', 'status', 'department'] },
        { method: 'GET', path: '/employees/:id', desc: 'Get a single employee by ID' },
    ],
    'payroll:read': [
        { method: 'GET', path: '/payroll', desc: 'List payroll runs', params: ['page', 'limit', 'year'] },
        { method: 'GET', path: '/payroll/:id', desc: 'Get a specific payroll run' },
        { method: 'GET', path: '/payroll/:id/payslips', desc: 'Get all payslips for a run', params: ['page', 'limit'] },
    ],
    'leave:read': [
        { method: 'GET', path: '/leave', desc: 'List leave requests', params: ['page', 'limit', 'status', 'employeeId'] },
    ],
    'attendance:read': [
        { method: 'GET', path: '/attendance', desc: 'List attendance records', params: ['page', 'limit', 'from', 'to', 'employeeId', 'status'] },
    ],
    'documents:read': [
        { method: 'GET', path: '/documents', desc: 'List employee documents', params: ['page', 'limit', 'status', 'employeeId', 'category'] },
    ],
    'organization:read': [
        { method: 'GET', path: '/organization', desc: 'Get organization profile & headcount' },
    ],
}

// Derive the external API base from the current page URL or env
function getExtBase() {
    const env = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/api\/v1\/?$/, '')
    if (env) return `${env}/api/ext`
    return `${window.location.protocol}//${window.location.host}/api/ext`
}

function CodeBlock({ code, onCopy }: { code: string; onCopy: (s: string) => void }) {
    return (
        <div className="relative group rounded-lg bg-zinc-950 dark:bg-zinc-900 border border-zinc-800">
            <pre className="p-4 text-xs font-mono text-zinc-200 whitespace-pre-wrap overflow-x-auto leading-relaxed">{code}</pre>
            <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-white hover:bg-zinc-700"
                onClick={() => onCopy(code)}
            >
                <Copy className="h-3 w-3" />
            </Button>
        </div>
    )
}

function ApiDocsTab({
    app,
    onEditScopes,
    canManage,
    copyText,
}: {
    app: { appKey: string; scopes: string[] }
    onEditScopes: () => void
    canManage: boolean
    copyText: (s: string) => void
}) {
    const extBase = getExtBase()
    const appUrl = `${extBase}/${app.appKey}`

    const authSnippet = `curl "${appUrl}" \\
  -H "X-API-Secret: <your-secret>"`

    return (
        <div className="space-y-5">
            {/* Quick start */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Terminal className="h-4 w-4 text-muted-foreground" /> Quick Start
                    </CardTitle>
                    <CardDescription className="text-xs">
                        Your app key is embedded in the URL. Pass your secret in the <code className="text-[11px] bg-muted px-1 rounded">X-API-Secret</code> header.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Base URL (this app)</Label>
                            <div className="flex gap-2">
                                <code className="flex-1 text-xs bg-muted rounded px-3 py-2 font-mono truncate">{appUrl}</code>
                                <Button type="button" size="sm" variant="outline" onClick={() => copyText(appUrl)}>
                                    <Copy className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Required header</Label>
                            <div className="flex gap-2">
                                <code className="flex-1 text-xs bg-muted rounded px-3 py-2 font-mono truncate">X-API-Secret: &lt;your-secret&gt;</code>
                                <Button type="button" size="sm" variant="outline" onClick={() => copyText('X-API-Secret: <your-secret>')}>
                                    <Copy className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Verify your credentials — GET app info</p>
                        <CodeBlock code={authSnippet} onCopy={copyText} />
                    </div>
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 p-3 text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                        <p className="font-medium">Keep your secret safe</p>
                        <p className="opacity-80">Never expose <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded">X-API-Secret</code> in client-side code. Always call from a server or backend. Regenerate it any time from this page.</p>
                    </div>
                </CardContent>
            </Card>

            {/* Per-scope endpoint reference */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                        <div>
                            <CardTitle className="text-sm flex items-center gap-2">
                                <BookOpen className="h-4 w-4 text-muted-foreground" /> Endpoint Reference
                            </CardTitle>
                            <CardDescription className="text-xs mt-0.5">
                                Endpoints available based on this app's granted permissions.
                            </CardDescription>
                        </div>
                        {canManage && (
                            <Button variant="outline" size="sm" leftIcon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={onEditScopes}>
                                Edit Permissions
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-6">
                    {app.scopes.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">
                            No permissions granted — this app cannot access any endpoints.
                            {canManage && ' Click "Edit Permissions" to add scopes.'}
                        </p>
                    )}
                    {app.scopes.map((scope) => {
                        const endpoints = SCOPE_ENDPOINTS[scope]
                        if (!endpoints) return null
                        return (
                            <div key={scope} className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs font-mono">{scope}</Badge>
                                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-xs text-muted-foreground">{endpoints.length} endpoint{endpoints.length > 1 ? 's' : ''}</span>
                                </div>
                                <div className="space-y-3 pl-2 border-l-2 border-muted ml-1">
                                    {endpoints.map((ep) => {
                                        const fullPath = `${appUrl}${ep.path}`
                                        const snippet = ep.params
                                            ? `curl "${fullPath}?${ep.params.map((p, i) => i === 0 ? `${p}=1` : `${p}=`).join('&')}" \\\n  -H "X-API-Secret: <your-secret>"`
                                            : `curl "${fullPath}" \\\n  -H "X-API-Secret: <your-secret>"`
                                        return (
                                            <div key={ep.path} className="space-y-2">
                                                <div className="flex items-start gap-2 flex-wrap">
                                                    <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-0 font-mono">
                                                        {ep.method}
                                                    </Badge>
                                                    <div className="min-w-0">
                                                        <code className="text-xs font-mono text-foreground">{ep.path}</code>
                                                        <p className="text-xs text-muted-foreground mt-0.5">{ep.desc}</p>
                                                    </div>
                                                </div>
                                                {ep.params && (
                                                    <div className="flex flex-wrap gap-1 pl-1">
                                                        {ep.params.map(p => (
                                                            <span key={p} className="text-[10px] font-mono bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{p}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                <CodeBlock code={snippet} onCopy={copyText} />
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        )
                    })}
                    {/* Scopes the app does NOT have */}
                    {Object.keys(SCOPE_ENDPOINTS).filter(s => !app.scopes.includes(s)).length > 0 && (
                        <div className="pt-2 border-t border-border">
                            <p className="text-xs text-muted-foreground mb-2 font-medium">Not granted (returning 403)</p>
                            <div className="flex flex-wrap gap-1.5">
                                {Object.keys(SCOPE_ENDPOINTS).filter(s => !app.scopes.includes(s)).map(s => (
                                    <Badge key={s} variant="outline" className="text-[10px] font-mono text-muted-foreground opacity-60 line-through">{s}</Badge>
                                ))}
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Response shape */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Response Format</CardTitle>
                    <CardDescription className="text-xs">All list endpoints return a consistent paginated shape.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">List response</p>
                            <CodeBlock code={`{
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 42
  }
}`} onCopy={copyText} />
                        </div>
                        <div className="space-y-1.5">
                            <p className="text-xs font-medium text-muted-foreground">Error response</p>
                            <CodeBlock code={`{
  "statusCode": 403,
  "error": "Forbidden",
  "message": "This app does not have
    the 'documents:read' scope."
}`} onCopy={copyText} />
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

export function AppDetailPage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { t } = useTranslation()
    const { can } = usePermissions()
    const canManage = can('manage_apps')

    const { data: app, isLoading, refetch: refetchApp } = useApp(id)
    const { data: analytics, refetch: refetchAnalytics } = useAppAnalytics(id)
    const { data: logsData, refetch: refetchLogs } = useAppRequestLogs(id, { limit: 50 })
    const { data: errorsData, refetch: refetchErrors } = useAppRequestLogs(id, { status: 'errors', limit: 50 })

    const handleRefresh = () => {
        refetchApp()
        refetchAnalytics()
        refetchLogs()
        refetchErrors()
    }
    const updateMut = useUpdateApp()
    const regenMut = useRegenerateAppSecret()
    const deleteMut = useDeleteApp()

    const [activeTab, setActiveTab] = useState<Tab>('overview')
    const [editOpen, setEditOpen] = useState(false)
    const [editForm, setEditForm] = useState({ name: '', description: '', ipAllowlist: '' })
    const [scopeEditOpen, setScopeEditOpen] = useState(false)
    const [scopeEditValue, setScopeEditValue] = useState<string[]>([])
    const [revealedSecret, setRevealedSecret] = useState<{ key: string; secret: string } | null>(null)
    const [regenConfirm, setRegenConfirm] = useState(false)
    const [revokeConfirm, setRevokeConfirm] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState(false)

    const openEdit = () => {
        if (!app) return
        setEditForm({
            name: app.name,
            description: app.description ?? '',
            ipAllowlist: (app.ipAllowlist ?? []).join(', '),
        })
        setEditOpen(true)
    }

    const openScopeEdit = () => {
        if (!app) return
        setScopeEditValue(app.scopes ?? [])
        setScopeEditOpen(true)
    }

    const submitScopeEdit = async () => {
        if (!app) return
        try {
            await updateMut.mutateAsync({ id: app.id, patch: { scopes: scopeEditValue } })
            toast.success('Permissions updated')
            setScopeEditOpen(false)
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('common.error'))
        }
    }

    const submitEdit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!app) return
        try {
            await updateMut.mutateAsync({
                id: app.id,
                patch: {
                    name: editForm.name,
                    description: editForm.description || undefined,
                    ipAllowlist: editForm.ipAllowlist.split(',').map(s => s.trim()).filter(Boolean),
                },
            })
            toast.success('App updated')
            setEditOpen(false)
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('common.error'))
        }
    }

    const confirmRegen = async () => {
        if (!app) return
        try {
            const res = await regenMut.mutateAsync(app.id)
            setRevealedSecret({ key: res.app.appKey, secret: res.appSecret })
            setRegenConfirm(false)
            toast.success(t('apps.secretRegenerated'))
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('common.error'))
        }
    }

    const confirmRevoke = async () => {
        if (!app) return
        try {
            await updateMut.mutateAsync({ id: app.id, patch: { status: app.status === 'active' ? 'revoked' : 'active' } })
            setRevokeConfirm(false)
            toast.success(app.status === 'active' ? t('apps.appRevoked') : t('apps.appReactivated'))
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('common.error'))
        }
    }

    const confirmDelete = async () => {
        if (!app) return
        try {
            await deleteMut.mutateAsync(app.id)
            toast.success(t('apps.appDeleted'))
            navigate('/apps')
        } catch (err) {
            toast.error(err instanceof ApiError ? err.message : t('common.error'))
        }
    }

    if (isLoading) {
        return (
            <PageWrapper>
                <div className="space-y-4">
                    <Skeleton className="h-8 w-48" />
                    <Skeleton className="h-24 w-full" />
                    <div className="grid grid-cols-5 gap-3">
                        {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
                    </div>
                </div>
            </PageWrapper>
        )
    }

    if (!app) {
        return (
            <PageWrapper>
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground gap-3">
                    <AlertCircle className="h-8 w-8" />
                    <p>App not found</p>
                    <Button variant="outline" size="sm" onClick={() => navigate('/apps')}>Back to Apps</Button>
                </div>
            </PageWrapper>
        )
    }

    const isActive = app.status === 'active'

    return (
        <PageWrapper>
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
                <div className="flex items-start gap-3">
                    <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => navigate('/apps')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <h1 className="text-xl font-bold leading-tight truncate">{app.name}</h1>
                            <Badge variant={isActive ? 'default' : 'destructive'} className="text-[10px] uppercase tracking-wide">
                                {app.status}
                            </Badge>
                        </div>
                        {app.description && (
                            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{app.description}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleRefresh}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    {canManage && (
                        <>
                            <Button variant="outline" size="sm" leftIcon={<KeyRound className="h-3.5 w-3.5" />} onClick={() => setRegenConfirm(true)}>
                                Regenerate Secret
                            </Button>
                            <Button variant="outline" size="sm" leftIcon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={openScopeEdit}>
                                Permissions
                            </Button>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="icon" className="h-8 w-8">
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                    <DropdownMenuItem onClick={openEdit}>
                                        <Edit2 className="h-3.5 w-3.5 mr-2" /> Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onClick={() => setRevokeConfirm(true)}>
                                        {isActive
                                            ? <><ShieldOff className="h-3.5 w-3.5 mr-2" /> Revoke access</>
                                            : <><ShieldCheck className="h-3.5 w-3.5 mr-2" /> Reactivate app</>}
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteConfirm(true)}>
                                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete app
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </>
                    )}
                </div>
            </div>

            {/* Top stat strip */}
            <Card className="mb-5">
                <CardContent className="p-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 divide-x divide-border">
                        <div className="min-w-0 px-2 first:pl-0 last:pr-0">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">App Key</p>
                            <div className="flex items-center gap-1.5 mt-1">
                                <code className="text-xs font-mono truncate">{app.appKey}</code>
                                <Button type="button" variant="ghost" size="icon" className="h-5 w-5 shrink-0"
                                    onClick={() => { navigator.clipboard.writeText(app.appKey); toast.success(t('apps.copied')) }}>
                                    <Copy className="h-3 w-3" />
                                </Button>
                            </div>
                        </div>
                        <div className="min-w-0 px-4">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                            <Badge variant={isActive ? 'default' : 'destructive'} className="mt-1 text-[10px] uppercase tracking-wide">
                                {app.status}
                            </Badge>
                        </div>
                        <div className="min-w-0 px-4">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Created</p>
                            <p className="text-sm font-medium mt-1">{formatDate(app.createdAt)}</p>
                        </div>
                        <div className="min-w-0 px-4">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Last Active</p>
                            <p className="text-sm font-medium mt-1">{app.lastUsedAt ? formatDate(app.lastUsedAt) : 'Never'}</p>
                        </div>
                        <div className="min-w-0 px-4">
                            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Permissions</p>
                            <p className="text-sm font-medium mt-1">{app.scopes.length} granted</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Metric cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
                <StatCard
                    label="Total Requests"
                    value={(analytics?.stats.totalRequests ?? app.requestCount).toLocaleString()}
                    sub={`${analytics?.stats.last7d ?? 0} last 7d`}
                    icon={Activity}
                    iconColor="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                />
                <StatCard
                    label="Last 24 Hours"
                    value={(analytics?.stats.last24h ?? 0).toLocaleString()}
                    sub={analytics?.stats.last24h ? 'Active' : 'No recent traffic'}
                    icon={TrendingUp}
                    iconColor="bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400"
                />
                <StatCard
                    label="Success Rate"
                    value={`${analytics?.stats.successRate ?? 0}%`}
                    sub={`${(analytics?.stats.totalRequests ?? 0) - (analytics?.stats.totalErrors ?? 0)} successful`}
                    icon={CheckCircle2}
                    iconColor="bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
                />
                <StatCard
                    label="Total Errors"
                    value={(analytics?.stats.totalErrors ?? 0).toLocaleString()}
                    sub={analytics?.stats.totalErrors ? 'Check Errors tab' : 'No errors'}
                    icon={AlertTriangle}
                    iconColor="bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                />
                <StatCard
                    label="Avg Latency"
                    value={`${analytics?.stats.avgLatencyMs ?? 0}ms`}
                    sub={`${analytics?.stats.minLatencyMs ?? 0}ms – ${analytics?.stats.maxLatencyMs ?? 0}ms range`}
                    icon={Zap}
                    iconColor="bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400"
                />
            </div>

            {/* Tab nav */}
            <div className="flex gap-0 border-b border-border mb-5">
                {TABS.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                            'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                            activeTab === tab
                                ? 'border-primary text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                        )}
                    >
                        {TAB_LABELS[tab]}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {activeTab === 'overview' && (
                <div className="space-y-4">
                    {/* Traffic Over Time */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                <BarChart2 className="h-4 w-4 text-muted-foreground" /> Traffic Over Time
                            </CardTitle>
                            <CardDescription className="text-xs">Daily request volume (last 30 days)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {analytics && analytics.dailyVolume.length > 0 ? (
                                <ResponsiveContainer width="100%" height={180}>
                                    <BarChart data={analytics.dailyVolume} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                        <XAxis dataKey="date" tick={{ fontSize: 10 }}
                                            tickFormatter={(d: string) => { const [, m, day] = d.split('-'); return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m]} ${+day}` }}
                                        />
                                        <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                                        <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                                            labelFormatter={(d) => { const s = String(d); const [, m, day] = s.split('-'); return `${['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m]} ${+day}` }}
                                        />
                                        <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="Requests" />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <EmptyChart label="No data yet — make some API calls to see traffic trends." />
                            )}
                        </CardContent>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* By Path */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2"><Layers className="h-3.5 w-3.5 text-muted-foreground" /> Top Paths</CardTitle>
                                <CardDescription className="text-xs">Most-called endpoints</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {analytics && analytics.byPath.length > 0 ? (
                                    <div className="space-y-2">
                                        {analytics.byPath.slice(0, 6).map((p) => {
                                            const pct = analytics.stats.totalRequests > 0
                                                ? Math.round((p.count / analytics.stats.totalRequests) * 100)
                                                : 0
                                            return (
                                                <div key={p.path} className="flex items-center gap-2">
                                                    <code className="text-[11px] font-mono truncate flex-1 min-w-0 text-muted-foreground">{p.path}</code>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                                                        </div>
                                                        <span className="text-xs text-muted-foreground w-7 text-right">{p.count}</span>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <EmptyChart label="No data yet" />
                                )}
                            </CardContent>
                        </Card>

                        {/* Status Codes */}
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm flex items-center gap-2"><PieChart className="h-3.5 w-3.5 text-muted-foreground" /> Status Codes</CardTitle>
                                <CardDescription className="text-xs">Response code distribution</CardDescription>
                            </CardHeader>
                            <CardContent>
                                {analytics && analytics.byStatusCode.length > 0 ? (() => {
                                    const STATUS_COLORS: Record<string, string> = { '2': '#22c55e', '4': '#f59e0b', '5': '#ef4444' }
                                    const pieData = analytics.byStatusCode.map((s) => ({
                                        name: String(s.statusCode),
                                        value: s.count,
                                        color: STATUS_COLORS[String(s.statusCode)[0]] ?? '#94a3b8',
                                    }))
                                    return (
                                        <div className="flex items-center gap-4">
                                            <RechartsPie width={100} height={100}>
                                                <Pie data={pieData} dataKey="value" cx={45} cy={45} innerRadius={25} outerRadius={45}>
                                                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                                                </Pie>
                                            </RechartsPie>
                                            <div className="space-y-1.5 flex-1">
                                                {pieData.map((entry) => (
                                                    <div key={entry.name} className="flex items-center gap-2">
                                                        <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: entry.color }} />
                                                        <span className="text-xs font-mono">{entry.name}</span>
                                                        <span className="text-xs text-muted-foreground ml-auto">{entry.value}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })() : (
                                    <EmptyChart label="No data yet" />
                                )}
                            </CardContent>
                        </Card>
                    </div>

                    {/* Performance Summary */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Performance Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-4">
                                {[
                                    { label: 'Min Latency', value: `${analytics?.stats.minLatencyMs ?? 0}ms`, color: 'text-green-600' },
                                    { label: 'Avg Latency', value: `${analytics?.stats.avgLatencyMs ?? 0}ms`, color: 'text-blue-600' },
                                    { label: 'Max Latency', value: `${analytics?.stats.maxLatencyMs ?? 0}ms`, color: 'text-red-500' },
                                    { label: 'Last 24h', value: (analytics?.stats.last24h ?? 0).toLocaleString() },
                                    { label: 'Last 7 Days', value: (analytics?.stats.last7d ?? 0).toLocaleString() },
                                    { label: 'All Time', value: (analytics?.stats.totalRequests ?? app.requestCount).toLocaleString() },
                                ].map((m) => (
                                    <div key={m.label} className="text-center">
                                        <p className={cn('text-2xl font-bold', m.color ?? 'text-foreground')}>{m.value}</p>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">{m.label}</p>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {activeTab === 'api-docs' && (
                <ApiDocsTab app={app} onEditScopes={openScopeEdit} canManage={canManage} copyText={(s) => { navigator.clipboard.writeText(s); toast.success(t('apps.copied')) }} />
            )}

            {activeTab === 'request-logs' && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><Hash className="h-4 w-4 text-muted-foreground" /> Request Logs</CardTitle>
                        <CardDescription className="text-xs">Last 50 API requests from this app</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        {logsData && logsData.data.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/40">
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Method</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Path</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Latency</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">IP</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {logsData.data.map((log: AppRequestLog) => (
                                            <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                                <td className="px-4 py-2.5">
                                                    <span className="font-mono bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[10px]">{log.method}</span>
                                                </td>
                                                <td className="px-4 py-2.5 font-mono max-w-[200px] truncate text-muted-foreground">{log.path}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className={cn('font-mono px-1.5 py-0.5 rounded text-[10px]',
                                                        log.statusCode < 300 ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400' :
                                                            log.statusCode < 500 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                                                                'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                                    )}>{log.statusCode}</span>
                                                </td>
                                                <td className="px-4 py-2.5 text-muted-foreground">{log.latencyMs != null ? `${log.latencyMs}ms` : '—'}</td>
                                                <td className="px-4 py-2.5 text-muted-foreground font-mono">{log.ipAddress ?? '—'}</td>
                                                <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
                                <Hash className="h-8 w-8 opacity-30" />
                                <p className="text-sm">No request logs yet</p>
                                <p className="text-xs opacity-70">Logs will appear once this app starts making API calls.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'errors' && (
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-muted-foreground" /> Errors</CardTitle>
                        <CardDescription className="text-xs">Requests with status 400+</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        {errorsData && errorsData.data.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-border bg-muted/40">
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Method</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Path</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Status</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Latency</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">IP</th>
                                            <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Time</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {errorsData.data.map((log: AppRequestLog) => (
                                            <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                                                <td className="px-4 py-2.5">
                                                    <span className="font-mono bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 px-1.5 py-0.5 rounded text-[10px]">{log.method}</span>
                                                </td>
                                                <td className="px-4 py-2.5 font-mono max-w-[200px] truncate text-muted-foreground">{log.path}</td>
                                                <td className="px-4 py-2.5">
                                                    <span className={cn('font-mono px-1.5 py-0.5 rounded text-[10px]',
                                                        log.statusCode < 500 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400' :
                                                            'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400'
                                                    )}>{log.statusCode}</span>
                                                </td>
                                                <td className="px-4 py-2.5 text-muted-foreground">{log.latencyMs != null ? `${log.latencyMs}ms` : '—'}</td>
                                                <td className="px-4 py-2.5 text-muted-foreground font-mono">{log.ipAddress ?? '—'}</td>
                                                <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="py-20 flex flex-col items-center gap-3 text-muted-foreground">
                                <CheckCircle2 className="h-8 w-8 opacity-30" />
                                <p className="text-sm">No errors recorded</p>
                                <p className="text-xs opacity-70">Error details will appear when API calls fail.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 'configuration' && (
                <div className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex items-start justify-between gap-2">
                                <CardTitle className="text-sm">App Details</CardTitle>
                                {canManage && (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" leftIcon={<Edit2 className="h-3 w-3" />} onClick={openEdit}>
                                        Edit
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Name</Label>
                                    <p className="text-sm font-medium">{app.name}</p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Status</Label>
                                    <Badge variant={isActive ? 'default' : 'destructive'} className="text-[10px]">{app.status}</Badge>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">App Key</Label>
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs font-mono truncate max-w-[180px]">{app.appKey}</code>
                                        <Button type="button" variant="ghost" size="icon" className="h-5 w-5 shrink-0"
                                            onClick={() => { navigator.clipboard.writeText(app.appKey); toast.success(t('apps.copied')) }}>
                                            <Copy className="h-3 w-3" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Created</Label>
                                    <p className="text-sm">{formatDate(app.createdAt)}</p>
                                </div>
                            </div>
                            {app.description && (
                                <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Description</Label>
                                    <p className="text-sm">{app.description}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2">
                            <div className="flex items-start justify-between gap-2">
                                <div>
                                    <CardTitle className="text-sm">API Permissions</CardTitle>
                                    <CardDescription className="text-xs mt-0.5">{app.scopes.length} permission{app.scopes.length !== 1 ? 's' : ''} granted</CardDescription>
                                </div>
                                {canManage && (
                                    <Button variant="outline" size="sm" leftIcon={<ShieldCheck className="h-3.5 w-3.5" />} onClick={openScopeEdit}>
                                        Edit Permissions
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            {app.scopes.length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">No permissions granted — this app cannot access any API endpoints.</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {app.scopes.map((s) => <Badge key={s} variant="outline" className="text-xs font-mono">{s}</Badge>)}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm">IP Allowlist</CardTitle>
                            <CardDescription className="text-xs">Only these IPs are permitted to use this key. Leave empty to allow all IPs.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {(app.ipAllowlist ?? []).length === 0 ? (
                                <p className="text-sm text-muted-foreground italic">No restrictions — requests are accepted from any IP address.</p>
                            ) : (
                                <div className="flex flex-wrap gap-1.5">
                                    {app.ipAllowlist.map((ip) => (
                                        <Badge key={ip} variant="secondary" className="text-xs font-mono">{ip}</Badge>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {canManage && (
                        <Card className="border-destructive/40">
                            <CardHeader>
                                <CardTitle className="text-sm text-destructive">Danger Zone</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-col sm:flex-row gap-3">
                                <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10"
                                    leftIcon={<KeyRound className="h-3.5 w-3.5" />}
                                    onClick={() => setRegenConfirm(true)}>
                                    Regenerate Secret
                                </Button>
                                <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10"
                                    leftIcon={<Trash2 className="h-3.5 w-3.5" />}
                                    onClick={() => setDeleteConfirm(true)}>
                                    Delete App
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Scope edit dialog */}
            <Dialog open={scopeEditOpen} onOpenChange={setScopeEditOpen}>
                <DialogContent className="sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4" /> Edit API Permissions
                        </DialogTitle>
                        <DialogDescription>
                            Choose which modules and operations this app can access. Changes take effect immediately.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                        <ScopeMatrix value={scopeEditValue} onChange={setScopeEditValue} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setScopeEditOpen(false)}>{t('common.cancel')}</Button>
                        <Button onClick={submitScopeEdit} loading={updateMut.isPending}>Save permissions</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit App</DialogTitle>
                        <DialogDescription>Update the app's name, description, or IP allowlist.</DialogDescription>
                    </DialogHeader>
                    <form id="edit-app-form" onSubmit={submitEdit} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-name">{t('apps.name')} *</Label>
                            <Input id="edit-name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-desc">{t('apps.descriptionField')}</Label>
                            <Textarea id="edit-desc" rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="edit-ip">{t('apps.ipAllowlist')}</Label>
                            <Input id="edit-ip" placeholder={t('apps.ipAllowlistPlaceholder')} value={editForm.ipAllowlist} onChange={(e) => setEditForm({ ...editForm, ipAllowlist: e.target.value })} />
                        </div>
                    </form>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>{t('common.cancel')}</Button>
                        <Button type="submit" form="edit-app-form" loading={updateMut.isPending}>Save changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reveal secret modal */}
            <Dialog open={!!revealedSecret} onOpenChange={(o) => !o && setRevealedSecret(null)}>
                <DialogContent className="sm:max-w-md">
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
                                    <code className="flex-1 text-xs bg-muted rounded px-2 py-2 truncate">{revealedSecret.key}</code>
                                    <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(revealedSecret.key); toast.success(t('apps.copied')) }}>
                                        <Copy className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">{t('apps.appSecret')}</Label>
                                <div className="flex gap-2">
                                    <code className="flex-1 text-xs bg-muted rounded px-2 py-2 truncate">{revealedSecret.secret}</code>
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
                open={regenConfirm}
                onOpenChange={setRegenConfirm}
                title={t('apps.regenerateConfirmTitle')}
                description={t('apps.regenerateConfirmDesc')}
                confirmLabel={t('apps.regenerateSecret')}
                variant="warning"
                onConfirm={confirmRegen}
            />

            <ConfirmDialog
                open={revokeConfirm}
                onOpenChange={setRevokeConfirm}
                title={isActive ? 'Revoke app?' : 'Reactivate app?'}
                description={isActive ? 'All credentials for this app will stop working immediately.' : 'This will re-enable API access for this app.'}
                confirmLabel={isActive ? t('apps.revoke') : t('apps.reactivate')}
                variant={isActive ? 'destructive' : undefined}
                onConfirm={confirmRevoke}
            />

            <ConfirmDialog
                open={deleteConfirm}
                onOpenChange={setDeleteConfirm}
                title={t('apps.deleteConfirmTitle')}
                description={t('apps.deleteConfirmDesc')}
                confirmLabel={t('apps.delete')}
                variant="destructive"
                onConfirm={confirmDelete}
            />
        </PageWrapper>
    )
}
