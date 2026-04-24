import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Clock, CheckCircle2, Plus, ArrowLeft, Trash2, Mail, Phone, FileText, Activity, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, Progress } from '@/components/ui/primitives'
import { ConfirmDialog, toast, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, DialogClose } from '@/components/ui/overlays'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { useEmployeeChecklist, useUpdateOnboardingStep, useAddOnboardingStep, useDeleteOnboardingStep, type OnboardingChecklist, type OnboardingStep, type OnboardingStepStatus } from '@/hooks/useOnboarding'
import { useDocuments } from '@/hooks/useDocuments'
import { useActivityLogs } from '@/hooks/useAudit'
import { InitialsAvatar } from '@/components/shared/Avatar'
import {
    ONBOARDING_TEMPLATE_STEPS,
    ONBOARDING_STATUS_LABEL,
    DueBadge,
    StatusPill,
    deriveSteps,
    progressTone,
} from './onboarding-helpers'

export function OnboardingDetailPage() {
    const { employeeId = '' } = useParams<{ employeeId: string }>()
    const navigate = useNavigate()
    const { data: raw, isLoading } = useEmployeeChecklist(employeeId)
    const checklist = useMemo<OnboardingChecklist | null>(() => {
        if (!raw) return null
        return { ...raw, steps: deriveSteps(raw.steps) }
    }, [raw])

    if (isLoading) {
        return (
            <PageWrapper>
                <div className="space-y-3">
                    <Skeleton className="h-9 w-48" />
                    <Skeleton className="h-32 w-full rounded-xl" />
                    <Skeleton className="h-64 w-full rounded-xl" />
                </div>
            </PageWrapper>
        )
    }

    if (!checklist) {
        return (
            <PageWrapper>
                <Card className="flex flex-col items-center justify-center py-16 text-center gap-3">
                    <Clock className="h-10 w-10 text-muted-foreground" />
                    <p className="text-sm font-medium">Onboarding checklist not found</p>
                    <Button variant="outline" size="sm" onClick={() => navigate('/onboarding')}>
                        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />Back to onboarding
                    </Button>
                </Card>
            </PageWrapper>
        )
    }

    const tone = progressTone(checklist.progress)

    return (
        <PageWrapper>
            <div className="flex items-center gap-2 mb-3">
                <Button variant="ghost" size="sm" onClick={() => navigate('/onboarding')}>
                    <ArrowLeft className="h-4 w-4 mr-1.5" />Onboarding
                </Button>
            </div>

            {/* Header card */}
            <Card className="p-5 mb-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                        <InitialsAvatar name={checklist.employeeName} src={checklist.avatarUrl ?? undefined} size="lg" />
                        <div className="min-w-0">
                            <h1 className="text-lg font-bold truncate">{checklist.employeeName}</h1>
                            <p className="text-sm text-muted-foreground truncate">
                                {checklist.designation ?? '—'}{checklist.department ? ` · ${checklist.department}` : ''}
                            </p>
                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground mt-1">
                                {checklist.employeeNo && <span>#{checklist.employeeNo}</span>}
                                {checklist.email && <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" />{checklist.email}</span>}
                                {checklist.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{checklist.phone}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="text-right shrink-0">
                        <p className={cn('text-3xl font-bold font-display', tone.color)}>{checklist.progress}%</p>
                        <p className="text-xs text-muted-foreground">{tone.label} · {checklist.completedCount}/{checklist.totalCount} steps</p>
                        <Button asChild variant="outline" size="sm" className="mt-2">
                            <Link to={`/employees/${checklist.employeeId}`}>View employee</Link>
                        </Button>
                    </div>
                </div>
                <Progress value={checklist.progress} className="mt-4" />
            </Card>

            <Tabs defaultValue="overview">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="steps">Steps ({checklist.totalCount})</TabsTrigger>
                    <TabsTrigger value="documents">Documents</TabsTrigger>
                    <TabsTrigger value="activity">Activity</TabsTrigger>
                </TabsList>

                <TabsContent value="overview"><OverviewTab checklist={checklist} /></TabsContent>
                <TabsContent value="steps"><StepsTab checklist={checklist} /></TabsContent>
                <TabsContent value="documents"><DocumentsTab employeeId={checklist.employeeId} /></TabsContent>
                <TabsContent value="activity"><ActivityTab employeeId={checklist.employeeId} /></TabsContent>
            </Tabs>
        </PageWrapper>
    )
}

function OverviewTab({ checklist }: { checklist: OnboardingChecklist }) {
    const stats = useMemo(() => {
        const counts = { pending: 0, in_progress: 0, completed: 0, overdue: 0 }
        for (const s of checklist.steps) counts[s.status] += 1
        return counts
    }, [checklist.steps])

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCardCompact label="Pending" value={stats.pending} icon={Clock} color="amber" />
                <KpiCardCompact label="In progress" value={stats.in_progress} icon={Activity} color="blue" />
                <KpiCardCompact label="Completed" value={stats.completed} icon={CheckCircle2} color="green" />
                <KpiCardCompact label="Overdue" value={stats.overdue} icon={Trash2} color="red" />
            </div>

            <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">Timeline</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                    <div>
                        <p className="text-xs text-muted-foreground">Start date</p>
                        <p className="font-medium">{checklist.startDate ? formatDate(checklist.startDate) : '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Due date</p>
                        <p className="font-medium">{checklist.dueDate ? formatDate(checklist.dueDate) : '—'}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Join date</p>
                        <p className="font-medium">{checklist.joinDate ? formatDate(checklist.joinDate) : '—'}</p>
                    </div>
                </div>
            </Card>

            <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">Up next</h3>
                {(() => {
                    const upcoming = checklist.steps.filter((s) => s.status !== 'completed').slice(0, 3)
                    if (upcoming.length === 0) return <p className="text-sm text-muted-foreground">All steps complete. 🎉</p>
                    return (
                        <ul className="divide-y">
                            {upcoming.map((step) => (
                                <li key={step.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium truncate">{step.title}</p>
                                        <p className="text-[11px] text-muted-foreground truncate">
                                            {step.owner ?? 'Unassigned'}{step.dueDate ? ` · Due ${formatDate(step.dueDate)}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <DueBadge dueDate={step.dueDate} status={step.status} />
                                        <StatusPill status={step.status} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )
                })()}
            </Card>
        </div>
    )
}

type StepFilter = 'all' | OnboardingStepStatus

function StepsTab({ checklist }: { checklist: OnboardingChecklist }) {
    const updateStep = useUpdateOnboardingStep()
    const addStep = useAddOnboardingStep()
    const deleteStep = useDeleteOnboardingStep()
    const [editing, setEditing] = useState<OnboardingStep | null>(null)
    const [stepStatus, setStepStatus] = useState<OnboardingStepStatus>('in_progress')
    const [stepNotes, setStepNotes] = useState('')
    const [stepDate, setStepDate] = useState('')
    const [adding, setAdding] = useState(false)
    const [newTitle, setNewTitle] = useState('')
    const [newOwner, setNewOwner] = useState('')
    const [newDue, setNewDue] = useState('')
    const [newSlaDays, setNewSlaDays] = useState('')
    const [showTemplates, setShowTemplates] = useState(false)
    const [confirmDelete, setConfirmDelete] = useState<OnboardingStep | null>(null)
    const [stepFilter, setStepFilter] = useState<StepFilter>('all')

    const stepCounts = useMemo(() => {
        const c = { all: checklist.steps.length, pending: 0, in_progress: 0, completed: 0, overdue: 0 }
        for (const s of checklist.steps) c[s.status] += 1
        return c
    }, [checklist.steps])

    const visibleSteps = useMemo(
        () => stepFilter === 'all' ? checklist.steps : checklist.steps.filter((s) => s.status === stepFilter),
        [checklist.steps, stepFilter],
    )

    const openEdit = (step: OnboardingStep) => {
        setEditing(step)
        setStepStatus(step.status === 'overdue' ? 'in_progress' : step.status)
        setStepNotes(step.notes ?? '')
        setStepDate(step.completedDate ?? new Date().toISOString().split('T')[0])
    }

    const saveEdit = () => {
        if (!editing) return
        updateStep.mutate(
            {
                checklistId: checklist.id,
                stepId: editing.id,
                data: {
                    status: stepStatus,
                    notes: stepNotes || undefined,
                    completedDate: stepStatus === 'completed' ? (stepDate || new Date().toISOString().split('T')[0]) : undefined,
                },
            },
            {
                onSuccess: () => {
                    toast.success('Step updated', `"${editing.title}" marked as ${ONBOARDING_STATUS_LABEL[stepStatus]}.`)
                    setEditing(null)
                },
                onError: () => toast.error('Update failed', 'Could not update the step.'),
            },
        )
    }

    const saveNew = () => {
        if (!newTitle.trim()) {
            toast.error('Title required', 'Enter a step title.')
            return
        }
        addStep.mutate(
            {
                checklistId: checklist.id,
                data: {
                    title: newTitle.trim(),
                    owner: newOwner || undefined,
                    dueDate: newDue || undefined,
                    slaDays: newSlaDays ? Number(newSlaDays) : undefined,
                },
            },
            {
                onSuccess: () => {
                    toast.success('Step added', `"${newTitle.trim()}" added to checklist.`)
                    setAdding(false)
                    setNewTitle(''); setNewOwner(''); setNewDue(''); setNewSlaDays(''); setShowTemplates(false)
                },
                onError: () => toast.error('Add failed', 'Could not add the step.'),
            },
        )
    }

    const applyTemplateStep = (t: typeof ONBOARDING_TEMPLATE_STEPS[number]) => {
        setNewTitle(t.title)
        setNewOwner(t.owner)
        setNewSlaDays(String(t.slaDays))
        setShowTemplates(false)
    }

    const doDelete = () => {
        if (!confirmDelete) return
        deleteStep.mutate(
            { checklistId: checklist.id, stepId: confirmDelete.id },
            {
                onSuccess: () => {
                    toast.success('Step removed', `"${confirmDelete.title}" deleted.`)
                    setConfirmDelete(null)
                },
                onError: () => toast.error('Delete failed', 'Could not remove the step.'),
            },
        )
    }

    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <h3 className="text-sm font-semibold">Checklist steps</h3>
                <Button size="sm" onClick={() => setAdding(true)}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" />Add step
                </Button>
            </div>

            {checklist.steps.length > 0 && (
                <div className="flex items-center gap-1 flex-wrap mb-3">
                    {([
                        { key: 'all', label: 'All' },
                        { key: 'pending', label: 'Pending' },
                        { key: 'in_progress', label: 'In progress' },
                        { key: 'completed', label: 'Completed' },
                        { key: 'overdue', label: 'Overdue' },
                    ] as Array<{ key: StepFilter; label: string }>).map(({ key, label }) => {
                        const count = stepCounts[key]
                        const active = stepFilter === key
                        return (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setStepFilter(key)}
                                disabled={key !== 'all' && count === 0}
                                className={cn(
                                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                                    active
                                        ? 'bg-primary text-primary-foreground border-primary'
                                        : 'bg-card text-muted-foreground border-border hover:bg-muted disabled:opacity-40 disabled:hover:bg-card',
                                )}
                            >
                                {label}
                                <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', active ? 'bg-primary-foreground/20' : 'bg-muted')}>{count}</span>
                            </button>
                        )
                    })}
                </div>
            )}

            {checklist.steps.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No steps yet. Click "Add step" to create one.</p>
            ) : visibleSteps.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">No steps in this view.</p>
            ) : (
                <div className="space-y-2">
                    {visibleSteps.map((step, i) => (
                        <div
                            key={step.id}
                            className={cn(
                                'w-full flex items-center gap-3 p-2.5 rounded-lg border',
                                step.status === 'completed' ? 'bg-success/5 border-success/30' :
                                    step.status === 'in_progress' ? 'bg-info/5 border-info/30' :
                                        step.status === 'overdue' ? 'bg-destructive/5 border-destructive/30' :
                                            'bg-card border-border',
                            )}
                        >
                            <button
                                type="button"
                                className={cn(
                                    'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                                    step.status === 'completed' ? 'bg-success text-success-foreground' :
                                        step.status === 'in_progress' ? 'bg-info text-info-foreground' :
                                            step.status === 'overdue' ? 'bg-destructive text-destructive-foreground' :
                                                'bg-muted text-muted-foreground',
                                )}
                                onClick={() => openEdit(step)}
                            >
                                {step.status === 'completed' ? '✓' : i + 1}
                            </button>
                            <button
                                type="button"
                                className="flex-1 min-w-0 text-left"
                                onClick={() => openEdit(step)}
                            >
                                <p className="text-sm font-medium truncate">{step.title}</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                    {step.owner ?? 'Unassigned'}
                                    {step.dueDate ? ` · Due ${formatDate(step.dueDate)}` : ''}
                                    {step.status === 'completed' && step.completedDate ? ` · Done ${formatDate(step.completedDate)}` : ''}
                                </p>
                                {step.notes && <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{step.notes}</p>}
                            </button>
                            <DueBadge dueDate={step.dueDate} status={step.status} />
                            <StatusPill status={step.status} />
                            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(step)} aria-label="Delete step">
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                        </div>
                    ))}
                </div>
            )}

            {/* Edit step dialog */}
            <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null) }}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Update step</DialogTitle></DialogHeader>
                    <DialogBody className="space-y-4">
                        <p className="text-sm font-semibold">{editing?.title}</p>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Status</label>
                            <Select value={stepStatus} onValueChange={(v) => setStepStatus(v as OnboardingStepStatus)}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="pending">Pending</SelectItem>
                                    <SelectItem value="in_progress">In progress</SelectItem>
                                    <SelectItem value="completed">Completed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {stepStatus === 'completed' && (
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Completion date</label>
                                <DatePicker value={stepDate} onChange={setStepDate} className="h-9" />
                            </div>
                        )}
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Notes (optional)</label>
                            <Textarea value={stepNotes} onChange={(e) => setStepNotes(e.target.value)} rows={3} placeholder="Add any relevant notes…" />
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
                        <Button size="sm" loading={updateStep.isPending} onClick={saveEdit}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Add step dialog */}
            <Dialog open={adding} onOpenChange={setAdding}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Add step</DialogTitle></DialogHeader>
                    <DialogBody className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-medium text-muted-foreground">Title *</label>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-2 text-[11px] text-primary"
                                    onClick={() => setShowTemplates(!showTemplates)}
                                >
                                    <Sparkles className="h-3 w-3 mr-1" />
                                    {showTemplates ? 'Hide templates' : 'From template'}
                                </Button>
                            </div>
                            {showTemplates && (
                                <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                                    {ONBOARDING_TEMPLATE_STEPS.map((t, i) => (
                                        <button
                                            key={i}
                                            type="button"
                                            onClick={() => applyTemplateStep(t)}
                                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 transition-colors"
                                        >
                                            <span className="font-medium">{t.title}</span>
                                            <span className="text-muted-foreground text-[11px] ml-2">— {t.owner} · {t.slaDays}d SLA</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                            <input
                                type="text"
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                placeholder="e.g. Issue laptop"
                                className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">Owner</label>
                                <input
                                    type="text"
                                    value={newOwner}
                                    onChange={(e) => setNewOwner(e.target.value)}
                                    placeholder="e.g. IT, HR"
                                    className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs font-medium text-muted-foreground">SLA days</label>
                                <input
                                    type="number"
                                    value={newSlaDays}
                                    onChange={(e) => setNewSlaDays(e.target.value)}
                                    placeholder="e.g. 3"
                                    min={0}
                                    className="w-full h-9 px-3 text-sm rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring/40"
                                />
                            </div>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">Due date</label>
                            <DatePicker value={newDue} onChange={setNewDue} className="h-9" />
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <DialogClose asChild><Button variant="outline" size="sm">Cancel</Button></DialogClose>
                        <Button size="sm" loading={addStep.isPending} onClick={saveNew}>Add step</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <ConfirmDialog
                open={!!confirmDelete}
                onOpenChange={(open) => { if (!open) setConfirmDelete(null) }}
                title="Delete step?"
                description={`This will permanently remove "${confirmDelete?.title}" from the checklist.`}
                confirmLabel={deleteStep.isPending ? 'Deleting…' : 'Delete'}
                variant="destructive"
                onConfirm={doDelete}
            />
        </Card>
    )
}

function DocumentsTab({ employeeId }: { employeeId: string }) {
    const { data, isLoading } = useDocuments({ employeeId, limit: 50 })
    const docs = (data?.data ?? []) as Array<{ id: string; fileName?: string; category?: string; docType?: string; status?: string; expiryDate?: string | null; uploadedAt?: string }>

    if (isLoading) {
        return (
            <Card className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </Card>
        )
    }

    return (
        <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">Employee documents</h3>
                <Button asChild size="sm" variant="outline">
                    <Link to={`/documents?employeeId=${employeeId}`}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" />Upload
                    </Link>
                </Button>
            </div>
            {docs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {docs.map((d) => (
                        <div key={d.id} className="flex items-center gap-3 p-2.5 rounded-lg border bg-card">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{d.fileName ?? d.docType ?? 'Document'}</p>
                                <p className="text-[11px] text-muted-foreground truncate">
                                    {d.category ?? '—'}
                                    {d.expiryDate ? ` · Expires ${formatDate(d.expiryDate)}` : ''}
                                    {d.uploadedAt ? ` · Uploaded ${formatDate(d.uploadedAt)}` : ''}
                                </p>
                            </div>
                            {d.status && <Badge variant="secondary" className="text-[10px] capitalize">{d.status}</Badge>}
                        </div>
                    ))}
                </div>
            )}
        </Card>
    )
}

function ActivityTab({ employeeId }: { employeeId: string }) {
    const { data, isLoading } = useActivityLogs({ entityType: 'employee', entityId: employeeId, limit: 30 })
    const logs = data ?? []

    if (isLoading) {
        return (
            <Card className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
            </Card>
        )
    }

    return (
        <Card className="p-4">
            <h3 className="text-sm font-semibold mb-3">Recent activity</h3>
            {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                    <Activity className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {logs.map((log) => (
                        <div key={log.id} className="flex items-start gap-3 p-2.5 rounded-lg border bg-card">
                            <Activity className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm">
                                    <span className="font-medium">{log.actorName ?? 'System'}</span>
                                    <span className="text-muted-foreground"> · {log.action}</span>
                                </p>
                                <p className="text-[11px] text-muted-foreground">{formatDate(log.createdAt)}</p>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    )
}
