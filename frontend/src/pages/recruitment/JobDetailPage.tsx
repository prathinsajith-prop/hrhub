import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { RichTextDisplay } from '@/components/ui/rich-text-display'
import {
  ArrowLeft, Edit2, MapPin, Briefcase, Users,
  Download, Eye, Star, CheckCircle2, XCircle, AlertCircle,
  GraduationCap, Sparkles, Hash, Building2, Clock, Wand2,
} from 'lucide-react'
import { JobTypeBadge, WorkplaceBadge, TagChip, formatPostedAgo } from '@/components/shared/JobBadges'
import { MatchScoreBadge, MatchSkillChips } from '@/components/shared/RecommendationBits'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/shared/EmptyState'
import { CandidateSourceBadge } from '@/components/shared/CandidateSourceBadge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { useJob, useApplications, useRecruitmentStages, useRecommendedCandidates } from '@/hooks/useRecruitment'
import { DataTable } from '@/components/ui/data-table'
import type { ColumnDef } from '@tanstack/react-table'
import { EditJobDialog } from '@/components/shared/action-dialogs'
import { formatCurrency, formatDate, getInitials, cn } from '@/lib/utils'
import { labelFor } from '@/lib/enums'
import { DEFAULT_STAGES, resolveStageColor, stageByKey, type RecruitmentStage } from '@/lib/recruitmentStages'
import type { Job, Candidate, ApplicationStage } from '@/types'

