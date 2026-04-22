import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useActivityLogs, type ActivityLog } from '@/hooks/useAudit'
import {
    ClipboardList,
    Search,
    Plus,
    Pencil,
    Trash2,
    CheckCircle2,
    XCircle,
    Send,
    Eye,
    Download,
    Upload,
    LogIn,
    LogOut,
    Activity,
    User as UserIcon,
    SlidersHorizontal,
    X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ActionMeta = {
    icon: React.ComponentType<{ className?: string }>
    tile: string
    pill: string
}

const ACTION_META: Record<string, ActionMeta> = {
    create: { icon: Plus, tile: 'bg-emerald-100 text-emerald-700', pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    update: { icon: Pencil, tile: 'bg-blue-100 text-blue-700', pill: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200' },
    delete: { icon: Trash2, tile: 'bg-red-100 text-red-700', pill: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
    approve: { icon: CheckCircle2, tile: 'bg-emerald-100 text-emerald-700', pill: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' },
    reject: { icon: XCircle, tile: 'bg-red-100 text-red-700', pill: 'bg-red-50 text-red-700 ring-1 ring-red-200' },
    submit: { icon: Send, tile: 'bg-violet-100 text-violet-700', pill: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200' },
    view: { icon: Eye, tile: 'bg-slate-100 text-slate-600', pill: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200' },
    export: { icon: Download, tile: 'bg-amber-100 text-amber-700', pill: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' },
    import: { icon: Upload, tile: 'bg-indigo-100 text-indigo-700', pill: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' },
    login: { icon: LogIn, tile: 'bg-teal-100 text-teal-700', pill: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200' },
    logout: { icon: LogOut, tile: 'bg-slate-100 text-slate-600', pill: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200' },
}

const FALLBACK_META: ActionMeta = {
    icon: Activity,
    tile: 'bg-slate-100 text-slate-600',
    pill: 'bg-slate-50 text-slate-600 ring-1 ring-slate-200',
}

const ENTITY_TYPES = ['employee', 'leave', 'payroll', 'visa', 'document', 'recruitment', 'onboarding', 'compliance', 'user', 'tenant']

function getInitials(name?: string | null): string {
    if (!name) return 'SY'
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('') || 'U'
}

function stringify(v: unknown): string {
    if (v === null || v === undefined) return '—'
    if (typeof v === 'string') return v
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)
    try { return JSON.stringify(v) } catch { return '—' }
}

function formatChanges(changes: Record<string, { from: unknown; to: unknown }> | null) {
    if (!changes) return []
    return Object.entries(changes).map(([key, val]) => ({
        key,
        from: stringify(val?.from),
        to: stringify(val?.to),
    }))
}

function isToday(d: Date): boolean {
    const n = new Date()
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}

function isYesterday(d: Date): boolean {
    const y = new Date()
    y.setDate(y.getDate() - 1)
    return d.getFullYear() === y.getFullYear() && d.getMonth() === y.getMonth() && d.getDate() === y.getDate()
}

function dayLabel(d: Date): string {
    if (isToday(d)) return 'Today'
    if (isYesterday(d)) return 'Yesterday'
    return d.toLocaleDateString('en-AE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function timeLabel(d: Date): string {
    return d.toLocaleTimeString('en-AE', { hour: '2-digit', minute: '2-digit' })
}

function actionVerb(action: string): string {
    const map: Record<string, string> = {
        create: 'created', update: 'updated', delete: 'deleted', approve: 'approved',
        reject: 'rejected', submit: 'submitted', view: 'viewed', export: 'exported',
        import: 'imported', login: 'logged into', logout: 'logged out of',
    }
    return map[action] ?? action
}

export function AuditLogPage() {
    const { t } = useTranslation()
    const [entityType, setEntityType] = useState('')
    const [search, setSearch] = useState('')

    const { data, isLoading } = useActivityLogs({
        entityType: entityType || undefined,
        limit: 100,
    })

    const logs: ActivityLog[] = Array.isArray(data) ? data : []

    const filtered = useMemo(() => {
        if (!search) return logs
        const q = search.toLowerCase()
        return logs.filter(l =>
            l.actorName?.toLowerCase().includes(q) ||
            l.entityName?.toLowerCase().includes(q) ||
            l.action.toLowerCase().includes(q) ||
            l.entityType.toLowerCase().includes(q),
        )
    }, [logs, search])

    const grouped = useMemo(() => {
        const map = new Map<string, ActivityLog[]>()
        for (const log of filtered) {
            const d = new Date(log.createdAt)
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
            if (!map.has(key)) map.set(key, [])
            map.get(key)!.push(log)
        }
        return Array.from(map.entries()).map(([key, items]) => ({
            key, date: new Date(items[0].createdAt), items,
        }))
    }, [filtered])

    const stats = useMemo(() => {
        const counts: Record<string, number> = {}
        const actors = new Set<string>()
        for (const log of filtered) {
            counts[log.action] = (counts[log.action] ?? 0) + 1
            if (log.actorName) actors.add(log.actorName)
        }
        return { total: filtered.length, counts, actorCount: actors.size }
    }, [filtered])

    const hasFilters = !!entityType || !!search

    return (
        <PageWrapper>
            <PageHeader
                eyebrow="Insights"
                title={t('audit.title')}
                description={t('audit.description')}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <StatTile label="Total events" value={stats.total} icon={Activity} tone="primary" />
                <StatTile label="Created" value={stats.counts['create'] ?? 0} icon={Plus} tone="emerald" />
                <StatTile label="Updated" value={stats.counts['update'] ?? 0} icon={Pencil} tone="blue" />
                <StatTile label="Unique actors" value={stats.actorCount} icon={UserIcon} tone="violet" />
            </div>

            <div className="rounded-xl border bg-card shadow-sm p-3 mb-5">
                <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by actor, entity, or action..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-9 h-9 bg-muted/40 border-transparent focus-visible:bg-background"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-muted-foreground hidden md:block" />
                        <Select value={entityType || '__all__'} onValueChange={(v) => setEntityType(v === '__all__' ? '' : v)}>
                            <SelectTrigger className="h-9 w-44">
                                <SelectValue placeholder="All entities" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All entities</SelectItem>
                                {ENTITY_TYPES.map(et => (
                                    <SelectItem key={et} value={et} className="capitalize">{et}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {hasFilters && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-2 text-xs gap-1"
                                onClick={() => { setSearch(''); setEntityType('') }}
                            >
                                <X className="h-3.5 w-3.5" /> Clear
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map(i => (
                        <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
                    ))}
                </div>
            ) : filtered.length === 0 ? (
                <div className="rounded-xl border bg-card shadow-sm">
                    <div className="flex flex-col items-center gap-3 py-16">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                            <ClipboardList className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <div className="text-center">
                            <p className="font-medium text-sm">No activity yet</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {hasFilters ? 'Try adjusting your filters or clearing the search.' : 'Actions performed in the workspace will appear here.'}
                            </p>
                        </div>
                        {hasFilters && (
                            <Button variant="outline" size="sm" onClick={() => { setSearch(''); setEntityType('') }}>
                                Clear filters
                            </Button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {grouped.map(group => (
                        <section key={group.key}>
                            <div className="flex items-center gap-3 mb-3">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                    {dayLabel(group.date)}
                                </h3>
                                <div className="flex-1 h-px bg-border" />
                                <span className="text-[11px] text-muted-foreground">{group.items.length} event{group.items.length === 1 ? '' : 's'}</span>
                            </div>
                            <div className="rounded-xl border bg-card shadow-sm divide-y overflow-hidden">
                                {group.items.map(log => (
                                    <ActivityRow key={log.id} log={log} />
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </PageWrapper>
    )
}

function StatTile({ label, value, icon: Icon, tone }: {
    label: string
    value: number
    icon: React.ComponentType<{ className?: string }>
    tone: 'primary' | 'emerald' | 'blue' | 'violet'
}) {
    const tones: Record<string, string> = {
        primary: 'bg-primary/10 text-primary',
        emerald: 'bg-emerald-100 text-emerald-700',
        blue: 'bg-blue-100 text-blue-700',
        violet: 'bg-violet-100 text-violet-700',
    }
    return (
        <div className="rounded-xl border bg-card shadow-sm p-4 flex items-center gap-3">
            <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center shrink-0', tones[tone])}>
                <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
                <p className="text-2xl font-semibold leading-none tracking-tight">{value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1 truncate">{label}</p>
            </div>
        </div>
    )
}

function ActivityRow({ log }: { log: ActivityLog }) {
    const meta = ACTION_META[log.action] ?? FALLBACK_META
    const Icon = meta.icon
    const created = new Date(log.createdAt)
    const changes = formatChanges(log.changes)

    return (
        <div className="px-4 py-3.5 hover:bg-muted/30 transition-colors">
            <div className="flex items-start gap-3">
                <div className={cn('h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5', meta.tile)}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm">
                                <span className="font-medium">{log.actorName ?? 'System'}</span>
                                <span className="text-muted-foreground"> {actionVerb(log.action)} </span>
                                <span className="font-medium capitalize">{log.entityType}</span>
                                {(log.entityName || log.entityId) && (
                                    <>
                                        <span className="text-muted-foreground"> · </span>
                                        <span className="font-medium truncate">{log.entityName ?? log.entityId}</span>
                                    </>
                                )}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                                <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium capitalize', meta.pill)}>
                                    {log.action}
                                </span>
                                {log.actorRole && (
                                    <span className="inline-flex items-center gap-1">
                                        <UserIcon className="h-3 w-3" />
                                        <span className="capitalize">{log.actorRole.replace('_', ' ')}</span>
                                    </span>
                                )}
                                {log.ipAddress && (
                                    <span className="font-mono text-[10px]">{log.ipAddress}</span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <div className="hidden sm:flex h-8 w-8 rounded-full bg-primary/10 text-primary text-[11px] font-semibold items-center justify-center shrink-0">
                                {getInitials(log.actorName)}
                            </div>
                            <div className="text-right">
                                <p className="text-xs font-medium">{timeLabel(created)}</p>
                                <p className="text-[10px] text-muted-foreground">
                                    {created.toLocaleDateString('en-AE', { day: 'numeric', month: 'short' })}
                                </p>
                            </div>
                        </div>
                    </div>

                    {changes.length > 0 && (
                        <div className="mt-3 rounded-lg bg-muted/40 border border-dashed p-2.5 space-y-1">
                            {changes.slice(0, 4).map(c => (
                                <div key={c.key} className="flex items-start gap-2 text-[11px]">
                                    <span className="font-mono font-medium text-muted-foreground shrink-0">{c.key}:</span>
                                    <span className="font-mono text-red-600/80 line-through truncate max-w-[160px]">{c.from}</span>
                                    <span className="text-muted-foreground">→</span>
                                    <span className="font-mono text-emerald-700 truncate max-w-[160px]">{c.to}</span>
                                </div>
                            ))}
                            {changes.length > 4 && (
                                <p className="text-[10px] text-muted-foreground pt-0.5">+{changes.length - 4} more change{changes.length - 4 === 1 ? '' : 's'}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
