import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, Briefcase, Users, Clock, TrendingUp, Star, DollarSign, Eye, Edit2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tabs } from '@/components/ui/form-controls'
import { DataTable } from '@/components/ui/data-table'
import { KpiCardCompact } from '@/components/ui/kpi-card'
import { Skeleton } from '@/components/ui/skeleton'
import { PageHeader } from '@/components/layout/PageHeader'
import { PageWrapper } from '@/components/layout/PageWrapper'
import { formatCurrency, formatDate, getInitials, cn } from '@/lib/utils'
import { useJobs, useApplications, useUpdateApplicationStage, useUpdateJob, useCreateJob } from '@/hooks/useRecruitment'
import { toast, ConfirmDialog } from '@/components/ui/overlays'
import { NewJobDialog, EditJobDialog } from '@/components/shared/action-dialogs'
import type { Candidate, ApplicationStage } from '@/types'
import type { ColumnDef } from '@tanstack/react-table'

const stages: { id: ApplicationStage; label: string; bgClass: string }[] = [
  { id: 'received', label: 'Received', bgClass: 'bg-muted/50 border-border' },
  { id: 'screening', label: 'Screening', bgClass: 'bg-info/5 border-info/20' },
  { id: 'interview', label: 'Interview', bgClass: 'bg-warning/5 border-warning/20' },
  { id: 'assessment', label: 'Assessment', bgClass: 'bg-primary/5 border-primary/20' },
  { id: 'offer', label: 'Offer', bgClass: 'bg-success/5 border-success/20' },
  { id: 'pre_boarding', label: 'Pre-boarding', bgClass: 'bg-accent/50 border-accent' },
]

