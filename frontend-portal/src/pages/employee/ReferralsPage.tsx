import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { UserPlus, Briefcase, MapPin, Loader2, Users, Search, Check, ChevronsUpDown, Paperclip, X, FileText, Sparkles } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { parseResumeFile, extractResumeImage } from '@/lib/resume-parser'

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
    const [form, setForm] = useState({ candidateName: '', candidateEmail: '', candidatePhone: '', relationship: '', notes: '' })

    const reset = () => {
        setForm({ candidateName: '', candidateEmail: '', candidatePhone: '', relationship: '', notes: '' })
        setJob(null); setResume(null); setPhoto(null); setParsedNote(null)
        if (fileRef.current) fileRef.current.value = ''
    }
    const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }))

    const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.candidateEmail.trim())
    const canSubmit = !!job && form.candidateName.trim().length > 0 && emailValid && !submit.isPending

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
                }))
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
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('referrals.dialogTitle', { defaultValue: 'Refer a candidate' })}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Résumé first — attach to auto-fill the fields below */}
                    <div className="space-y-1.5">
                        <Label>{t('referrals.resumeLabel', { defaultValue: 'Resume (optional)' })}</Label>
                        <input
                            ref={fileRef}
                            type="file"
                            accept={RESUME_ACCEPT}
                            className="hidden"
                            onChange={(e) => pickResume(e.target.files?.[0])}
                        />
                        {resume ? (
                            <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-center gap-2">
                                        {parsing ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                                        <span className="truncate">{resume.name}</span>
                                    </span>
                                    <button type="button" onClick={() => { setResume(null); setPhoto(null); setParsedNote(null); if (fileRef.current) fileRef.current.value = '' }} className="shrink-0 text-muted-foreground hover:text-foreground">
                                        <X className="size-4" />
                                    </button>
                                </div>
                                {(parsing || parsedNote) && (
                                    <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                        <Sparkles className="size-3 text-primary" />
                                        {parsing ? t('referrals.resumeReading', { defaultValue: 'Reading résumé…' }) : parsedNote}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <Button type="button" variant="outline" size="sm" className="w-full gap-2" onClick={() => fileRef.current?.click()}>
                                <Paperclip className="size-4" /> {t('referrals.attachResume', { defaultValue: 'Attach resume' })}
                            </Button>
                        )}
                        <p className="text-[11px] text-muted-foreground">{t('referrals.resumeHint', { defaultValue: 'PDF, Word, or image · up to 10 MB. We’ll read it and fill the form for you.' })}</p>
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
                        <Input value={form.relationship} onChange={(e) => set('relationship')(e.target.value)} placeholder={t('referrals.relationshipPlaceholder', { defaultValue: 'Former colleague, friend…' })} />
                    </div>

                    <div className="space-y-1.5">
                        <Label>{t('referrals.notes', { defaultValue: 'Why are you referring them?' })}</Label>
                        <Textarea rows={3} value={form.notes} onChange={(e) => set('notes')(e.target.value)} placeholder={t('referrals.notesPlaceholder', { defaultValue: 'A short note for the hiring team…' })} />
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
