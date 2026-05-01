import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCardCompact } from '@/components/shared/KpiCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
    AlertCircle, AlertTriangle, CheckCircle2, Clock, ChevronRight,
    Search, ShieldAlert, ArrowUpRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    type Complaint,
    useComplaints, useComplaintStats,
    useAcknowledgeComplaint, useEscalateComplaint, useResolveComplaint,
} from '@/hooks/useComplaints'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, string> = {
    critical: 'bg-red-50 text-red-700 ring-1 ring-red-200',
    high:     'bg-orange-50 text-orange-700 ring-1 ring-orange-200',
    medium:   'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
    low:      'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
}

const STATUS_STYLE: Record<string, string> = {
    draft:        'bg-slate-100 text-slate-600',
    submitted:    'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
    under_review: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
    escalated:    'bg-red-50 text-red-700 ring-1 ring-red-200',
    resolved:     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
}

function isOverdue(slaDueAt: string | null, status: string): boolean {
    if (!slaDueAt || status === 'resolved') return false
    return new Date(slaDueAt) < new Date()
}

// ─── Resolve Dialog ───────────────────────────────────────────────────────────

function ResolveDialog({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
    const { t } = useTranslation()
    const [notes, setNotes] = useState('')
    const { mutate, isPending } = useResolveComplaint()

    function handleResolve() {
        mutate({ id: complaint.id, resolutionNotes: notes }, { onSuccess: onClose })
    }

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{t('complaints.resolveDialog.title')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <p className="text-sm text-muted-foreground">{complaint.title}</p>
                    <div className="space-y-1.5">
                        <Label>{t('complaints.resolveDialog.notesLabel')} <span className="text-destructive">*</span></Label>
                        <Textarea
                            rows={4}
                            placeholder={t('complaints.resolveDialog.notesPlaceholder')}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>{t('complaints.resolveDialog.cancel')}</Button>
                    <Button onClick={handleResolve} disabled={notes.trim().length < 5 || isPending}>
                        {isPending ? t('complaints.resolveDialog.resolving') : t('complaints.resolveDialog.markResolved')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

function ComplaintDetail({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
    const { t } = useTranslation()
    const [resolving, setResolving] = useState(false)
    const acknowledge = useAcknowledgeComplaint()
    const escalate = useEscalateComplaint()

    return (
        <>
            <Dialog open onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="pr-6 leading-snug">{complaint.title}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        {/* Status row */}
                        <div className="flex flex-wrap gap-2 items-center">
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[complaint.status])}>
                                {t(`complaints.status.${complaint.status}`)}
                            </span>
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SEVERITY_STYLE[complaint.severity])}>
                                {t(`complaints.severity.${complaint.severity}`).toUpperCase()}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                                {t(`complaints.category.${complaint.category}`, { defaultValue: complaint.category })}
                            </span>
                            {isOverdue(complaint.slaDueAt, complaint.status) && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-700 ring-1 ring-red-200 flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> {t('complaints.detail.overdue')}
                                </span>
                            )}
                        </div>

                        {/* Meta */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground">{t('complaints.detail.submittedBy')}</p>
                                <p className="font-medium">{complaint.submittedByName ?? '—'}</p>
                            </div>
                            {complaint.subjectName && (
                                <div>
                                    <p className="text-xs text-muted-foreground">{t('complaints.detail.subject')}</p>
                                    <p className="font-medium">{complaint.subjectName}</p>
                                </div>
                            )}
                            {complaint.assigneeName && (
                                <div>
                                    <p className="text-xs text-muted-foreground">{t('complaints.detail.assignedTo')}</p>
                                    <p className="font-medium">{complaint.assigneeName}</p>
                                </div>
                            )}
                            {complaint.slaDueAt && (
                                <div>
                                    <p className="text-xs text-muted-foreground">{t('complaints.detail.slaDue')}</p>
                                    <p className={cn('font-medium', isOverdue(complaint.slaDueAt, complaint.status) && 'text-red-600')}>
                                        {new Date(complaint.slaDueAt).toLocaleDateString()}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Description */}
                        <div className="rounded-lg border bg-muted/30 p-4">
                            <p className="text-xs text-muted-foreground mb-1.5">{t('complaints.detail.description')}</p>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{complaint.description}</p>
                        </div>

                        {/* Resolution */}
                        {complaint.resolutionNotes && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                                <p className="text-xs text-emerald-600 font-semibold mb-1.5">{t('complaints.detail.resolution')}</p>
                                <p className="text-sm whitespace-pre-wrap leading-relaxed">{complaint.resolutionNotes}</p>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    {complaint.status !== 'resolved' && (
                        <DialogFooter className="flex-wrap gap-2">
                            {complaint.status === 'submitted' && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => acknowledge.mutate(complaint.id)}
                                    disabled={acknowledge.isPending}
                                >
                                    {t('complaints.detail.acknowledge')}
                                </Button>
                            )}
                            {['submitted', 'under_review'].includes(complaint.status) && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() => escalate.mutate(complaint.id)}
                                    disabled={escalate.isPending}
                                >
                                    <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />
                                    {t('complaints.detail.escalate')}
                                </Button>
                            )}
                            <Button size="sm" onClick={() => setResolving(true)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                {t('complaints.detail.resolve')}
                            </Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>

            {resolving && <ResolveDialog complaint={complaint} onClose={() => setResolving(false)} />}
        </>
    )
}

// ─── Row ──────────────────────────────────────────────────────────────────────

function ComplaintRow({ c, onClick }: { c: Complaint; onClick: () => void }) {
    const { t } = useTranslation()
    const overdue = isOverdue(c.slaDueAt, c.status)
    return (
        <tr
            className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
            onClick={onClick}
        >
            <td className="px-4 py-3 max-w-[240px]">
                <p className="text-sm font-medium truncate">{c.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {t(`complaints.category.${c.category}`, { defaultValue: c.category })}
                </p>
            </td>
            <td className="px-4 py-3">
                <p className="text-sm">{c.submittedByName ?? '—'}</p>
            </td>
            <td className="px-4 py-3">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SEVERITY_STYLE[c.severity])}>
                    {t(`complaints.severity.${c.severity}`).toUpperCase()}
                </span>
            </td>
            <td className="px-4 py-3">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[c.status])}>
                    {t(`complaints.status.${c.status}`)}
                </span>
            </td>
            <td className="px-4 py-3">
                {c.slaDueAt ? (
                    <p className={cn('text-xs', overdue ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
                        {overdue && <Clock className="h-3 w-3 inline mr-1" />}
                        {new Date(c.slaDueAt).toLocaleDateString()}
                    </p>
                ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                )}
            </td>
            <td className="px-4 py-3">
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </td>
        </tr>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ComplaintsPage() {
    const { t } = useTranslation()
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('all')
    const [severity, setSeverity] = useState('all')
    const [selected, setSelected] = useState<Complaint | null>(null)

    const { data: stats, isLoading: statsLoading } = useComplaintStats()
    const { data: list = [], isLoading } = useComplaints({
        search: search || undefined,
        status: status !== 'all' ? status : undefined,
        severity: severity !== 'all' ? severity : undefined,
    })

    return (
        <PageWrapper>
            <PageHeader
                title={t('complaints.pageTitle')}
                description={t('complaints.pageDesc')}
            />

            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {statsLoading
                    ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
                    : ([
                        { label: t('complaints.stats.total'),    value: stats?.total ?? 0,    icon: ShieldAlert,    color: 'blue' },
                        { label: t('complaints.stats.open'),     value: stats?.open ?? 0,     icon: AlertCircle,    color: 'blue' },
                        { label: t('complaints.stats.critical'), value: stats?.critical ?? 0, icon: AlertTriangle,  color: 'red' },
                        { label: t('complaints.stats.overdue'),  value: stats?.overdue ?? 0,  icon: Clock,          color: 'amber' },
                    ] as const).map(s => (
                        <KpiCardCompact
                            key={s.label}
                            label={s.label}
                            value={String(s.value)}
                            icon={s.icon}
                            color={s.color}
                        />
                    ))
                }
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={t('complaints.filters.search')}
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder={t('complaints.filters.allStatuses')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('complaints.filters.allStatuses')}</SelectItem>
                        <SelectItem value="submitted">{t('complaints.status.submitted')}</SelectItem>
                        <SelectItem value="under_review">{t('complaints.status.under_review')}</SelectItem>
                        <SelectItem value="escalated">{t('complaints.status.escalated')}</SelectItem>
                        <SelectItem value="resolved">{t('complaints.status.resolved')}</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder={t('complaints.filters.allSeverity')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('complaints.filters.allSeverity')}</SelectItem>
                        <SelectItem value="critical">{t('complaints.severity.critical')}</SelectItem>
                        <SelectItem value="high">{t('complaints.severity.high')}</SelectItem>
                        <SelectItem value="medium">{t('complaints.severity.medium')}</SelectItem>
                        <SelectItem value="low">{t('complaints.severity.low')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('complaints.table.complaint')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('complaints.table.submittedBy')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('complaints.table.severity')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('complaints.table.status')}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('complaints.table.slaDue')}</th>
                            <th className="w-8" />
                        </tr>
                    </thead>
                    <tbody className="bg-background">
                        {isLoading
                            ? Array.from({ length: 5 }).map((_, i) => (
                                <tr key={i} className="border-b last:border-0">
                                    {Array.from({ length: 5 }).map((_, j) => (
                                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                                    ))}
                                    <td />
                                </tr>
                            ))
                            : list.length === 0
                                ? (
                                    <tr>
                                        <td colSpan={6} className="text-center py-16">
                                            <ShieldAlert className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                                            <p className="text-muted-foreground text-sm">{t('complaints.noComplaints')}</p>
                                        </td>
                                    </tr>
                                )
                                : list.map(c => (
                                    <ComplaintRow key={c.id} c={c} onClick={() => setSelected(c)} />
                                ))
                        }
                    </tbody>
                </table>
            </div>

            {selected && <ComplaintDetail complaint={selected} onClose={() => setSelected(null)} />}
        </PageWrapper>
    )
}
