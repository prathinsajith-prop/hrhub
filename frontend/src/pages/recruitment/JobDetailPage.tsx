import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { RichTextDisplay } from '@/components/ui/rich-text-editor'
import {
  ArrowLeft, Edit2, MapPin, Briefcase, Users,
  Download, Eye, FileText, Star, Clock, CheckCircle2, XCircle, AlertCircle,
  ChevronRight, Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { useJob, useApplications } from '@/hooks/useRecruitment'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { EditJobDialog } from '@/components/shared/action-dialogs'
import { formatCurrency, formatDate, getInitials, cn } from '@/lib/utils'
import { labelFor } from '@/lib/enums'
import type { Job, Candidate, ApplicationStage } from '@/types'

const STAGE_CONFIG: Record<ApplicationStage, { label: string; cls: string }> = {
  received:    { label: 'Received',     cls: 'bg-slate-100 text-slate-600 border-slate-300' },
  screening:   { label: 'Screening',    cls: 'bg-info/10 text-info border-info/20' },
  interview:   { label: 'Interview',    cls: 'bg-warning/10 text-warning border-warning/20' },
  assessment:  { label: 'Assessment',   cls: 'bg-primary/10 text-primary border-primary/20' },
  offer:       { label: 'Offer',        cls: 'bg-success/10 text-success border-success/20' },
  pre_boarding:{ label: 'Pre-Boarding', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected:    { label: 'Rejected',     cls: 'bg-destructive/10 text-destructive border-destructive/20' },
}

const JOB_STATUS_STYLE: Record<string, string> = {
  open:    'bg-success/10 text-success border-success/20',
  on_hold: 'bg-warning/10 text-warning border-warning/20',
  closed:  'bg-muted text-muted-foreground border-border',
  draft:   'bg-muted text-muted-foreground border-border',
}

const STAGE_ORDER: ApplicationStage[] = [
  'received', 'screening', 'interview', 'assessment', 'offer', 'pre_boarding', 'rejected',
]

function CandidateRow({ c, onView }: { c: Candidate; onView: (id: string) => void }) {
  const stageCfg = STAGE_CONFIG[c.stage] ?? { label: c.stage, cls: 'bg-muted text-muted-foreground' }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 py-3 px-4 rounded-lg hover:bg-muted/40 transition-colors group">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <Avatar className="h-9 w-9 shrink-0 border border-border/60">
          {c.avatar && <img src={c.avatar} alt={c.name} className="object-cover" />}
          <AvatarFallback className="text-xs font-semibold bg-primary/10 text-primary">
            {getInitials(c.name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{c.name}</p>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="text-[11px] text-muted-foreground">{c.nationality}</span>
            {c.experience > 0 && (
              <span className="text-[11px] text-muted-foreground">{c.experience}y exp</span>
            )}
            {c.expectedSalary != null && (
              <span className="text-[11px] text-muted-foreground">
                {formatCurrency(c.expectedSalary)} expected
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
        <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5 shrink-0', stageCfg.cls)}>
          {stageCfg.label}
        </Badge>
        {c.score > 0 && (
          <div className="flex items-center gap-0.5 text-[11px] text-amber-600 shrink-0">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            <span className="font-medium">{c.score}</span>
          </div>
        )}
        <span className="text-[11px] text-muted-foreground shrink-0">{formatDate(c.appliedDate)}</span>
      </div>

      <div className="flex items-center gap-1 shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        {c.resumeUrl && (
          <a
            href={c.resumeUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            onClick={e => e.stopPropagation()}
          >
            <Button size="icon-sm" variant="ghost" aria-label="Download resume">
              <Download className="h-3.5 w-3.5" />
            </Button>
          </a>
        )}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="View candidate"
          onClick={() => onView(c.id)}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <ChevronRight className="h-4 w-4 text-muted-foreground/40" />
      </div>
    </div>
  )
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [stageFilter, setStageFilter] = useState<ApplicationStage | 'all'>('all')

  const { data: jobData, isLoading: jobLoading } = useJob(id)
  const { data: appsData, isLoading: appsLoading } = useApplications({ jobId: id, limit: 200 })

  const job = (jobData as { data?: Job })?.data
  const allCandidates = useMemo(
    () => ((appsData as { data?: Candidate[] })?.data ?? []) as Candidate[],
    [appsData],
  )
  const stageCounts = useMemo(
    () => allCandidates.reduce<Partial<Record<ApplicationStage, number>>>((acc, c) => {
      acc[c.stage] = (acc[c.stage] ?? 0) + 1
      return acc
    }, {}),
    [allCandidates],
  )
  const candidates = useMemo(
    () => stageFilter === 'all' ? allCandidates : allCandidates.filter(c => c.stage === stageFilter),
    [allCandidates, stageFilter],
  )

  const { visibleCount, setVisibleCount, sentinelRef } = useInfiniteScroll(candidates.length)
  useEffect(() => { setVisibleCount(20) }, [stageFilter, setVisibleCount])

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
          <XCircle className="h-12 w-12 text-muted-foreground/30" />
          <p className="text-muted-foreground">Job not found.</p>
          <Button variant="outline" onClick={() => navigate('/recruitment')}>
            <ArrowLeft className="h-4 w-4 mr-2" />Back to Recruitment
          </Button>
        </div>
      </PageWrapper>
    )
  }

  const statusStyle = JOB_STATUS_STYLE[job.status] ?? JOB_STATUS_STYLE.draft
  const filledPct = job.openings > 0
    ? Math.min(100, Math.round(((job.applications ?? 0) / job.openings) * 100))
    : 0

  return (
    <PageWrapper>
      <button
        type="button"
        onClick={() => navigate('/recruitment')}
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Recruitment
      </button>

      <div className="space-y-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap mb-1.5">
                  <h1 className="text-xl font-bold text-foreground leading-tight">{job.title}</h1>
                  <Badge variant="outline" className={cn('text-xs capitalize', statusStyle)}>
                    {labelFor(job.status)}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 flex-wrap text-sm text-muted-foreground">
                  {job.department && (
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5" />
                      {job.department}
                    </span>
                  )}
                  {job.location && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {job.location}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    {labelFor(job.type)}
                  </span>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                leftIcon={<Edit2 className="h-3.5 w-3.5" />}
                onClick={() => setEditOpen(true)}
              >
                Edit Job
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Openings</p>
                <p className="text-lg font-bold text-foreground mt-0.5">{job.openings}</p>
              </div>
              <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Applications</p>
                <p className="text-lg font-bold text-foreground mt-0.5">{job.applications ?? 0}</p>
              </div>
              <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Salary Range</p>
                <p className="text-sm font-semibold text-foreground mt-0.5 truncate">
                  {formatCurrency(job.minSalary)} – {formatCurrency(job.maxSalary)}
                </p>
              </div>
              <div className="rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Closing</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{formatDate(job.closingDate)}</p>
              </div>
            </div>

            {job.openings > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                  <span>Application fill rate</span>
                  <span className="font-medium">{job.applications ?? 0} / {job.openings} openings</span>
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
                  <CardTitle className="text-sm font-semibold text-foreground">Job Description</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <RichTextDisplay html={job.description} />
                </CardContent>
              </Card>
            )}
            {job.requirements && job.requirements.length > 0 && (
              <Card>
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-foreground">Requirements</CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4">
                  <ul className="space-y-1.5">
                    {job.requirements.map((r, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-3.5 w-3.5 text-success mt-0.5 shrink-0" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
            {!job.description && (!job.requirements || job.requirements.length === 0) && (
              <Card>
                <CardContent className="py-10 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No description added yet.</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={() => setEditOpen(true)}>
                    Add Details
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-2">
            <Card>
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm font-semibold">Candidates</CardTitle>
                  {allCandidates.length > 0 && (
                    <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-muted text-[11px] font-medium tabular-nums">
                      {allCandidates.length}
                    </span>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => navigate('/recruitment')}>
                  <Users className="h-3.5 w-3.5 mr-1.5" />
                  Pipeline
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
                      All · {allCandidates.length}
                    </button>
                    {STAGE_ORDER.map(s => {
                      const count = stageCounts[s] ?? 0
                      if (count === 0) return null
                      const cfg = STAGE_CONFIG[s]
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setStageFilter(stageFilter === s ? 'all' : s)}
                          className={cn(
                            'px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                            stageFilter === s ? cfg.cls : 'bg-background text-muted-foreground border-border hover:border-foreground/40',
                          )}
                        >
                          {cfg.label} · {count}
                        </button>
                      )
                    })}
                  </div>
              )}

              <CardContent className="p-0">
                {appsLoading ? (
                  <div className="px-4 py-4 space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
                  </div>
                ) : allCandidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                    <div className="h-12 w-12 rounded-xl bg-muted/60 border flex items-center justify-center mb-3">
                      <Users className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm font-semibold">No candidates yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Candidates who apply will appear here.</p>
                  </div>
                ) : candidates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <AlertCircle className="h-8 w-8 text-muted-foreground/20 mb-2" />
                    <p className="text-sm text-muted-foreground">No candidates in this stage.</p>
                    <button
                      type="button"
                      onClick={() => setStageFilter('all')}
                      className="text-xs text-primary mt-2 hover:underline"
                    >
                      Show all
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="divide-y divide-border/40">
                      {candidates.slice(0, visibleCount).map(c => (
                        <CandidateRow
                          key={c.id}
                          c={c}
                          onView={cid => navigate(`/recruitment/candidates/${cid}`)}
                        />
                      ))}
                    </div>
                    {candidates.length > visibleCount && (
                      <div ref={sentinelRef} className="py-3 flex justify-center">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
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
