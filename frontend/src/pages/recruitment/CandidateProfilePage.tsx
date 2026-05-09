import { useParams, useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import {
    ArrowLeft, Mail, Phone, Globe, Briefcase, DollarSign, Star,
    XCircle, UserPlus, Save, Edit2, FileText, Upload, CheckCircle2,
    Clock, ChevronRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
    AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter } from '@/components/ui/overlays'
import { cn, getInitials, formatDate, formatCurrency } from '@/lib/utils'
import { useApplication, useUpdateApplicationStage, useUpdateApplication, useConvertCandidateToEmployee, useUploadResume } from '@/hooks/useRecruitment'
import { useOrgUnits, type OrgUnit } from '@/hooks/useOrgUnits'
import { buildOrgOptions } from '@/components/shared/action-dialogs'
import { Combobox } from '@/components/ui/combobox'
import { toast } from '@/components/ui/overlays'
import { EditCandidateDialog } from '@/components/shared/EditCandidateDialog'
import { CopyableEmail, CopyablePhone } from '@/components/shared'
import { FlagImg, resolveCountryIso } from '@/components/shared/PhoneInput'
import type { Candidate, ApplicationStage } from '@/types'

const STAGE_CONFIG: Record<ApplicationStage, {
    label: string
    badgeClass: string
    dotClass: string
    textClass: string
    lineClass: string
}> = {
    received: { label: 'Received', badgeClass: 'bg-slate-100 text-slate-600 border-slate-300', dotClass: 'bg-slate-400 border-slate-400 text-white', lineClass: 'bg-slate-200', textClass: 'text-slate-600' },
    screening: { label: 'Screening', badgeClass: 'bg-info/10 text-info border-info/20', dotClass: 'bg-info border-info text-white', lineClass: 'bg-info/30', textClass: 'text-info' },
    interview: { label: 'Interview', badgeClass: 'bg-warning/10 text-warning border-warning/20', dotClass: 'bg-warning border-warning text-warning-foreground', lineClass: 'bg-warning/30', textClass: 'text-warning' },
    assessment: { label: 'Assessment', badgeClass: 'bg-primary/10 text-primary border-primary/20', dotClass: 'bg-primary border-primary text-primary-foreground', lineClass: 'bg-primary/30', textClass: 'text-primary' },
    offer: { label: 'Offer', badgeClass: 'bg-success/10 text-success border-success/20', dotClass: 'bg-success border-success text-success-foreground', lineClass: 'bg-success/30', textClass: 'text-success' },
    pre_boarding: { label: 'Pre-Boarding', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200', dotClass: 'bg-emerald-500 border-emerald-500 text-white', lineClass: 'bg-emerald-200', textClass: 'text-emerald-600' },
    rejected: { label: 'Rejected', badgeClass: 'bg-destructive/10 text-destructive border-destructive/20', dotClass: 'bg-destructive border-destructive text-destructive-foreground', lineClass: 'bg-destructive/30', textClass: 'text-destructive' },
}

const STAGE_ORDER: ApplicationStage[] = ['received', 'screening', 'interview', 'assessment', 'offer', 'pre_boarding']

const NOTE_ENTRY_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s*(?:([^:]+):\s*)?(.*)$/

function parseNoteEntries(raw: string) {
    const lines = raw.trim().split(/\r?\n/)
    const entries: { stamp?: string; label?: string; text: string }[] = []
    let buf: { stamp?: string; label?: string; text: string } | null = null
    for (const line of lines) {
        const m = line.match(NOTE_ENTRY_RE)
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
    return entries.slice().reverse()
}

function appendNoteEntry(existing: string | undefined, label: string, body: string): string {
    const stamp = new Date().toISOString().replace('T', ' ').slice(0, 16)
    const entry = `[${stamp}] ${label}: ${body.trim()}`
    return existing && existing.trim().length > 0 ? `${existing.trim()}\n${entry}` : entry
}

function ScoreBadge({ score }: { score: number }) {
    const color = score >= 80 ? 'text-success' : score >= 60 ? 'text-warning' : 'text-muted-foreground'
    return (
        <div className="flex items-center gap-1.5">
            <Star className={cn('h-3.5 w-3.5 fill-current', color)} />
            <span className={cn('font-semibold tabular-nums', color)}>{score}</span>
            <span className="text-muted-foreground text-xs">/ 100</span>
        </div>
    )
}

function NoteHistory({ notes }: { notes: string | undefined }) {
    const entries = useMemo(() => parseNoteEntries(notes ?? ''), [notes])
    if (!entries.length) return <p className="text-sm text-muted-foreground py-4 text-center">No notes yet.</p>
    return (
        <ol className="space-y-3">
            {entries.map((e, i) => (
                <li key={i} className="border-l-2 border-border pl-3 py-1">
                    {(e.stamp || e.label) && (
                        <div className="flex items-center gap-2 mb-1">
                            {e.stamp && <span className="text-[11px] text-muted-foreground tabular-nums">{e.stamp}</span>}
                            {e.label && (
                                <Badge variant="outline" className="text-[10px] py-0 h-4">{e.label}</Badge>
                            )}
                        </div>
                    )}
                    <p className="text-sm whitespace-pre-wrap text-foreground/90">{e.text}</p>
                </li>
            ))}
        </ol>
    )
}

export function CandidateProfilePage() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const { data: candidateData, isLoading } = useApplication(id)
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
        departmentId: '',
        basicSalary: '',
        note: '',
    })
    const [newNote, setNewNote] = useState('')

    const { data: orgUnitsRaw = [] } = useOrgUnits()
    const orgUnits = Array.isArray(orgUnitsRaw) ? orgUnitsRaw as OrgUnit[] : []
    const orgOptions = buildOrgOptions(orgUnits)

    const candidate = candidateData as Candidate | undefined

    if (isLoading) {
        return (
            <PageWrapper>
                <div className="space-y-4">
                    <Skeleton className="h-10 w-64" />
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <Skeleton className="h-64" />
                        <div className="lg:col-span-2 space-y-3">
                            <Skeleton className="h-10 w-48" />
                            <Skeleton className="h-48" />
                        </div>
                    </div>
                </div>
            </PageWrapper>
        )
    }

    if (!candidate) {
        return (
            <PageWrapper>
                <div className="flex flex-col items-center gap-4 py-24">
                    <XCircle className="h-12 w-12 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">Candidate not found.</p>
                    <Button variant="outline" size="sm" onClick={() => navigate('/recruitment')}>
                        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Recruitment
                    </Button>
                </div>
            </PageWrapper>
        )
    }

    const currentStageIdx = STAGE_ORDER.indexOf(candidate.stage)
    const isRejected = candidate.stage === 'rejected'
    const isLastStage = currentStageIdx >= STAGE_ORDER.length - 1
    const stageCfg = STAGE_CONFIG[candidate.stage]
    const effectiveResumeUrl = resumeDownloadUrl ?? candidate.resumeUrl

    function handleAdvanceStage() {
        const nextStage = STAGE_ORDER[currentStageIdx + 1]
        if (!nextStage) return
        updateStage.mutate(
            { id: candidate!.id, stage: nextStage },
            {
                onSuccess: () => toast.success(`Moved to ${STAGE_CONFIG[nextStage].label}`),
                onError: () => toast.error('Failed to update stage'),
            },
        )
    }

    function handleReject() {
        const trimmed = rejectNote.trim()
        if (!trimmed) { toast.error('Reason required', 'Please add a rejection note before continuing.'); return }
        const merged = appendNoteEntry(candidate!.notes, 'Rejected', trimmed)
        updateApplication.mutate(
            { id: candidate!.id, data: { notes: merged } },
            {
                onSuccess: () => updateStage.mutate(
                    { id: candidate!.id, stage: 'rejected' },
                    {
                        onSuccess: () => { setRejectOpen(false); setRejectNote(''); toast.success('Candidate rejected'); navigate('/recruitment') },
                        onError: () => toast.error('Failed to update stage'),
                    },
                ),
                onError: () => toast.error('Failed to save rejection note'),
            },
        )
    }

    function handleAppendNote() {
        const trimmed = newNote.trim()
        if (!trimmed) return
        const merged = appendNoteEntry(candidate!.notes, 'Note', trimmed)
        updateApplication.mutate(
            { id: candidate!.id, data: { notes: merged } },
            {
                onSuccess: () => { toast.success('Note added'); setNewNote('') },
                onError: () => toast.error('Failed to add note'),
            },
        )
    }

    function handleConvertSubmit() {
        const trimmedNote = convertForm.note.trim()
        if (!trimmedNote) { toast.error('Note required', 'Please add a conversion note before creating the employee record.'); return }
        const merged = appendNoteEntry(candidate!.notes, 'Converted', trimmedNote)
        updateApplication.mutate(
            { id: candidate!.id, data: { notes: merged } },
            {
                onSuccess: () => convertToEmployee.mutate(
                    {
                        id: candidate!.id,
                        data: {
                            joinDate: convertForm.joinDate || undefined,
                            designation: convertForm.designation || undefined,
                            department: convertForm.department || undefined,
                            departmentId: convertForm.departmentId || undefined,
                            basicSalary: convertForm.basicSalary ? Number(convertForm.basicSalary) : undefined,
                        },
                    },
                    {
                        onSuccess: (res) => {
                            setConvertOpen(false)
                            const empNo = res?.data?.employee?.employeeNo
                            toast.success('Candidate converted', empNo ? `Employee ${empNo} created.` : 'Employee created.')
                            const empId = res?.data?.employee?.id
                            if (empId) navigate(`/employees/${empId}`)
                        },
                        onError: (err: Error & { message?: string }) => toast.error('Conversion failed', err?.message ?? 'Could not create employee.'),
                    },
                ),
                onError: () => toast.error('Failed to save conversion note'),
            },
        )
    }

    return (
        <PageWrapper>
            {/* ── Page header ── */}
            <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12 border border-border shrink-0">
                        {candidate.avatar && <img src={candidate.avatar} alt={candidate.name} className="object-cover" />}
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                            {getInitials(candidate.name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold truncate">{candidate.name}</h1>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {candidate.jobTitle && (
                                <span className="text-sm text-muted-foreground">{candidate.jobTitle}</span>
                            )}
                            {candidate.jobTitle && <span className="text-muted-foreground/40">·</span>}
                            <span className="text-sm text-muted-foreground">
                                Applied {candidate.appliedDate ? formatDate(candidate.appliedDate) : '—'}
                            </span>
                            <Badge variant="outline" className={cn('text-[11px]', stageCfg.badgeClass)}>
                                {stageCfg.label}
                            </Badge>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                        <Edit2 className="h-3.5 w-3.5 mr-1.5" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/recruitment')}>
                        <ArrowLeft className="h-3.5 w-3.5 mr-1.5" /> Back
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Sidebar ── */}
                <div className="space-y-4">

                    {/* Contact & details */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Profile</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-0">
                            <div className="flex items-start gap-2 text-sm">
                                <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                <CopyableEmail email={candidate.email} className="text-muted-foreground truncate" />
                            </div>
                            {candidate.phone && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <CopyablePhone phone={candidate.phone} className="text-muted-foreground" />
                                </div>
                            )}
                            {candidate.nationality && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <div className="flex items-center gap-1.5">
                                        <FlagImg iso2={resolveCountryIso(candidate.nationality) ?? ''} size={14} className="shrink-0" />
                                        <span className="text-muted-foreground">{candidate.nationality}</span>
                                    </div>
                                </div>
                            )}
                            {candidate.experience !== undefined && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">{candidate.experience} yr{candidate.experience !== 1 ? 's' : ''} experience</span>
                                </div>
                            )}

                            {(candidate.expectedSalary || candidate.currentSalary || candidate.score !== undefined) && (
                                <div className="border-t border-border pt-3 space-y-2.5">
                                    {candidate.score !== undefined && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Score</span>
                                            <ScoreBadge score={candidate.score} />
                                        </div>
                                    )}
                                    {candidate.currentSalary && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Current salary</span>
                                            <span className="font-medium tabular-nums">{formatCurrency(candidate.currentSalary)}</span>
                                        </div>
                                    )}
                                    {candidate.expectedSalary && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Expected salary</span>
                                            <span className="font-medium tabular-nums">{formatCurrency(candidate.expectedSalary)}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Resume */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm">Resume / CV</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 pt-0">
                            {effectiveResumeUrl ? (
                                <a
                                    href={effectiveResumeUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                                >
                                    <FileText className="h-3.5 w-3.5 shrink-0" />
                                    View / Download Resume
                                </a>
                            ) : (
                                <p className="text-sm text-muted-foreground">No resume on file.</p>
                            )}
                            <label>
                                <span className="sr-only">Upload resume</span>
                                <input
                                    id="resume-upload"
                                    type="file"
                                    accept=".pdf,.doc,.docx"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (!file) return
                                        uploadResume.mutate(
                                            { id: candidate.id, file },
                                            {
                                                onSuccess: (res) => { setResumeDownloadUrl(res?.data?.downloadUrl ?? null); toast.success('Resume uploaded') },
                                                onError: () => toast.error('Upload failed', 'Could not upload resume.'),
                                            },
                                        )
                                        e.target.value = ''
                                    }}
                                />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-xs mt-1"
                                    disabled={uploadResume.isPending}
                                    onClick={() => document.getElementById('resume-upload')?.click()}
                                    type="button"
                                >
                                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                                    {uploadResume.isPending ? 'Uploading…' : effectiveResumeUrl ? 'Replace Resume' : 'Upload Resume'}
                                </Button>
                            </label>
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    {!isRejected && (
                        <div className="space-y-2">
                            {candidate.stage === 'pre_boarding' ? (
                                <Button className="w-full" onClick={() => setConvertOpen(true)} disabled={convertToEmployee.isPending}>
                                    <UserPlus className="h-4 w-4 mr-2" />
                                    Convert to Employee
                                </Button>
                            ) : !isLastStage ? (
                                <Button className="w-full" onClick={handleAdvanceStage} disabled={updateStage.isPending}>
                                    <ChevronRight className="h-4 w-4 mr-1.5" />
                                    Move to {STAGE_CONFIG[STAGE_ORDER[currentStageIdx + 1]].label}
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

                {/* ── Main content ── */}
                <div className="lg:col-span-2">
                    <Tabs defaultValue="overview">
                        <TabsList>
                            <TabsTrigger value="overview">Overview</TabsTrigger>
                            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
                            <TabsTrigger value="notes">Notes</TabsTrigger>
                        </TabsList>

                        {/* ── Overview tab ── */}
                        <TabsContent value="overview" className="mt-4 space-y-4">
                            {/* Current stage callout */}
                            <Card className={cn('border', isRejected ? 'border-destructive/30 bg-destructive/5' : 'border-primary/20 bg-primary/5')}>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className={cn('h-9 w-9 rounded-full flex items-center justify-center shrink-0', stageCfg.dotClass)}>
                                            {isRejected ? <XCircle className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm">
                                                {isRejected ? 'Application Rejected' : `Currently in ${stageCfg.label}`}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {isRejected
                                                    ? 'This candidate has been removed from the active pipeline.'
                                                    : !isLastStage
                                                        ? `Next: ${STAGE_CONFIG[STAGE_ORDER[currentStageIdx + 1]].label}`
                                                        : 'Final stage — ready to convert to employee.'}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Quick stats */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <StatCard label="Score" value={candidate.score !== undefined ? `${candidate.score}/100` : '—'} icon={<Star className="h-4 w-4 text-warning" />} />
                                <StatCard label="Experience" value={candidate.experience !== undefined ? `${candidate.experience} yr${candidate.experience !== 1 ? 's' : ''}` : '—'} icon={<Briefcase className="h-4 w-4 text-primary" />} />
                                <StatCard label="Expected" value={candidate.expectedSalary ? formatCurrency(candidate.expectedSalary) : '—'} icon={<DollarSign className="h-4 w-4 text-success" />} />
                                <StatCard label="Applied" value={candidate.appliedDate ? formatDate(candidate.appliedDate) : '—'} icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />} />
                            </div>

                            {/* Latest note preview */}
                            {candidate.notes?.trim() && (() => {
                                const latest = parseNoteEntries(candidate.notes)[0]
                                return latest ? (
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <div className="flex items-center justify-between">
                                                <CardTitle className="text-sm">Latest Note</CardTitle>
                                                {latest.stamp && <span className="text-[11px] text-muted-foreground tabular-nums">{latest.stamp}</span>}
                                            </div>
                                        </CardHeader>
                                        <CardContent className="pt-0">
                                            {latest.label && <Badge variant="outline" className="text-[10px] py-0 h-4 mb-2">{latest.label}</Badge>}
                                            <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">{latest.text}</p>
                                        </CardContent>
                                    </Card>
                                ) : null
                            })()}
                        </TabsContent>

                        {/* ── Pipeline tab ── */}
                        <TabsContent value="pipeline" className="mt-4">
                            <Card>
                                <CardHeader className="pb-4">
                                    <CardTitle className="text-sm">Recruitment Pipeline</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0 space-y-1">
                                    {STAGE_ORDER.map((stage, i) => {
                                        const done = i < currentStageIdx
                                        const current = i === currentStageIdx && !isRejected
                                        const cfg = STAGE_CONFIG[stage]
                                        return (
                                            <div key={stage} className="flex gap-4">
                                                <div className="flex flex-col items-center">
                                                    <div className={cn(
                                                        'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2',
                                                        done || current ? cfg.dotClass : 'bg-card border-border text-muted-foreground',
                                                    )}>
                                                        {done ? '✓' : i + 1}
                                                    </div>
                                                    {i < STAGE_ORDER.length - 1 && (
                                                        <div className={cn('w-0.5 flex-1 min-h-[24px] mt-1', done ? cfg.lineClass : 'bg-border')} />
                                                    )}
                                                </div>
                                                <div className="pb-4 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className={cn('font-medium text-sm', done || current ? cfg.textClass : 'text-muted-foreground')}>
                                                            {cfg.label}
                                                        </p>
                                                        {current && (
                                                            <Badge variant="outline" className={cn('text-[10px] py-0 h-4', cfg.badgeClass)}>
                                                                Current
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {done ? 'Completed' : current ? 'In progress' : 'Upcoming'}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {isRejected && (
                                        <div className="flex gap-4">
                                            <div className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2', STAGE_CONFIG.rejected.dotClass)}>
                                                ✕
                                            </div>
                                            <div className="flex-1 pb-2">
                                                <p className={cn('font-medium text-sm', STAGE_CONFIG.rejected.textClass)}>Rejected</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">Application closed</p>
                                            </div>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* ── Notes tab ── */}
                        <TabsContent value="notes" className="mt-4 space-y-4">
                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm">Add a Note</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0 space-y-3">
                                    <Textarea
                                        value={newNote}
                                        onChange={(e) => setNewNote(e.target.value)}
                                        placeholder="Interview feedback, screening summary, references checked…"
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
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm">Notes History</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0">
                                    <NoteHistory notes={candidate.notes} />
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </div>
            </div>

            {/* ── Dialogs ── */}
            <EditCandidateDialog candidate={candidate} open={editOpen} onOpenChange={setEditOpen} />

            <AlertDialog open={rejectOpen} onOpenChange={(v) => { setRejectOpen(v); if (!v) setRejectNote('') }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Reject this candidate?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will move <strong>{candidate.name}</strong> to the rejected stage. A rejection reason
                            is required and will be stored in the notes history.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2 py-2">
                        <Label htmlFor="reject-note">Rejection reason *</Label>
                        <Textarea
                            id="reject-note"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            placeholder="e.g. Salary expectation outside range; withdrew application…"
                            rows={3}
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
                    <DialogBody className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Create an employee record for <strong>{candidate.name}</strong>. The new employee
                            will start in <em>onboarding</em> status with an auto-generated employee number.
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
                                <Combobox
                                    value={convertForm.departmentId}
                                    onValueChange={(id) => {
                                        const opt = orgOptions.find(o => o.value === id)
                                        setConvertForm(f => ({ ...f, departmentId: id, department: opt?.label ?? '' }))
                                    }}
                                    options={orgOptions}
                                    placeholder="Select department…"
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

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
    return (
        <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
                {icon}
                <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-sm font-semibold tabular-nums truncate">{value}</p>
        </Card>
    )
}
