import { useMemo, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { UserPlus, Briefcase, MapPin, Loader2, Users, Search, Check, ChevronsUpDown, Paperclip, X, FileText, Sparkles, UploadCloud } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useMyReferrals, useReferralJobs, useSubmitReferral, type MyReferral, type ReferralJob } from '@/hooks/useReferrals'
import { parseResumeFile, extractResumeImage, type ParsedResume } from '@/lib/resume-parser'
import { CandidateProfileFields } from '@/components/shared/CandidateProfileFields'
import type { EducationEntry, ExperienceEntry } from '@/components/shared/MultiEntryField'

// Pipeline stage → badge tone. Keys are the seeded recruitment stage keys; we
// degrade gracefully (slate) for any custom/unknown stage.
const STAGE_TONE: Record<string, string> = {
    received: 'bg-blue-50 text-blue-700 ring-blue-200',
    screening: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    interview: 'bg-violet-50 text-violet-700 ring-violet-200',
    assessment: 'bg-amber-50 text-amber-700 ring-amber-200',
    offer: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    hired: 'bg-emerald-100 text-emerald-800 ring-emerald-300',
    rejected: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const MAX_RESUME_BYTES = 10 * 1024 * 1024 // 10 MB — matches the server limit
const RESUME_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp'

// "How do you know them?" — a fixed list keeps referrals consistent and reportable.
// The stored value is the English string; the label is translated for display.
const RELATIONSHIP_OPTIONS: Array<{ value: string; key: string }> = [
    { value: 'Former colleague', key: 'referrals.rel.formerColleague' },
    { value: 'Current colleague', key: 'referrals.rel.currentColleague' },
    { value: 'Friend', key: 'referrals.rel.friend' },
    { value: 'Family member', key: 'referrals.rel.family' },
    { value: 'University / classmate', key: 'referrals.rel.classmate' },
    { value: 'Professional network', key: 'referrals.rel.network' },
    { value: 'Other', key: 'referrals.rel.other' },
]

function humanizeStage(stage: string | null): string {
    if (!stage) return 'Removed'
    return stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ReferralsPage() {
    const { t } = useTranslation()
    const { data: referrals, isLoading } = useMyReferrals()
    const [open, setOpen] = useState(false)

    const list = useMemo<MyReferral[]>(() => referrals ?? [], [referrals])

    return (
        <div className="space-y-5">
            <PageHeader
                title={t('referrals.title', { defaultValue: 'Refer a Candidate' })}
                subtitle={t('referrals.description', {
                    defaultValue: 'Recommend someone for an open role. Your referrals enter the recruitment pipeline and you can track their progress here.',
                })}
                action={
                    <Button onClick={() => setOpen(true)} className="gap-2">
                        <UserPlus className="size-4" />
                        {t('referrals.refer', { defaultValue: 'Refer someone' })}
                    </Button>
                }
            />

            {isLoading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
                </div>
            ) : list.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
                        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
                            <Users className="size-6 text-muted-foreground" />
                        </div>
                        <div>
                            <p className="text-sm font-medium">{t('referrals.emptyTitle', { defaultValue: 'No referrals yet' })}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {t('referrals.emptyDesc', { defaultValue: 'Refer a candidate for an open role to get started.' })}
                            </p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setOpen(true)} className="gap-2">
                            <UserPlus className="size-4" /> {t('referrals.refer', { defaultValue: 'Refer someone' })}
                        </Button>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2.5">
                    {list.map((r) => {
                        const tone = STAGE_TONE[r.stage ?? ''] ?? 'bg-slate-50 text-slate-600 ring-slate-200'
                        return (
                            <Card key={r.id}>
                                <CardContent className="flex items-start justify-between gap-3 p-4">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold">{r.candidateName}</p>
                                        <p className="truncate text-xs text-muted-foreground">{r.candidateEmail}</p>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                            {r.jobNo && (
                                                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-foreground/70">{r.jobNo}</span>
                                            )}
                                            {r.jobTitle && (
                                                <span className="inline-flex items-center gap-1">
                                                    <Briefcase className="size-3" /> {r.jobTitle}
                                                </span>
                                            )}
                                            {r.hasResume && (
                                                <span className="inline-flex items-center gap-0.5"><Paperclip className="size-3" /> {t('referrals.resume', { defaultValue: 'Resume' })}</span>
                                            )}
                                            {r.relationship && <span>· {r.relationship}</span>}
                                            <span>· {new Date(r.createdAt).toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                        </div>
                                    </div>
                                    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ring-1 ${tone}`}>
                                        {humanizeStage(r.stage)}
                                    </span>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}

            <ReferDialog open={open} onOpenChange={setOpen} />
        </div>
    )
}

/**
 * Searchable, API-backed job picker. The search box drives the server query
 * (`/referrals/jobs?q=`) so the dropdown only ever holds matching open roles,
 * each shown with its job number.
 */
function JobCombobox({ value, onChange }: { value: ReferralJob | null; onChange: (job: ReferralJob) => void }) {
    const { t } = useTranslation()
    const [open, setOpen] = useState(false)
    const [q, setQ] = useState('')
    const { data: jobs, isFetching } = useReferralJobs(q)
    const results = jobs ?? []

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                >
                    {value ? (
                        <span className="flex min-w-0 items-center gap-2">
                            {value.jobNo && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{value.jobNo}</span>}
                            <span className="truncate">{value.title}</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground">{t('referrals.jobPlaceholder', { defaultValue: 'Search a job…' })}</span>
                    )}
                    <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <div className="flex items-center gap-2 border-b px-3">
                    <Search className="size-4 shrink-0 text-muted-foreground" />
                    <input
                        autoFocus
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder={t('referrals.jobSearch', { defaultValue: 'Search by job no. or title…' })}
                        className="h-10 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                    />
                    {isFetching && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                    {results.length === 0 ? (
                        <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                            {t('referrals.noJobs', { defaultValue: 'No open positions match.' })}
                        </p>
                    ) : (
                        results.map((j) => (
                            <button
                                key={j.id}
                                type="button"
                                onClick={() => { onChange(j); setOpen(false) }}
                                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                            >
                                <Check className={cn('mt-0.5 size-4 shrink-0', value?.id === j.id ? 'opacity-100 text-primary' : 'opacity-0')} />
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-2">
                                        {j.jobNo && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{j.jobNo}</span>}
                                        <span className="truncate font-medium">{j.title}</span>
                                    </span>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                        {j.department && <span>{j.department}</span>}
                                        {j.location && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" />{j.location}</span>}
                                    </span>
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

function ReferDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
    const { t } = useTranslation()
    const submit = useSubmitReferral()
    const fileRef = useRef<HTMLInputElement | null>(null)
    const [job, setJob] = useState<ReferralJob | null>(null)
    const [resume, setResume] = useState<File | null>(null)
    const [photo, setPhoto] = useState<Blob | null>(null)
    const [parsing, setParsing] = useState(false)
    const [parsedNote, setParsedNote] = useState<string | null>(null)
    const [dragging, setDragging] = useState(false)
    const [form, setForm] = useState({ candidateName: '', candidateEmail: '', candidatePhone: '', relationship: '', notes: '' })
    // Extended candidate profile (matches public apply form + admin candidate
    // dialogs). All optional — referrer adds what they know.
    const [nationality, setNationality] = useState('')
    const [experience, setExperience] = useState('')
    const [expectedSalary, setExpectedSalary] = useState('')
    const [currentSalary, setCurrentSalary] = useState('')
    const [address, setAddress] = useState('')
    const [gender, setGender] = useState<'' | 'male' | 'female' | 'other' | 'prefer_not_to_say'>('')
    const [educationHistory, setEducationHistory] = useState<EducationEntry[]>([])
    const [experienceHistory, setExperienceHistory] = useState<ExperienceEntry[]>([])

    const reset = () => {
        setForm({ candidateName: '', candidateEmail: '', candidatePhone: '', relationship: '', notes: '' })
        setJob(null); setResume(null); setPhoto(null); setParsedNote(null)
        setNationality(''); setExperience(''); setExpectedSalary(''); setCurrentSalary('')
        setAddress(''); setGender(''); setEducationHistory([]); setExperienceHistory([])
        if (fileRef.current) fileRef.current.value = ''
    }
    const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

    const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.candidateEmail.trim())
    const canSubmit = !!job && !!resume && form.candidateName.trim().length > 0 && emailValid && !submit.isPending

    function close() { onOpenChange(false); reset() }

    function pickResume(file: File | undefined) {
        if (!file) return
        if (file.size > MAX_RESUME_BYTES) {
            toast.error(t('referrals.resumeTooLarge', { defaultValue: 'Resume must be 10 MB or smaller' }))
            if (fileRef.current) fileRef.current.value = ''
            return
        }
        setResume(file)
        setParsedNote(null)
        setParsing(true)
        // Photo extraction runs alongside text parsing; neither blocks the form.
        extractResumeImage(file).then(setPhoto).catch(() => setPhoto(null))
        parseResumeFile(file)
            .then((p) => {
                // Only fill what the referrer hasn't already typed.
                setForm((prev) => ({
                    ...prev,
                    candidateName: prev.candidateName || p.name || '',
                    candidateEmail: prev.candidateEmail || p.email || '',
                    candidatePhone: prev.candidatePhone || p.phone || '',
                    // Lossless capture for fields the form doesn't surface
                    // (skills + social/portfolio links): pre-fill notes only if
                    // the referrer hasn't written their own note yet.
                    notes: prev.notes || buildReferralParsedNote(p),
                }))
                if (p.experienceYears != null) setExperience((prev) => prev || String(p.experienceYears))
                const filled = (['name', 'email', 'phone'] as const).filter((k) => p[k])
                if (p.textLength === 0) {
                    setParsedNote(t('referrals.resumeUnreadable', { defaultValue: 'Couldn’t read text (scanned résumé?) — please fill the fields manually.' }))
                } else if (filled.length) {
                    setParsedNote(t('referrals.resumeAutofilled', { defaultValue: 'Auto-filled from résumé — please review.' }))
                    toast.success(t('referrals.resumeRead', { defaultValue: 'Résumé read — we pre-filled the form.' }))
                }
            })
            .catch(() => { /* parsing is best-effort */ })
            .finally(() => setParsing(false))
    }

    function handleSubmit() {
        if (!canSubmit || !job) return
        submit.mutate(
            {
                jobId: job.id,
                candidateName: form.candidateName.trim(),
                candidateEmail: form.candidateEmail.trim(),
                candidatePhone: form.candidatePhone.trim() || undefined,
                relationship: form.relationship.trim() || undefined,
                notes: form.notes.trim() || undefined,
                nationality: nationality.trim() || undefined,
                experience: experience.trim() || undefined,
                expectedSalary: expectedSalary.trim() || undefined,
                currentSalary: currentSalary.trim() || undefined,
                address: address.trim() || undefined,
                gender: gender || undefined,
                educationHistory: educationHistory.length > 0 ? educationHistory : undefined,
                experienceHistory: experienceHistory.length > 0 ? experienceHistory : undefined,
                resume,
                photo,
            },
            {
                onSuccess: () => {
                    toast.success(t('referrals.submitted', { defaultValue: 'Referral submitted' }))
                    close()
                },
                onError: (err: unknown) => {
                    const msg = err instanceof Error ? err.message : t('referrals.submitFailed', { defaultValue: 'Could not submit referral' })
                    toast.error(msg)
                },
            },
        )
    }

    return (
        <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
            {/* Wider dialog now that we collect address/gender/education/experience */}
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{t('referrals.dialogTitle', { defaultValue: 'Refer a candidate' })}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Résumé first — attach to auto-fill the fields below */}
                    <div className="space-y-1.5">
                        <Label>{t('referrals.resumeLabel', { defaultValue: 'Resume' })} *</Label>
                        <input
                            ref={fileRef}
                            type="file"
                            accept={RESUME_ACCEPT}
                            className="hidden"
                            onChange={(e) => pickResume(e.target.files?.[0])}
                        />
                        {resume ? (
                            <div className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-2.5">
                                        {parsing ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> : <FileText className="size-4 shrink-0 text-primary" />}
                                        <span className="min-w-0">
                                            <span className="block truncate font-medium">{resume.name}</span>
                                            <span className="block text-[11px] text-muted-foreground">{(resume.size / 1024).toFixed(0)} KB</span>
                                        </span>
                                    </span>
                                    <span className="flex shrink-0 items-center gap-1">
                                        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10">{t('referrals.replace', { defaultValue: 'Replace' })}</button>
                                        <button type="button" aria-label="Remove résumé" onClick={() => { setResume(null); setPhoto(null); setParsedNote(null); if (fileRef.current) fileRef.current.value = '' }} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
                                            <X className="size-4" />
                                        </button>
                                    </span>
                                </div>
                                {(parsing || parsedNote) && (
                                    <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <Sparkles className="size-3 text-primary" />
                                        {parsing ? t('referrals.resumeReading', { defaultValue: 'Reading résumé…' }) : parsedNote}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                onDragOver={(e: DragEvent) => { e.preventDefault(); setDragging(true) }}
                                onDragLeave={() => setDragging(false)}
                                onDrop={(e: DragEvent) => { e.preventDefault(); setDragging(false); pickResume(e.dataTransfer.files?.[0]) }}
                                className={cn(
                                    'flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-5 text-center transition-colors',
                                    dragging ? 'border-primary bg-primary/5' : 'border-input hover:border-primary/40 hover:bg-muted/40',
                                )}
                            >
                                <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary"><UploadCloud className="size-4" /></span>
                                <span className="text-sm font-medium">{t('referrals.attachResume', { defaultValue: 'Upload résumé to auto-fill' })}</span>
                                <span className="text-[11px] text-muted-foreground">{t('referrals.resumeHint', { defaultValue: 'PDF, Word, or image · up to 10 MB. We’ll read it and fill the form for you.' })}</span>
                            </button>
                        )}
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t('referrals.job', { defaultValue: 'Open position' })} *</Label>
                        <JobCombobox value={job} onChange={setJob} />
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t('referrals.candidateName', { defaultValue: 'Candidate name' })} *</Label>
                        <Input value={form.candidateName} onChange={(e) => set('candidateName')(e.target.value)} placeholder="Jane Doe" />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>{t('referrals.candidateEmail', { defaultValue: 'Email' })} *</Label>
                            <Input type="email" value={form.candidateEmail} onChange={(e) => set('candidateEmail')(e.target.value)} placeholder="jane@example.com" aria-invalid={form.candidateEmail.length > 0 && !emailValid} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('referrals.candidatePhone', { defaultValue: 'Phone' })}</Label>
                            <Input value={form.candidatePhone} onChange={(e) => set('candidatePhone')(e.target.value)} placeholder="+971…" />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t('referrals.relationship', { defaultValue: 'How do you know them?' })}</Label>
                        <Select value={form.relationship || undefined} onValueChange={set('relationship')}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder={t('referrals.relationshipPlaceholder', { defaultValue: 'Select…' })} />
                            </SelectTrigger>
                            <SelectContent>
                                {RELATIONSHIP_OPTIONS.map((r) => (
                                    <SelectItem key={r.value} value={r.value}>{t(r.key, { defaultValue: r.value })}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Optional candidate metadata that HR also captures via the
                        admin Add Candidate dialog & the public apply form. Plain
                        inputs here — the portal doesn't ship the country/numeric
                        helpers, but a free-text field is enough for a referral. */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                            <Label>{t('referrals.nationality', { defaultValue: 'Nationality' })}</Label>
                            <Input value={nationality} onChange={(e) => setNationality(e.target.value)} placeholder={t('referrals.nationalityPlaceholder', { defaultValue: 'e.g. Indian' })} />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('referrals.experience', { defaultValue: 'Experience (years)' })}</Label>
                            <Input
                                type="number"
                                min={0}
                                step={1}
                                inputMode="numeric"
                                value={experience}
                                onChange={(e) => setExperience(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('referrals.expectedSalary', { defaultValue: 'Expected salary (AED)' })}</Label>
                            <Input
                                type="number"
                                min={0}
                                inputMode="decimal"
                                value={expectedSalary}
                                onChange={(e) => setExpectedSalary(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>{t('referrals.currentSalary', { defaultValue: 'Current salary (AED)' })}</Label>
                            <Input
                                type="number"
                                min={0}
                                inputMode="decimal"
                                value={currentSalary}
                                onChange={(e) => setCurrentSalary(e.target.value)}
                                placeholder="0"
                            />
                        </div>
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t('referrals.notes', { defaultValue: 'Why are you referring them?' })}</Label>
                        <Textarea rows={3} value={form.notes} onChange={(e) => set('notes')(e.target.value)} placeholder={t('referrals.notesPlaceholder', { defaultValue: 'A short note for the hiring team…' })} />
                    </div>

                    {/* Extended candidate profile — Address, Gender, Experience[], Education[] */}
                    <div className="pt-4 border-t border-border/60">
                        <CandidateProfileFields
                            address={address}
                            onAddressChange={setAddress}
                            gender={gender}
                            onGenderChange={setGender}
                            education={educationHistory}
                            onEducationChange={setEducationHistory}
                            experience={experienceHistory}
                            onExperienceChange={setExperienceHistory}
                            compact
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={close} disabled={submit.isPending}>{t('common.cancel', { defaultValue: 'Cancel' })}</Button>
                    <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
                        {submit.isPending && <Loader2 className="size-4 animate-spin" />}
                        {t('referrals.submit', { defaultValue: 'Submit referral' })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

/**
 * Lossless capture of résumé-parsed fields the referral form doesn't surface
 * (skills + social/portfolio links). Returns a single "Parsed:" block we
 * pre-fill into the free-text "why are you referring them?" textarea; empty
 * string when nothing useful was found.
 */
function buildReferralParsedNote(p: ParsedResume): string {
    const lines: string[] = []
    if (p.skills.length > 0) lines.push(`Skills: ${p.skills.join(', ')}`)
    if (p.linkedin) lines.push(`LinkedIn: ${p.linkedin}`)
    if (p.github) lines.push(`GitHub: ${p.github}`)
    if (p.portfolio) lines.push(`Portfolio: ${p.portfolio}`)
    return lines.length > 0 ? `Parsed:\n${lines.join('\n')}` : ''
}
