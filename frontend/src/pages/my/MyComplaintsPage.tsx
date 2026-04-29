import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/overlays'
import { Plus, ShieldAlert, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Complaint {
    id: string
    title: string
    category: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    confidentiality: 'anonymous' | 'named' | 'confidential'
    status: 'draft' | 'submitted' | 'under_review' | 'escalated' | 'resolved'
    description: string
    resolutionNotes: string | null
    slaDueAt: string | null
    acknowledgedAt: string | null
    resolvedAt: string | null
    createdAt: string
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

// ─── New Complaint Form ───────────────────────────────────────────────────────

interface FormState {
    title: string
    category: string
    severity: string
    confidentiality: string
    description: string
}

const EMPTY_FORM: FormState = {
    title: '',
    category: 'other',
    severity: 'medium',
    confidentiality: 'confidential',
    description: '',
}

function NewComplaintDialog({ onClose }: { onClose: () => void }) {
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [draft, setDraft] = useState<Complaint | null>(null)
    const qc = useQueryClient()

    const field = (k: keyof FormState) => (v: string) => setForm(p => ({ ...p, [k]: v }))

    const create = useMutation({
        mutationFn: () => api.post<{ data: Complaint }>('/my/complaints', form),
        onSuccess: (res) => {
            setDraft(res.data)
            qc.invalidateQueries({ queryKey: ['my-complaints'] })
        },
        onError: (err: any) => toast.error('Failed to save', err?.message),
    })

    const submit = useMutation({
        mutationFn: (id: string) => api.post(`/my/complaints/${id}/submit`, {}),
        onSuccess: () => {
            toast.success('Complaint submitted. HR will review shortly.')
            qc.invalidateQueries({ queryKey: ['my-complaints'] })
            onClose()
        },
        onError: (err: any) => toast.error('Failed to submit', err?.message),
    })

    const isValid = form.title.trim().length >= 3 && form.description.trim().length >= 10

    return (
        <Dialog open onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{draft ? 'Review & Submit' : 'New Complaint'}</DialogTitle>
                </DialogHeader>

                {!draft ? (
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Title <span className="text-destructive">*</span></Label>
                            <Input
                                placeholder="Brief summary of the issue…"
                                value={form.title}
                                onChange={e => field('title')(e.target.value)}
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Category</Label>
                                <Select value={form.category} onValueChange={field('category')}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                                            <SelectItem key={v} value={v}>{l}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Severity</Label>
                                <Select value={form.severity} onValueChange={field('severity')}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="critical">Critical</SelectItem>
                                        <SelectItem value="high">High</SelectItem>
                                        <SelectItem value="medium">Medium</SelectItem>
                                        <SelectItem value="low">Low</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Confidentiality</Label>
                            <Select value={form.confidentiality} onValueChange={field('confidentiality')}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="confidential">Confidential — HR sees your name</SelectItem>
                                    <SelectItem value="anonymous">Anonymous — name hidden from all</SelectItem>
                                    <SelectItem value="named">Named — name visible to all parties</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label>Description <span className="text-destructive">*</span></Label>
                            <Textarea
                                rows={5}
                                placeholder="Describe the issue in detail, including dates, people involved, and any supporting context…"
                                value={form.description}
                                onChange={e => field('description')(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">{form.description.length}/5000</p>
                        </div>

                        <div className="rounded-lg border bg-amber-50/60 border-amber-200 p-3 text-xs text-amber-800 leading-relaxed">
                            Your complaint is saved as a draft first. Review it before submitting — once submitted, it cannot be edited.
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4 py-2">
                        <div className="rounded-lg border p-4 space-y-3">
                            <div className="flex flex-wrap gap-2">
                                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SEVERITY_STYLE[draft.severity])}>
                                    {draft.severity.toUpperCase()}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground">
                                    {CATEGORY_LABELS[draft.category] ?? draft.category}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground capitalize">
                                    {draft.confidentiality}
                                </span>
                            </div>
                            <p className="font-semibold">{draft.title}</p>
                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{draft.description}</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Ready to submit? Once submitted, HR will be notified and will acknowledge within 2 working days.
                        </p>
                    </div>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    {!draft ? (
                        <Button onClick={() => create.mutate()} disabled={!isValid || create.isPending}>
                            {create.isPending ? 'Saving…' : 'Save Draft'}
                        </Button>
                    ) : (
                        <Button onClick={() => submit.mutate(draft.id)} disabled={submit.isPending}>
                            {submit.isPending ? 'Submitting…' : 'Submit Complaint'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

// ─── Complaint Card ───────────────────────────────────────────────────────────

function ComplaintCard({ c }: { c: Complaint }) {
    return (
        <div className="rounded-xl border bg-card p-4 space-y-3 hover:shadow-sm transition-shadow">
            <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-tight truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {CATEGORY_LABELS[c.category] ?? c.category} · {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                </div>
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium shrink-0', STATUS_STYLE[c.status])}>
                    {STATUS_LABELS[c.status]}
                </span>
            </div>

            <div className="flex flex-wrap gap-2">
                <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', SEVERITY_STYLE[c.severity])}>
                    {c.severity.toUpperCase()}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-muted text-muted-foreground capitalize">
                    {c.confidentiality}
                </span>
                {c.slaDueAt && c.status !== 'resolved' && (
                    <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1',
                        new Date(c.slaDueAt) < new Date() ? 'bg-red-50 text-red-700' : 'bg-muted text-muted-foreground'
                    )}>
                        <Clock className="h-2.5 w-2.5" />
                        Due {new Date(c.slaDueAt).toLocaleDateString()}
                    </span>
                )}
            </div>

            {c.resolutionNotes && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                    <p className="text-xs text-emerald-600 font-semibold mb-1">Resolution</p>
                    <p className="text-xs text-emerald-800 leading-relaxed line-clamp-3">{c.resolutionNotes}</p>
                </div>
            )}
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function MyComplaintsPage() {
    const [showNew, setShowNew] = useState(false)

    const { data: list = [], isLoading } = useQuery({
        queryKey: ['my-complaints'],
        queryFn: () => api.get<{ data: Complaint[] }>('/my/complaints').then(r => r.data ?? []),
    })

    return (
        <PageWrapper>
            <PageHeader
                title="My Complaints"
                description="Submit and track your complaints and grievances confidentially."
                actions={
                    <Button onClick={() => setShowNew(true)} size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        New Complaint
                    </Button>
                }
            />

            {isLoading ? (
                <div className="grid sm:grid-cols-2 gap-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-36 rounded-xl" />
                    ))}
                </div>
            ) : list.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                    <ShieldAlert className="h-10 w-10 text-muted-foreground" />
                    <div>
                        <p className="font-medium text-sm">No complaints yet</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Use the button above to submit a complaint or grievance to HR.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                    {list.map(c => <ComplaintCard key={c.id} c={c} />)}
                </div>
            )}

            {showNew && <NewComplaintDialog onClose={() => setShowNew(false)} />}
        </PageWrapper>
    )
}
