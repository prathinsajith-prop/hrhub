/**
 * Public job listings — /careers/:companyCode
 * Editorial hero + server-side filters + a 4-up grid of square tiles with
 * infinite scroll (25 per page, fetched from the API as the user scrolls).
 */
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { MapPin, Building2, Briefcase, ArrowRight, Banknote, Loader2, Search, X } from 'lucide-react'
import { usePublicJobs, usePublicJobFacets, type JobFilters } from '@/hooks/usePublicCareers'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { PUBLIC_ROUTES } from '@/lib/routes'
import { PublicShell, CareersError } from './careersShared'
import { useJobTypeLabel, formatSalaryRange } from './careersHelpers'

const ALL = 'all'

export function CareersListPage() {
    const { companyCode = '' } = useParams<{ companyCode: string }>()
    const { t } = useTranslation()
    const typeLabel = useJobTypeLabel()

    // ── Filter state (search is debounced before it hits the query key) ──
    const [searchInput, setSearchInput] = useState('')
    const [q, setQ] = useState('')
    const [department, setDepartment] = useState('')
    const [location, setLocation] = useState('')
    const [type, setType] = useState('')
    useEffect(() => {
        const id = setTimeout(() => setQ(searchInput.trim()), 300)
        return () => clearTimeout(id)
    }, [searchInput])

    const filters: JobFilters = { q: q || undefined, department: department || undefined, location: location || undefined, type: type || undefined }
    const hasActiveFilters = !!(q || department || location || type)
    const clearFilters = () => { setSearchInput(''); setQ(''); setDepartment(''); setLocation(''); setType('') }

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
                    <div className="mt-9 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-square w-full rounded-2xl" />)}
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
                    <ul className={`grid grid-cols-1 gap-4 transition-opacity sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${refetchingFilters ? 'opacity-50' : ''}`}>
                        {jobs.map((job, i) => {
                            const salary = formatSalaryRange(job.minSalary, job.maxSalary)
                            return (
                                <li key={job.id} className="animate-fade-in" style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}>
                                    <Link
                                        to={PUBLIC_ROUTES.careersJob(companyCode, job.id)}
                                        className="card-hover group flex aspect-square flex-col rounded-2xl border border-border/70 bg-card p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                                    >
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{typeLabel(job.type)}</span>
                                            {job.openings > 1 && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-figures">{job.openings} {t('careers.openingsShort')}</span>}
                                        </div>

                                        <h2 className="mt-3.5 line-clamp-2 font-display text-lg font-semibold leading-snug tracking-tight transition-colors group-hover:text-primary">{job.title}</h2>

                                        <div className="mt-2.5 flex flex-col gap-1.5 text-[13px] text-muted-foreground">
                                            {job.department && <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5 shrink-0 opacity-70" /><span className="truncate">{job.department}</span></span>}
                                            {job.location && <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5 shrink-0 opacity-70" /><span className="truncate">{job.location}</span></span>}
                                            {salary && <span className="inline-flex items-center gap-1.5 font-medium text-foreground/80 tabular-figures"><Banknote className="size-3.5 shrink-0 opacity-70" /><span className="truncate">{salary}</span></span>}
                                        </div>

                                        <div className="mt-auto flex items-center justify-between border-t border-border/60 pt-3 text-sm font-medium text-muted-foreground transition-colors group-hover:text-primary">
                                            <span>{t('careers.viewRole')}</span>
                                            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
                                        </div>
                                    </Link>
                                </li>
                            )
                        })}
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
