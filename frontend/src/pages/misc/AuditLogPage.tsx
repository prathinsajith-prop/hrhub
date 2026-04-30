import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { labelFor } from '@/lib/enums'
import { AUDIT_ACTION_OPTIONS, AUDIT_ENTITY_TYPE_OPTIONS, ROLE_OPTIONS } from '@/lib/options'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { useInfiniteActivityLogs, type ActivityLog } from '@/hooks/useAudit'
import { AdvancedSearchBar } from '@/components/filters/AdvancedSearchBar'
import { useSearchFilters } from '@/hooks/useSearchFilters'
import type { FilterConfig } from '@/lib/filters'
import {
    ClipboardList,
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
    X,
    RefreshCcw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { exportAuditLog } from '@/lib/export'
import { toast } from 'sonner'
import { KpiCardCompact } from '@/components/ui/kpi-card'

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
    submit: { icon: Send, tile: 'bg-primary/10 text-primary', pill: 'bg-primary/5 text-primary ring-1 ring-primary/20' },
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

const AUDIT_FILTERS: FilterConfig[] = [
    { name: 'entityType', label: 'Entity', type: 'select', field: 'entityType', options: AUDIT_ENTITY_TYPE_OPTIONS },
    { name: 'action', label: 'Action', type: 'select', field: 'action', options: AUDIT_ACTION_OPTIONS },
    { name: 'actorName', label: 'Actor name', type: 'text', field: 'actorName' },
    { name: 'actorRole', label: 'Actor role', type: 'select', field: 'actorRole', options: ROLE_OPTIONS },
    { name: 'entityName', label: 'Entity name', type: 'text', field: 'entityName' },
    { name: 'createdAt', label: 'Date range', type: 'date_range', field: 'createdAt' },
    { name: 'ipAddress', label: 'IP address', type: 'text', field: 'ipAddress' },
]

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
    const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'all'>('30d')
    const auditSearch = useSearchFilters({
        storageKey: 'hrhub.audit.searchHistory',
        availableFilters: AUDIT_FILTERS,
    })

    const entityTypeFilter = (auditSearch.appliedFilters.entityType?.value as string | undefined) ?? ''
    const actionFilter = (auditSearch.appliedFilters.action?.value as string | undefined) ?? ''
    const actorNameFilter = (auditSearch.appliedFilters.actorName?.value as string | undefined) ?? ''
    const actorRoleFilter = (auditSearch.appliedFilters.actorRole?.value as string | undefined) ?? ''
    const entityNameFilter = (auditSearch.appliedFilters.entityName?.value as string | undefined) ?? ''
    const ipFilter = (auditSearch.appliedFilters.ipAddress?.value as string | undefined) ?? ''
    const createdAtRange = (auditSearch.appliedFilters.createdAt?.value as [string | null, string | null] | undefined) ?? null

    const { data, isLoading, isFetching, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteActivityLogs({
        entityType: entityTypeFilter || undefined,
        pageSize: 30,
    })

    const logs: ActivityLog[] = useMemo(() => {
        const pages = data?.pages ?? []
        return pages.flat()
    }, [data])

    // Infinite scroll sentinel
    const sentinelRef = useRef<HTMLDivElement | null>(null)
    useEffect(() => {
        const el = sentinelRef.current
        if (!el) return
        const io = new IntersectionObserver((entries) => {
            if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
                fetchNextPage()
            }
        }, { rootMargin: '200px' })
        io.observe(el)
        return () => io.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    const filtered = useMemo(() => {
        const now = Date.now()
        const rangeMs: Record<typeof dateRange, number | null> = {
            today: 24 * 3600 * 1000,
            '7d': 7 * 24 * 3600 * 1000,
            '30d': 30 * 24 * 3600 * 1000,
            all: null,
        }
        const cutoff = rangeMs[dateRange]
        let result = logs
        if (cutoff !== null) {
            result = result.filter(l => now - new Date(l.createdAt).getTime() <= cutoff)
        }
        if (createdAtRange) {
            const [from, to] = createdAtRange
            if (from) {
                const fromTs = new Date(from).getTime()
                result = result.filter(l => new Date(l.createdAt).getTime() >= fromTs)
            }
            if (to) {
                const toTs = new Date(to).getTime() + 24 * 3600 * 1000 - 1
                result = result.filter(l => new Date(l.createdAt).getTime() <= toTs)
            }
        }
        if (actionFilter) result = result.filter(l => l.action === actionFilter)
        if (actorRoleFilter) result = result.filter(l => l.actorRole === actorRoleFilter)
        if (actorNameFilter) {
            const q = actorNameFilter.toLowerCase()
            result = result.filter(l => (l.actorName ?? '').toLowerCase().includes(q))
        }
        if (entityNameFilter) {
            const q = entityNameFilter.toLowerCase()
            result = result.filter(l => (l.entityName ?? '').toLowerCase().includes(q))
        }
        if (ipFilter) {
            result = result.filter(l => (l.ipAddress ?? '').includes(ipFilter))
        }
        const search = auditSearch.searchInput.trim()
        if (search) {
            const q = search.toLowerCase()
            result = result.filter(l =>
                l.actorName?.toLowerCase().includes(q) ||
                l.entityName?.toLowerCase().includes(q) ||
                l.action.toLowerCase().includes(q) ||
                l.entityType.toLowerCase().includes(q),
            )
        }
        return result
    }, [logs, auditSearch.searchInput, actionFilter, actorRoleFilter, actorNameFilter, entityNameFilter, ipFilter, createdAtRange, dateRange])

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

    const hasFilters = auditSearch.appliedCount > 0 || !!auditSearch.searchInput || dateRange !== '30d'

    function clearAll() {
        auditSearch.clearAll()
        setDateRange('30d')
    }

    function exportCsv() {
        const headers = ['Timestamp', 'Actor', 'Role', 'Action', 'Entity Type', 'Entity Name', 'Entity Id', 'IP']
        const rows = filtered.map(l => [
            new Date(l.createdAt).toISOString(),
            l.actorName ?? '',
            l.actorRole ?? '',
            l.action,
            l.entityType,
            l.entityName ?? '',
            l.entityId ?? '',
            l.ipAddress ?? '',
        ])
        const escape = (s: string) => `"${String(s).replace(/"/g, '""')}"`
        const csv = [headers, ...rows].map(r => r.map(escape).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
    }

    return (
        <PageWrapper>
            <PageHeader
                eyebrow="Insights"
                title={t('audit.title')}
                description={t('audit.description')}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" leftIcon={<RefreshCcw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />} onClick={() => refetch()} disabled={isFetching}>
                            Refresh
                        </Button>
                        <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => exportAuditLog({ format: 'csv' }).catch(() => toast.error('Export failed'))}>CSV</Button>
                        <Button variant="outline" size="sm" leftIcon={<Download className="h-3.5 w-3.5" />} onClick={() => exportAuditLog({ format: 'pdf' }).catch(() => toast.error('Export failed'))}>PDF</Button>
                    </div>
                }
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <KpiCardCompact label="Total events" value={stats.total} icon={Activity} color="blue" />
                <KpiCardCompact label="Created" value={stats.counts['create'] ?? 0} icon={Plus} color="green" />
                <KpiCardCompact label="Updated" value={stats.counts['update'] ?? 0} icon={Pencil} color="amber" />
                <KpiCardCompact label="Unique actors" value={stats.actorCount} icon={UserIcon} color="purple" />
            </div>

            <div className="rounded-xl border bg-card shadow-sm p-3 mb-5">
                <AdvancedSearchBar
                    search={auditSearch}
                    filters={AUDIT_FILTERS}
                    placeholder="Search by actor, entity, or action…"
                    resultCount={filtered.length}
                    rightSlot={
                        <>
                            <Button variant="outline" size="sm" className="h-9 gap-1" onClick={exportCsv}>
                                <Download className="h-3.5 w-3.5" /> Export
                            </Button>
                            {hasFilters && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-2 text-xs gap-1"
                                    onClick={clearAll}
                                >
                                    <X className="h-3.5 w-3.5" /> Clear
                                </Button>
                            )}
                        </>
                    }
                />
                <div className="flex items-center gap-1 mt-3 pt-3 border-t">
                    <span className="text-[11px] text-muted-foreground mr-2">Range:</span>
                    {(['today', '7d', '30d', 'all'] as const).map(r => (
                        <button
                            key={r}
                            type="button"
                            onClick={() => setDateRange(r)}
                            className={cn(
                                'px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors',
                                dateRange === r
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:bg-muted',
                            )}
                        >
                            {r === 'today' ? 'Today' : r === '7d' ? 'Last 7 days' : r === '30d' ? 'Last 30 days' : 'All time'}
                        </button>
                    ))}
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
                            <Button variant="outline" size="sm" onClick={clearAll}>
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
                    {/* Infinite scroll sentinel + status */}
                    <div ref={sentinelRef} className="h-8" />
                    {isFetchingNextPage && (
                        <div className="flex justify-center py-4 text-xs text-muted-foreground">
                            Loading more…
                        </div>
                    )}
                    {!hasNextPage && filtered.length > 0 && (
                        <div className="text-center py-4 text-[11px] text-muted-foreground/70">
                            End of activity log
                        </div>
                    )}
                </div>
            )}
        </PageWrapper>
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
                                        <span className="capitalize">{labelFor(log.actorRole)}</span>
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
