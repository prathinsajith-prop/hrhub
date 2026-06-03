import { useParams, useNavigate } from 'react-router-dom'
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
    ArrowLeft, Mail, Phone, Globe, Briefcase, DollarSign, Star,
    XCircle, UserPlus, Save, Edit2, FileText, Upload, CheckCircle2,
    Clock, ChevronRight, User, MapPin, GraduationCap, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumericInput } from '@/components/ui/numeric-input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { DatePicker } from '@/components/ui/date-picker'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { CandidateSourceBadge } from '@/components/shared/CandidateSourceBadge'
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
import { useDesignations, useDesignationOptions, useCreateDesignation } from '@/hooks/useDesignations'
import { useRecruitmentStages } from '@/hooks/useRecruitment'
import { DEFAULT_STAGES, kanbanStages as filterKanbanStages, resolveStageColor, stageByKey, type RecruitmentStage } from '@/lib/recruitmentStages'
import { buildOrgOptions } from '@/components/shared/action-dialogs'
import { Combobox } from '@/components/ui/combobox'
import { toast } from '@/components/ui/overlays'
import { EditCandidateDialog } from '@/components/shared/EditCandidateDialog'
import { CopyableEmail, CopyablePhone } from '@/components/shared'
import { FlagImg, resolveCountryIso } from '@/components/shared/PhoneInput'
import type { Candidate } from '@/types'

// Stage labels / colours come from the per-tenant config via useRecruitmentStages.
// DEFAULT_STAGES is the fallback while the API is loading.

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
            <Star className={cn('size-3.5 fill-current', color)} />
            <span className={cn('font-semibold tabular-nums', color)}>{score}</span>
            <span className="text-muted-foreground text-xs">/ 100</span>
        </div>
    )
}

