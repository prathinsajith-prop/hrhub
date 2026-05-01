import { useParams, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, User, Mail, Phone, Globe, Briefcase, DollarSign, Star, XCircle, UserPlus, Save, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { PageHeader } from '@/components/layout/PageHeader'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/overlays'
import { cn } from '@/lib/utils'
import { useApplications, useUpdateApplicationStage, useUpdateApplication, useConvertCandidateToEmployee, useUploadResume } from '@/hooks/useRecruitment'
import { toast } from '@/components/ui/overlays'
import { EditCandidateDialog } from '@/components/shared/EditCandidateDialog'
import { CopyableEmail, CopyablePhone } from '@/components/shared'
import type { Candidate, ApplicationStage } from '@/types'

const stageLabel: Record<ApplicationStage, string> = {
    received: 'Received',
    screening: 'Screening',
    interview: 'Interview',
    assessment: 'Assessment',
    offer: 'Offer',
    pre_boarding: 'Pre-Boarding',
    rejected: 'Rejected',
}

const stageStyles: Record<ApplicationStage, string> = {
    received: 'bg-muted text-muted-foreground',
    screening: 'bg-info/10 text-info border-info/20',
    interview: 'bg-primary/10 text-primary border-primary/20',
    assessment: 'bg-warning/10 text-warning border-warning/20',
    offer: 'bg-success/10 text-success border-success/20',
    pre_boarding: 'bg-success/10 text-success border-success/20',
    rejected: 'bg-destructive/10 text-destructive border-destructive/20',
}

const stageOrder: ApplicationStage[] = ['received', 'screening', 'interview', 'assessment', 'offer', 'pre_boarding']

export function CandidateProfilePage() {
    const { t } = useTranslation()
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { data, isLoading } = useApplications({ limit: 100 })
    const updateStage = useUpdateApplicationStage()
    const updateApplication = useUpdateApplication()
    const convertToEmployee = useConvertCandidateToEmployee()
    const uploadResume = useUploadResume()
    const [resumeDownloadUrl, setResumeDownloadUrl] = useState<string | null>(null)
    const [rejectOpen, setRejectOpen] = useState(false)
    const [rejectNote, setRejectNote] = useState('')
    const [editOpen, setEditOpen] = useState(false)
    const [convertOpen, setConvertOpen] = useState(false)
    const [convertForm, setConvertForm] = useState({
        joinDate: new Date().toISOString().slice(0, 10),
        designation: '',
        department: '',
        basicSalary: '',
        note: '',
    })
    const [notesDraft, setNotesDraft] = useState('')
    const [newNote, setNewNote] = useState('')

    const candidates = (data?.data ?? []) as Candidate[]
    const candidate = candidates.find((c) => c.id === id)

    // Sync notesDraft when the server-side notes value changes (e.g. after a remote
    // save / TanStack Query refetch). Using "state during render" avoids the double-
    // render penalty of setState-inside-useEffect (react-hooks/set-state-in-effect).
    const [lastSyncedNotes, setLastSyncedNotes] = useState<string | undefined>(undefined)
    if (candidate?.notes !== lastSyncedNotes) {
        setLastSyncedNotes(candidate?.notes)
        setNotesDraft(candidate?.notes ?? '')
    }

    if (isLoading) {
        return (
            <PageWrapper>
                <PageHeader title={t('recruitment.candidates')} description={t('common.loading')} />
                <div className="grid grid-cols-1 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
                </div>
            </PageWrapper>
        )
    }

    if (!candidate) {
        return (
            <PageWrapper>
                <PageHeader title="Candidate Profile" description="Not found" />
                <div className="flex flex-col items-center gap-4 py-16">
                    <XCircle className="h-12 w-12 text-muted-foreground" />
                    <p className="text-muted-foreground">Candidate not found.</p>
                    <Button variant="outline" onClick={() => navigate('/recruitment')}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Recruitment
                    </Button>
                </div>
            </PageWrapper>
        )
    }

    function handleAdvanceStage() {
        const currentIdx = stageOrder.indexOf(candidate!.stage)
        if (currentIdx < stageOrder.length - 1) {
            const nextStage = stageOrder[currentIdx + 1]
            updateStage.mutate(
                { id: candidate!.id, stage: nextStage },
                {
                    onSuccess: () => toast.success(`Moved to ${stageLabel[nextStage]}`),
                    onError: () => toast.error('Failed to update stage'),
                },
            )
        }
    }

    function appendNoteEntry(existing: string | undefined, label: string, body: string): string {
        const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
        const entry = `[${stamp}] ${label}: ${body.trim()}`
        return existing && existing.trim().length > 0 ? `${existing.trim()}\n${entry}` : entry
    }

    function handleReject() {
        if (!candidate) return
        const trimmed = rejectNote.trim()
        if (!trimmed) {
            toast.error('Reason required', 'Please add a rejection note before continuing.')
            return
        }
        const merged = appendNoteEntry(candidate.notes, 'Rejected', trimmed)
        // Save the note first, then update the stage so the reason is preserved.
        updateApplication.mutate(
            { id: candidate.id, data: { notes: merged } },
            {
                onSuccess: () => {
                    updateStage.mutate(
                        { id: candidate.id, stage: 'rejected' },
                        {
                            onSuccess: () => {
                                setRejectOpen(false)
                                setRejectNote('')
                                toast.success('Candidate rejected')
                                navigate('/recruitment')
                            },
                            onError: () => toast.error('Failed to update stage'),
                        },
                    )
                },
                onError: () => toast.error('Failed to save rejection note'),
            },
        )
    }

    function handleSaveNotes() {
        if (!candidate) return
        updateApplication.mutate(
            { id: candidate.id, data: { notes: notesDraft } },
            {
                onSuccess: () => toast.success('Notes saved'),
                onError: () => toast.error('Failed to save notes'),
            },
        )
    }

    function handleAppendNote() {
        if (!candidate) return
        const trimmed = newNote.trim()
        if (!trimmed) return
        const merged = appendNoteEntry(candidate.notes, 'Note', trimmed)
        updateApplication.mutate(
            { id: candidate.id, data: { notes: merged } },
            {
                onSuccess: () => {
                    toast.success('Note added')
                    setNewNote('')
                    setNotesDraft(merged)
                },
                onError: () => toast.error('Failed to add note'),
            },
        )
    }

    function handleConvertSubmit() {
        if (!candidate) return
        const trimmedNote = convertForm.note.trim()
        if (!trimmedNote) {
            toast.error('Note required', 'Please add a conversion note before creating the employee record.')
            return
        }
        const merged = appendNoteEntry(candidate.notes, 'Converted', trimmedNote)
        // Save the note first so it survives even if conversion fails.
        updateApplication.mutate(
            { id: candidate.id, data: { notes: merged } },
            {
                onSuccess: () => {
                    convertToEmployee.mutate(
                        {
                            id: candidate.id,
                            data: {
                                joinDate: convertForm.joinDate || undefined,
                                designation: convertForm.designation || undefined,
                                department: convertForm.department || undefined,
                                basicSalary: convertForm.basicSalary ? Number(convertForm.basicSalary) : undefined,
                            },
                        },
                        {
                            onSuccess: (res) => {
                                setConvertOpen(false)
                                const empNo = (res as any)?.data?.employee?.employeeNo
                                toast.success('Candidate converted', empNo ? `Employee ${empNo} created.` : 'Employee created.')
                                const empId = (res as any)?.data?.employee?.id
                                if (empId) navigate(`/employees/${empId}`)
                            },
                            onError: (err: any) => toast.error('Conversion failed', err?.message ?? 'Could not create employee.'),
                        },
                    )
                },
                onError: () => toast.error('Failed to save conversion note'),
            },
        )
    }

    const currentStageIdx = stageOrder.indexOf(candidate.stage)
    const isRejected = candidate.stage === 'rejected'
    const isLastStage = currentStageIdx >= stageOrder.length - 1

    return (
        <PageWrapper>
            <PageHeader
                title={candidate.name}
                description={`Applied ${candidate.appliedDate ? new Date(candidate.appliedDate).toLocaleDateString() : ''}`}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                            <Edit2 className="h-4 w-4 mr-2" /> Edit
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => navigate('/recruitment')}>
                            <ArrowLeft className="h-4 w-4 mr-2" /> Back
                        </Button>
                    </div>
                }
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Sidebar */}
                <div className="lg:col-span-1 space-y-4">
                    <Card className="p-5 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="h-7 w-7 text-primary" />
                            </div>
                            <div>
                                <h3 className="font-semibold">{candidate.name}</h3>
                                <Badge variant="outline" className={cn('text-[11px] mt-1', stageStyles[candidate.stage])}>
                                    {stageLabel[candidate.stage]}
                                </Badge>
                            </div>
                        </div>

                        <dl className="space-y-2 text-sm">
                            <div className="flex items-center gap-2">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <CopyableEmail email={candidate.email} className="text-sm text-muted-foreground truncate" />
                            </div>
                            {candidate.phone && (
                                <div className="flex items-center gap-2">
                                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <CopyablePhone phone={candidate.phone} className="text-sm text-muted-foreground" />
                                </div>
                            )}
                            {candidate.nationality && (
                                <div className="flex items-center gap-2">
                                    <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">{candidate.nationality}</span>
                                </div>
                            )}
                            {candidate.experience !== undefined && (
                                <div className="flex items-center gap-2">
                                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">{candidate.experience} years exp.</span>
                                </div>
                            )}
                            {candidate.expectedSalary && (
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">Expects AED {candidate.expectedSalary?.toLocaleString()}</span>
                                </div>
                            )}
                            {candidate.score !== undefined && (
                                <div className="flex items-center gap-2">
                                    <Star className="h-3.5 w-3.5 text-warning shrink-0" />
                                    <span className="text-muted-foreground">Score: <strong>{candidate.score}/100</strong></span>
                                </div>
                            )}
                        </dl>

                        {/* Resume upload / download */}
                        <div className="pt-2 border-t border-border space-y-2">
                            <p className="text-xs font-medium text-muted-foreground">Resume / CV</p>
                            {(candidate.resumeUrl || resumeDownloadUrl) && (
                                <a
                                    href={resumeDownloadUrl ?? '#'}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-xs text-primary underline underline-offset-2"
                                >
                                    Download Resume
                                </a>
                            )}
                            <label className="block">
                                <span className="sr-only">Upload resume</span>
                                <input
                                    type="file"
                                    accept=".pdf,.doc,.docx"
                                    className="hidden"
                                    id="resume-upload"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (!file || !candidate) return
                                        uploadResume.mutate(
                                            { id: candidate.id, file },
                                            {
                                                onSuccess: (res) => {
                                                    setResumeDownloadUrl((res as any)?.data?.downloadUrl ?? null)
                                                    toast.success('Resume uploaded')
                                                },
                                                onError: () => toast.error('Upload failed', 'Could not upload resume.'),
                                            },
                                        )
                                        e.target.value = ''
                                    }}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-xs"
                                    disabled={uploadResume.isPending}
                                    onClick={() => document.getElementById('resume-upload')?.click()}
                                    type="button"
                                >
                                    {uploadResume.isPending ? 'Uploading…' : candidate.resumeUrl ? 'Replace Resume' : 'Upload Resume'}
                                </Button>
                            </label>
                        </div>
                    </Card>

                    {!isRejected && (
                        <div className="space-y-2">
                            {candidate.stage === 'pre_boarding' ? (
                                <Button
                                    className="w-full"
                                    onClick={() => setConvertOpen(true)}
                                    disabled={convertToEmployee.isPending}
                                >
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Convert to Employee
                                </Button>
                            ) : !isLastStage ? (
                                <Button
                                    className="w-full"
                                    onClick={handleAdvanceStage}
                                    disabled={updateStage.isPending}
                                >
                                    Move to {stageOrder[currentStageIdx + 1] ? stageLabel[stageOrder[currentStageIdx + 1]] : 'Next Stage'}
                                </Button>
                            ) : null}
                            <Button
                                variant="outline"
                                className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={() => setRejectOpen(true)}
                                disabled={updateStage.isPending}
                            >
                                Reject Candidate
                            </Button>
                        </div>
                    )}
                </div>

                {/* Main content */}
                <div className="lg:col-span-2">
                    <Tabs defaultValue="pipeline">
                        <TabsList>
                            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
                            <TabsTrigger value="notes">Notes</TabsTrigger>
                        </TabsList>

                        <TabsContent value="pipeline" className="mt-4">
                            <Card className="p-6">
                                <h3 className="font-semibold mb-6 text-sm">Recruitment Pipeline</h3>
                                <div className="space-y-4">
                                    {stageOrder.map((stage, i) => {
                                        const done = i < currentStageIdx
                                        const current = i === currentStageIdx && !isRejected
                                        return (
                                            <div key={stage} className="flex gap-4">
                                                <div className="flex flex-col items-center">
                                                    <div className={cn(
                                                        'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2',
                                                        done ? 'bg-success border-success text-success-foreground' :
                                                            current ? 'bg-primary border-primary text-primary-foreground' :
                                                                'bg-card border-border text-muted-foreground'
                                                    )}>
                                                        {done ? '✓' : i + 1}
                                                    </div>
                                                    {i < stageOrder.length - 1 && (
                                                        <div className={cn('w-0.5 flex-1 min-h-[24px] mt-1', done ? 'bg-success' : 'bg-border')} />
                                                    )}
                                                </div>
                                                <div className="pb-4 flex-1">
                                                    <p className={cn(
                                                        'font-medium text-sm',
                                                        done ? 'text-success' : current ? 'text-primary' : 'text-muted-foreground'
                                                    )}>
                                                        {stageLabel[stage]}
                                                    </p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {done ? 'Completed' : current ? 'Current Stage' : 'Upcoming'}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {isRejected && (
                                        <div className="flex gap-4">
                                            <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2 bg-destructive border-destructive text-destructive-foreground">
                                                ✕
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium text-sm text-destructive">Rejected</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">Application closed</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </Card>
                        </TabsContent>

                        <TabsContent value="notes" className="mt-4 space-y-4">
                            <Card className="p-6 space-y-3">
                                <h3 className="font-semibold text-sm">Add a note</h3>
                                <Textarea
                                    value={newNote}
                                    onChange={(e) => setNewNote(e.target.value)}
                                    placeholder="Interview feedback, screening summary, references checked, etc."
                                    rows={3}
                                />
                                <div className="flex justify-end">
                                    <Button
                                        size="sm"
                                        onClick={handleAppendNote}
                                        disabled={updateApplication.isPending || !newNote.trim()}
                                    >
                                        <Save className="h-3.5 w-3.5 mr-1.5" />
                                        {updateApplication.isPending ? 'Saving…' : 'Add Note'}
                                    </Button>
                                </div>
                            </Card>

                            <Card className="p-6 space-y-3">
                                <h3 className="font-semibold text-sm">Notes history</h3>
                                {(() => {
                                    const raw = (candidate.notes ?? '').trim()
                                    if (!raw) {
                                        return <p className="text-xs text-muted-foreground">No notes yet.</p>
                                    }
                                    // Split on lines beginning with [YYYY-MM-DD HH:mm] markers; keep legacy text as one entry.
                                    const entryRegex = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s*(?:([^:]+):\s*)?(.*)$/
                                    const lines = raw.split(/\r?\n/)
                                    const entries: { stamp?: string; label?: string; text: string }[] = []
                                    let buf: { stamp?: string; label?: string; text: string } | null = null
                                    for (const line of lines) {
                                        const m = line.match(entryRegex)
                                        if (m) {
                                            if (buf) entries.push(buf)
                                            buf = { stamp: m[1], label: m[2]?.trim(), text: m[3] }
                                        } else if (buf) {
                                            buf.text += `\n${line}`
                                        } else {
                                            buf = { text: line }
                                        }
                                    }
                                    if (buf) entries.push(buf)
                                    return (
                                        <ol className="space-y-3">
                                            {entries.slice().reverse().map((e, i) => (
                                                <li key={i} className="border-l-2 border-border pl-3 py-1">
                                                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                        {e.stamp && <span>{e.stamp}</span>}
                                                        {e.label && (
                                                            <Badge variant="outline" className="text-[10px] py-0 h-4">{e.label}</Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-sm whitespace-pre-wrap mt-1">{e.text}</p>
                                                </li>
                                            ))}
                                        </ol>
                                    )
                                })()}
                            </Card>

                            <Card className="p-6 space-y-3">
                                <div className="flex items-center justify-between">
                                    <h3 className="font-semibold text-sm">Raw notes (advanced)</h3>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleSaveNotes}
                                        disabled={updateApplication.isPending || notesDraft === (candidate.notes ?? '')}
                                    >
                                        <Save className="h-3.5 w-3.5 mr-1.5" />
                                        {updateApplication.isPending ? 'Saving…' : 'Save'}
                                    </Button>
                                </div>
                                <Textarea
                                    value={notesDraft}
                                    onChange={(e) => setNotesDraft(e.target.value)}
                                    placeholder="Edit raw notes log."
                                    rows={6}
                                    className="resize-y font-mono text-xs"
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Editing here lets you correct typos in older entries. Prefer the "Add a note" box above for new entries.
                                </p>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            <EditCandidateDialog
                candidate={candidate}
                open={editOpen}
                onOpenChange={setEditOpen}
            />

            <AlertDialog open={rejectOpen} onOpenChange={(v) => { setRejectOpen(v); if (!v) setRejectNote('') }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject this candidate?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will move <strong>{candidate.name}</strong> to the rejected stage. A rejection
                            reason is required and will be stored in the notes history.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2 py-2">
                        <Label htmlFor="reject-note">Rejection reason *</Label>
                        <Textarea
                            id="reject-note"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            placeholder="e.g. Salary expectation outside range; weak technical screen; withdrew application…"
                            rows={4}
                            autoFocus
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => { e.preventDefault(); handleReject() }}
                            disabled={!rejectNote.trim() || updateApplication.isPending || updateStage.isPending}
                        >
                            Reject Candidate
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
                <DialogContent size="md">
                    <DialogHeader>
                        <DialogTitle>Convert to Employee</DialogTitle>
                    </DialogHeader>
                    <DialogBody className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                            Create an employee record for <strong>{candidate.name}</strong>. The new employee
                            will start in the <em>onboarding</em> status with an auto-generated employee number.
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label required>Join Date</Label>
                                <DatePicker
                                    value={convertForm.joinDate}
                                    onChange={(v) => setConvertForm((f) => ({ ...f, joinDate: v }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Designation</Label>
                                <Input
                                    value={convertForm.designation}
                                    onChange={(e) => setConvertForm((f) => ({ ...f, designation: e.target.value }))}
                                    placeholder="e.g. Senior Developer"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Department</Label>
                                <Input
                                    value={convertForm.department}
                                    onChange={(e) => setConvertForm((f) => ({ ...f, department: e.target.value }))}
                                    placeholder="e.g. Engineering"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Basic Salary (AED)</Label>
                                <NumericInput
                                    value={convertForm.basicSalary}
                                    onChange={(e) => setConvertForm((f) => ({ ...f, basicSalary: e.target.value }))}
                                    placeholder={candidate.expectedSalary?.toString() ?? '0'}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="convert-note">Conversion note *</Label>
                            <Textarea
                                id="convert-note"
                                value={convertForm.note}
                                onChange={(e) => setConvertForm((f) => ({ ...f, note: e.target.value }))}
                                placeholder="e.g. Offer accepted on 12 Apr; reporting to Engineering Manager."
                                rows={3}
                            />
                            <p className="text-[11px] text-muted-foreground">
                                This note will be appended to the candidate's notes history alongside the conversion timestamp.
                            </p>
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
                        <Button
                            onClick={handleConvertSubmit}
                            loading={convertToEmployee.isPending || updateApplication.isPending}
                            disabled={!convertForm.note.trim()}
                        >
                            <UserPlus className="h-4 w-4 mr-2" /> Create Employee
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </PageWrapper>
    )
}
