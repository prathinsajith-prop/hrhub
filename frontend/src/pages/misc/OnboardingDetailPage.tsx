import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { labelFor } from '@/lib/enums'
import { Clock, CheckCircle2, Plus, ArrowLeft, Trash2, Mail, Phone, FileText, Activity, Sparkles, Send, Upload, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge, Card, Progress } from '@/components/ui/primitives'
import { ConfirmDialog, toast, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogBody, DialogClose } from '@/components/ui/overlays'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/form-controls'
import { DatePicker } from '@/components/ui/date-picker'
import { NumericInput } from '@/components/ui/numeric-input'
import { Textarea } from '@/components/ui/textarea'
import { formatDate, cn } from '@/lib/utils'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { useEmployeeChecklist, useUpdateOnboardingStep, useAddOnboardingStep, useDeleteOnboardingStep, useSendOnboardingUploadLink, type OnboardingChecklist, type OnboardingStep, type OnboardingStepStatus } from '@/hooks/useOnboarding'
import { useDocuments, useUploadDocument } from '@/hooks/useDocuments'
import { useQueryClient } from '@tanstack/react-query'
import { useActivityLogs } from '@/hooks/useAudit'
import { InitialsAvatar } from '@/components/shared/Avatar'
import { DOC_TYPE_CATALOG, CATEGORY_LABELS, type DocCategory } from '@/lib/docTypes'
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
    const sendLink = useSendOnboardingUploadLink()

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

    const handleSendUploadLink = () => {
        sendLink.mutate({ checklistId: checklist.id }, {
            onSuccess: (result) => {
                if (result.sent) {
                    toast.success('Upload link sent', `Email sent to ${result.email}. Link expires in ${result.expiresInDays} days.`)
                } else {
                    toast.warning('Email delivery failed', 'Link generated but email could not be sent. Check email settings.')
                }
            },
            onError: () => toast.error('Failed to send link', 'Could not generate upload link. Please try again.'),
        })
    }

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
                    <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-right">
                            <p className={cn('text-3xl font-bold font-display', tone.color)}>{checklist.progress}%</p>
                            <p className="text-xs text-muted-foreground">{tone.label} · {checklist.completedCount}/{checklist.totalCount} steps</p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                leftIcon={<Send className="h-3.5 w-3.5" />}
                                loading={sendLink.isPending}
                                onClick={handleSendUploadLink}
                                title={checklist.email ? `Send upload link to ${checklist.email}` : 'No email address on record'}
                                disabled={!checklist.email}
                            >
                                Send Upload Link
                            </Button>
                            <Button asChild variant="outline" size="sm">
                                <Link to={`/employees/${checklist.employeeId}`}>View employee</Link>
                            </Button>
                        </div>
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
                <TabsContent value="documents"><DocumentsTab checklist={checklist} /></TabsContent>
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                                <NumericInput
                                    decimal={false}
                                    value={newSlaDays}
                                    onChange={(e) => setNewSlaDays(e.target.value)}
                                    placeholder="e.g. 3"
                                    className="h-9"
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