const SOURCE_FILTERS = [
  { key: 'all' as const,      labelKey: 'recruitment.source.all',      activeClass: 'bg-foreground text-background border-foreground' },
  { key: 'careers' as const,  labelKey: 'recruitment.source.careers',  activeClass: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50' },
  { key: 'referral' as const, labelKey: 'recruitment.source.referral', activeClass: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900/50' },
  { key: 'direct' as const,   labelKey: 'recruitment.source.hr',       activeClass: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50' },
]

const JOB_STATUS_STYLE: Record<string, string> = {
  open:    'bg-success/10 text-success border-success/20',
  on_hold: 'bg-warning/10 text-warning border-warning/20',
  closed:  'bg-muted text-muted-foreground border-border',
  draft:   'bg-muted text-muted-foreground border-border',
}

/**
 * Label + value row used by the "Job overview" card on the detail page.
 * Keeps employment-type / workplace / industry / ref visually consistent
 * regardless of which fields are populated.
 */
function OverviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

export function JobDetailPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [stageFilter, setStageFilter] = useState<ApplicationStage | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'direct' | 'referral' | 'careers'>('all')

  const { data: jobData, isLoading: jobLoading } = useJob(id)
  const { data: appsData, isLoading: appsLoading } = useApplications({ jobId: id, limit: 200 })
  const { data: recsData, isLoading: recsLoading } = useRecommendedCandidates(id ?? '', !!id)
  const { data: stagesData } = useRecruitmentStages()
  const allStages = useMemo<RecruitmentStage[]>(
    () => (stagesData && stagesData.length > 0
      ? stagesData
      : DEFAULT_STAGES.map((s) => ({ ...s, id: `default-${s.stageKey}`, tenantId: '', createdAt: '', updatedAt: '' }))),
    [stagesData],
  )

  const job = jobData as Job | undefined
  const allCandidates = useMemo(
    () => ((appsData as { data?: Candidate[] })?.data ?? []) as Candidate[],
    [appsData],
  )
  // Authoritative applicant count. The detail page used to read `job.applications`,
  // but the job record carries NO applicant counter column — that field is always
  // undefined, so the "Applications" stat + fill-rate rendered 0 even with
  // candidates listed below. Use the applications query's own server-side total
  // (COUNT(*) OVER(), not capped by the 200-row fetch limit) so the stat can never
  // disagree with the candidates table on the same page.
  const applicationCount = (appsData as { total?: number } | undefined)?.total ?? allCandidates.length
  const stageCounts = useMemo(
    () => allCandidates.reduce<Partial<Record<ApplicationStage, number>>>((acc, c) => {
      acc[c.stage] = (acc[c.stage] ?? 0) + 1
      return acc
    }, {}),
    [allCandidates],
  )
  const sourceCounts = useMemo(
    () => allCandidates.reduce<Record<'direct' | 'referral' | 'careers', number>>((acc, c) => {
      const src = c.source ?? 'direct'
      acc[src] = (acc[src] ?? 0) + 1
      return acc
    }, { direct: 0, referral: 0, careers: 0 }),
    [allCandidates],
  )
  const candidates = useMemo(
    () => allCandidates.filter(c =>
      (stageFilter === 'all' || c.stage === stageFilter) &&
      (sourceFilter === 'all' || (c.source ?? 'direct') === sourceFilter),
    ),
    [allCandidates, stageFilter, sourceFilter],
  )

  const columns = useMemo<ColumnDef<Candidate>[]>(() => [
    {
      id: 'candidate',
      header: t('recruitment.jobDetail.candidates'),
      cell: ({ row }) => {
        const c = row.original
        return (
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="size-9 shrink-0 border border-border/60">
              {(c.avatarUrl ?? c.avatar) && (
                <img src={(c.avatarUrl ?? c.avatar) as string} alt={c.name} className="object-cover" />
              )}
              <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">{getInitials(c.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
                <CandidateSourceBadge source={c.source} referredByName={c.referredByName} className="shrink-0" />
              </div>
              <div className="flex items-center gap-2 flex-wrap mt-0.5">
                <span className="text-[11px] text-muted-foreground">{c.nationality}</span>
                {c.experience > 0 && <span className="text-[11px] text-muted-foreground">{t('recruitment.jobDetail.experienceYears', { count: c.experience })}</span>}
                {c.expectedSalary != null && <span className="text-[11px] text-muted-foreground">{t('recruitment.jobDetail.expectedSalary', { salary: formatCurrency(c.expectedSalary) })}</span>}
              </div>
            </div>
          </div>
        )
      },
    },
    {
      id: 'stage',
      header: t('common.status', { defaultValue: 'Status' }),
      cell: ({ row }) => {
        const c = row.original
        const stage = stageByKey(allStages, c.stage)
        const color = resolveStageColor(stage?.colorKey)
        return <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5', color.badgeClass)}>{stage?.label ?? c.stage}</Badge>
      },
    },
    {
      id: 'score',
      header: t('recruitment.jobDetail.score', { defaultValue: 'Score' }),
      // A manual recruiter rating wins when set (gold star); otherwise we show
      // the engine's fit score against this job (% match badge), so the column
      // is meaningful even when nobody has hand-scored the candidate. Falls back
      // to — only when neither exists.
      cell: ({ row }) => {
        const c = row.original
        if (c.score > 0) {
          return <div className="flex items-center gap-0.5 text-[11px] text-amber-600"><Star className="size-3 fill-amber-400 text-amber-400" /><span className="font-medium">{c.score}</span></div>
        }
        if (typeof c.matchScore === 'number' && c.matchScore > 0) {
          return <MatchScoreBadge score={c.matchScore} compact />
        }
        return <span className="text-[11px] text-muted-foreground">—</span>
      },
    },
    {
      id: 'applied',
      header: t('recruitment.jobDetail.applied', { defaultValue: 'Applied' }),
      cell: ({ row }) => <span className="text-[11px] text-muted-foreground whitespace-nowrap">{formatDate(row.original.appliedDate)}</span>,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const c = row.original
        return (
          <div className="flex items-center justify-end gap-1">
            {c.resumeUrl && (
              <a href={c.resumeUrl} target="_blank" rel="noopener noreferrer" download onClick={e => e.stopPropagation()}>
                <Button size="icon-sm" variant="ghost" aria-label={t('recruitment.jobDetail.downloadResume')}><Download className="size-3.5" /></Button>
              </a>
            )}
            <Button size="icon-sm" variant="ghost" aria-label={t('recruitment.jobDetail.viewCandidate')} onClick={e => { e.stopPropagation(); navigate(`/recruitment/candidates/${c.id}`) }}><Eye className="size-3.5" /></Button>
          </div>
        )
      },
    },
  ], [t, allStages, navigate])

  if (jobLoading) {
    return (
      <PageWrapper>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40" />
          <Skeleton className="h-64" />
        </div>
      </PageWrapper>
    )
  }

  if (!job) {
    return (
      <PageWrapper>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <XCircle className="size-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">{t('recruitment.jobDetail.jobNotFound')}</p>
          <Button variant="outline" onClick={() => navigate('/recruitment')}>
            <ArrowLeft className="size-4 mr-2" />{t('recruitment.candidateProfile.backToRecruitment')}
          </Button>
        </div>
      </PageWrapper>
    )
  }

  const statusStyle = JOB_STATUS_STYLE[job.status] ?? JOB_STATUS_STYLE.draft
  const filledPct = job.openings > 0
    ? Math.min(100, Math.round((applicationCount / job.openings) * 100))
    : 0

  return (
    <PageWrapper>
      <button
        type="button"
        onClick={() => navigate('/recruitment')}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="size-4" />
        {t('recruitment.jobDetail.backToRecruitment')}
      </button>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Ref number above the title — HR scans by JOB-#### a lot. */}
                {job.jobNo && (
                  <div className="mb-1 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <Hash className="size-3 opacity-70" />{job.jobNo}
                  </div>
                )}
                <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                  <h1 className="text-xl font-semibold text-foreground leading-tight">{job.title}</h1>
                  <Badge variant="outline" className={cn('text-xs capitalize', statusStyle)}>
                    {labelFor(job.status)}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                  {job.department && (
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="size-3.5" />
                      {job.department}
                    </span>
                  )}
                  {job.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="size-3.5" />
                      {job.location}
                    </span>
                  )}
                  {job.industry && (
                    <span className="flex items-center gap-1.5">
                      <Building2 className="size-3.5" />
                      {job.industry}
                    </span>
                  )}
                  <JobTypeBadge type={job.type} size="xs" variant="bordered" />
                  {job.workplaceType && <WorkplaceBadge workplace={job.workplaceType} size="xs" variant="bordered" />}
                </div>
                {/* Posted / last-updated row */}
                {(job.createdAt || job.updatedAt) && (
                  <div className="mt-2 flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground/80">
                    {job.createdAt && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3 opacity-70" />
                        Posted {formatPostedAgo(job.createdAt)}
                      </span>
                    )}
                    {job.updatedAt && job.updatedAt !== job.createdAt && (
                      <span className="inline-flex items-center gap-1">
                        <Edit2 className="size-3 opacity-70" />
                        Updated {formatPostedAgo(job.updatedAt)}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Edit2 className="size-3.5" />}
                onClick={() => setEditOpen(true)}
              >
                {t('recruitment.jobDetail.editJob')}
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('recruitment.jobDetail.openings')}</p>
                <p className="text-lg font-bold text-foreground mt-0.5">{job.openings}</p>
              </div>
              <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('recruitment.jobDetail.applications')}</p>
                <p className="text-lg font-bold text-foreground mt-0.5">{applicationCount}</p>
              </div>
              <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('recruitment.jobDetail.salaryRange')}</p>
                <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
                  {formatCurrency(job.minSalary)} – {formatCurrency(job.maxSalary)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('recruitment.jobDetail.closing')}</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{formatDate(job.closingDate)}</p>
              </div>
            </div>

            {job.openings > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>{t('recruitment.jobDetail.fillRate')}</span>
                  <span className="font-medium">{t('recruitment.jobDetail.fillRateCount', { applications: applicationCount, openings: job.openings })}</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', filledPct >= 100 ? 'bg-success' : 'bg-primary')}
                    style={{ width: `${Math.min(filledPct, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* ── Description + Requirements ── */}
          <div className="lg:col-span-1 space-y-4">
            {job.description && (
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-foreground">{t('recruitment.jobDetail.jobDescription')}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <RichTextDisplay html={job.description} />
                </CardContent>
              </Card>
            )}
            {job.requirements && job.requirements.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-foreground">{t('recruitment.jobDetail.requirements')}</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ul className="space-y-1.5">
                    {job.requirements.map((r, i) => (
                      <li key={`${i}-${r}`} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="size-3.5 text-success mt-0.5 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {/* Job overview — always visible so HR can see employment type,
                workplace, openings etc. even when the description is empty. */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-foreground">{t('recruitment.jobDetail.overview', { defaultValue: 'Job overview' })}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <dl className="space-y-2.5 text-sm">
                  <OverviewRow label={t('recruitment.jobDetail.employmentType', { defaultValue: 'Employment type' })}>
                    <JobTypeBadge type={job.type} size="xs" variant="bordered" />
                  </OverviewRow>
                  <OverviewRow label={t('recruitment.jobDetail.workplaceType', { defaultValue: 'Workplace' })}>
                    {job.workplaceType
                      ? <WorkplaceBadge workplace={job.workplaceType} size="xs" variant="bordered" />
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </OverviewRow>
                  {job.experienceYears != null && (
                    <OverviewRow label={t('recruitment.jobDetail.experienceRequired', { defaultValue: 'Experience required' })}>
                      <span className="text-foreground/90">
                        {job.experienceYears} {job.experienceYears === 1
                          ? t('recruitment.jobDetail.yearSingular', { defaultValue: 'year' })
                          : t('recruitment.jobDetail.yearPlural', { defaultValue: 'years' })}
                      </span>
                    </OverviewRow>
                  )}
                  {job.industry && (
                    <OverviewRow label={t('recruitment.jobDetail.industry', { defaultValue: 'Industry' })}>
                      <span className="text-foreground/90">{job.industry}</span>
                    </OverviewRow>
                  )}
                  {job.jobNo && (
                    <OverviewRow label={t('recruitment.jobDetail.ref', { defaultValue: 'Ref' })}>
                      <span className="font-mono text-xs text-muted-foreground">{job.jobNo}</span>
                    </OverviewRow>
                  )}
                </dl>
              </CardContent>
            </Card>

            {/* Skills — always visible with empty state */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-3.5 text-sky-500" />
                  {t('recruitment.jobDetail.skills', { defaultValue: 'Skills' })}
                  {(job.skills?.length ?? 0) > 0 && (
                    <span className="text-[10px] font-normal text-muted-foreground ml-auto">
                      {job.skills?.length}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {(job.skills?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {job.skills.map((s, i) => (
                      <TagChip key={`${i}-${s}`} tone="sky">{s}</TagChip>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">{t('recruitment.jobDetail.noSkills', { defaultValue: 'No skills added — use Edit Job to add.' })}</p>
                )}
              </CardContent>
            </Card>

            {/* Qualifications — always visible with empty state */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <GraduationCap className="size-3.5 text-emerald-500" />
                  {t('recruitment.jobDetail.qualifications', { defaultValue: 'Qualifications' })}
                  {(job.qualifications?.length ?? 0) > 0 && (
                    <span className="text-[10px] font-normal text-muted-foreground ml-auto">
                      {job.qualifications?.length}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {(job.qualifications?.length ?? 0) > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {job.qualifications.map((q, i) => (
                      <TagChip key={`${i}-${q}`} tone="emerald">{q}</TagChip>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">{t('recruitment.jobDetail.noQualifications', { defaultValue: 'No qualifications added — use Edit Job to add.' })}</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold">{t('recruitment.jobDetail.candidates')}</CardTitle>
                  {allCandidates.length > 0 && (
                    <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-muted text-[11px] font-medium tabular-nums">
                      {allCandidates.length}
                    </span>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate('/recruitment')}>
                  <Users className="size-3.5 mr-1.5" />
                  {t('recruitment.jobDetail.pipeline')}
                </Button>
              </div>

              {allCandidates.length > 0 && (
                  <div className="flex items-center gap-1.5 px-4 py-2.5 border-b bg-muted/10 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setStageFilter('all')}
                      className={cn(
                        'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                        stageFilter === 'all'
                          ? 'bg-foreground text-background border-foreground'
                          : 'bg-background text-muted-foreground border-border hover:border-foreground/40',
                      )}
                    >
                      {t('recruitment.jobDetail.allCount', { count: allCandidates.length })}
                    </button>
                    {allStages.map(s => {
                      const count = stageCounts[s.stageKey] ?? 0
                      if (count === 0) return null
                      const color = resolveStageColor(s.colorKey)
                      const isActive = stageFilter === s.stageKey
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setStageFilter(isActive ? 'all' : s.stageKey)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                            isActive ? color.badgeClass : 'bg-background text-muted-foreground border-border hover:border-foreground/40',
                          )}
                        >
                          {s.label} · {count}
                        </button>
                      )
                    })}
                  </div>
              )}

              {allCandidates.length > 0 && (
                <div className="flex items-center gap-1.5 px-4 py-2.5 border-b bg-muted/5 flex-wrap">
                  <span className="text-[11px] font-medium text-muted-foreground/70 mr-0.5">{t('recruitment.jobDetail.source', { defaultValue: 'Source' })}</span>
                  {SOURCE_FILTERS.map(sf => {
                    const count = sf.key === 'all' ? allCandidates.length : sourceCounts[sf.key]
                    const isActive = sourceFilter === sf.key
                    // Hide a zero-count source pill — unless it's the active filter,
                    // so the user can always toggle the current source back off.
                    if (sf.key !== 'all' && count === 0 && !isActive) return null
                    return (
                      <button
                        key={sf.key}
                        type="button"
                        onClick={() => setSourceFilter(isActive ? 'all' : sf.key)}
                        className={cn(
                          'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                          isActive ? sf.activeClass : 'bg-background text-muted-foreground border-border hover:border-foreground/40',
                        )}
                      >
                        {t(sf.labelKey)} · {count}
                      </button>
                    )
                  })}
                </div>
              )}

              <CardContent className="p-0">
                {appsLoading ? (
                  <div className="p-4 space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={`skeleton-${i}`} className="h-14 rounded-lg" />)}
                  </div>
                ) : allCandidates.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title={t('recruitment.jobDetail.noCandidatesYet')}
                    description={t('recruitment.jobDetail.candidatesWillAppear')}
                    size="lg"
                  />
                ) : candidates.length === 0 ? (
                  <EmptyState
                    icon={AlertCircle}
                    title={t('recruitment.jobDetail.noCandidatesInStage')}
                    action={(
                      <button
                        type="button"
                        onClick={() => { setStageFilter('all'); setSourceFilter('all') }}
                        className="text-xs text-primary hover:underline"
                      >
                        {t('recruitment.jobDetail.showAll')}
                      </button>
                    )}
                  />
                ) : (
                  <div className="p-3">
                    <DataTable
                      columns={columns}
                      data={candidates}
                      pageSize={10}
                      getRowId={(c) => c.id}
                      onRowClick={(c) => navigate(`/recruitment/candidates/${c.id}`)}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ── Recommended candidates (talent-pool matching) ── */}
            <Card className="mt-4">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Wand2 className="size-3.5 text-violet-500" />
                  {t('recruitment.recommendations.candidatesTitle', { defaultValue: 'Recommended candidates' })}
                  {(recsData?.data?.length ?? 0) > 0 && (
                    <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-muted text-[11px] font-medium tabular-nums ml-auto">
                      {recsData?.data.length}
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {recsLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={`rec-skeleton-${i}`} className="h-24 rounded-lg" />)}
                  </div>
                ) : (recsData?.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    {t('recruitment.recommendations.candidatesEmpty', { defaultValue: 'No strong matches in the talent pool yet' })}
                  </p>
                ) : (
                  <>
                    <ul className="space-y-2.5">
                      {recsData!.data.map((rc) => (
                        <li key={rc.applicationId}>
                          <button
                            type="button"
                            onClick={() => navigate(`/recruitment/candidates/${rc.applicationId}`)}
                            className="w-full text-start rounded-xl border border-border/60 bg-card hover:border-foreground/30 hover:bg-muted/30 transition-colors p-3.5"
                          >
                            <div className="flex items-start gap-3">
                              <Avatar className="size-10 shrink-0 border border-border/60">
                                {rc.avatar && <img src={rc.avatar} alt={rc.name} className="object-cover" />}
                                <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">{getInitials(rc.name)}</AvatarFallback>
                              </Avatar>
                              <div className="min-w-0 flex-1">
                                {/* Identity left, match score pinned top-right — the
                                    score never wraps under the name now. */}
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-sm font-semibold text-foreground truncate">{rc.name}</p>
                                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                      {rc.email}
                                      {rc.experience != null && rc.experience > 0 && (
                                        <span> · {t('recruitment.jobDetail.experienceYears', { count: rc.experience })}</span>
                                      )}
                                    </p>
                                  </div>
                                  <MatchScoreBadge score={rc.overall} className="shrink-0" />
                                </div>

                                {(rc.matchedSkills.length > 0 || rc.missingSkills.length > 0) && (
                                  <div className="mt-2.5 border-t border-border/40 pt-2.5">
                                    <MatchSkillChips matched={rc.matchedSkills} missing={rc.missingSkills} />
                                  </div>
                                )}
                                {rc.strengths.length > 0 && (
                                  <p className="mt-2.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
                                    <Sparkles className="size-3 shrink-0 mt-0.5 text-violet-500" />
                                    <span>{rc.strengths.join(' · ')}</span>
                                  </p>
                                )}
                                {rc.appliedJobs.length > 0 && (
                                  <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
                                    <Briefcase className="size-3 shrink-0 mt-0.5" />
                                    <span>
                                      {t('recruitment.recommendations.alsoAppliedTo', { defaultValue: 'Also applied to:' })}{' '}
                                      {rc.appliedJobs.map(j => j.title).join(', ')}
                                    </span>
                                  </p>
                                )}
                              </div>
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                    {recsData!.capped && (
                      <p className="text-[11px] text-muted-foreground/60 mt-3">
                        {t('recruitment.recommendations.cappedNote', { defaultValue: 'Scored the most recent {{count}} candidates', count: recsData!.scanned })}
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {job && (
        <EditJobDialog open={editOpen} onOpenChange={setEditOpen} job={job} />
      )}
    </PageWrapper>
  )
}
