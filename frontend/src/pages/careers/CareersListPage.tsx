/**
 * Public job listings — /careers/:companyCode
 * Editorial hero + server-side filters + a 3-up grid of richer job cards with
 * infinite scroll. Each card surfaces type/workplace badges, salary, a skills
 * preview, and closing date so candidates can scan without opening every role.
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, Building2, Briefcase, ArrowRight, Banknote, Loader2, Search, X, CalendarClock, Users, Hash } from 'lucide-react'
import { usePublicJobs, usePublicJobFacets, type JobFilters } from '@/hooks/usePublicCareers'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { PUBLIC_ROUTES } from '@/lib/routes'
import { PublicShell, CareersError } from './careersShared'
import { useJobTypeLabel, useWorkplaceLabel, formatSalaryRange } from './careersHelpers'
import { JobTypeBadge, WorkplaceBadge, TagChip, formatPostedAgo } from '@/components/shared/JobBadges'
import { formatDate } from '@/lib/utils'

const ALL = 'all'
const SKILLS_PREVIEW = 3 // how many skill chips to show on the card before "+N more"

export function CareersListPage() {
    const { companyCode = '' } = useParams<{ companyCode: string }>()
    const { t } = useTranslation()
    const typeLabel = useJobTypeLabel()
    const workplaceLabel = useWorkplaceLabel()

    // ── Filter state (search is debounced before it hits the query key) ──
    const [searchInput, setSearchInput] = useState('')
    const [q, setQ] = useState('')
    const [department, setDepartment] = useState('')
    const [location, setLocation] = useState('')
    const [type, setType] = useState('')
    const [workplaceType, setWorkplaceType] = useState('')
    useEffect(() => {
        const id = setTimeout(() => setQ(searchInput.trim()), 300)
        return () => clearTimeout(id)
    }, [searchInput])

    const filters: JobFilters = { q: q || undefined, department: department || undefined, location: location || undefined, type: type || undefined, workplaceType: workplaceType || undefined }
    const hasActiveFilters = !!(q || department || location || type || workplaceType)
    const clearFilters = () => { setSearchInput(''); setQ(''); setDepartment(''); setLocation(''); setType(''); setWorkplaceType('') }

    const { data, isLoading, isError, isFetching, isPlaceholderData, fetchNextPage, hasNextPage, isFetchingNextPage } = usePublicJobs(companyCode, filters)
    const { data: facetsRes } = usePublicJobFacets(companyCode)
    const facets = facetsRes?.data

    // Fetch the next page when the sentinel scrolls into view.
    const sentinelRef = useRef<HTMLDivElement>(null)
    useEffect(() => {
        const el = sentinelRef.current
        if (!el || !hasNextPage) return
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting && !isFetchingNextPage) fetchNextPage() },
            { rootMargin: '300px' },
        )
        observer.observe(el)
        return () => observer.disconnect()
    }, [hasNextPage, isFetchingNextPage, fetchNextPage])

    // First load (no data yet) — full-page skeleton.
    if (isLoading) {
        return (
            <PublicShell>
                <div className="mx-auto max-w-6xl px-5 pt-14 pb-10">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="mt-4 h-10 w-72" />
                    <Skeleton className="mt-3 h-4 w-96 max-w-full" />
                    <div className="mt-9 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64 w-full rounded-2xl" />)}
                    </div>
                </div>
            </PublicShell>
        )
    }

    if (isError || !data) {
        return <CareersError title={t('careers.companyNotFound')} hint={t('careers.companyNotFoundHint')} />
    }

    const company = data.pages[0].data.company
    const total = data.pages[0].data.total
    const jobs = data.pages.flatMap(p => p.data.jobs)
    const refetchingFilters = isFetching && isPlaceholderData

    return (
        <PublicShell company={company.name}>
            <div className="mx-auto max-w-6xl px-5 pt-14 pb-16">
                {/* ── Hero ── */}
                <header className="mb-8">
                    <p className="animate-fade-in text-xs font-semibold uppercase tracking-[0.18em] text-primary">{company.name}</p>
                    <h1 className="animate-fade-in mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl" style={{ animationDelay: '40ms' }}>
                        {t('careers.openPositions')}
                    </h1>
                    <p className="animate-fade-in mt-3 max-w-prose text-[15px] leading-relaxed text-muted-foreground" style={{ animationDelay: '80ms' }}>
                        {t('careers.openPositionsAt', { company: company.name })}
                    </p>
                </header>

                {/* ── Filters ── */}
                <div className="animate-fade-in mb-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" style={{ animationDelay: '110ms' }}>
                    <div className="relative flex-1 sm:min-w-[240px]">
                        <Search className="pointer-events-none absolute top-1/2 size-4 -translate-y-1/2 text-muted-foreground ltr:left-3 rtl:right-3" />
                        <Input
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            placeholder={t('careers.searchPlaceholder')}
                            className="ltr:pl-9 rtl:pr-9"
                            aria-label={t('careers.searchPlaceholder')}
                        />
                    </div>

                    {!!facets?.departments.length && (
                        <FacetSelect value={department} onChange={setDepartment} allLabel={t('careers.allDepartments')} options={facets.departments} />
                    )}
                    {!!facets?.locations.length && (
                        <FacetSelect value={location} onChange={setLocation} allLabel={t('careers.allLocations')} options={facets.locations} />
                    )}
                    {!!facets?.types.length && (
                        <FacetSelect value={type} onChange={setType} allLabel={t('careers.allTypes')} options={facets.types} renderLabel={typeLabel} />
                    )}
                    {!!facets?.workplaceTypes?.length && (
                        <FacetSelect value={workplaceType} onChange={setWorkplaceType} allLabel={t('careers.allWorkplaces', { defaultValue: 'All workplaces' })} options={facets.workplaceTypes} renderLabel={workplaceLabel} />
                    )}

                    {hasActiveFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                            <X className="size-4 ltr:mr-1 rtl:ml-1" />{t('careers.clearFilters')}
                        </Button>
                    )}
                </div>

                <p className="mb-5 text-sm text-muted-foreground tabular-figures">{t('careers.resultsCount', { count: total })}</p>

                {/* ── Roles ── */}
                {jobs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed bg-card/50 py-20 text-center">
                        <div className="mx-auto grid size-11 place-items-center rounded-2xl border bg-background text-muted-foreground/60">
                            <Briefcase className="size-5" />
                        </div>
                        <p className="mt-4 font-display text-base font-medium">{hasActiveFilters ? t('careers.noMatches') : t('careers.noOpenings')}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{hasActiveFilters ? t('careers.noMatchesHint') : t('careers.noOpeningsHint')}</p>
                        {hasActiveFilters && <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">{t('careers.clearFilters')}</Button>}
                    </div>
                ) : (
                    <ul className={`grid grid-cols-1 gap-5 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${refetchingFilters ? 'opacity-50' : ''}`}>
                        {jobs.map((job, i) => (
                            <li key={job.id} className="animate-fade-in" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                                <JobCard
                                    job={job}
                                    href={PUBLIC_ROUTES.careersJob(companyCode, job.id)}
                                    skillsPreview={SKILLS_PREVIEW}
                                    t={t}
                                />
                            </li>
                        ))}
                    </ul>
                )}

                {/* Infinite-scroll sentinel — fetches the next page as it nears the viewport. */}
                {hasNextPage && (
                    <div ref={sentinelRef} className="flex justify-center py-8 text-muted-foreground">
                        {isFetchingNextPage && <Loader2 className="size-5 animate-spin" />}
                    </div>
                )}
            </div>
        </PublicShell>
    )
}

