/**
 * Public job detail + apply — /careers/:companyCode/jobs/:jobId
 * Two-column on desktop: the posting (left) and a sticky apply panel (right);
 * stacks on mobile. Resume is required (drag-and-drop or click).
 */
import { useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, MapPin, Building2, CalendarDays, Banknote, Users, Upload, FileText, CheckCircle2, X, Check } from 'lucide-react'
import { usePublicJob, useApplyToJob, type ApplyInput } from '@/hooks/usePublicCareers'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { RichTextDisplay } from '@/components/ui/rich-text-display'
import { toast } from '@/components/ui/overlays'
import { cn, formatDate, formatFileSize } from '@/lib/utils'
import { PUBLIC_ROUTES } from '@/lib/routes'
import { PublicShell, CareersError } from './careersShared'
import { useJobTypeLabel, formatSalaryRange } from './careersHelpers'

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED = /\.(pdf|doc|docx)$/i

export function CareersJobPage() {
    const { companyCode = '', jobId = '' } = useParams<{ companyCode: string; jobId: string }>()
    const { t } = useTranslation()
    const typeLabel = useJobTypeLabel()
    const { data, isLoading, isError } = usePublicJob(companyCode, jobId)

    if (isLoading) {
        return (
            <PublicShell>
                <div className="mx-auto max-w-5xl px-5 py-10">
                    <Skeleton className="h-4 w-32" />
                    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
                        <Skeleton className="h-80 w-full rounded-2xl" />
                        <Skeleton className="h-96 w-full rounded-2xl" />
                    </div>
                </div>
            </PublicShell>
        )
    }
    if (isError || !data) {
        return <CareersError title={t('careers.jobNotFound')} hint={t('careers.jobNotFoundHint')} />
    }

    const { company, job } = data.data
    const salary = formatSalaryRange(job.minSalary, job.maxSalary)

    return (
        <PublicShell company={company.name}>
            <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
                <Link
                    to={PUBLIC_ROUTES.careersJobs(companyCode)}
                    className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5" />
                    {t('careers.backToJobs')}
                </Link>

                <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
                    {/* ── Posting ── */}
                    <article className="animate-fade-in min-w-0">
                        <span className="inline-block rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
                            {typeLabel(job.type)}
                        </span>
                        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{job.title}</h1>

                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                            {job.department && <span className="inline-flex items-center gap-1.5"><Building2 className="size-4 opacity-70" />{job.department}</span>}
                            {job.location && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 opacity-70" />{job.location}</span>}
                            {job.openings > 1 && <span className="inline-flex items-center gap-1.5"><Users className="size-4 opacity-70" />{t('careers.openingsCount', { count: job.openings })}</span>}
                            {job.closingDate && <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4 opacity-70" />{t('careers.closingDate', { date: formatDate(job.closingDate) })}</span>}
                        </div>

                        {job.description && job.description !== '<p></p>' && (
                            <section className="mt-8">
                                <SectionTitle>{t('careers.aboutRole')}</SectionTitle>
                                <RichTextDisplay html={job.description} className="mt-3 text-[15px] text-foreground/80" />
                            </section>
                        )}

                        {job.requirements?.length > 0 && (
                            <section className="mt-8">
                                <SectionTitle>{t('careers.requirements')}</SectionTitle>
                                <ul className="mt-3 space-y-2.5">
                                    {job.requirements.map((r, i) => (
                                        <li key={`${i}-${r}`} className="flex gap-2.5 text-[15px] leading-relaxed text-foreground/80">
                                            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                                                <Check className="size-3" strokeWidth={3} />
                                            </span>
                                            {r}
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}
                    </article>

                    {/* ── Apply panel (sticky on desktop) ── */}
                    <aside className="animate-fade-in lg:sticky lg:top-20" style={{ animationDelay: '60ms' }}>
                        {salary && (
                            <div className="mb-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
                                <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('careers.salaryLabel')}</div>
                                <div className="mt-0.5 inline-flex items-center gap-1.5 font-display text-lg font-semibold tabular-figures">
                                    <Banknote className="size-4 text-primary" />{salary}
                                </div>
                            </div>
                        )}
                        <ApplyForm companyCode={companyCode} jobId={jobId} jobTitle={job.title} />
                    </aside>
                </div>
            </div>
        </PublicShell>
    )
}

function SectionTitle({ children }: { children: ReactNode }) {
    return (
        <h2 className="flex items-center gap-2.5 font-display text-base font-semibold tracking-tight">
            <span className="h-4 w-1 rounded-full bg-primary" />{children}
        </h2>
    )
}

function ApplyForm({ companyCode, jobId, jobTitle }: { companyCode: string; jobId: string; jobTitle: string }) {
    const { t } = useTranslation()
    const apply = useApplyToJob(companyCode, jobId)
    const fileRef = useRef<HTMLInputElement>(null)
    const [form, setForm] = useState({ name: '', email: '', phone: '', nationality: '', experience: '', expectedSalary: '', coverNote: '' })
    const [file, setFile] = useState<File | null>(null)
    const [dragging, setDragging] = useState(false)
    const [done, setDone] = useState(false)

    const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(prev => ({ ...prev, [k]: e.target.value }))

    const pickFile = (picked: File | null | undefined) => {
        if (!picked) return
        if (!ACCEPTED.test(picked.name)) return toast.error(t('careers.apply.fileType'))
        if (picked.size > MAX_BYTES) return toast.error(t('careers.apply.fileTooLarge'))
        setFile(picked)
    }

    const onDrop = (e: DragEvent) => {
        e.preventDefault()
        setDragging(false)
        pickFile(e.dataTransfer.files?.[0])
    }

    const submit = (e: FormEvent) => {
        e.preventDefault()
        if (!form.name.trim() || !form.email.trim() || !file) return toast.error(t('careers.apply.missingFields'))
        const input: ApplyInput = { ...form, resume: file }
        apply.mutate(input, {
            onSuccess: () => setDone(true),
            onError: (err) => {
                if (err instanceof ApiError && err.statusCode === 409) toast.error(t('careers.apply.errorDuplicate'))
                else toast.error((err as Error)?.message || t('careers.apply.errorGeneric'))
            },
        })
    }

    if (done) {
        return (
            <div className="rounded-2xl border border-border/70 bg-card p-6 text-center">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="size-6" />
                </div>
                <h2 className="mt-4 font-display text-base font-semibold tracking-tight">{t('careers.apply.successTitle')}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{t('careers.apply.successBody', { name: form.name, title: jobTitle })}</p>
                <Button asChild variant="outline" className="mt-5 w-full">
                    <Link to={PUBLIC_ROUTES.careersJobs(companyCode)}>{t('careers.apply.applyAnother')}</Link>
                </Button>
            </div>
        )
    }

    return (
        <form onSubmit={submit} className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
            <h2 className="font-display text-base font-semibold tracking-tight">{t('careers.apply.heading')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('careers.apply.headingHint')}</p>

            <div className="mt-4 space-y-3.5">
                <Field label={t('careers.apply.name')} required>
                    <Input value={form.name} onChange={set('name')} autoComplete="name" required />
                </Field>
                <Field label={t('careers.apply.email')} required>
                    <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label={t('careers.apply.phone')}>
                        <Input value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" />
                    </Field>
                    <Field label={t('careers.apply.nationality')}>
                        <Input value={form.nationality} onChange={set('nationality')} />
                    </Field>
                    <Field label={t('careers.apply.experience')}>
                        <Input type="number" min={0} value={form.experience} onChange={set('experience')} inputMode="numeric" />
                    </Field>
                    <Field label={t('careers.apply.expectedSalary')}>
                        <Input type="number" min={0} value={form.expectedSalary} onChange={set('expectedSalary')} inputMode="numeric" />
                    </Field>
                </div>
                <Field label={t('careers.apply.coverNote')}>
                    <Textarea rows={3} value={form.coverNote} onChange={set('coverNote')} placeholder={t('careers.apply.coverNotePlaceholder')} className="resize-none" />
                </Field>

                {/* Resume dropzone */}
                <div>
                    <Label className="text-xs">{t('careers.apply.resume')} <span className="text-destructive">*</span></Label>
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".pdf,.doc,.docx"
                        aria-label={t('careers.apply.resume')}
                        className="sr-only"
                        onChange={(e: ChangeEvent<HTMLInputElement>) => { pickFile(e.target.files?.[0]); e.target.value = '' }}
                    />
                    {file ? (
                        <div className="mt-1.5 flex items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2.5">
                            <span className="inline-flex min-w-0 items-center gap-2.5 text-sm">
                                <FileText className="size-4 shrink-0 text-primary" />
                                <span className="min-w-0">
                                    <span className="block truncate font-medium">{file.name}</span>
                                    <span className="block text-[11px] text-muted-foreground tabular-figures">{formatFileSize(file.size)}</span>
                                </span>
                            </span>
                            <button type="button" onClick={() => setFile(null)} className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={t('common.remove', { defaultValue: 'Remove' })}>
                                <X className="size-4" />
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                            onDragLeave={() => setDragging(false)}
                            onDrop={onDrop}
                            className={cn(
                                'mt-1.5 flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-3 py-5 text-center transition-colors',
                                dragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-accent/40',
                            )}
                        >
                            <span className="grid size-9 place-items-center rounded-full bg-muted text-muted-foreground">
                                <Upload className="size-4" />
                            </span>
                            <span className="text-sm font-medium">{t('careers.apply.chooseFile')}</span>
                            <span className="text-[11px] text-muted-foreground">{t('careers.apply.resumeHint')}</span>
                        </button>
                    )}
                </div>
            </div>

            <Button type="submit" className="mt-5 w-full" disabled={apply.isPending}>
                {apply.isPending ? t('careers.apply.submitting') : t('careers.apply.submit')}
            </Button>
        </form>
    )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
    return (
        <div>
            <Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>
            <div className="mt-1.5">{children}</div>
        </div>
    )
}
