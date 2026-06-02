/**
 * Public job detail + apply — /careers/:companyCode/jobs/:jobId
 * Two-column on desktop: the posting (left) and a sticky apply panel (right);
 * stacks on mobile. Resume is required (drag-and-drop or click).
 */
import { useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, MapPin, Building2, CalendarDays, Banknote, Users, CheckCircle2, Check, Sparkles, GraduationCap, Clock, Hash, Briefcase, Info } from 'lucide-react'
import { usePublicJob, useApplyToJob, type ApplyInput } from '@/hooks/usePublicCareers'
import { ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NumericInput } from '@/components/ui/numeric-input'
import { CountrySelect, resolveCountryIso, countryNameFromIso } from '@/components/shared/PhoneInput'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { RichTextDisplay } from '@/components/ui/rich-text-display'
import { ResumeUpload } from '@/components/shared/ResumeUpload'
import type { ParsedResume } from '@/lib/resume-parser'
import { toast } from '@/components/ui/overlays'
import { formatDate } from '@/lib/utils'
import { PUBLIC_ROUTES } from '@/lib/routes'
import { PublicShell, CareersError } from './careersShared'
import { formatSalaryRange } from './careersHelpers'
import { JobTypeBadge, WorkplaceBadge, TagChip, formatPostedAgo } from '@/components/shared/JobBadges'