/**
 * One job tile for the public listing. Designed to be scannable:
 *   • Top stripe — type + workplace badges (colour-coded) and "posted X ago"
 *   • Title (line-clamp-2)
 *   • Department / Location / Salary / Openings rows
 *   • Skills preview (first N chips + overflow counter)
 *   • Footer — closing date + "View role →"
 */
function JobCard({
    job,
    href,
    skillsPreview,
    t,
}: {
    job: import('@/hooks/usePublicCareers').PublicJob
    href: string
    skillsPreview: number
    t: ReturnType<typeof useTranslation>['t']
}) {
    const salary = formatSalaryRange(job.minSalary, job.maxSalary)
    const postedAgo = formatPostedAgo(job.createdAt)
    const visibleSkills = (job.skills ?? []).slice(0, skillsPreview)
    const extraSkills = Math.max(0, (job.skills ?? []).length - visibleSkills.length)

    return (
        <Link
            to={href}
            className="card-hover group flex h-full flex-col rounded-2xl border border-border/70 bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
            {/* Header — badges + ref/posted */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <JobTypeBadge type={job.type} size="sm" />
                    {job.workplaceType && <WorkplaceBadge workplace={job.workplaceType} size="sm" />}
                </div>
                <div className="flex flex-col items-end gap-0.5 pt-0.5 shrink-0">
                    {postedAgo && (
                        <span className="text-[11px] font-medium text-muted-foreground/80 tabular-figures whitespace-nowrap">
                            {postedAgo}
                        </span>
                    )}
                    {job.jobNo && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-muted-foreground/60 tabular-figures whitespace-nowrap">
                            <Hash className="size-2.5 opacity-70" />{job.jobNo}
                        </span>
                    )}
                </div>
            </div>

            {/* Title */}
            <h2 className="mt-4 line-clamp-2 font-display text-lg font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-primary">
                {job.title}
            </h2>

            {/* Meta */}
            <div className="mt-3 space-y-1.5 text-[13px] text-muted-foreground">
                {job.department && (
                    <span className="flex items-center gap-1.5">
                        <Building2 className="size-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{job.department}</span>
                    </span>
                )}
                {job.location && (
                    <span className="flex items-center gap-1.5">
                        <MapPin className="size-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{job.location}</span>
                    </span>
                )}
                {job.industry && (
                    <span className="flex items-center gap-1.5">
                        <Briefcase className="size-3.5 shrink-0 opacity-70" />
                        <span className="truncate">{job.industry}</span>
                    </span>
                )}
                {salary && (
                    <span className="flex items-center gap-1.5 font-semibold text-foreground/90 tabular-figures">
                        <Banknote className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="truncate">{salary}</span>
                    </span>
                )}
                {job.openings > 1 && (
                    <span className="flex items-center gap-1.5">
                        <Users className="size-3.5 shrink-0 opacity-70" />
                        <span>{t('careers.openingsCount', { count: job.openings })}</span>
                    </span>
                )}
            </div>

            {/* Skills preview */}
            {visibleSkills.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                    {visibleSkills.map(s => (
                        <TagChip key={s} tone="sky">{s}</TagChip>
                    ))}
                    {extraSkills > 0 && (
                        <TagChip tone="slate">+{extraSkills}</TagChip>
                    )}
                </div>
            )}

            {/* Footer */}
            <div className="mt-auto pt-4">
                <div className="flex items-center justify-between border-t border-border/60 pt-3">
                    {job.closingDate ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground tabular-figures">
                            <CalendarClock className="size-3.5 opacity-70" />
                            {t('careers.closingDate', { date: formatDate(job.closingDate) })}
                        </span>
                    ) : (
                        <span />
                    )}
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
                        {t('careers.viewRole')}
                        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                    </span>
                </div>
            </div>
        </Link>
    )
}

function FacetSelect({
    value,
    onChange,
    allLabel,
    options,
    renderLabel,
}: {
    value: string
    onChange: (v: string) => void
    allLabel: string
    options: string[]
    renderLabel?: (v: string) => string
}) {
    return (
        <Select value={value || ALL} onValueChange={v => onChange(v === ALL ? '' : v)}>
            <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder={allLabel} />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>{allLabel}</SelectItem>
                {options.map(opt => <SelectItem key={opt} value={opt}>{renderLabel ? renderLabel(opt) : opt}</SelectItem>)}
            </SelectContent>
        </Select>
    )
}
