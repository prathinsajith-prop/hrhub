/**
 * Public job detail + apply — /careers/:companyCode/jobs/:jobId
 * Two-column on desktop: the posting (left) and a sticky apply panel (right);
 * stacks on mobile. Resume is required (drag-and-drop or click).
 */
import { useState, useRef, useMemo, useEffect, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, MapPin, Building2, CalendarDays, Banknote, Users, CheckCircle2, Sparkles, GraduationCap, Clock, Hash, Briefcase, Info, ImagePlus, Trash2 } from 'lucide-react'
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
import { formatDate, cn } from '@/lib/utils'
import { PUBLIC_ROUTES } from '@/lib/routes'
import { PublicShell, CareersError } from './careersShared'
import { formatSalaryRange } from './careersHelpers'
import { JobTypeBadge, WorkplaceBadge, TagChip, formatPostedAgo } from '@/components/shared/JobBadges'
import { CandidateProfileFields, GenderSelect } from '@/components/shared/CandidateProfileFields'
import type { EducationEntry, ExperienceEntry } from '@/components/shared/MultiEntryField'

export function CareersJobPage() {
    const { companyCode = '', jobId = '' } = useParams<{ companyCode: string; jobId: string }>()
    const { t } = useTranslation()
    const { data, isLoading, isError } = usePublicJob(companyCode, jobId)
    const [tab, setTab] = useState<'overview' | 'application'>('overview')

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

                {/* Hero — anchored job header, shown above both tabs.
                    All structured details live here in two regions so we don't
                    duplicate them in a body sidebar:
                      • Top region: company eyebrow + title + badges + ref + meta
                      • Bottom region (divided): salary · employment type · workplace
                        · openings · closes + the primary Apply CTA */}
                <header className="mt-5 animate-fade-in overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-sm backdrop-blur-sm">
                    <div aria-hidden className="h-1 w-full bg-gradient-to-r from-primary via-primary/55 to-transparent" />
                    <div className="p-6 sm:p-7">
                        <p className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{company.name}</p>
                        <div className="mt-2.5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                                <h1 className="font-display text-[26px] font-semibold leading-tight tracking-tight sm:text-4xl">{job.title}</h1>
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                    <JobTypeBadge type={job.type} size="md" variant="bordered" />
                                    {job.workplaceType && <WorkplaceBadge workplace={job.workplaceType} size="md" variant="bordered" />}
                                    {job.jobNo && (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                                            <Hash className="size-3 opacity-70" />{job.jobNo}
                                        </span>
                                    )}
                                </div>
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
                            </div>
                            {/* Primary CTA — top-right, immediately visible */}
                            {tab !== 'application' && (
                                <Button size="lg" onClick={() => setTab('application')} className="shrink-0 sm:min-w-[150px]">
                                    {t('careers.applyNow', { defaultValue: 'Apply now' })}
                                </Button>
                            )}
                        </div>

                        {/* Divided details strip — key facts at a glance */}
                        <div className="mt-5 border-t border-border/60 pt-4">
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
                                {salary && (
                                    <HeroFact icon={<Banknote className="size-3.5 text-emerald-600 dark:text-emerald-400" />} label={t('careers.salaryLabel')}>
                                        <span className="tabular-figures">{salary}</span>
                                    </HeroFact>
                                )}
                                <HeroFact icon={<Briefcase className="size-3.5" />} label={t('careers.typeLabel', { defaultValue: 'Employment type' })}>
                                    {t(`careers.type.${job.type}`, { defaultValue: job.type })}
                                </HeroFact>
                                {job.workplaceType && (
                                    <HeroFact icon={<Building2 className="size-3.5" />} label={t('careers.workplaceLabel', { defaultValue: 'Workplace' })}>
                                        {t(`careers.workplace.${job.workplaceType}`, { defaultValue: job.workplaceType })}
                                    </HeroFact>
                                )}
                                {job.openings > 0 && (
                                    <HeroFact icon={<Users className="size-3.5" />} label={t('careers.openingsLabel', { defaultValue: 'Openings' })}>
                                        <span className="tabular-figures">{job.openings}</span>
                                    </HeroFact>
                                )}
                                {job.closingDate && (
                                    <HeroFact icon={<CalendarDays className="size-3.5" />} label={t('careers.closingLabel', { defaultValue: 'Closes' })}>
                                        <span className="tabular-figures">{formatDate(job.closingDate)}</span>
                                    </HeroFact>
                                )}
                            </dl>
                        </div>
                    </div>
                </header>

                {/* Overview / Application tabs */}
                <div className="mt-6 border-b border-border">
                    <nav className="-mb-px flex gap-1" aria-label={t('careers.jobSections', { defaultValue: 'Job sections' })}>
                        {([['overview', t('careers.overview', { defaultValue: 'Overview' })], ['application', t('careers.applicationTab', { defaultValue: 'Application' })]] as const).map(([key, label]) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setTab(key)}
                                className={cn(
                                    'border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                                    tab === key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </nav>
                </div>

                {tab === 'overview' ? (
                <div className="mt-6">
                    {/* Body is now single-column — the header carries all the
                        structured details (salary, type, workplace, openings,
                        closes) so we don't repeat them in a sidebar. */}
                    <article className="animate-fade-in min-w-0 divide-y divide-border/60 rounded-2xl border border-border/70 bg-card/60 px-6 shadow-sm sm:px-7">

                        {/* About */}
                        {job.description && job.description !== '<p></p>' && (
                            <section className="py-6">
                                <SectionTitle>{t('careers.aboutRole')}</SectionTitle>
                                <RichTextDisplay html={job.description} className="mt-3 text-[15px] text-foreground/80" />
                            </section>
                        )}

                        {/* Requirements */}
                        {job.requirements?.length > 0 && (
                            <section className="py-6">
                                <SectionTitle>{t('careers.requirements')}</SectionTitle>
                                {/* Line design (matches the section-title accent bar) —
                                    cleaner than a checkmark list for free-form requirements. */}
                                <ul className="mt-3 space-y-3">
                                    {job.requirements.map((r, i) => (
                                        <li key={`${i}-${r}`} className="flex gap-3 text-[15px] leading-relaxed text-foreground/80">
                                            <span aria-hidden className="mt-[7px] h-4 w-1 shrink-0 rounded-full bg-primary/50" />
                                            <span>{r}</span>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        )}

                        {/* Skills — always rendered so the field is visible
                            even when the job hasn't listed any yet. */}
                        <section className="py-6">
                            <SectionTitle>
                                <Sparkles className="inline size-3.5 text-sky-500 ltr:mr-1.5 rtl:ml-1.5 align-[-1px]" />
                                {t('careers.skills', { defaultValue: 'Skills' })}
                            </SectionTitle>
                            {(job.skills?.length ?? 0) > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {job.skills.map((s: string, i: number) => (
                                        <TagChip key={`${i}-${s}`} tone="sky" className="text-[13px] px-3 py-1">{s}</TagChip>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-3 text-sm text-muted-foreground italic">
                                    {t('careers.noSkillsListed', { defaultValue: 'Specific skills not listed — share yours when you apply.' })}
                                </p>
                            )}
                        </section>

                        {/* Qualifications — always rendered too */}
                        <section className="py-6">
                            <SectionTitle>
                                <GraduationCap className="inline size-3.5 text-emerald-500 ltr:mr-1.5 rtl:ml-1.5 align-[-1px]" />
                                {t('careers.qualifications', { defaultValue: 'Qualifications' })}
                            </SectionTitle>
                            {(job.qualifications?.length ?? 0) > 0 ? (
                                <div className="mt-3 flex flex-wrap gap-1.5">
                                    {job.qualifications.map((q: string, i: number) => (
                                        <TagChip key={`${i}-${q}`} tone="emerald" className="text-[13px] px-3 py-1">{q}</TagChip>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-3 text-sm text-muted-foreground italic">
                                    {t('careers.noQualificationsListed', { defaultValue: 'Specific qualifications not listed — apply and we\'ll discuss requirements.' })}
                                </p>
                            )}
                        </section>

                        {/* Friendly fallback so the article never looks empty */}
                        {!hasBodyContent && (
                            <section className="py-8 text-center">
                                <div className="mx-auto grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                                    <Info className="size-4" />
                                </div>
                                <p className="mt-3 text-sm text-muted-foreground">{t('careers.noDetailsYet', { defaultValue: 'Full role details coming soon. Apply below — the hiring team will share more when they reach out.' })}</p>
                            </section>
                        )}
                    </article>

                </div>
                ) : (
                    /* Application tab — wider container so the résumé dropzone
                        and the inline 2-col form fields breathe properly. */
                    <div className="mx-auto mt-6 max-w-4xl">
                        <ApplyForm companyCode={companyCode} jobId={jobId} jobTitle={job.title} />
                    </div>
                )}
            </div>
        </PublicShell>
    )
}

/**
 * One labeled fact inside the hero's bottom strip — stacks as a small
 * uppercase label above a foreground value. Used for salary, employment type,
 * workplace, openings, closes. Keeps the strip information-dense without
 * needing a separate sidebar panel.
 */
function HeroFact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
    return (
        <div className="min-w-0">
            <dt className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="opacity-70">{icon}</span>{label}
            </dt>
            <dd className="mt-0.5 truncate text-sm font-semibold text-foreground/90">{children}</dd>
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
    const [form, setForm] = useState({ name: '', email: '', phone: '', nationality: '', experience: '', expectedSalary: '', currentSalary: '', coverNote: '' })
    // Additional profile fields — kept as separate state to keep the submit
    // payload assembly explicit (multipart upload).
    const [address, setAddress] = useState('')
    const [gender, setGender] = useState<'' | 'male' | 'female' | 'other' | 'prefer_not_to_say'>('')
    const [education, setEducation] = useState<EducationEntry[]>([])
    const [experience, setExperience] = useState<ExperienceEntry[]>([])
    const [file, setFile] = useState<File | null>(null)
    const [photo, setPhoto] = useState<Blob | null>(null)
    const [done, setDone] = useState(false)
    // The submitted candidate photo defaults to the image auto-extracted from the
    // résumé; an explicit upload takes priority. `photoLocked` ensures a résumé
    // re-parse never overrides the candidate's manual upload/removal.
    const photoLocked = useRef(false)
    const onResumePhoto = (p: Blob | null) => { if (!photoLocked.current) setPhoto(p) }
    const onPickPhoto = (f: File | null) => { photoLocked.current = true; setPhoto(f) }
    const onRemovePhoto = () => { photoLocked.current = true; setPhoto(null) }

    const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setForm(prev => ({ ...prev, [k]: e.target.value }))

    // Pre-fill empty fields from the parsed résumé; never overwrite what the user typed.
    // Skills/links the parser extracts but the form doesn't surface are prepended
    // to the cover note as a lossless "Parsed:" block so HR sees them.
    const handleParsed = (p: ParsedResume) => {
        setForm(prev => ({
            ...prev,
            name: prev.name || p.name || '',
            email: prev.email || p.email || '',
            phone: prev.phone || p.phone || '',
            experience: prev.experience || (p.experienceYears != null ? String(p.experienceYears) : ''),
            coverNote: prev.coverNote || buildParsedNoteBlock(p),
        }))
    }

    const submit = (e: FormEvent) => {
        e.preventDefault()
        if (!form.name.trim() || !form.email.trim() || !file) return toast.error(t('careers.apply.missingFields'))
        const input: ApplyInput = {
            ...form,
            address: address.trim() || undefined,
            gender: gender || undefined,
            educationHistory: education.length > 0 ? education : undefined,
            experienceHistory: experience.length > 0 ? experience : undefined,
            resume: file,
            photo,
        }
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
                    <ResumeUpload file={file} onFile={setFile} onParsed={handleParsed} onPhoto={onResumePhoto} />
                </Field>

                <div className="relative flex items-center gap-3 py-0.5">
                    <span className="h-px flex-1 bg-border" />
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">or enter details manually</span>
                    <span className="h-px flex-1 bg-border" />
                </div>

                <Field label={t('careers.apply.name')} required>
                    <Input value={form.name} onChange={set('name')} autoComplete="name" required />
                </Field>
                {/* Email + Gender side-by-side (Gender on the right) */}
                <div className="grid grid-cols-2 gap-3">
                    <Field label={t('careers.apply.email')} required>
                        <Input type="email" value={form.email} onChange={set('email')} autoComplete="email" required />
                    </Field>
                    <Field label={t('careers.apply.gender', { defaultValue: 'Gender' })}>
                        <GenderSelect value={gender} onChange={setGender} />
                    </Field>
                </div>
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
                    <Field label={t('careers.apply.currentSalary', { defaultValue: 'Current salary' })}>
                        <NumericInput decimal={false} value={form.currentSalary} onChange={set('currentSalary')} />
                    </Field>
                </div>
                <Field label={t('careers.apply.photo', { defaultValue: 'Photo (optional)' })}>
                    <PhotoField photo={photo} onPick={onPickPhoto} onRemove={onRemovePhoto} t={t} />
                </Field>

                {/* ── Extended profile — Address, Gender, Experience, Education ── */}
                <div className="pt-4 border-t border-border/60">
                    <CandidateProfileFields
                        address={address}
                        onAddressChange={setAddress}
                        gender={gender}
                        onGenderChange={setGender}
                        showGender={false}
                        education={education}
                        onEducationChange={setEducation}
                        experience={experience}
                        onExperienceChange={setExperience}
                    />
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

/**
 * Lossless capture of résumé-parsed fields the form doesn't surface (skills,
 * LinkedIn, GitHub, portfolio). Returns a single "Parsed:" line block ready to
 * prefix into a free-text notes field; empty string when nothing was parsed.
 */
function buildParsedNoteBlock(p: ParsedResume): string {
    const lines: string[] = []
    if (p.skills.length > 0) lines.push(`Skills: ${p.skills.join(', ')}`)
    if (p.linkedin) lines.push(`LinkedIn: ${p.linkedin}`)
    if (p.github) lines.push(`GitHub: ${p.github}`)
    if (p.portfolio) lines.push(`Portfolio: ${p.portfolio}`)
    return lines.length > 0 ? `Parsed:\n${lines.join('\n')}` : ''
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
    return (
        <div>
            <Label className="text-xs">{label}{required && <span className="text-destructive"> *</span>}</Label>
            <div className="mt-1.5">{children}</div>
        </div>
    )
}

/**
 * Optional candidate photo. Shows the effective photo (manual upload OR the
 * image auto-extracted from the résumé) as a circular preview with replace /
 * remove; otherwise a compact image drop zone. Image-only, ≤2 MB.
 */
function PhotoField({ photo, onPick, onRemove, t }: {
    photo: Blob | null
    onPick: (f: File | null) => void
    onRemove: () => void
    t: ReturnType<typeof useTranslation>['t']
}) {
    const inputRef = useRef<HTMLInputElement>(null)
    const [dragging, setDragging] = useState(false)
    const url = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
    useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

    function pick(f: File | null | undefined) {
        if (!f) return
        if (!f.type.startsWith('image/')) return toast.error(t('careers.apply.photoInvalid', { defaultValue: 'Please choose an image file.' }))
        if (f.size > 2 * 1024 * 1024) return toast.error(t('careers.apply.photoTooLarge', { defaultValue: 'Image must be under 2 MB.' }))
        onPick(f)
    }

    return (
        <>
            <input ref={inputRef} type="file" accept="image/*" className="sr-only" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
            {url ? (
                <div className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 p-2.5">
                    <img src={url} alt="" className="size-12 shrink-0 rounded-full object-cover ring-1 ring-border" />
                    <span className="flex-1 truncate text-xs text-muted-foreground">{t('careers.apply.photoAttached', { defaultValue: 'Photo attached' })}</span>
                    <button type="button" onClick={() => inputRef.current?.click()} className="rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10">{t('careers.apply.photoReplace', { defaultValue: 'Replace' })}</button>
                    <button type="button" onClick={onRemove} aria-label={t('careers.apply.photoRemove', { defaultValue: 'Remove photo' })} className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
                        <Trash2 className="size-4" />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragging(true) }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={e => { e.preventDefault(); setDragging(false); pick(e.dataTransfer.files?.[0]) }}
                    className={cn(
                        'flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-4 text-center text-sm transition-colors',
                        dragging ? 'border-primary bg-primary/5' : 'border-border text-muted-foreground hover:border-primary/40 hover:bg-accent/40',
                    )}
                >
                    <span className="grid size-8 place-items-center rounded-full bg-muted text-muted-foreground"><ImagePlus className="size-4" /></span>
                    {t('careers.apply.photoChoose', { defaultValue: 'Choose a photo or drag and drop' })}
                </button>
            )}
        </>
    )
}