function CandidateCard({ candidate, onMove }: { candidate: Candidate; onMove: (id: string, stage: ApplicationStage) => void }) {
  const stageIdx = stages.findIndex(s => s.id === candidate.stage)
  const nextStage = stages[stageIdx + 1]
  const navigate = useNavigate()

  return (
    <div className="bg-card rounded-xl border border-border p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">{getInitials(candidate.name)}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xs font-semibold text-foreground">{candidate.name}</p>
            <p className="text-[10px] text-muted-foreground">{candidate.nationality}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <Star className="h-3 w-3 text-warning fill-warning" />
          <span className="text-[10px] font-medium">{candidate.score}</span>
        </div>
      </div>
      <div className="space-y-1 mb-3">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" /> {candidate.experience}y exp
        </div>
        {candidate.expectedSalary && (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <DollarSign className="h-3 w-3" /> {formatCurrency(candidate.expectedSalary)}
          </div>
        )}
      </div>
      {nextStage && (
        <Button
          size="sm"
          variant="secondary"
          className="w-full text-[10px] h-6"
          onClick={() => onMove(candidate.id, nextStage.id)}
        >
          Move to {nextStage.label} &rarr;
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="w-full text-[10px] h-6 mt-1"
        onClick={() => navigate(`/recruitment/candidates/${candidate.id}`)}
      >
        <Eye className="h-3 w-3 mr-1" /> View Profile
      </Button>
    </div>
  )
}

const buildJobColumns = (onEdit: (job: any) => void): ColumnDef<any>[] => [
  {
    accessorKey: 'title',
    header: 'Position',
    cell: ({ row: { original: j } }) => (
      <div>
        <p className="font-medium text-sm text-foreground">{j.title}</p>
        <p className="text-[11px] text-muted-foreground">{j.department} &middot; {j.location}</p>
      </div>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => {
      const s = getValue() as string
      const config: Record<string, string> = {
        open: 'bg-success/10 text-success border-success/20',
        on_hold: 'bg-warning/10 text-warning border-warning/20',
        closed: 'bg-muted text-muted-foreground',
      }
      return (
        <Badge variant="outline" className={cn('capitalize text-[11px]', config[s] || config.closed)}>
          {s.replace('_', ' ')}
        </Badge>
      )
    },
  },
  { accessorKey: 'openings', header: 'Openings', cell: ({ getValue }) => <span className="text-sm font-medium">{getValue() as number}</span> },
  { accessorKey: 'applications', header: 'Applications', cell: ({ getValue }) => <span className="text-sm">{getValue() as number}</span> },
  {
    id: 'salary',
    header: 'Salary Range',
    cell: ({ row: { original: j } }) => (
      <span className="text-xs text-muted-foreground">{formatCurrency(j.minSalary)} – {formatCurrency(j.maxSalary)}</span>
    ),
  },
  { accessorKey: 'closingDate', header: 'Closing', cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{formatDate(getValue() as string)}</span> },
  {
    id: 'actions',
    header: '',
    cell: ({ row: { original: j } }) => (
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Edit job"
        className="text-muted-foreground hover:text-foreground"
        onClick={() => onEdit(j)}
      >
        <Edit2 className="h-3.5 w-3.5" />
      </Button>
    ),
    size: 60,
  },
]

export function RecruitmentPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState('pipeline')
  const [jobDialogOpen, setJobDialogOpen] = useState(false)
  const [editJob, setEditJob] = useState<any | null>(null)
  const [closeConfirm, setCloseConfirm] = useState<string[] | null>(null)
  const { data: jobsData, isLoading: jobsLoading } = useJobs({ limit: 50 })
  const { data: appsData, isLoading: appsLoading } = useApplications({ limit: 100 })
  const isLoading = jobsLoading || appsLoading
  const updateStage = useUpdateApplicationStage()
  const updateJob = useUpdateJob()
  const createJob = useCreateJob()
  const jobs: any[] = (jobsData?.data as any[]) ?? []
  const candidates: Candidate[] = (appsData?.data as Candidate[]) ?? []
  const jobColumns = buildJobColumns((j) => setEditJob(j))

  const moveCandidate = (id: string, newStage: ApplicationStage) => {
    const c = candidates.find((c: any) => c.id === id)
    updateStage.mutate({ id, stage: newStage }, {
      onSuccess: () => {
        if (c) toast.success('Candidate moved', `${(c as any).name} moved to ${newStage.replace('_', ' ')} stage.`)
      }
    })
  }

  const openJobs = jobs.filter((j: any) => j.status === 'open').length
  const inInterview = candidates.filter((c: any) => c.stage === 'interview').length
  const inOffer = candidates.filter((c: any) => c.stage === 'offer' || c.stage === 'pre_boarding').length

  return (
    <PageWrapper>
      <PageHeader
        title={t('recruitment.title')}
        description={t('recruitment.description')}
        actions={
          <Button className="gap-2" onClick={() => setJobDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">New Job</span>
            <span className="sm:hidden">Add</span>
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-7 rounded-lg" />
              </div>
              <Skeleton className="h-7 w-16" />
            </div>
          ))
        ) : (
          <>
            <KpiCardCompact label="Open Positions" value={openJobs} icon={Briefcase} color="blue" />
            <KpiCardCompact label="Total Applicants" value={candidates.length} icon={Users} color="cyan" />
            <KpiCardCompact label="In Interview" value={inInterview} icon={Clock} color="amber" />
            <KpiCardCompact label="Offer Stage" value={inOffer} icon={TrendingUp} color="green" />
          </>
        )}
      </div>

      <Tabs
        tabs={[
          { id: 'pipeline', label: 'Candidate Pipeline' },
          { id: 'jobs', label: 'Job Listings' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
        className="border-b-0"
      />

      {activeTab === 'pipeline' && (
        <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex gap-3 min-w-max">
            {stages.map(stage => {
              const stageCandidates = candidates.filter((c: any) => c.stage === stage.id)
              return (
                <div key={stage.id} className={cn('w-56 rounded-xl border p-3 space-y-2', stage.bgClass)}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-foreground">{stage.label}</p>
                    <span className="h-5 w-5 rounded-full bg-background text-[10px] font-bold flex items-center justify-center border border-border shadow-sm">
                      {stageCandidates.length}
                    </span>
                  </div>
                  <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                    {stageCandidates.map(c => (
                      <CandidateCard key={c.id} candidate={c} onMove={moveCandidate} />
                    ))}
                    {stageCandidates.length === 0 && (
                      <div className="border-2 border-dashed border-border rounded-lg py-6 text-center">
                        <p className="text-[10px] text-muted-foreground">No candidates</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'jobs' && (
        <Card className="p-4 sm:p-5">
          <DataTable
            columns={jobColumns}
            data={jobs}
            searchKey="title"
            searchPlaceholder="Search jobs..."
            pageSize={8}
            enableSelection
            getRowId={(row: any) => String(row.id)}
            toolbar={
              <Button size="sm" className="gap-1.5" onClick={() => setJobDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                New Job
              </Button>
            }
            bulkActions={(selected) => (
              <>
                <Button variant="outline" size="sm"
                  onClick={() => setCloseConfirm(selected.map((r: any) => r.id))}>
                  Close
                </Button>
                <Button variant="outline" size="sm"
                  onClick={async () => {
                    try {
                      await Promise.all(selected.map((r: any) => createJob.mutateAsync({
                        title: `${r.title} (Copy)`,
                        department: r.department,
                        location: r.location,
                        type: r.type,
                        status: 'draft',
                        openings: r.openings,
                        minSalary: r.minSalary,
                        maxSalary: r.maxSalary,
                        description: r.description,
                        requirements: r.requirements,
                        closingDate: r.closingDate,
                      })))
                      toast.success(`${selected.length} job(s) duplicated`, 'Draft copies created.')
                    } catch {
                      toast.error('Duplicate failed', 'Could not duplicate selected jobs.')
                    }
                  }}
                  disabled={createJob.isPending}>
                  Duplicate
                </Button>
              </>
            )}
          />
        </Card>
      )}

      <NewJobDialog open={jobDialogOpen} onOpenChange={setJobDialogOpen} />
      {editJob && (
        <EditJobDialog
          open={!!editJob}
          onOpenChange={(o) => !o && setEditJob(null)}
          job={editJob}
        />
      )}
      <ConfirmDialog
        open={!!closeConfirm}
        onOpenChange={(o) => !o && setCloseConfirm(null)}
        title={`Close ${closeConfirm?.length ?? 0} job${closeConfirm?.length === 1 ? '' : 's'}?`}
        description="Closing these jobs will stop accepting new applications. Existing candidates remain in the pipeline."
        confirmLabel="Close jobs"
        variant="warning"
        onConfirm={async () => {
          try {
            await Promise.all((closeConfirm ?? []).map(id => updateJob.mutateAsync({ id, data: { status: 'closed' } })))
            toast.success(`${closeConfirm?.length ?? 0} jobs closed`, 'They are now read-only.')
          } catch {
            toast.error('Failed to close jobs', 'Some jobs could not be updated.')
          } finally {
            setCloseConfirm(null)
          }
        }}
      />
    </PageWrapper>
  )
}

export default RecruitmentPage