function NoteHistory({ notes }: { notes: string | undefined }) {
    const { t } = useTranslation()
    const entries = useMemo(() => parseNoteEntries(notes ?? ''), [notes])
    if (!entries.length) return <p className="text-sm text-muted-foreground py-4 text-center">{t('recruitment.candidateProfile.notes.noNotes')}</p>
    return (
        <ol className="space-y-3">
            {entries.map((e, i) => (
                <li key={`${i}-${e.stamp ?? ''}`} className="border-l-2 border-border pl-3 py-1">
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
    const { t } = useTranslation()
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
    const { data: designationList = [] } = useDesignations()
    const createDesignation = useCreateDesignation()
    const designationOptions = useDesignationOptions()

    const { data: stagesData } = useRecruitmentStages()
    const allStages = useMemo<RecruitmentStage[]>(
        () => (stagesData && stagesData.length > 0
            ? stagesData
            : DEFAULT_STAGES.map((s) => ({ ...s, id: `default-${s.stageKey}`, tenantId: '', createdAt: '', updatedAt: '' }))),
        [stagesData],
    )
    const linearStages = useMemo(() => filterKanbanStages(allStages), [allStages])

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
                    <XCircle className="size-12 text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground">{t('recruitment.candidateProfile.notFound')}</p>
                    <Button variant="outline" size="sm" onClick={() => navigate('/recruitment')}>
                        <ArrowLeft className="size-4 mr-2" /> {t('recruitment.candidateProfile.backToRecruitment')}
                    </Button>
                </div>
            </PageWrapper>
        )
    }

    const currentStageIdx = linearStages.findIndex(s => s.stageKey === candidate.stage)
    const isRejected = candidate.stage === 'rejected'
    const isLastStage = currentStageIdx >= linearStages.length - 1
    const currentStage = stageByKey(allStages, candidate.stage)
    const stageColor = resolveStageColor(currentStage?.colorKey)
    const rejectedStage = stageByKey(allStages, 'rejected')
    const rejectedColor = resolveStageColor(rejectedStage?.colorKey)
    const nextStageEntry = currentStageIdx >= 0 ? linearStages[currentStageIdx + 1] : undefined
    const effectiveResumeUrl = resumeDownloadUrl ?? candidate.resumeUrl

    function handleAdvanceStage() {
        if (!nextStageEntry) return
        const nextKey = nextStageEntry.stageKey
        updateStage.mutate(
            { id: candidate!.id, stage: nextKey },
            {
                onSuccess: () => toast.success(t('recruitment.candidateProfile.toast.movedTo', { stage: nextStageEntry.label })),
                onError: () => toast.error(t('recruitment.candidateProfile.toast.failedUpdateStage')),
            },
        )
    }

    function handleReject() {
        const trimmed = rejectNote.trim()
        if (!trimmed) { toast.error(t('recruitment.candidateProfile.toast.reasonRequired'), t('recruitment.candidateProfile.toast.addRejectionNote')); return }
        const merged = appendNoteEntry(candidate!.notes, 'Rejected', trimmed)
        updateApplication.mutate(
            { id: candidate!.id, data: { notes: merged } },
            {
                onSuccess: () => updateStage.mutate(
                    { id: candidate!.id, stage: 'rejected' },
                    {
                        onSuccess: () => { setRejectOpen(false); setRejectNote(''); toast.success(t('recruitment.candidateProfile.toast.candidateRejected')); navigate('/recruitment') },
                        onError: () => toast.error(t('recruitment.candidateProfile.toast.failedUpdateStage')),
                    },
                ),
                onError: () => toast.error(t('recruitment.candidateProfile.toast.failedSaveRejection')),
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
                onSuccess: () => { toast.success(t('recruitment.candidateProfile.toast.noteAdded')); setNewNote('') },
                onError: () => toast.error(t('recruitment.candidateProfile.toast.failedAddNote')),
            },
        )
    }

    async function handleConvertSubmit() {
        const trimmedNote = convertForm.note.trim()
        if (!trimmedNote) { toast.error(t('recruitment.candidateProfile.toast.noteRequired'), t('recruitment.candidateProfile.toast.addConversionNote')); return }
        // Auto-create the designation if the user typed a new name not already in the list.
        if (convertForm.designation) {
            const exists = (Array.isArray(designationList) ? designationList : [])
                .some((d: { name: string; isActive: boolean }) => d.isActive && d.name.toLowerCase() === convertForm.designation.toLowerCase())
            if (!exists) {
                try { await createDesignation.mutateAsync({ name: convertForm.designation }) } catch { /* toast handled by hook */ }
            }
        }
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
                            toast.success(t('recruitment.candidateProfile.toast.candidateConverted'), empNo ? t('recruitment.candidateProfile.toast.employeeCreatedNo', { empNo }) : t('recruitment.candidateProfile.toast.employeeCreated'))
                            const empId = res?.data?.employee?.id
                            if (empId) navigate(`/employees/${empId}`)
                        },
                        onError: (err: Error & { message?: string }) => toast.error(t('recruitment.candidateProfile.toast.conversionFailed'), err?.message ?? t('recruitment.candidateProfile.toast.couldNotCreateEmployee')),
                    },
                ),
                onError: () => toast.error(t('recruitment.candidateProfile.toast.failedSaveConversion')),
            },
        )
    }

    return (
        <PageWrapper>
            {/* ── Page header ── */}
            <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                    <Avatar className="size-12 border border-border shrink-0">
                        {(candidate.avatarUrl ?? candidate.avatar) && (
                            <img src={(candidate.avatarUrl ?? candidate.avatar) as string} alt={candidate.name} className="object-cover" />
                        )}
                        <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                            {getInitials(candidate.name)}
                        </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                        <h1 className="text-xl font-semibold truncate">{candidate.name}</h1>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {candidate.jobTitle && (
                                <span className="text-sm text-muted-foreground">{candidate.jobTitle}</span>
                            )}
                            {candidate.jobTitle && <span className="text-muted-foreground/40">·</span>}
                            <span className="text-sm text-muted-foreground">
                                {t('recruitment.candidateProfile.appliedDate', { date: candidate.appliedDate ? formatDate(candidate.appliedDate) : '—' })}
                            </span>
                            <Badge variant="outline" className={cn('text-[11px]', stageColor.badgeClass)}>
                                {currentStage?.label ?? candidate.stage}
                            </Badge>
                            <CandidateSourceBadge source={candidate.source} referredByName={candidate.referredByName} />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                        <Edit2 className="size-3.5 mr-1.5" /> {t('common.edit')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/recruitment')}>
                        <ArrowLeft className="size-3.5 mr-1.5" /> {t('common.back')}
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Sidebar ── */}
                <div className="space-y-4">

                    {/* Contact & details */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-sm">{t('recruitment.candidateProfile.profile')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-0">
                            <div className="flex items-start gap-2 text-sm">
                                <Mail className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                <CopyableEmail email={candidate.email} className="text-muted-foreground truncate" />
                            </div>
                            {candidate.phone && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Phone className="size-3.5 text-muted-foreground shrink-0" />
                                    <CopyablePhone phone={candidate.phone} className="text-muted-foreground" />
                                </div>
                            )}
                            {candidate.nationality && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Globe className="size-3.5 text-muted-foreground shrink-0" />
                                    <div className="flex items-center gap-1.5">
                                        <FlagImg iso2={resolveCountryIso(candidate.nationality) ?? ''} size={14} className="shrink-0" />
                                        <span className="text-muted-foreground">{candidate.nationality}</span>
                                    </div>
                                </div>
                            )}
                            {candidate.experience !== undefined && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Briefcase className="size-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground">{t('recruitment.candidateProfile.experience', { count: candidate.experience })}</span>
                                </div>
                            )}
                            {candidate.gender && (
                                <div className="flex items-center gap-2 text-sm">
                                    <User className="size-3.5 text-muted-foreground shrink-0" />
                                    <span className="text-muted-foreground capitalize">{candidate.gender.replace(/_/g, ' ')}</span>
                                </div>
                            )}
                            {candidate.address && (
                                <div className="flex items-start gap-2 text-sm">
                                    <MapPin className="size-3.5 text-muted-foreground shrink-0 mt-0.5" />
                                    <span className="text-muted-foreground whitespace-pre-line">{candidate.address}</span>
                                </div>
                            )}

                            {(candidate.expectedSalary != null || candidate.currentSalary != null || candidate.score !== undefined) && (
                                <div className="border-t border-border pt-3 space-y-2.5">
                                    {candidate.score !== undefined && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">{t('recruitment.candidateProfile.score')}</span>
                                            <ScoreBadge score={candidate.score} />
                                        </div>
                                    )}
                                    {candidate.currentSalary != null && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">{t('recruitment.candidateProfile.currentSalary')}</span>
                                            <span className="font-medium tabular-nums">{formatCurrency(candidate.currentSalary)}</span>
                                        </div>
                                    )}
                                    {candidate.expectedSalary != null && (
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">{t('recruitment.candidateProfile.expectedSalary')}</span>
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
                            <CardTitle className="text-sm">{t('recruitment.candidateProfile.resumeCV')}</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2 pt-0">
                            {effectiveResumeUrl ? (
                                <a
                                    href={effectiveResumeUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                                >
                                    <FileText className="size-3.5 shrink-0" />
                                    {t('recruitment.candidateProfile.viewDownloadResume')}
                                </a>
                            ) : (
                                <p className="text-sm text-muted-foreground">{t('recruitment.candidateProfile.noResume')}</p>
                            )}
                            <Label>
                                <span className="sr-only">{t('recruitment.candidateProfile.uploadResumeLabel')}</span>
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
                                                onSuccess: (res) => { setResumeDownloadUrl(res?.data?.downloadUrl ?? null); toast.success(t('recruitment.candidateProfile.toast.resumeUploaded')) },
                                                onError: () => toast.error(t('recruitment.candidateProfile.toast.uploadFailed'), t('recruitment.candidateProfile.toast.couldNotUploadResume')),
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
                                    <Upload className="size-3.5 mr-1.5" />
                                    {uploadResume.isPending ? t('recruitment.candidateProfile.uploading') : effectiveResumeUrl ? t('recruitment.candidateProfile.replaceResume') : t('recruitment.candidateProfile.uploadResume')}
                                </Button>
                            </Label>
                        </CardContent>
                    </Card>

                    {/* Skills — candidate's own skill tags (from the form or résumé) */}
                    {candidate.skills && candidate.skills.length > 0 && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-1.5">
                                    <Sparkles className="size-3.5 text-amber-500" />
                                    {t('recruitment.candidateProfile.skills', { defaultValue: 'Skills' })}
                                    <span className="ml-auto text-[10px] font-normal text-muted-foreground">{candidate.skills.length}</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <div className="flex flex-wrap gap-1.5">
                                    {candidate.skills.map((s, i) => (
                                        <Badge key={`skill-${i}`} variant="secondary" className="text-[11px] font-normal">{s}</Badge>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Experience timeline — past roles captured at apply time */}
                    {candidate.experienceHistory && candidate.experienceHistory.length > 0 && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-1.5">
                                    <Briefcase className="size-3.5 text-sky-600" />
                                    {t('recruitment.candidateProfile.experienceHistory', { defaultValue: 'Experience' })}
                                    <span className="ml-auto text-[10px] font-normal text-muted-foreground">{candidate.experienceHistory.length}</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <ol className="space-y-3 border-l-2 border-border/60 pl-4">
                                    {candidate.experienceHistory.map((e, i) => (
                                        <li key={`exp-${i}`} className="relative">
                                            <span aria-hidden className="absolute -left-[19px] top-1.5 grid size-3 place-items-center rounded-full bg-sky-500 ring-2 ring-background" />
                                            <p className="text-sm font-semibold text-foreground">{e.title}</p>
                                            {(e.company || e.industry) && (
                                                <p className="text-[12px] text-muted-foreground">{[e.company, e.industry].filter(Boolean).join(' · ')}</p>
                                            )}
                                            {(e.startDate || e.endDate || e.current) && (
                                                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground/80 tabular-figures">
                                                    <Clock className="size-3 opacity-70" />{formatMonth(e.startDate)} – {e.current ? 'Present' : formatMonth(e.endDate)}
                                                </p>
                                            )}
                                            {e.summary && <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">{e.summary}</p>}
                                        </li>
                                    ))}
                                </ol>
                            </CardContent>
                        </Card>
                    )}

                    {/* Education timeline */}
                    {candidate.educationHistory && candidate.educationHistory.length > 0 && (
                        <Card>
                            <CardHeader className="pb-3">
                                <CardTitle className="text-sm flex items-center gap-1.5">
                                    <GraduationCap className="size-3.5 text-emerald-600" />
                                    {t('recruitment.candidateProfile.educationHistory', { defaultValue: 'Education' })}
                                    <span className="ml-auto text-[10px] font-normal text-muted-foreground">{candidate.educationHistory.length}</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-0">
                                <ol className="space-y-3 border-l-2 border-border/60 pl-4">
                                    {candidate.educationHistory.map((e, i) => (
                                        <li key={`edu-${i}`} className="relative">
                                            <span aria-hidden className="absolute -left-[19px] top-1.5 grid size-3 place-items-center rounded-full bg-emerald-500 ring-2 ring-background" />
                                            <p className="text-sm font-semibold text-foreground">{e.school}</p>
                                            {(e.degree || e.fieldOfStudy) && (
                                                <p className="text-[12px] text-muted-foreground">{[e.degree, e.fieldOfStudy].filter(Boolean).join(' · ')}</p>
                                            )}
                                            {(e.startDate || e.endDate || e.current) && (
                                                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground/80 tabular-figures">
                                                    <Clock className="size-3 opacity-70" />{formatMonth(e.startDate)} – {e.current ? 'Present' : formatMonth(e.endDate)}
                                                </p>
                                            )}
                                            {e.summary && <p className="mt-1 text-xs text-muted-foreground whitespace-pre-line">{e.summary}</p>}
                                        </li>
                                    ))}
                                </ol>
                            </CardContent>
                        </Card>
                    )}

                    {/* Actions */}
                    {!isRejected && (
                        <div className="space-y-2">
                            {candidate.stage === 'pre_boarding' ? (
                                <Button className="w-full" onClick={() => setConvertOpen(true)} disabled={convertToEmployee.isPending}>
                                    <UserPlus className="size-4 mr-2" />
                                    {t('recruitment.candidateProfile.convertToEmployee')}
                                </Button>
                            ) : !isLastStage ? (
                                <Button className="w-full" onClick={handleAdvanceStage} disabled={updateStage.isPending}>
                                    <ChevronRight className="size-4 mr-1.5" />
                                    {t('recruitment.candidateProfile.moveTo', { stage: nextStageEntry?.label ?? '' })}
                                </Button>
                            ) : null}
                            <Button
                                variant="outline"
                                className="w-full text-destructive border-destructive/30 hover:bg-destructive/5"
                                onClick={() => setRejectOpen(true)}
                                disabled={updateStage.isPending}
                            >
                                {t('recruitment.candidateProfile.rejectCandidate')}
                            </Button>
                        </div>
                    )}
                </div>

                {/* ── Main content ── */}
                <div className="lg:col-span-2">
                    <Tabs defaultValue="overview">
                        <TabsList>
                            <TabsTrigger value="overview">{t('recruitment.candidateProfile.tabs.overview')}</TabsTrigger>
                            <TabsTrigger value="pipeline">{t('recruitment.candidateProfile.tabs.pipeline')}</TabsTrigger>
                            <TabsTrigger value="notes">{t('recruitment.candidateProfile.tabs.notes')}</TabsTrigger>
                        </TabsList>

                        {/* ── Overview tab ── */}
                        <TabsContent value="overview" className="mt-4 space-y-4">
                            {/* Current stage callout */}
                            <Card className={cn('border', isRejected ? 'border-destructive/30 bg-destructive/5' : 'border-primary/20 bg-primary/5')}>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <div className={cn('size-9 rounded-full flex items-center justify-center shrink-0 text-white', stageColor.dotClass)}>
                                            {isRejected ? <XCircle className="size-4" /> : <Clock className="size-4" />}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-sm">
                                                {isRejected ? t('recruitment.candidateProfile.overview.applicationRejected') : t('recruitment.candidateProfile.overview.currentlyIn', { stage: currentStage?.label ?? candidate.stage })}
                                            </p>
                                            <p className="text-xs text-muted-foreground mt-0.5">
                                                {isRejected
                                                    ? t('recruitment.candidateProfile.overview.removedFromPipeline')
                                                    : !isLastStage
                                                        ? t('recruitment.candidateProfile.overview.nextStage', { stage: nextStageEntry?.label ?? '' })
                                                        : t('recruitment.candidateProfile.overview.finalStage')}
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Quick stats */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <StatCard label={t('recruitment.candidateProfile.overview.statScore')} value={candidate.score !== undefined ? `${candidate.score}/100` : '—'} icon={<Star className="size-4 text-warning" />} />
                                <StatCard label={t('recruitment.candidateProfile.overview.statExperience')} value={candidate.experience !== undefined ? `${candidate.experience} yr${candidate.experience !== 1 ? 's' : ''}` : '—'} icon={<Briefcase className="size-4 text-primary" />} />
                                <StatCard label={t('recruitment.candidateProfile.overview.statExpected')} value={candidate.expectedSalary ? formatCurrency(candidate.expectedSalary) : '—'} icon={<DollarSign className="size-4 text-success" />} />
                                <StatCard label={t('recruitment.candidateProfile.overview.statApplied')} value={candidate.appliedDate ? formatDate(candidate.appliedDate) : '—'} icon={<CheckCircle2 className="size-4 text-muted-foreground" />} />
                            </div>

                            {/* Latest note preview */}
                            {candidate.notes?.trim() && (() => {
                                const latest = parseNoteEntries(candidate.notes)[0]
                                return latest ? (
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <div className="flex items-center justify-between">
                                                <CardTitle className="text-sm">{t('recruitment.candidateProfile.overview.latestNote')}</CardTitle>
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
                                    <CardTitle className="text-sm">{t('recruitment.candidateProfile.pipeline.title')}</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0 space-y-1">
                                    {linearStages.map((stage, i) => {
                                        const done = i < currentStageIdx
                                        const current = i === currentStageIdx && !isRejected
                                        const cfg = resolveStageColor(stage.colorKey)
                                        return (
                                            <div key={stage.id} className="flex gap-4">
                                                <div className="flex flex-col items-center">
                                                    <div className={cn(
                                                        'size-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2 text-white',
                                                        done || current ? cfg.dotClass : 'bg-card border-border text-muted-foreground',
                                                    )}>
                                                        {done ? '✓' : i + 1}
                                                    </div>
                                                    {i < linearStages.length - 1 && (
                                                        <div className={cn('w-0.5 flex-1 min-h-[24px] mt-1', done ? cfg.lineClass : 'bg-border')} />
                                                    )}
                                                </div>
                                                <div className="pb-4 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <p className={cn('font-medium text-sm', done || current ? cfg.textClass : 'text-muted-foreground')}>
                                                            {stage.label}
                                                        </p>
                                                        {current && (
                                                            <Badge variant="outline" className={cn('text-[10px] py-0 h-4', cfg.badgeClass)}>
                                                                {t('recruitment.candidateProfile.pipeline.current')}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5">
                                                        {done ? t('recruitment.candidateProfile.pipeline.completed') : current ? t('recruitment.candidateProfile.pipeline.inProgress') : t('recruitment.candidateProfile.pipeline.upcoming')}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {isRejected && (
                                        <div className="flex gap-4">
                                            <div className={cn('size-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border-2 text-white', rejectedColor.dotClass)}>
                                                ✕
                                            </div>
                                            <div className="flex-1 pb-2">
                                                <p className={cn('font-medium text-sm', rejectedColor.textClass)}>{rejectedStage?.label ?? t('recruitment.stages.rejected')}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5">{t('recruitment.candidateProfile.pipeline.applicationClosed')}</p>
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
                                    <CardTitle className="text-sm">{t('recruitment.candidateProfile.notes.addNote')}</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-0 space-y-3">
                                    <Textarea
                                        value={newNote}
                                        onChange={(e) => setNewNote(e.target.value)}
                                        placeholder={t('recruitment.candidateProfile.notes.placeholder')}
                                        rows={3}
                                    />
                                    <div className="flex justify-end">
                                        <Button
                                            size="sm"
                                            onClick={handleAppendNote}
                                            disabled={updateApplication.isPending || !newNote.trim()}
                                        >
                                            <Save className="size-3.5 mr-1.5" />
                                            {updateApplication.isPending ? t('recruitment.candidateProfile.notes.saving') : t('recruitment.candidateProfile.notes.addNoteButton')}
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-sm">{t('recruitment.candidateProfile.notes.history')}</CardTitle>
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
                        <AlertDialogTitle>{t('recruitment.candidateProfile.rejectDialog.title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('recruitment.candidateProfile.rejectDialog.description', { name: candidate.name })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2 py-2">
                        <Label htmlFor="reject-note">{t('recruitment.candidateProfile.rejectDialog.reasonLabel')}</Label>
                        <Textarea
                            id="reject-note"
                            value={rejectNote}
                            onChange={(e) => setRejectNote(e.target.value)}
                            placeholder={t('recruitment.candidateProfile.rejectDialog.reasonPlaceholder')}
                            rows={3}
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={(e) => { e.preventDefault(); handleReject() }}
                            disabled={!rejectNote.trim() || updateApplication.isPending || updateStage.isPending}
                        >
                            {t('recruitment.candidateProfile.rejectDialog.confirmButton')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
                <DialogContent size="md">
                    <DialogHeader>
                        <DialogTitle>{t('recruitment.candidateProfile.convertDialog.title')}</DialogTitle>
                    </DialogHeader>
                    <DialogBody className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            {t('recruitment.candidateProfile.convertDialog.description', { name: candidate.name })}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label required>{t('recruitment.candidateProfile.convertDialog.joinDate')}</Label>
                                <DatePicker
                                    value={convertForm.joinDate}
                                    onChange={(v) => setConvertForm((f) => ({ ...f, joinDate: v }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t('recruitment.candidateProfile.convertDialog.designation')}</Label>
                                <Combobox
                                    value={convertForm.designation}
                                    onValueChange={(v) => setConvertForm((f) => ({ ...f, designation: v }))}
                                    options={designationOptions}
                                    placeholder={t('recruitment.candidateProfile.convertDialog.designationPlaceholder')}
                                    searchPlaceholder="Search or create…"
                                    clearable
                                    creatable
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t('recruitment.department')}</Label>
                                <Combobox
                                    value={convertForm.departmentId}
                                    onValueChange={(id) => {
                                        const opt = orgOptions.find(o => o.value === id)
                                        setConvertForm(f => ({ ...f, departmentId: id, department: opt?.label ?? '' }))
                                    }}
                                    options={orgOptions}
                                    placeholder={t('recruitment.candidateProfile.convertDialog.selectDepartment')}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>{t('recruitment.candidateProfile.convertDialog.basicSalary')}</Label>
                                <NumericInput
                                    value={convertForm.basicSalary}
                                    onChange={(e) => setConvertForm((f) => ({ ...f, basicSalary: e.target.value }))}
                                    placeholder={candidate.expectedSalary?.toString() ?? '0'}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="convert-note">{t('recruitment.candidateProfile.convertDialog.conversionNote')}</Label>
                            <Textarea
                                id="convert-note"
                                value={convertForm.note}
                                onChange={(e) => setConvertForm((f) => ({ ...f, note: e.target.value }))}
                                placeholder={t('recruitment.candidateProfile.convertDialog.notePlaceholder')}
                                rows={3}
                            />
                            <p className="text-[11px] text-muted-foreground">
                                {t('recruitment.candidateProfile.convertDialog.noteHelper')}
                            </p>
                        </div>
                    </DialogBody>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConvertOpen(false)}>{t('common.cancel')}</Button>
                        <Button
                            onClick={handleConvertSubmit}
                            loading={convertToEmployee.isPending || updateApplication.isPending}
                            disabled={!convertForm.note.trim()}
                        >
                            <UserPlus className="size-4 mr-2" /> {t('recruitment.candidateProfile.convertDialog.createEmployee')}
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

/**
 * "YYYY-MM" → "Jan 2024". Returns empty string when value is missing so we can
 * still render "— Present" for current roles where only an end is set.
 */
function formatMonth(value: string | null | undefined): string {
    if (!value) return ''
    const [y, m] = value.split('-')
    if (!y) return ''
    if (!m) return y
    const month = new Date(Number(y), Number(m) - 1, 1).toLocaleString('en', { month: 'short' })
    return `${month} ${y}`
}
