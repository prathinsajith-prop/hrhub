import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useActivityLogs, type ActivityLog } from '@/hooks/useAudit'
import { ClipboardList, Search } from 'lucide-react'

const ACTION_COLORS: Record<string, string> = {
    create: 'bg-green-100 text-green-800',
    update: 'bg-blue-100 text-blue-800',
    delete: 'bg-red-100 text-red-800',
    approve: 'bg-emerald-100 text-emerald-800',
    reject: 'bg-red-100 text-red-800',
    submit: 'bg-purple-100 text-purple-800',
    view: 'bg-gray-100 text-gray-600',
    export: 'bg-yellow-100 text-yellow-800',
    import: 'bg-indigo-100 text-indigo-800',
    login: 'bg-teal-100 text-teal-800',
    logout: 'bg-gray-100 text-gray-600',
}

const ENTITY_TYPES = ['employee', 'leave', 'payroll', 'visa', 'document', 'recruitment', 'onboarding', 'compliance', 'user', 'tenant']

export function AuditLogPage() {
    const { t } = useTranslation()
    const [entityType, setEntityType] = useState('')
    const [search, setSearch] = useState('')

    const { data, isLoading } = useActivityLogs({
        entityType: entityType || undefined,
        limit: 100,
    })

    const logs: ActivityLog[] = Array.isArray(data) ? data : []

    const filtered = search
        ? logs.filter(l =>
            l.actorName?.toLowerCase().includes(search.toLowerCase()) ||
            l.entityName?.toLowerCase().includes(search.toLowerCase()) ||
            l.action.includes(search.toLowerCase())
        )
        : logs

    return (
        <PageWrapper>
            <PageHeader title={t('audit.title')} description={t('audit.description')} />

            <Card className="p-4 mb-4">
                <div className="flex flex-wrap gap-3 items-end">
                    <div className="space-y-1.5 flex-1 min-w-[200px]">
                        <Label className="text-xs">Search</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Actor, entity, action..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs">Entity Type</Label>
                        <Select value={entityType} onValueChange={setEntityType}>
                            <SelectTrigger className="w-44"><SelectValue placeholder="All types" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">All types</SelectItem>
                                {ENTITY_TYPES.map(t => (
                                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </Card>

            {isLoading ? (
                <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />)}
                </div>
            ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16">
                    <ClipboardList className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No activity logs found.</p>
                </div>
            ) : (
                <div className="rounded-lg border overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium">Time</th>
                                <th className="text-left px-4 py-3 font-medium">Actor</th>
                                <th className="text-left px-4 py-3 font-medium">Action</th>
                                <th className="text-left px-4 py-3 font-medium">Entity</th>
                                <th className="text-left px-4 py-3 font-medium">Changes</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {filtered.map((log: ActivityLog) => (
                                <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                                        {new Date(log.createdAt).toLocaleString('en-AE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="font-medium">{log.actorName ?? 'System'}</p>
                                        {log.actorRole && <p className="text-xs text-muted-foreground capitalize">{log.actorRole.replace('_', ' ')}</p>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${ACTION_COLORS[log.action] ?? 'bg-gray-100 text-gray-700'}`}>
                                            {log.action}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <p className="capitalize text-xs text-muted-foreground">{log.entityType}</p>
                                        <p className="font-medium text-xs">{log.entityName ?? log.entityId ?? '—'}</p>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[240px]">
                                        {log.changes ? (
                                            <pre className="whitespace-pre-wrap font-mono text-[10px] bg-muted px-2 py-1 rounded max-h-16 overflow-hidden">
                                                {JSON.stringify(log.changes, null, 1).slice(0, 200)}
                                            </pre>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </PageWrapper>
    )
}