// ── Per-step document upload panel ───────────────────────────────────────────
function StepDocPanel({
    step,
    stepDocs,
    employeeId,
}: {
    step: OnboardingStep
    stepDocs: Array<{ id: string; docType: string; fileName?: string; category?: string; status?: string; expiryDate?: string | null; stepId?: string | null }>
    employeeId: string
}) {
    const [expanded, setExpanded] = useState(false)
    const [uploadOpen, setUploadOpen] = useState(false)
    const [selectedCategory, setSelectedCategory] = useState<DocCategory | ''>('')
    const [selectedDocType, setSelectedDocType] = useState('')
    const [expiryDate, setExpiryDate] = useState('')
    const [file, setFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)
    const fileRef = useRef<HTMLInputElement>(null)
    const qc = useQueryClient()
    const uploadDoc = useUploadDocument()

    const categoryDocs = selectedCategory ? DOC_TYPE_CATALOG[selectedCategory] : []
    const selectedDocDef = categoryDocs.find(d => d.docType === selectedDocType)
    const expiryRequired = selectedDocDef?.expiryRequired ?? false

    const handleUpload = async () => {
        if (!selectedCategory || !selectedDocType || !file) {
            toast.warning('Incomplete', 'Please select a category, document type, and file.')
            return
        }
        if (expiryRequired && !expiryDate) {
            toast.warning('Expiry date required', `${selectedDocType} requires an expiry date.`)
            return
        }
        setUploading(true)
        try {
            await uploadDoc.mutateAsync({
                file,
                employeeId,
                category: selectedCategory,
                docType: selectedDocType,
                expiryDate: expiryDate || undefined,
            })
            await qc.invalidateQueries({ queryKey: ['documents'] })
            toast.success('Document uploaded', `${selectedDocType} submitted for review.`)
            setUploadOpen(false)
            setFile(null)
            setSelectedCategory('')
            setSelectedDocType('')
            setExpiryDate('')
        } catch {
            toast.error('Upload failed', 'Could not upload the document.')
        } finally {
            setUploading(false)
        }
    }

    const docCount = stepDocs.length
    const hasOverdue = step.status === 'overdue'

    return (
        <div className={cn(
            'rounded-xl border overflow-hidden',
            step.status === 'completed' ? 'border-success/30 bg-success/5' :
                hasOverdue ? 'border-destructive/30 bg-destructive/5' :
                    'border-border bg-card',
        )}>
            <button
                type="button"
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-center gap-3 px-3.5 py-3 hover:bg-black/5 transition-colors text-left"
            >
                <div className={cn(
                    'h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0',
                    step.status === 'completed' ? 'bg-success text-success-foreground' :
                        hasOverdue ? 'bg-destructive text-destructive-foreground' :
                            'bg-muted text-muted-foreground',
                )}>
                    {step.status === 'completed' ? '✓' : step.stepOrder}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{step.title}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                        {step.owner ?? 'Unassigned'}
                        {step.dueDate ? ` · Due ${formatDate(step.dueDate)}` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {docCount > 0 && (
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                            {docCount} doc{docCount !== 1 ? 's' : ''}
                        </span>
                    )}
                    <StatusPill status={step.status} />
                    {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
            </button>

            {expanded && (
                <div className="border-t px-3.5 py-3 space-y-3">
                    {/* Existing docs */}
                    {stepDocs.length > 0 ? (
                        <div className="space-y-1.5">
                            {stepDocs.map((d) => (
                                <div key={d.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-card border">
                                    <FileText className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold text-foreground truncate">{d.docType}</p>
                                        <p className="text-[10px] text-muted-foreground truncate">
                                            {CATEGORY_LABELS[d.category as DocCategory] ?? d.category}
                                            {d.expiryDate ? ` · Expires ${formatDate(d.expiryDate)}` : ''}
                                        </p>
                                    </div>
                                    <Badge
                                        variant={d.status === 'valid' ? 'success' : d.status === 'expired' ? 'destructive' : 'secondary'}
                                        className="text-[10px] capitalize shrink-0"
                                    >
                                        {labelFor(d.status)}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-xs text-muted-foreground py-1">No documents uploaded for this step yet.</p>
                    )}

                    {/* Upload form toggle */}
                    {!uploadOpen ? (
                        <Button size="sm" variant="outline" leftIcon={<Upload className="h-3 w-3" />} onClick={() => setUploadOpen(true)}>
                            Upload document
                        </Button>
                    ) : (
                        <div className="border rounded-xl p-3.5 space-y-3 bg-background">
                            <p className="text-xs font-semibold text-foreground">Upload for: {step.title}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="space-y-1">
                                    <label className="text-[11px] font-medium text-muted-foreground">Category *</label>
                                    <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v as DocCategory); setSelectedDocType('') }}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                                        <SelectContent>
                                            {(Object.entries(CATEGORY_LABELS) as [DocCategory, string][]).map(([key, label]) => (
                                                <SelectItem key={key} value={key} className="text-xs">{label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[11px] font-medium text-muted-foreground">Document type *</label>
                                    <Select value={selectedDocType} onValueChange={setSelectedDocType} disabled={!selectedCategory}>
                                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                                        <SelectContent>
                                            {categoryDocs.map(d => (
                                                <SelectItem key={d.docType} value={d.docType} className="text-xs">
                                                    {d.label}{d.expiryRequired ? ' *' : ''}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {expiryRequired && (
                                <div className="space-y-1">
                                    <label className="text-[11px] font-medium text-destructive flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />Expiry date required *
                                    </label>
                                    <DatePicker value={expiryDate} onChange={setExpiryDate} className="h-8" />
                                </div>
                            )}

                            <div className="space-y-1">
                                <label className="text-[11px] font-medium text-muted-foreground">File *</label>
                                <div
                                    className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                                    onClick={() => fileRef.current?.click()}
                                >
                                    {file ? (
                                        <div className="flex items-center justify-center gap-1.5 text-xs">
                                            <FileText className="h-3.5 w-3.5 text-primary" />
                                            <span className="font-medium truncate max-w-[180px]">{file.name}</span>
                                        </div>
                                    ) : (
                                        <p className="text-[11px] text-muted-foreground">Click to choose file (PDF, JPG, PNG)</p>
                                    )}
                                    <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <Button size="sm" loading={uploading} leftIcon={<Upload className="h-3 w-3" />} onClick={handleUpload}>
                                    Upload
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { setUploadOpen(false); setFile(null); setSelectedCategory(''); setSelectedDocType(''); setExpiryDate('') }}>
                                    Cancel
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

function DocumentsTab({ checklist }: { checklist: OnboardingChecklist }) {
    const { data, isLoading } = useDocuments({ employeeId: checklist.employeeId, limit: 100 })
    const allDocs = (data?.data ?? []) as Array<{ id: string; docType: string; fileName?: string; category?: string; status?: string; expiryDate?: string | null; stepId?: string | null }>

    // Group docs by stepId
    const docsByStep = useMemo(() => {
        const map = new Map<string, typeof allDocs>()
        for (const d of allDocs) {
            const key = d.stepId ?? '__none'
            const arr = map.get(key) ?? []
            arr.push(d)
            map.set(key, arr)
        }
        return map
    }, [allDocs])

    const unattachedDocs = docsByStep.get('__none') ?? []

    if (isLoading) {
        return (
            <Card className="p-4 space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-xl" />)}
            </Card>
        )
    }

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-semibold">Documents by onboarding step</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Upload documents against each step. Expiry dates are required for time-sensitive documents.</p>
                </div>
                <Button asChild size="sm" variant="outline" leftIcon={<Plus className="h-3.5 w-3.5" />}>
                    <Link to={`/documents?employeeId=${checklist.employeeId}`}>All documents</Link>
                </Button>
            </div>

            {/* Per-step panels */}
            {checklist.steps.length === 0 ? (
                <Card className="flex flex-col items-center justify-center py-10 text-center gap-2">
                    <FileText className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">No onboarding steps yet. Add steps first, then upload documents against each one.</p>
                </Card>
            ) : (
                <div className="space-y-2">
                    {checklist.steps.map((step) => (
                        <StepDocPanel
                            key={step.id}
                            step={step}
                            stepDocs={docsByStep.get(step.id) ?? []}
                            employeeId={checklist.employeeId}
                        />
                    ))}
                </div>
            )}

            {/* Unattached docs (legacy / uploaded from main docs page) */}
            {unattachedDocs.length > 0 && (
                <Card className="p-4">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">Other employee documents (not linked to a step)</h4>
                    <div className="space-y-1.5">
                        {unattachedDocs.map((d) => (
                            <div key={d.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border bg-card">
                                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium truncate">{d.docType}</p>
                                    <p className="text-[10px] text-muted-foreground truncate">
                                        {CATEGORY_LABELS[d.category as DocCategory] ?? d.category}
                                        {d.expiryDate ? ` · Expires ${formatDate(d.expiryDate)}` : ''}
                                    </p>
                                </div>
                                <Badge variant="secondary" className="text-[10px] capitalize shrink-0">{labelFor(d.status)}</Badge>
                            </div>
                        ))}
                    </div>
                </Card>
            )}
        </div>
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
