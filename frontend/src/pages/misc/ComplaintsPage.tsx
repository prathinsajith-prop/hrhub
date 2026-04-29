import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import {
    AlertCircle, AlertTriangle, CheckCircle2, Clock, ChevronRight,
    Search, ShieldAlert, Users2, ArrowUpRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Complaint {
    id: string
    title: string
    category: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    confidentiality: 'anonymous' | 'named' | 'confidential'
    status: 'draft' | 'submitted' | 'under_review' | 'escalated' | 'resolved'
    submittedByName: string | null
    subjectName: string | null
    assigneeName: string | null
    description: string
    resolutionNotes: string | null
    slaDueAt: string | null
    acknowledgedAt: string | null
    resolvedAt: string | null
    createdAt: string
}

interface ComplaintStats {
    total: number
    open: number
    critical: number
    overdue: number
}

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

const STATUS_LABELS: Record<string, string> = {
    draft:        'Draft',
    submitted:    'Submitted',
    under_review: 'Under Review',
    escalated:    'Escalated',
    resolved:     'Resolved',
}

const CATEGORY_LABELS: Record<string, string> = {
    harassment:         'Harassment',
    pay_dispute:        'Pay Dispute',
    leave_dispute:      'Leave Dispute',
    working_conditions: 'Working Conditions',
    discrimination:     'Discrimination',
    other:              'Other',
}

function isOverdue(slaDueAt: string | null, status: string): boolean {
    if (!slaDueAt || status === 'resolved') return false
    return new Date(slaDueAt) < new Date()
}

// ─── Resolve Dialog ───────────────────────────────────────────────────────────

function ResolveDialog({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
    const [notes, setNotes] = useState('')
    const qc = useQueryClient()

    const { mutate, isPending } = useMutation({
        mutationFn: () => api.post(`/complaints/${complaint.id}/resolve`, { resolutionNotes: notes }),
        onSuccess: () => {
            toast.success('Complaint resolved')
            qc.invalidateQueries({ queryKey: ['complaints'] })
            onClose()
        },
        onError: (err: any) => toast.error('Failed to resolve', err?.message),
    })

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>Resolve Complaint</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    <p className="text-sm text-muted-foreground">{complaint.title}</p>
                    <div className="space-y-1.5">
                        <Label>Resolution Notes <span className="text-destructive">*</span></Label>
                        <Textarea
                            rows={4}
                            placeholder="Describe the resolution and outcome…"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={() => mutate()} disabled={notes.trim().length < 5 || isPending}>
                        {isPending ? 'Resolving…' : 'Mark Resolved'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

function ComplaintDetail({ complaint, onClose }: { complaint: Complaint; onClose: () => void }) {
    const [resolving, setResolving] = useState(false)
    const qc = useQueryClient()

    const acknowledge = useMutation({
        mutationFn: () => api.post(`/complaints/${complaint.id}/acknowledge`, {}),
        onSuccess: () => { toast.success('Acknowledged'); qc.invalidateQueries({ queryKey: ['complaints'] }) },
        onError: (err: any) => toast.error('Failed', err?.message),
    })

    const escalate = useMutation({
        mutationFn: () => api.post(`/complaints/${complaint.id}/escalate`, {}),
        onSuccess: () => { toast.success('Escalated'); qc.invalidateQueries({ queryKey: ['complaints'] }) },
        onError: (err: any) => toast.error('Failed', err?.message),
    })

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
                                {STATUS_LABELS[complaint.status]}
                            </span>
                            <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SEVERITY_STYLE[complaint.severity])}>
                                {complaint.severity.toUpperCase()}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                                {CATEGORY_LABELS[complaint.category] ?? complaint.category}
                            </span>
                            {isOverdue(complaint.slaDueAt, complaint.status) && (
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-50 text-red-700 ring-1 ring-red-200 flex items-center gap-1">
                                    <Clock className="h-3 w-3" /> Overdue
                                </span>
                            )}
                        </div>

                        {/* Meta */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground">Submitted by</p>
                                <p className="font-medium">{complaint.submittedByName ?? '—'}</p>
                            </div>
                            {complaint.subjectName && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Subject</p>
                                    <p className="font-medium">{complaint.subjectName}</p>
                                </div>
                            )}
                            {complaint.assigneeName && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Assigned to</p>
                                    <p className="font-medium">{complaint.assigneeName}</p>
                                </div>
                            )}
                            {complaint.slaDueAt && (
                                <div>
                                    <p className="text-xs text-muted-foreground">SLA due</p>
                                    <p className={cn('font-medium', isOverdue(complaint.slaDueAt, complaint.status) && 'text-red-600')}>
                                        {new Date(complaint.slaDueAt).toLocaleDateString()}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Description */}
                        <div className="rounded-lg border bg-muted/30 p-4">
                            <p className="text-xs text-muted-foreground mb-1.5">Description</p>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{complaint.description}</p>
                        </div>

                        {/* Resolution */}
                        {complaint.resolutionNotes && (
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
                                <p className="text-xs text-emerald-600 font-semibold mb-1.5">Resolution</p>
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
                                    onClick={() => acknowledge.mutate()}
                                    disabled={acknowledge.isPending}
                                >
                                    Acknowledge
                                </Button>
                            )}
                            {['submitted', 'under_review'].includes(complaint.status) && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() => escalate.mutate()}
                                    disabled={escalate.isPending}
                                >
                                    <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />
                                    Escalate
                                </Button>
                            )}
                            <Button size="sm" onClick={() => setResolving(true)}>
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                                Resolve
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
    const overdue = isOverdue(c.slaDueAt, c.status)
    return (
        <tr
            className="border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
            onClick={onClick}
        >
            <td className="px-4 py-3 max-w-[240px]">
                <p className="text-sm font-medium truncate">{c.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                    {CATEGORY_LABELS[c.category] ?? c.category}
                </p>
            </td>
            <td className="px-4 py-3">
                <p className="text-sm">{c.submittedByName ?? '—'}</p>
            </td>
            <td className="px-4 py-3">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SEVERITY_STYLE[c.severity])}>
                    {c.severity.toUpperCase()}
                </span>
            </td>
            <td className="px-4 py-3">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_STYLE[c.status])}>
                    {STATUS_LABELS[c.status]}
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
    const [search, setSearch] = useState('')
    const [status, setStatus] = useState('all')
    const [severity, setSeverity] = useState('all')
    const [selected, setSelected] = useState<Complaint | null>(null)

    const { data: stats, isLoading: statsLoading } = useQuery({
        queryKey: ['complaints', 'stats'],
        queryFn: () => api.get<{ data: ComplaintStats }>('/complaints/stats').then(r => r.data),
    })

    const params = new URLSearchParams({ limit: '50', offset: '0' })
    if (search) params.set('search', search)
    if (status !== 'all') params.set('status', status)
    if (severity !== 'all') params.set('severity', severity)

    const { data: list = [], isLoading } = useQuery({
        queryKey: ['complaints', { search, status, severity }],
        queryFn: () => api.get<{ data: Complaint[] }>(`/complaints?${params}`).then(r => r.data ?? []),
    })

    return (
        <PageWrapper>
            <PageHeader
                title="Complaints & Grievances"
                description="Review, investigate, and resolve employee complaints and grievances."
            />

            {/* KPI strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                {statsLoading
                    ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
                    : ([
                        { label: 'Total', value: stats?.total ?? 0, icon: ShieldAlert, color: 'blue' },
                        { label: 'Open', value: stats?.open ?? 0, icon: AlertCircle, color: 'blue' },
                        { label: 'Critical', value: stats?.critical ?? 0, icon: AlertTriangle, color: 'red' },
                        { label: 'Overdue', value: stats?.overdue ?? 0, icon: Clock, color: 'amber' },
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
                        placeholder="Search complaints…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9"
                    />
                </div>
                <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="submitted">Submitted</SelectItem>
                        <SelectItem value="under_review">Under Review</SelectItem>
                        <SelectItem value="escalated">Escalated</SelectItem>
                        <SelectItem value="resolved">Resolved</SelectItem>
                    </SelectContent>
                </Select>
                <Select value={severity} onValueChange={setSeverity}>
                    <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="All severity" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">All severity</SelectItem>
                        <SelectItem value="critical">Critical</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Table */}
            <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Complaint</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Submitted by</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Severity</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">SLA Due</th>
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
                                            <p className="text-muted-foreground text-sm">No complaints found</p>
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