export function CareersJobPage() {
    const { companyCode = '', jobId = '' } = useParams<{ companyCode: string; jobId: string }>()
    const { t } = useTranslation()
    const { data, isLoading, isError } = usePublicJob(companyCode, jobId)

    if (isLoading) {
        return (
            <PublicShell>
                <div className="mx-auto max-w-6xl px-5 py-10">
                    <Skeleton className="h-4 w-32" />
                    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
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
    const hasBodyContent = !!(
        (job.description && job.description !== '<p></p>') ||
        (job.requirements?.length ?? 0) > 0 ||
        (job.skills?.length ?? 0) > 0 ||
        (job.qualifications?.length ?? 0) > 0
    )

    return (
        <PublicShell company={company.name}>
            {/* Wider container — was max-w-5xl, kept article + sidebar cramped */}
            <div className="mx-auto max-w-6xl px-5 py-8 sm:py-10">
                <Link
                    to={PUBLIC_ROUTES.careersJobs(companyCode)}
                    className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                    <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5" />
                    {t('careers.backToJobs')}
                </Link>

                <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
                    {/* ── Posting ── */}
                    <article className="animate-fade-in min-w-0">
                        {/* Headline badges + ref no */}
                        <div className="flex flex-wrap items-center gap-2">
                            <JobTypeBadge type={job.type} size="md" variant="bordered" />
                            {job.workplaceType && <WorkplaceBadge workplace={job.workplaceType} size="md" variant="bordered" />}
                            {job.jobNo && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                    <Hash className="size-3 opacity-70" />{job.jobNo}
                                </span>
                            )}
                        </div>

                        <h1 className="mt-4 font-display text-3xl font-semibold leading-tight tracking-tight sm:text-[40px]">{job.title}</h1>

                        {/* Compact meta row — first line of facts */}
                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                            {job.department && <span className="inline-flex items-center gap-1.5"><Building2 className="size-4 opacity-70" />{job.department}</span>}
                            {job.location && <span className="inline-flex items-center gap-1.5"><MapPin className="size-4 opacity-70" />{job.location}</span>}
                            {job.industry && <span className="inline-flex items-center gap-1.5"><Briefcase className="size-4 opacity-70" />{job.industry}</span>}
                            {job.createdAt && (
                                <span className="inline-flex items-center gap-1.5">
                                    <Clock className="size-4 opacity-70" />
                                    {t('careers.posted', { defaultValue: 'Posted' })} {formatPostedAgo(job.createdAt)}
                                </span>
                            )}
                        </div>

                        {/* About */}
                        {job.description && job.description !== '<p></p>' && (
                            <section className="mt-7">
                                <SectionTitle>{t('careers.aboutRole')}</SectionTitle>
                                <RichTextDisplay html={job.description} className="mt-3 text-[15px] text-foreground/80" />
                            </section>
                        )}

                        {/* Requirements */}
                        {job.requirements?.length > 0 && (
                            <section className="mt-7">
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

                        {/* Skills — tag chips */}
                        {job.skills?.length > 0 && (
                            <section className="mt-7">
                                <SectionTitle>
                                    <Sparkles className="inline size-3.5 text-sky-500 ltr:mr-1.5 rtl:ml-1.5 align-[-1px]" />
                                    {t('careers.skills', { defaultValue: 'Skills' })}
                                </SectionTitle>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {job.skills.map((s: string, i: number) => (
                                        <TagChip key={`${i}-${s}`} tone="sky" className="text-[13px] px-3 py-1">{s}</TagChip>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Qualifications — tag chips */}
                        {job.qualifications?.length > 0 && (
                            <section className="mt-7">
                                <SectionTitle>
                                    <GraduationCap className="inline size-3.5 text-emerald-500 ltr:mr-1.5 rtl:ml-1.5 align-[-1px]" />
                                    {t('careers.qualifications', { defaultValue: 'Qualifications' })}
                                </SectionTitle>
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {job.qualifications.map((q: string, i: number) => (
                                        <TagChip key={`${i}-${q}`} tone="emerald" className="text-[13px] px-3 py-1">{q}</TagChip>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* Friendly fallback so the article never looks empty */}
                        {!hasBodyContent && (
                            <section className="mt-7 rounded-2xl border border-dashed border-border/70 bg-card/50 p-6 text-center">
                                <div className="mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                                    <Info className="size-4" />
                                </div>
                                <p className="mt-3 text-sm text-muted-foreground">{t('careers.noDetailsYet', { defaultValue: 'Full role details coming soon. Apply below — the hiring team will share more when they reach out.' })}</p>
                            </section>
                        )}
                    </article>

                    {/* ── Sidebar: Job summary + Apply form (sticky on desktop) ── */}
                    <aside className="animate-fade-in space-y-3" style={{ animationDelay: '60ms' }}>
                        <JobSummaryCard
                            salary={salary}
                            openings={job.openings}
                            closingDate={job.closingDate}
                            workplaceType={job.workplaceType}
                            department={job.department}
                            location={job.location}
                            jobNo={job.jobNo}
                            t={t}
                        />
                        <div className="lg:sticky lg:top-20">
                            <ApplyForm companyCode={companyCode} jobId={jobId} jobTitle={job.title} />
                        </div>
                    </aside>
                </div>
            </div>
        </PublicShell>
    )
}

/**
 * Compact "Job summary" panel — surfaces salary, openings, closing date,
 * workplace type, department, location, and ref number in one scannable list.
 * Replaces the sparse salary-only card that wasted vertical space above the
 * apply form.
 */
function JobSummaryCard({
    salary, openings, closingDate, workplaceType, department, location, jobNo, t,
}: {
    salary: string
    openings: number
    closingDate: string | null
    workplaceType: string | null
    department: string | null
    location: string | null
    jobNo: string | null
    t: ReturnType<typeof useTranslation>['t']
}) {
    return (
        <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            {salary && (
                <div className="pb-3 border-b border-border/60">
                    <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t('careers.salaryLabel')}</div>
                    <div className="mt-0.5 inline-flex items-center gap-1.5 font-display text-lg font-semibold tabular-figures">
                        <Banknote className="size-4 text-emerald-600 dark:text-emerald-400" />{salary}
                    </div>
                </div>
            )}
            <dl className={`grid grid-cols-1 gap-2.5 text-sm ${salary ? 'pt-3' : ''}`}>
                {workplaceType && (
                    <SummaryRow icon={<Building2 className="size-3.5" />} label={t('careers.workplaceLabel', { defaultValue: 'Workplace' })}>
                        {t(`careers.workplace.${workplaceType}`, { defaultValue: workplaceType })}
                    </SummaryRow>
                )}
                {department && (
                    <SummaryRow icon={<Briefcase className="size-3.5" />} label={t('careers.departmentLabel', { defaultValue: 'Department' })}>
                        {department}
                    </SummaryRow>
                )}
                {location && (
                    <SummaryRow icon={<MapPin className="size-3.5" />} label={t('careers.locationLabel', { defaultValue: 'Location' })}>
                        {location}
                    </SummaryRow>
                )}
                {openings > 0 && (
                    <SummaryRow icon={<Users className="size-3.5" />} label={t('careers.openingsLabel', { defaultValue: 'Openings' })}>
                        <span className="tabular-figures">{openings}</span>
                    </SummaryRow>
                )}
                {closingDate && (
                    <SummaryRow icon={<CalendarDays className="size-3.5" />} label={t('careers.closingLabel', { defaultValue: 'Closes' })}>
                        <span className="tabular-figures">{formatDate(closingDate)}</span>
                    </SummaryRow>
                )}
                {jobNo && (
                    <SummaryRow icon={<Hash className="size-3.5" />} label={t('careers.refLabel', { defaultValue: 'Ref' })}>
                        <span className="tabular-figures font-mono text-xs">{jobNo}</span>
                    </SummaryRow>
                )}
            </dl>
        </div>
    )
}

function SummaryRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3">
            <dt className="inline-flex items-center gap-1.5 text-muted-foreground text-[13px]">
                <span className="opacity-70">{icon}</span>{label}
            </dt>
            <dd className="text-right text-[13px] font-medium text-foreground/90 min-w-0 truncate">{children}</dd>
        </div>
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
    const [form, setForm] = useState({ name: '', email: '', phone: '', nationality: '', experience: '', expectedSalary: '', coverNote: '' })
    const [file, setFile] = useState<File | null>(null)
    const [photo, setPhoto] = useState<Blob | null>(null)
    const [done, setDone] = useState(false)

    const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(prev => ({ ...prev, [k]: e.target.value }))

    // Pre-fill empty fields from the parsed résumé; never overwrite what the user typed.
    const handleParsed = (p: ParsedResume) => {
        setForm(prev => ({
            ...prev,
            name: prev.name || p.name || '',
            email: prev.email || p.email || '',
            phone: prev.phone || p.phone || '',
            experience: prev.experience || (p.experienceYears != null ? String(p.experienceYears) : ''),
        }))
    }

    const submit = (e: FormEvent) => {
        e.preventDefault()
        if (!form.name.trim() || !form.email.trim() || !file) return toast.error(t('careers.apply.missingFields'))
        const input: ApplyInput = { ...form, resume: file, photo }
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
                {/* Résumé first — upload to auto-fill the fields below */}
                <Field label={t('careers.apply.resume')} required>
                    <ResumeUpload file={file} onFile={setFile} onParsed={handleParsed} onPhoto={setPhoto} />
                </Field>

                <div className="relative flex items-center gap-3 py-0.5">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">or enter details manually</span>
                    <span className="h-px flex-1 bg-border" />
                </div>

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
                        <CountrySelect
                            value={resolveCountryIso(form.nationality)}
                            onChange={(iso) => setForm(prev => ({ ...prev, nationality: countryNameFromIso(iso) }))}
                            placeholder={t('careers.apply.nationality')}
                        />
                    </Field>
                    <Field label={t('careers.apply.experience')}>
                        <NumericInput decimal={false} value={form.experience} onChange={set('experience')} />
                    </Field>
                    <Field label={t('careers.apply.expectedSalary')}>
                        <NumericInput decimal={false} value={form.expectedSalary} onChange={set('expectedSalary')} />
                    </Field>
                </div>
                <Field label={t('careers.apply.coverNote')}>
                    <Textarea rows={3} value={form.coverNote} onChange={set('coverNote')} placeholder={t('careers.apply.coverNotePlaceholder')} className="resize-none" />
                </Field>
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
